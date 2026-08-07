#!/usr/bin/env python3
"""Validate structural integrity and readiness of a file-backed courseware case."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


REQUIRED_FILES = {
    "context": "00-context.md",
    "teachingDesign": "01-teaching-design.md",
    "contentSpec": "02-content-spec.md",
    "presentationScript": "03-presentation-script.md",
    "visualDirection": "04-visual-direction.md",
    "implementationHandoff": "05-implementation-handoff.md",
    "traceability": "06-traceability.json",
    "acceptance": "07-acceptance.md",
}

HEADINGS = {
    "00-context.md": ["## 原始请求", "## 来源清单", "## 硬约束", "## 缺失信息", "## 冲突", "## 已批准假设"],
    "01-teaching-design.md": ["## 受众与使用场景", "## 学习目标", "## 学习证据", "## 困难与误概念", "## 教学序列", "## 目标—证据—阶段覆盖"],
    "02-content-spec.md": ["## 内容边界与难度标尺", "## 权威内容项", "#### 完整学习者可见题面/材料", "#### 完整推理或解释", "#### 难度与认知要求", "#### 揭示策略", "## 整课容量表"],
    "03-presentation-script.md": ["## 全课推进规则", "## 教学节拍", "#### 初始画面", "#### 操作前必须可见", "#### 学生动作", "#### 即时反馈", "#### 分支与修复", "#### 稳定结束状态", "#### 证据与静态审阅帧"],
    "04-visual-direction.md": ["## 视觉目标", "## 必须避免", "## 各节拍构图计划", "## 互动因果与动效", "## 公式、图表与专业排版", "## 关键帧"],
    "05-implementation-handoff.md": ["## 获批制品", "## 已解决决策", "## 权威内容", "## 可编辑性要求", "## 交付格式", "## 接受证据", "## 变更控制"],
    "07-acceptance.md": ["## 管线状态", "## 结果状态", "## 首轮冻结", "## 脚本忠实度", "## 人类接受记录"],
}

PLACEHOLDERS = ("[待填写", "{{", "TODO", "TBD")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest


def ids(text: str, prefix: str) -> set[str]:
    return set(re.findall(rf"\b{re.escape(prefix)}-\d{{3,}}\b", text))


def field_minutes(text: str, label: str) -> list[int]:
    return [int(value) for value in re.findall(rf"{re.escape(label)}\s*[：:]\s*(\d+)", text)]


def section_has_content(block: str, heading: str) -> bool:
    match = re.search(rf"^{re.escape(heading)}\s*$([\s\S]*?)(?=^#{{2,4}}\s|\Z)", block, re.MULTILINE)
    if not match:
        return False
    value = match.group(1).strip()
    return bool(value) and not any(marker in value for marker in PLACEHOLDERS)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a courseware case")
    parser.add_argument("case_dir")
    parser.add_argument("--target", choices=("draft", "implementation-ready", "accepted"), default="draft")
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--promote", action="store_true", help="Write the validated target stage into case.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    errors: list[str] = []
    warnings: list[str] = []
    texts: dict[str, str] = {}

    manifest_path = case_dir / "case.json"
    decisions_path = case_dir / "decisions.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        decisions = json.loads(decisions_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read case manifest: {exc}", file=sys.stderr)
        return 1

    if manifest.get("schemaVersion") != 1:
        errors.append("case.json must use schemaVersion 1")
    if manifest.get("authoringMode") != "ppt-compatible":
        errors.append("authoringMode must be ppt-compatible for Skill V1")
    if decisions.get("schemaVersion") != 1 or not isinstance(decisions.get("decisions"), list):
        errors.append("decisions.json must contain schemaVersion 1 and a decisions array")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        errors.append("case.json artifacts must be an object")
        artifacts = {}

    for key, expected_name in REQUIRED_FILES.items():
        artifact = artifacts.get(key)
        if not isinstance(artifact, dict):
            errors.append(f"missing artifact manifest entry: {key}")
            continue
        if artifact.get("path") != expected_name:
            errors.append(f"artifact {key} must point to {expected_name}")
        path = case_dir / expected_name
        if not path.is_file():
            errors.append(f"missing artifact file: {expected_name}")
            continue
        if path.suffix == ".md":
            text = path.read_text(encoding="utf-8")
            texts[expected_name] = text
            for heading in HEADINGS.get(expected_name, []):
                if heading not in text:
                    errors.append(f"{expected_name} is missing heading: {heading}")

        stored_hash = artifact.get("sha256")
        if stored_hash and stored_hash != sha256(path):
            errors.append(f"stale approval/hash for artifact {key}")

    unresolved = []
    for decision in decisions.get("decisions", []):
        if isinstance(decision, dict) and decision.get("blocking") is True and not decision.get("response"):
            unresolved.append(str(decision.get("id", "<missing-id>")))
    declared_blockers = set(manifest.get("blockingDecisionIds") or [])
    if set(unresolved) != declared_blockers:
        errors.append("blockingDecisionIds does not match unresolved blocking decisions")

    if args.target in ("implementation-ready", "accepted"):
        required_approved = ("context", "teachingDesign", "contentSpec", "presentationScript", "implementationHandoff")
        for key in required_approved:
            artifact = artifacts.get(key, {})
            if artifact.get("status") != "approved":
                errors.append(f"artifact {key} must be approved")
            for approval_key in ("sha256", "approvedBy", "approvedAt", "approvalEvidence"):
                if not artifact.get(approval_key):
                    errors.append(f"approved artifact {key} is missing {approval_key}")
        visual = artifacts.get("visualDirection", {})
        if visual.get("status") not in ("approved", "not-required"):
            errors.append("visualDirection must be approved or explicitly not-required")
        if visual.get("status") == "not-required" and not visual.get("notRequiredReason"):
            errors.append("visualDirection not-required needs a concrete reason")
        if unresolved:
            errors.append("unresolved blocking decisions: " + ", ".join(unresolved))

        for name in ("00-context.md", "01-teaching-design.md", "02-content-spec.md", "03-presentation-script.md", "05-implementation-handoff.md"):
            for marker in PLACEHOLDERS:
                if marker in texts.get(name, ""):
                    errors.append(f"{name} still contains placeholder marker {marker!r}")
                    break
        if visual.get("status") == "approved":
            for marker in PLACEHOLDERS:
                if marker in texts.get("04-visual-direction.md", ""):
                    errors.append(f"04-visual-direction.md still contains placeholder marker {marker!r}")
                    break

        teaching = texts.get("01-teaching-design.md", "")
        content = texts.get("02-content-spec.md", "")
        script = texts.get("03-presentation-script.md", "")
        handoff = texts.get("05-implementation-handoff.md", "")

        objective_ids = ids(teaching, "OBJ")
        evidence_ids = ids(teaching, "EVD")
        stage_ids = ids(teaching, "STG")
        content_ids = ids(content, "CNT")
        beat_ids = ids(script, "BEAT")
        for label, values in (("objective", objective_ids), ("evidence", evidence_ids), ("teaching stage", stage_ids), ("content item", content_ids), ("presentation beat", beat_ids)):
            if not values:
                errors.append(f"no {label} IDs found")

        script_content_refs = ids(script, "CNT")
        unknown_content = script_content_refs - content_ids
        if unknown_content:
            errors.append("presentation script references unknown content IDs: " + ", ".join(sorted(unknown_content)))
        unpresented_content = content_ids - script_content_refs
        if unpresented_content:
            errors.append("content items not used by presentation script: " + ", ".join(sorted(unpresented_content)))
        unknown_objectives = (ids(content, "OBJ") | ids(script, "OBJ")) - objective_ids
        unknown_evidence = (ids(content, "EVD") | ids(script, "EVD")) - evidence_ids
        if unknown_objectives:
            errors.append("unknown objective references: " + ", ".join(sorted(unknown_objectives)))
        if unknown_evidence:
            errors.append("unknown evidence references: " + ", ".join(sorted(unknown_evidence)))

        beat_blocks = re.split(r"(?=^### BEAT-\d{3,}\b)", script, flags=re.MULTILINE)[1:]
        for block in beat_blocks:
            beat_match = re.match(r"### (BEAT-\d{3,})", block)
            beat_id = beat_match.group(1) if beat_match else "<unknown>"
            for heading in ("#### 初始画面", "#### 操作前必须可见", "#### 学生动作", "#### 即时反馈", "#### 分支与修复", "#### 稳定结束状态", "#### 证据与静态审阅帧"):
                if not section_has_content(block, heading):
                    errors.append(f"{beat_id} has no completed section: {heading}")

        total_values = field_minutes(teaching, "总时长（分钟）")
        beat_minutes = field_minutes(script, "节拍总时长（分钟）")
        if not total_values:
            errors.append("teaching design is missing numeric total duration")
        elif not beat_minutes:
            errors.append("presentation script is missing numeric beat durations")
        elif abs(sum(beat_minutes) - total_values[0]) > 1:
            errors.append(f"presentation beat minutes sum to {sum(beat_minutes)}, expected {total_values[0]}")

        content_minutes = field_minutes(content, "预计用时（分钟）")
        if total_values and content_minutes and abs(sum(content_minutes) - total_values[0]) > 5:
            warnings.append(f"content item minutes sum to {sum(content_minutes)}, while lesson duration is {total_values[0]}; verify overlap or missing capacity")

        for key in ("teachingDesign", "contentSpec", "presentationScript"):
            expected_hash = artifacts.get(key, {}).get("sha256")
            if expected_hash and expected_hash not in handoff:
                errors.append(f"handoff does not contain approved hash for {key}")
        if visual.get("status") == "approved" and visual.get("sha256") not in handoff:
            errors.append("handoff does not contain approved hash for visualDirection")

    if args.target == "accepted":
        acceptance = artifacts.get("acceptance", {})
        if acceptance.get("status") != "approved":
            errors.append("acceptance artifact must be approved")
        acceptance_text = texts.get("07-acceptance.md", "")
        if "- 结果：accepted" not in acceptance_text:
            errors.append("acceptance record must explicitly contain '- 结果：accepted'")
        for marker in PLACEHOLDERS:
            if marker in acceptance_text:
                errors.append(f"07-acceptance.md still contains placeholder marker {marker!r}")
                break

    if not errors and args.promote:
        manifest["stage"] = args.target
        manifest["updatedAt"] = now_iso()
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {
        "validator": "courseware-case-v1",
        "target": args.target,
        "pipelineStatus": "passed" if not errors else "failed",
        "outcomeStatus": "pending",
        "errors": errors,
        "warnings": warnings,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"pipeline status: {report['pipelineStatus']}")
        print("outcome status: pending")
        for error in errors:
            print(f"ERROR: {error}")
        for warning in warnings:
            print(f"WARNING: {warning}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
