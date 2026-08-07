#!/usr/bin/env python3
"""Manage artifact hashes and human approval state for a courseware case."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


DEPENDENTS = {
    "context": ["teachingDesign", "contentSpec", "presentationScript", "visualDirection", "implementationHandoff", "traceability", "acceptance"],
    "teachingDesign": ["contentSpec", "presentationScript", "visualDirection", "implementationHandoff", "traceability", "acceptance"],
    "contentSpec": ["presentationScript", "visualDirection", "implementationHandoff", "traceability", "acceptance"],
    "presentationScript": ["visualDirection", "implementationHandoff", "traceability", "acceptance"],
    "visualDirection": ["implementationHandoff", "traceability", "acceptance"],
    "implementationHandoff": ["traceability", "acceptance"],
    "traceability": ["acceptance"],
    "acceptance": [],
}

REVIEW_STAGE = {
    "context": "intake",
    "teachingDesign": "teaching-design-review",
    "contentSpec": "content-spec-review",
    "presentationScript": "presentation-script-review",
    "visualDirection": "visual-review",
    "implementationHandoff": "visual-review",
    "traceability": "building-sample",
    "acceptance": "outcome-review",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(case_dir: Path) -> tuple[Path, dict]:
    manifest_path = case_dir / "case.json"
    if not manifest_path.is_file():
        raise ValueError(f"missing manifest: {manifest_path}")
    value = json.loads(manifest_path.read_text(encoding="utf-8"))
    if value.get("schemaVersion") != 1 or not isinstance(value.get("artifacts"), dict):
        raise ValueError("case.json is not CoursewareCaseManifestV1")
    return manifest_path, value


def artifact_path(case_dir: Path, artifact: dict) -> Path:
    path = (case_dir / str(artifact.get("path", ""))).resolve()
    try:
        path.relative_to(case_dir)
    except ValueError as exc:
        raise ValueError(f"artifact path escapes case directory: {path}") from exc
    if not path.is_file():
        raise ValueError(f"artifact file is missing: {path}")
    return path


def clear_approval(artifact: dict) -> None:
    for key in ("approvedBy", "approvedAt", "approvalEvidence", "rejectedAt", "rejectionEvidence", "notRequiredReason"):
        artifact.pop(key, None)


def invalidate_dependents(manifest: dict, key: str) -> list[str]:
    changed: list[str] = []
    artifacts = manifest["artifacts"]
    for dependent_key in DEPENDENTS.get(key, []):
        dependent = artifacts.get(dependent_key)
        if not isinstance(dependent, dict):
            continue
        previous = dependent.get("status")
        if previous == "missing":
            continue
        dependent["status"] = "draft"
        dependent.pop("sha256", None)
        clear_approval(dependent)
        changed.append(dependent_key)
    if changed:
        manifest["stage"] = REVIEW_STAGE[key]
    return changed


def save(path: Path, manifest: dict) -> None:
    manifest["updatedAt"] = now_iso()
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage a courseware case artifact")
    parser.add_argument("case_dir")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ready = subparsers.add_parser("ready")
    ready.add_argument("artifact_key")
    ready.add_argument("--version")

    approve = subparsers.add_parser("approve")
    approve.add_argument("artifact_key")
    approve.add_argument("--evidence", required=True)

    reject = subparsers.add_parser("reject")
    reject.add_argument("artifact_key")
    reject.add_argument("--evidence", required=True)

    not_required = subparsers.add_parser("not-required")
    not_required.add_argument("artifact_key")
    not_required.add_argument("--reason", required=True)

    invalidate = subparsers.add_parser("invalidate")
    invalidate.add_argument("artifact_key")
    invalidate.add_argument("--reason", required=True)

    subparsers.add_parser("status")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    try:
        manifest_path, manifest = load_manifest(case_dir)
        artifacts = manifest["artifacts"]

        if args.command == "status":
            rows = []
            for key, artifact in artifacts.items():
                path = artifact_path(case_dir, artifact)
                current_hash = sha256(path)
                rows.append({
                    "key": key,
                    "version": artifact.get("version"),
                    "status": artifact.get("status"),
                    "hashMatches": artifact.get("sha256") in (None, current_hash),
                })
            print(json.dumps({"stage": manifest.get("stage"), "artifacts": rows}, ensure_ascii=False, indent=2))
            return 0

        key = args.artifact_key
        if key not in artifacts:
            raise ValueError(f"unknown artifact key: {key}")
        artifact = artifacts[key]
        path = artifact_path(case_dir, artifact)
        current_hash = sha256(path)

        if args.command == "ready":
            previous_hash = artifact.get("sha256")
            invalidated = invalidate_dependents(manifest, key) if previous_hash not in (None, current_hash) else []
            artifact["status"] = "ready-for-review"
            artifact["sha256"] = current_hash
            clear_approval(artifact)
            if args.version:
                artifact["version"] = args.version
            manifest["stage"] = REVIEW_STAGE[key]
            save(manifest_path, manifest)
            print(json.dumps({"status": "ready-for-review", "artifact": key, "sha256": current_hash, "invalidated": invalidated}, ensure_ascii=False))
            return 0

        if args.command == "approve":
            if artifact.get("status") != "ready-for-review":
                raise ValueError("artifact must be ready-for-review before approval")
            if artifact.get("sha256") != current_hash:
                raise ValueError("artifact changed after it was marked ready; mark it ready again")
            artifact.update({
                "status": "approved",
                "sha256": current_hash,
                "approvedBy": "user",
                "approvedAt": now_iso(),
                "approvalEvidence": args.evidence,
            })
            save(manifest_path, manifest)
            print(json.dumps({"status": "approved", "artifact": key, "sha256": current_hash}, ensure_ascii=False))
            return 0

        if args.command == "reject":
            artifact.update({"status": "rejected", "sha256": current_hash, "rejectedAt": now_iso(), "rejectionEvidence": args.evidence})
            clear_approval(artifact)
            artifact["status"] = "rejected"
            artifact["sha256"] = current_hash
            artifact["rejectedAt"] = now_iso()
            artifact["rejectionEvidence"] = args.evidence
            invalidate_dependents(manifest, key)
            manifest["stage"] = REVIEW_STAGE[key]
            save(manifest_path, manifest)
            print(json.dumps({"status": "rejected", "artifact": key}, ensure_ascii=False))
            return 0

        if args.command == "not-required":
            if key != "visualDirection":
                raise ValueError("only visualDirection may be marked not-required in Skill V1")
            invalidate_dependents(manifest, key)
            artifact["status"] = "not-required"
            artifact.pop("sha256", None)
            clear_approval(artifact)
            artifact["notRequiredReason"] = args.reason
            manifest["stage"] = "visual-review"
            save(manifest_path, manifest)
            print(json.dumps({"status": "not-required", "artifact": key, "reason": args.reason}, ensure_ascii=False))
            return 0

        if args.command == "invalidate":
            artifact["status"] = "draft"
            artifact.pop("sha256", None)
            clear_approval(artifact)
            artifact["invalidationReason"] = args.reason
            invalidated = invalidate_dependents(manifest, key)
            manifest["stage"] = REVIEW_STAGE[key]
            save(manifest_path, manifest)
            print(json.dumps({"status": "draft", "artifact": key, "invalidated": invalidated}, ensure_ascii=False))
            return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
