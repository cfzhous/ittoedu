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


PLACEHOLDERS = ("[待填写", "{{", "TODO", "TBD")
UNDERSPECIFIED = ("见聊天", "见旧实现", "参考旧课件", "同上", "按需处理", "后续补充", "由实现决定")
CONTRACT_HEADINGS = (
    "## 受众、场景与时间",
    "## 学习目标与证据",
    "## 内容边界与教学序列",
    "## 精确内容",
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
        "--promote",
        action="store_true",
        help="Persist the derived readiness result; never creates an approval or accepted outcome",
    )
    return parser.parse_args()


def ids(text: str, prefix: str) -> set[str]:
    return set(re.findall(rf"\b{re.escape(prefix)}-\d{{3,}}\b", text))


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


def semantic_closure(case_dir: Path, manifest: dict[str, Any], errors: list[str], warnings: list[str]) -> dict[str, str]:
    contract_path = case_dir / "01-courseware-contract.md"
    script_path = case_dir / "02-presentation-script.md"
    try:
        contract = contract_path.read_text(encoding="utf-8")
        script = script_path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"cannot read required Markdown: {exc}")
        return {}
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

    objective_ids = ids(contract, "OBJ")
    evidence_ids = ids(contract, "EVD")
    stage_ids = ids(contract, "STG")
    scene_ids = ids(script, "SCN")
    state_ids = ids(script, "STATE")
    for label, values in (
        ("learning objective", objective_ids),
        ("learning evidence", evidence_ids),
        ("teaching stage", stage_ids),
        ("scene", scene_ids),
        ("stable state", state_ids),
    ):
        if not values:
            errors.append(f"no {label} IDs found")
    script_content_refs = ids(script, "CNT")
    unknown_content = script_content_refs - set(blocks)
    if unknown_content:
        errors.append("presentation script references unknown content IDs: " + ", ".join(sorted(unknown_content)))
    unused_content = set(blocks) - script_content_refs
    if unused_content:
        errors.append("exact content items unused by the presentation script: " + ", ".join(sorted(unused_content)))
    unknown_objectives = ids(script, "OBJ") - objective_ids
    unknown_evidence = ids(script, "EVD") - evidence_ids
    if unknown_objectives:
        errors.append("presentation script references unknown objectives: " + ", ".join(sorted(unknown_objectives)))
    if unknown_evidence:
        errors.append("presentation script references unknown evidence: " + ", ".join(sorted(unknown_evidence)))

    scene_blocks = re.split(r"(?=^### SCN-\d{3,}\b)", script, flags=re.MULTILINE)[1:]
    for block in scene_blocks:
        match = re.match(r"### (SCN-\d{3,})", block)
        scene_id = match.group(1) if match else "<unknown-scene>"
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
    return locations


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

    if args.target == "implementation-ready":
        if unresolved:
            errors.append("unresolved blocking decisions: " + ", ".join(unresolved))
        for review_key in review_order(manifest):
            if manifest.get("reviews", {}).get(review_key, {}).get("status") != "approved":
                errors.append(f"required review is not approved: {review_key}")
        exact_locations = semantic_closure(case_dir, manifest, errors, warnings)

    result_status = manifest.get("resultStatus")
    if result_status not in ("pending", "engineering candidate", "art candidate", "accepted", "rejected"):
        errors.append(f"invalid resultStatus: {result_status}")
    if result_status == "accepted":
        human = manifest.get("humanAcceptance")
        if not isinstance(human, dict) or not all(str(human.get(key) or "").strip() for key in ("reviewer", "acceptedAt", "evidence")):
            errors.append("accepted requires an explicit humanAcceptance reviewer, time, and evidence")
        elif is_automated_identity(human.get("reviewer")):
            errors.append("accepted reviewer must be human; automated identities cannot accept outcomes")

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
