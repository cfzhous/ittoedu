#!/usr/bin/env python3
"""Validate semantic closure, exact review scopes, and derived V2 readiness."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from courseware_case_v2 import (
    APPROVAL_FIELDS,
    ARTIFACT_SPECS,
    PATH_MODES,
    SCHEMA_VERSION,
    TARGET_PROJECT_SCHEMA_VERSION,
    archive_review,
    artifact_current_hash,
    clear_review_state,
    expected_reviews,
    is_automated_identity,
    next_stage,
    now_iso,
    refresh_blocking_decisions,
    review_order,
    review_scope_sha256,
    save_manifest,
)
from contract_records import parse_contract_records, validate_executable_contracts


PLACEHOLDERS = ("[待填写", "{{", "TODO", "TBD")
UNDERSPECIFIED = (
    "见聊天", "见旧实现", "参考旧课件", "同上", "按需处理", "后续补充", "由实现决定",
    "稍后补充", "稍后说明", "课堂中补充", "课上补充", "待课堂说明",
    "later in class", "explain later", "to be supplied later",
)
CONTRACT_HEADINGS = (
    "## 受众、场景与时间",
    "## 产品能力剖面",
    "## 学习目标与证据",
    "## 内容边界与教学序列",
    "## 精确内容",
    "## 响应、判定与容量",
    "## 自动判定容差矩阵",
    "## 响应容量汇总",
    "## 编辑结果合同",
    "## 评价、反馈与约束",
    "## 来源与假设",
)
SCRIPT_HEADINGS = (
    "## 全课推进与揭示",
    "## 场景与状态脚本",
    "#### 初始与操作前可见",
    "#### 教师与学生动作",
    "#### 即时反馈、错误与恢复",
    "#### 稳定状态与转换",
    "#### 信息释放与教师视角",
    "#### 可执行动作与教师逃生",
    "#### 证据与静态审阅帧",
)
CONTENT_HEADINGS = (
    "#### 学习者可见内容",
    "#### 预期回应与完整解释",
    "#### 可接受答案与不接受边界",
    "#### 典型错误与反馈",
    "#### 难度、先修与来源",
    "#### 揭示、时间与专业表示",
)
VISUAL_HEADINGS = (
    "## 视觉目标与避免事项",
    "## 学科表征与构图",
    "## 核心互动与代表性样机",
    "## 关键帧、素材与许可",
    "## 无障碍与静态差异",
)
LEGACY_TRUTH_FILES = (
    "decisions.json",
    "00-context.md",
    "01-teaching-design.md",
    "02-content-spec.md",
    "03-presentation-script.md",
    "04-visual-direction.md",
    "05-implementation-handoff.md",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate CoursewareCaseManifestV2")
    parser.add_argument("case_dir")
    parser.add_argument("--target", choices=("draft", "implementation-ready"), default="draft")
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument(
        "--capability-index",
        help=(
            "Explicit product Capability Index path. Otherwise discover an editor root "
            "from cwd, the case, or a repository-backed skill location."
        ),
    )
    parser.add_argument(
        "--promote",
        action="store_true",
        help="Persist the derived readiness result; never creates an approval or accepted outcome",
    )
    return parser.parse_args()


def ids(text: str, prefix: str) -> set[str]:
    return set(re.findall(rf"\b{re.escape(prefix)}-\d{{3,}}\b", text))


def heading_ids(text: str, prefix: str) -> set[str]:
    return set(
        re.findall(
            rf"^#{{3,6}}\s+({re.escape(prefix)}-\d{{3,}})\b",
            text,
            re.MULTILINE,
        )
    )


def heading_id_list(text: str, prefix: str) -> list[str]:
    return re.findall(
        rf"^#{{3,6}}\s+({re.escape(prefix)}-\d{{3,}})\b",
        text,
        re.MULTILINE,
    )


def strip_nonsemantic_comments(text: str) -> str:
    """Remove HTML comments so commented-out IDs cannot satisfy closure."""

    return re.sub(r"<!--[\s\S]*?-->", "", text)


def state_definition_ids(text: str) -> set[str]:
    return set(
        re.findall(
            r"^\s*-\s*(STATE-\d{3,})\b[^\n：:]*[：:]",
            text,
            re.MULTILINE,
        )
    )


def state_definition_list(text: str) -> list[str]:
    return re.findall(
        r"^\s*-\s*(STATE-\d{3,})\b[^\n：:]*[：:]",
        text,
        re.MULTILINE,
    )


def marker_definition_list(text: str, prefix: str) -> list[str]:
    """Find explicitly structured heading, bullet-field, or first-table-cell definitions."""

    identifier = rf"{re.escape(prefix)}-\d{{3,}}"
    values = re.findall(rf"^#{{3,6}}\s+({identifier})\b", text, re.MULTILINE)
    values.extend(
        re.findall(
            rf"^\s*-\s*({identifier})\b[^\n：:]*[：:]",
            text,
            re.MULTILINE,
        )
    )
    values.extend(
        re.findall(
            rf"^\|\s*`?({identifier})`?\s*\|",
            text,
            re.MULTILINE,
        )
    )
    return values


def field_minutes(text: str, label: str) -> list[int]:
    return [int(value) for value in re.findall(rf"{re.escape(label)}\s*[：:]\s*(\d+)", text)]


def completed_section(block: str, heading: str) -> bool:
    match = re.search(rf"^{re.escape(heading)}\s*$([\s\S]*?)(?=^#{{1,4}}\s|\Z)", block, re.MULTILINE)
    if not match:
        return False
    body = match.group(1).strip()
    return (
        bool(body)
        and body not in ("无", "见上文")
        and not any(marker in body for marker in PLACEHOLDERS)
        and not any(marker in body for marker in UNDERSPECIFIED)
    )


def content_definitions(files: dict[str, str]) -> tuple[dict[str, str], dict[str, str], list[str]]:
    blocks: dict[str, str] = {}
    locations: dict[str, str] = {}
    duplicates: list[str] = []
    for location, text in files.items():
        chunks = re.split(r"(?=^### CNT-\d{3,}\b)", text, flags=re.MULTILINE)[1:]
        for chunk in chunks:
            match = re.match(r"### (CNT-\d{3,})\b", chunk)
            if not match:
                continue
            content_id = match.group(1)
            if content_id in blocks:
                duplicates.append(content_id)
            else:
                blocks[content_id] = chunk
                locations[content_id] = location
    return blocks, locations, duplicates


def discover_capability_index(
    case_dir: Path,
    explicit_path: str | None,
    errors: list[str],
) -> Path | None:
    if explicit_path:
        path = Path(explicit_path).resolve()
        if not path.is_file():
            errors.append(f"explicit Capability Index does not exist: {path}")
            return None
        return path

    roots: list[Path] = []
    for origin in (Path.cwd().resolve(), case_dir.resolve(), Path(__file__).resolve().parent):
        for candidate_root in (origin, *origin.parents):
            if candidate_root not in roots:
                roots.append(candidate_root)
    for root in roots:
        index_path = root / "artifacts" / "ai-capabilities" / "index.json"
        # The product source marker prevents an installed ~/.agents Skill from
        # accidentally treating the user's home directory as the editor root.
        if (
            index_path.is_file()
            and (root / "package.json").is_file()
            and (root / "src" / "shared" / "assessmentEvaluators.ts").is_file()
        ):
            return index_path
    errors.append(
        "cannot discover the repository Capability Index; run from the editor root "
        "or pass --capability-index <editor-root>/artifacts/ai-capabilities/index.json"
    )
    return None


def load_evaluator_registry(
    errors: list[str],
    index_path: Path | None,
) -> dict[str, dict[str, Any]]:
    """Load only published, callable assessment evaluators from the product index."""

    if index_path is None:
        return {}
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"cannot load assessment evaluator registry {index_path}: {exc}")
        return {}
    entries = index.get("assessmentEvaluators")
    if not isinstance(entries, list):
        errors.append("capability index has no assessmentEvaluators registry")
        return {}
    registry: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            errors.append("assessmentEvaluators entries must be objects")
            continue
        evaluator_id = entry.get("id")
        invocation = entry.get("invocation")
        valid = (
            isinstance(evaluator_id, str)
            and re.fullmatch(r"EVAL-[A-Za-z0-9._-]+", evaluator_id)
            and entry.get("version") == 1
            and entry.get("status") == "stable"
            and isinstance(entry.get("authorities"), list)
            and isinstance(entry.get("responseTypes"), list)
            and isinstance(invocation, dict)
            and invocation.get("module") == "src/shared/assessmentEvaluators.ts"
            and invocation.get("export") == "evaluateAssessment"
            and invocation.get("runtime") == "ctx.assessment.evaluate"
        )
        if not valid:
            errors.append(f"assessment evaluator registry entry is not published/callable: {evaluator_id!r}")
            continue
        if evaluator_id in registry:
            errors.append(f"duplicate assessment evaluator registry ID: {evaluator_id}")
            continue
        registry[evaluator_id] = entry
    return registry


def validate_decisions(manifest: dict[str, Any], errors: list[str]) -> list[str]:
    decisions = manifest.get("decisions")
    if not isinstance(decisions, list):
        errors.append("decisions must be embedded in case.json as an array")
        return []
    seen = set()
    unresolved = []
    for decision in decisions:
        if not isinstance(decision, dict):
            errors.append("each decision must be an object")
            continue
        decision_id = decision.get("id")
        if not isinstance(decision_id, str) or not re.fullmatch(r"DEC-\d{3,}", decision_id):
            errors.append(f"invalid decision ID: {decision_id!r}")
            continue
        if decision_id in seen:
            errors.append(f"duplicate decision ID: {decision_id}")
        seen.add(decision_id)
        options = decision.get("options")
        if not isinstance(options, list) or not 2 <= len(options) <= 3:
            errors.append(f"{decision_id} must contain 2-3 options")
            options = []
        option_ids = [option.get("id") for option in options if isinstance(option, dict)]
        if len(option_ids) != len(set(option_ids)):
            errors.append(f"{decision_id} has duplicate option IDs")
        recommended = [index for index, option in enumerate(options) if isinstance(option, dict) and option.get("recommended") is True]
        if recommended != [0]:
            errors.append(f"{decision_id} must put exactly one recommended option first")
        response = decision.get("response")
        scope_refs = decision.get("scopeRefs", [])
        if not isinstance(scope_refs, list) or any(
            not isinstance(value, str)
            or not re.fullmatch(
                r"(?:RESP-\d{3,}#capacity|capability:[a-z0-9]+(?:-[a-z0-9]+)*)",
                value,
            )
            for value in scope_refs
        ):
            errors.append(f"{decision_id} has invalid scopeRefs")
        elif len(scope_refs) != len(set(scope_refs)):
            errors.append(f"{decision_id} has duplicate scopeRefs")
        if decision.get("blocking") is True and not response:
            unresolved.append(decision_id)
        if response:
            answered_by = response.get("answeredBy")
            if answered_by not in ("user-structured", "user-text", "safe-default"):
                errors.append(f"{decision_id} has invalid answeredBy")
            selected = response.get("selectedOptionIds") or []
            if any(option_id not in option_ids for option_id in selected):
                errors.append(f"{decision_id} response selects an unknown option")
            if answered_by == "safe-default" and selected != [decision.get("safeDefaultOptionId")]:
                errors.append(f"{decision_id} safe-default response does not match the recorded safe default")
            if answered_by == "user-text" and not str(response.get("text") or "").strip():
                errors.append(f"{decision_id} user-text response is empty")
    declared = manifest.get("blockingDecisionIds")
    if declared != unresolved:
        errors.append("blockingDecisionIds does not exactly match unresolved blocking decisions")
    return unresolved


def validate_topology(case_dir: Path, manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> None:
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        errors.append("case.json must use schemaVersion 2")
    if manifest.get("targetProjectSchemaVersion") != TARGET_PROJECT_SCHEMA_VERSION:
        errors.append("targetProjectSchemaVersion must be 8")
    if manifest.get("authoringMode") != "ppt-compatible":
        errors.append("authoringMode must be ppt-compatible")
    path_mode = manifest.get("pathMode")
    if path_mode not in PATH_MODES:
        errors.append("pathMode must be fast, standard, or high-risk")
        path_mode = "standard"
    if not str(manifest.get("inputs", {}).get("originalRequest") or "").strip():
        errors.append("inputs.originalRequest must preserve the original request or a faithful summary")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        errors.append("artifacts must be an object")
        return
    if set(artifacts) != set(ARTIFACT_SPECS):
        errors.append("artifacts must contain exactly the V2 contract, script, content bundle, and visual direction entries")
    for key, spec in ARTIFACT_SPECS.items():
        artifact = artifacts.get(key)
        if not isinstance(artifact, dict):
            errors.append(f"missing artifact entry: {key}")
            continue
        if artifact.get("kind") != spec["kind"] or artifact.get("path") != spec["path"]:
            errors.append(f"artifact {key} must use {spec['kind']} path {spec['path']}")
        current_hash = artifact_current_hash(case_dir, artifact)
        if artifact.get("required") and current_hash is None:
            errors.append(f"required artifact is missing: {key}")
        if artifact.get("status") == "ready-for-review":
            if not artifact.get("sha256"):
                errors.append(f"ready artifact lacks sha256: {key}")
            elif artifact.get("sha256") != current_hash:
                errors.append(f"artifact hash is stale: {key}")
        if artifact.get("status") in ("not-present", "not-required") and current_hash is not None:
            errors.append(f"artifact {key} exists but is declared {artifact.get('status')}")

    visual = artifacts.get("visualDirection", {})
    if path_mode == "high-risk":
        if visual.get("required") is not True or visual.get("status") == "not-required":
            errors.append("high-risk path requires visualDirection")
    elif visual.get("required") is not False or visual.get("status") != "not-required":
        errors.append("fast/standard visualDirection must be absent and explicitly not-required")

    expected = expected_reviews(path_mode)
    reviews = manifest.get("reviews")
    if not isinstance(reviews, dict):
        errors.append("reviews must be an object")
    elif set(reviews) != set(expected):
        errors.append(f"reviews do not match the {path_mode} path profile")
    else:
        for key, expected_review in expected.items():
            review = reviews[key]
            for field in ("required", "covers", "dependsOn"):
                if review.get(field) != expected_review[field]:
                    errors.append(f"review {key} has an invalid {field} contract")

    for legacy in LEGACY_TRUTH_FILES:
        if (case_dir / legacy).exists():
            errors.append(f"V2 case contains legacy parallel truth file: {legacy}")
    if (case_dir / "content").is_dir() and not any(path.is_file() for path in (case_dir / "content").rglob("*")):
        warnings.append("content/ exists but contains no files")


def validate_reviews(case_dir: Path, manifest: dict[str, Any], errors: list[str]) -> tuple[dict[str, str], list[str]]:
    approved_hashes: dict[str, str] = {}
    stale_reviews: list[str] = []
    reviews = manifest.get("reviews", {})
    for key in review_order(manifest):
        review = reviews.get(key, {})
        status = review.get("status")
        if status not in ("pending", "ready-for-review", "approved", "rejected", "stale"):
            errors.append(f"review {key} has invalid status: {status}")
            continue
        try:
            current_scope = review_scope_sha256(case_dir, manifest, key)
        except (OSError, ValueError) as exc:
            errors.append(f"cannot compute review {key} scope: {exc}")
            continue
        stored_scope = review.get("scopeSha256")
        if status in ("ready-for-review", "approved", "rejected") and stored_scope != current_scope:
            errors.append(f"review scope is stale: {key}")
            stale_reviews.append(key)
        if status == "approved":
            for field in APPROVAL_FIELDS:
                if not review.get(field):
                    errors.append(f"approved review {key} lacks {field}")
            if is_automated_identity(review.get("approvedBy")):
                errors.append(f"approved review {key} names an automated identity instead of a human")
            for dependency in review.get("dependsOn", []):
                if reviews.get(dependency, {}).get("status") != "approved":
                    errors.append(f"approved review {key} lacks approved dependency {dependency}")
            approved_hashes[key] = str(stored_scope or "")
    return approved_hashes, stale_reviews


def semantic_closure(
    case_dir: Path,
    manifest: dict[str, Any],
    errors: list[str],
    warnings: list[str],
    capability_index_path: Path | None,
) -> tuple[dict[str, str], dict[str, Any]]:
    contract_path = case_dir / "01-courseware-contract.md"
    script_path = case_dir / "02-presentation-script.md"
    try:
        contract = contract_path.read_text(encoding="utf-8")
        script = script_path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"cannot read required Markdown: {exc}")
        return {}, {}
    for heading in CONTRACT_HEADINGS:
        if heading not in contract:
            errors.append(f"01-courseware-contract.md is missing heading: {heading}")
    for heading in SCRIPT_HEADINGS:
        if heading not in script:
            errors.append(f"02-presentation-script.md is missing heading: {heading}")

    semantic_files = {
        "01-courseware-contract.md": contract,
        "02-presentation-script.md": script,
    }
    content_dir = case_dir / "content"
    if content_dir.is_dir():
        for path in sorted(content_dir.rglob("*.md"), key=lambda item: item.as_posix()):
            semantic_files[path.relative_to(case_dir).as_posix()] = path.read_text(encoding="utf-8")
    blocks, locations, duplicates = content_definitions(semantic_files)
    for duplicate in sorted(set(duplicates)):
        errors.append(f"exact content item is defined more than once: {duplicate}")
    if not blocks:
        errors.append("no exact CNT-* content definition was found in the contract, script, or content/")
    for content_id, block in blocks.items():
        for heading in CONTENT_HEADINGS:
            if not completed_section(block, heading):
                errors.append(f"{content_id} has no completed exact-content section: {heading}")

    semantic_contract = strip_nonsemantic_comments(contract)
    semantic_script = strip_nonsemantic_comments(script)
    objective_ids = heading_ids(semantic_contract, "OBJ")
    evidence_ids = heading_ids(semantic_contract, "EVD")
    stage_ids = heading_ids(semantic_contract, "STG")
    scene_ids = heading_ids(semantic_script, "SCN")
    state_ids = state_definition_ids(semantic_script)
    for label, values in (
        ("OBJ", heading_id_list(semantic_contract, "OBJ")),
        ("EVD", heading_id_list(semantic_contract, "EVD")),
        ("STG", heading_id_list(semantic_contract, "STG")),
        ("SCN", heading_id_list(semantic_script, "SCN")),
        ("STATE", state_definition_list(semantic_script)),
    ):
        duplicates_for_type = sorted({value for value in values if values.count(value) > 1})
        if duplicates_for_type:
            errors.append(
                f"duplicate {label} definitions: " + ", ".join(duplicates_for_type)
            )
    for label, values in (
        ("learning objective", objective_ids),
        ("learning evidence", evidence_ids),
        ("teaching stage", stage_ids),
        ("scene", scene_ids),
        ("stable state", state_ids),
    ):
        if not values:
            errors.append(f"no {label} IDs found")
    script_content_refs = ids(semantic_script, "CNT")
    unknown_content = script_content_refs - set(blocks)
    if unknown_content:
        errors.append("presentation script references unknown content IDs: " + ", ".join(sorted(unknown_content)))
    unused_content = set(blocks) - script_content_refs
    if unused_content:
        errors.append("exact content items unused by the presentation script: " + ", ".join(sorted(unused_content)))
    unknown_objectives = ids(semantic_script, "OBJ") - objective_ids
    unknown_evidence = ids(semantic_script, "EVD") - evidence_ids
    if unknown_objectives:
        errors.append("presentation script references unknown objectives: " + ", ".join(sorted(unknown_objectives)))
    if unknown_evidence:
        errors.append("presentation script references unknown evidence: " + ", ".join(sorted(unknown_evidence)))

    scene_blocks = re.split(r"(?=^### SCN-\d{3,}\b)", semantic_script, flags=re.MULTILINE)[1:]
    state_scene_map: dict[str, str] = {}
    scene_content_map: dict[str, set[str]] = {}
    for block in scene_blocks:
        match = re.match(r"### (SCN-\d{3,})", block)
        scene_id = match.group(1) if match else "<unknown-scene>"
        scene_objectives = ids(block, "OBJ")
        scene_evidence = ids(block, "EVD")
        scene_content = set().union(*(
            ids(value, "CNT")
            for value in re.findall(
                r"^\s*-\s*内容引用\s*[：:]\s*(.*?)\s*$",
                block,
                re.MULTILINE,
            )
        ))
        scene_content_map[scene_id] = scene_content
        scene_states = state_definition_list(block)
        if not scene_objectives:
            errors.append(f"{scene_id} has no explicit OBJ-* reference")
        if not scene_evidence:
            errors.append(f"{scene_id} has no explicit EVD-* reference")
        if not scene_content:
            errors.append(f"{scene_id} has no explicit CNT-* reference")
        if not scene_states:
            errors.append(f"{scene_id} has no STATE-* definition")
        for state_id in scene_states:
            existing_scene = state_scene_map.get(state_id)
            if existing_scene and existing_scene != scene_id:
                errors.append(f"{state_id} is defined in more than one scene")
            else:
                state_scene_map[state_id] = scene_id
        for heading in SCRIPT_HEADINGS[2:]:
            if not completed_section(block, heading):
                errors.append(f"{scene_id} has no completed section: {heading}")

    total_minutes = field_minutes(contract, "总时长（分钟）")
    scene_minutes = field_minutes(script, "场景用时（分钟）")
    expected_duration = manifest.get("durationMinutes")
    if not total_minutes or total_minutes[0] != expected_duration:
        errors.append("contract total duration must match case.json durationMinutes")
    if not scene_minutes:
        errors.append("presentation script has no numeric scene duration")
    elif isinstance(expected_duration, int) and abs(sum(scene_minutes) - expected_duration) > 1:
        errors.append(f"scene minutes sum to {sum(scene_minutes)}, expected {expected_duration}")

    for location, text in semantic_files.items():
        for marker in PLACEHOLDERS:
            if marker in text:
                errors.append(f"{location} still contains placeholder marker {marker!r}")
                break

    parsed_contracts = parse_contract_records(semantic_contract, semantic_script)
    reference_files = dict(semantic_files)
    visual_path_for_index = case_dir / "visual-direction.md"
    if visual_path_for_index.is_file():
        reference_files["visual-direction.md"] = visual_path_for_index.read_text(encoding="utf-8")
    semantic_corpus = "\n".join(
        strip_nonsemantic_comments(text) for text in reference_files.values()
    )
    structured_marker_ids: dict[str, set[str]] = {}
    for prefix in ("SRC", "ERR", "FORM", "VIS"):
        definitions = marker_definition_list(semantic_corpus, prefix)
        duplicates_for_type = sorted({value for value in definitions if definitions.count(value) > 1})
        if duplicates_for_type:
            errors.append(
                f"duplicate {prefix} definitions: " + ", ".join(duplicates_for_type)
            )
        structured_marker_ids[prefix] = set(definitions)

    known_ids_by_prefix = {
        "DEC": {
            decision.get("id") for decision in manifest.get("decisions", [])
            if isinstance(decision, dict) and isinstance(decision.get("id"), str)
        },
        "OBJ": objective_ids,
        "EVD": evidence_ids,
        "STG": stage_ids,
        "SCN": scene_ids,
        "STATE": state_ids,
        "CNT": set(blocks),
        "TOL": set(parsed_contracts.tolerance_cases),
        "RESP": {record.record_id for record in parsed_contracts.of_type("RESP")},
        "AUTH": {record.record_id for record in parsed_contracts.of_type("AUTH")},
        "ACT": {record.record_id for record in parsed_contracts.of_type("ACT")},
        "ESC": {record.record_id for record in parsed_contracts.of_type("ESC")},
        **structured_marker_ids,
    }
    for prefix, known_ids in known_ids_by_prefix.items():
        unknown_ids = ids(semantic_corpus, prefix) - known_ids
        if unknown_ids:
            errors.append(
                f"semantic files reference unknown {prefix} IDs: "
                + ", ".join(sorted(unknown_ids))
            )
    fragment_refs = sorted(set(re.findall(r"\bCNT-\d{3,}#[A-Za-z0-9._-]+", semantic_corpus)))
    if fragment_refs:
        errors.append(
            "unstructured CNT-* fragments are forbidden; define exact CNT-* items instead: "
            + ", ".join(fragment_refs)
        )
    evaluator_registry = load_evaluator_registry(errors, capability_index_path)
    record_errors, record_warnings, record_summary = validate_executable_contracts(
        parsed_contracts,
        objective_ids=objective_ids,
        evidence_ids=evidence_ids,
        content_ids=set(blocks),
        scene_ids=scene_ids,
        scene_content_map=scene_content_map,
        state_ids=state_ids,
        state_scene_map=state_scene_map,
        decisions=manifest.get("decisions", []),
        duration_minutes=manifest.get("durationMinutes"),
        evaluator_registry=evaluator_registry,
    )
    errors.extend(record_errors)
    warnings.extend(record_warnings)

    visual = manifest.get("artifacts", {}).get("visualDirection", {})
    if visual.get("required"):
        visual_path = case_dir / "visual-direction.md"
        if visual_path.is_file():
            visual_text = visual_path.read_text(encoding="utf-8")
            for heading in VISUAL_HEADINGS:
                if heading not in visual_text:
                    errors.append(f"visual-direction.md is missing heading: {heading}")
            if not ids(visual_text, "VIS"):
                errors.append("high-risk visual direction has no VIS-* key frame")
            for marker in PLACEHOLDERS:
                if marker in visual_text:
                    errors.append(f"visual-direction.md still contains placeholder marker {marker!r}")
                    break
        else:
            errors.append("high-risk path is missing visual-direction.md")
    return locations, record_summary


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    errors: list[str] = []
    warnings: list[str] = []
    manifest_path = case_dir / "case.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read case.json: {exc}", file=sys.stderr)
        return 1

    validate_topology(case_dir, manifest, errors, warnings)
    unresolved = validate_decisions(manifest, errors)
    approved_hashes, stale_reviews = validate_reviews(case_dir, manifest, errors)
    exact_locations: dict[str, str] = {}
    contract_record_summary: dict[str, Any] = {}
    capability_index_path = discover_capability_index(
        case_dir,
        args.capability_index,
        errors,
    ) if args.target == "implementation-ready" else None

    if args.target == "implementation-ready":
        if unresolved:
            errors.append("unresolved blocking decisions: " + ", ".join(unresolved))
        for review_key in review_order(manifest):
            if manifest.get("reviews", {}).get(review_key, {}).get("status") != "approved":
                errors.append(f"required review is not approved: {review_key}")
        exact_locations, contract_record_summary = semantic_closure(
            case_dir, manifest, errors, warnings, capability_index_path
        )

    result_status = manifest.get("resultStatus")
    if result_status not in ("pending", "rejected"):
        errors.append(
            f"orchestration resultStatus may only be pending or rejected, got: {result_status}"
        )

    artifact_hashes = {}
    for key, artifact in manifest.get("artifacts", {}).items():
        try:
            current_hash = artifact_current_hash(case_dir, artifact)
        except (OSError, ValueError):
            current_hash = None
        if current_hash is not None:
            artifact_hashes[key] = current_hash

    if args.promote and manifest.get("schemaVersion") == SCHEMA_VERSION:
        for review_key in stale_reviews:
            review = manifest["reviews"].get(review_key)
            if isinstance(review, dict):
                archive_review(manifest, review_key, "validator detected a stale review scope")
                clear_review_state(review, "stale", "validator detected a stale review scope")
        readiness = {
            "status": "implementation-ready" if not errors and args.target == "implementation-ready" else "not-ready",
            "evaluatedAt": now_iso(),
            "validator": "courseware-case-v2",
            "artifactHashes": artifact_hashes,
            "approvedReviewHashes": approved_hashes if not errors else {},
            "exactContentLocations": exact_locations if not errors else {},
            "blockingReasons": [] if not errors else list(dict.fromkeys(errors)),
        }
        manifest["derivedReadiness"] = readiness
        manifest["stage"] = "implementation-ready" if readiness["status"] == "implementation-ready" else next_stage(manifest, ignore_readiness=True)
        save_manifest(manifest_path, manifest)

    report = {
        "validator": "courseware-case-v2",
        "target": args.target,
        "pipelineStatus": "passed" if not errors else "failed",
        "derivedReadiness": "implementation-ready" if not errors and args.target == "implementation-ready" else "not-ready",
        "outcomeStatus": result_status,
        "errors": list(dict.fromkeys(errors)),
        "warnings": list(dict.fromkeys(warnings)),
        "exactContentLocations": exact_locations,
        "contractRecordSummary": contract_record_summary,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"pipeline status: {report['pipelineStatus']}")
        print(f"derived readiness: {report['derivedReadiness']}")
        print(f"outcome status: {report['outcomeStatus']}")
        for error in report["errors"]:
            print(f"ERROR: {error}")
        for warning in report["warnings"]:
            print(f"WARNING: {warning}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
