#!/usr/bin/env python3
"""Verify that a courseware case is safe to enter Project V7 implementation."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


REQUIRED_APPROVED = ("context", "teachingDesign", "contentSpec", "presentationScript", "implementationHandoff")
IMPLEMENTATION_STAGES = {
    "implementation-ready",
    "building-sample",
    "sample-review",
    "building-full",
    "outcome-review",
    "accepted",
}
PLACEHOLDERS = ("[待填写", "{{", "TODO", "TBD")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a Project V7 implementation handoff")
    parser.add_argument("case_dir")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    errors: list[str] = []
    warnings: list[str] = []
    try:
        manifest = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
        decisions = json.loads((case_dir / "decisions.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read handoff: {exc}", file=sys.stderr)
        return 1

    if manifest.get("schemaVersion") != 1:
        errors.append("case.json must use schemaVersion 1")
    if manifest.get("authoringMode") != "ppt-compatible":
        errors.append("Skill V1 only accepts authoringMode ppt-compatible")
    if manifest.get("stage") not in IMPLEMENTATION_STAGES:
        errors.append(f"case stage is {manifest.get('stage')!r}, not implementation-ready or later")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        errors.append("case.json artifacts must be an object")
        artifacts = {}

    approved_hashes: dict[str, str] = {}
    for key in REQUIRED_APPROVED:
        artifact = artifacts.get(key)
        if not isinstance(artifact, dict):
            errors.append(f"missing artifact entry: {key}")
            continue
        if artifact.get("status") != "approved":
            errors.append(f"artifact {key} is not approved")
        path = case_dir / str(artifact.get("path", ""))
        if not path.is_file():
            errors.append(f"artifact {key} file is missing: {path.name}")
            continue
        current_hash = sha256(path)
        if artifact.get("sha256") != current_hash:
            errors.append(f"artifact {key} approval hash is stale")
        else:
            approved_hashes[key] = current_hash
        for approval_key in ("approvedBy", "approvedAt", "approvalEvidence"):
            if not artifact.get(approval_key):
                errors.append(f"artifact {key} is missing {approval_key}")
        if path.suffix == ".md":
            text = path.read_text(encoding="utf-8")
            if any(marker in text for marker in PLACEHOLDERS):
                errors.append(f"artifact {key} still contains template placeholders")

    visual = artifacts.get("visualDirection", {})
    if visual.get("status") == "approved":
        visual_path = case_dir / str(visual.get("path", ""))
        if not visual_path.is_file() or visual.get("sha256") != sha256(visual_path):
            errors.append("visualDirection approval hash is stale or file is missing")
        else:
            approved_hashes["visualDirection"] = visual["sha256"]
    elif visual.get("status") == "not-required":
        if not visual.get("notRequiredReason"):
            errors.append("visualDirection is not-required without a reason")
    else:
        errors.append("visualDirection must be approved or explicitly not-required")

    unresolved = [
        str(item.get("id", "<missing-id>"))
        for item in decisions.get("decisions", [])
        if isinstance(item, dict) and item.get("blocking") is True and not item.get("response")
    ]
    if unresolved:
        errors.append("unresolved blocking decisions: " + ", ".join(unresolved))
    if set(manifest.get("blockingDecisionIds") or []) != set(unresolved):
        errors.append("blockingDecisionIds is inconsistent with decisions.json")

    handoff_entry = artifacts.get("implementationHandoff", {})
    handoff_path = case_dir / str(handoff_entry.get("path", "05-implementation-handoff.md"))
    if handoff_path.is_file():
        handoff_text = handoff_path.read_text(encoding="utf-8")
        for key in ("teachingDesign", "contentSpec", "presentationScript"):
            value = approved_hashes.get(key)
            if value and value not in handoff_text:
                errors.append(f"handoff does not cite approved hash for {key}")
        if "visualDirection" in approved_hashes and approved_hashes["visualDirection"] not in handoff_text:
            errors.append("handoff does not cite approved hash for visualDirection")

    if not errors and not warnings:
        warnings.append("Handoff structure is valid; teaching, visual, and outcome quality still require human review.")

    report = {
        "validator": "project-v7-handoff-v1",
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
