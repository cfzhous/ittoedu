#!/usr/bin/env python3
"""Audit a V1 case and optionally create an unapproved V2 reconciliation draft."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

from courseware_case_v2 import PATH_MODES, now_iso, save_manifest, sha256_directory, sha256_file
from init_case import create_case_at


V1_ARTIFACTS = {
    "context": "00-context.md",
    "teachingDesign": "01-teaching-design.md",
    "contentSpec": "02-content-spec.md",
    "presentationScript": "03-presentation-script.md",
    "visualDirection": "04-visual-direction.md",
    "implementationHandoff": "05-implementation-handoff.md",
    "traceability": "06-traceability.json",
    "acceptance": "07-acceptance.md",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit or migrate CoursewareCaseManifestV1")
    parser.add_argument("source_case")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("audit")
    migrate = subparsers.add_parser("migrate")
    migrate.add_argument("--destination", required=True, help="New V2 directory; must not exist")
    migrate.add_argument("--path-mode", choices=PATH_MODES, default="standard")
    migrate.add_argument("--case-id", help="Override the V1 caseId if it is not a valid lowercase ID")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def audit_v1(source: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest_path = source / "case.json"
    if not manifest_path.is_file():
        raise ValueError("V1 source lacks case.json")
    manifest = read_json(manifest_path)
    if manifest.get("schemaVersion") != 1:
        raise ValueError("source case is not schemaVersion 1")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        raise ValueError("V1 source lacks an artifacts object")
    rows = []
    approval_claims = []
    for key, default_path in V1_ARTIFACTS.items():
        artifact = artifacts.get(key, {}) if isinstance(artifacts.get(key), dict) else {}
        relative = str(artifact.get("path") or default_path)
        candidate = (source / relative).resolve()
        try:
            candidate.relative_to(source)
        except ValueError:
            rows.append({"key": key, "path": relative, "exists": False, "error": "path escapes source"})
            continue
        current_hash = sha256_file(candidate) if candidate.is_file() else None
        status = artifact.get("status")
        rows.append({
            "key": key,
            "path": relative,
            "exists": candidate.is_file(),
            "statusClaim": status,
            "storedSha256": artifact.get("sha256"),
            "currentSha256": current_hash,
            "hashMatches": artifact.get("sha256") in (None, current_hash),
        })
        if status == "approved":
            approval_claims.append({
                "artifactKey": key,
                "storedSha256": artifact.get("sha256"),
                "currentSha256": current_hash,
                "hashMatches": artifact.get("sha256") == current_hash,
            })
    decisions_path = source / "decisions.json"
    legacy_decisions = []
    if decisions_path.is_file():
        value = read_json(decisions_path)
        for decision in value.get("decisions", []) if isinstance(value.get("decisions"), list) else []:
            if isinstance(decision, dict):
                legacy_decisions.append({
                    "id": decision.get("id"),
                    "blocking": decision.get("blocking"),
                    "hadResponse": bool(decision.get("response")),
                })
    audit = {
        "auditVersion": 1,
        "sourceSchemaVersion": 1,
        "sourceCase": str(source),
        "sourceManifestSha256": sha256_file(manifest_path),
        "sourceTreeSha256": sha256_directory(source),
        "artifacts": rows,
        "legacyApprovalClaims": approval_claims,
        "legacyDecisionClaims": legacy_decisions,
        "migrationPolicy": {
            "sourceIsReadOnly": True,
            "approvalsInherited": False,
            "decisionsInherited": False,
            "derivedReadinessInherited": False,
            "requiresSemanticReconciliation": True,
            "requiresFreshPathReviews": True,
        },
        "mapping": {
            "01-teaching-design.md + 02-content-spec.md": "01-courseware-contract.md draft",
            "03-presentation-script.md": "02-presentation-script.md draft",
            "04-visual-direction.md": "visual-direction.md draft only for high-risk",
            "decisions.json": "audit claims only; re-ask material decisions",
            "05-implementation-handoff.md": "not migrated; readiness is derived",
        },
    }
    return manifest, audit


def append_legacy(target: Path, title: str, paths: list[Path]) -> None:
    parts = [target.read_text(encoding="utf-8"), f"\n\n## {title}\n", "\n> 这些内容仅是未批准迁移输入，必须整理到上方 V2 结构并重新审阅。\n"]
    for path in paths:
        if path.is_file():
            parts.extend([f"\n### 来源：`{path.name}`\n\n", path.read_text(encoding="utf-8")])
    target.write_text("".join(parts), encoding="utf-8")


def preserve_v1_bytes(source: Path, destination: Path) -> dict[str, Any]:
    legacy_root = destination / "legacy-v1"
    legacy_root.mkdir()
    copied_files = []
    for path in sorted((item for item in source.rglob("*") if item.is_file()), key=lambda item: item.as_posix()):
        relative = path.relative_to(source)
        target = legacy_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        copied_files.append({
            "path": relative.as_posix(),
            "sha256": sha256_file(path),
        })
    legacy_tree_sha256 = sha256_directory(legacy_root)
    source_tree_sha256 = sha256_directory(source)
    if legacy_tree_sha256 != source_tree_sha256:
        raise RuntimeError("legacy-v1 byte-for-byte copy does not match the V1 source")
    return {
        "path": "legacy-v1",
        "fileCount": len(copied_files),
        "treeSha256": legacy_tree_sha256,
        "files": copied_files,
    }


def migrate(source: Path, destination: Path, path_mode: str, case_id_override: str | None) -> dict[str, Any]:
    source_manifest, audit = audit_v1(source)
    if destination.exists():
        raise ValueError(f"destination already exists: {destination}")
    try:
        destination.relative_to(source)
    except ValueError:
        pass
    else:
        raise ValueError("destination must not be inside the V1 source directory")
    case_id = str(case_id_override or source_manifest.get("caseId") or "")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", case_id):
        raise ValueError("V1 caseId is not V2-safe; provide --case-id")
    title = str(source_manifest.get("title") or case_id)
    duration = source_manifest.get("durationMinutes")
    if not isinstance(duration, int) or not 1 <= duration <= 600:
        raise ValueError("V1 durationMinutes is missing or invalid")
    source_before = audit["sourceTreeSha256"]
    migration_record = {
        "sourceSchemaVersion": 1,
        "sourceCase": str(source),
        "sourceManifestSha256": audit["sourceManifestSha256"],
        "sourceTreeSha256": source_before,
        "legacyApprovalClaims": audit["legacyApprovalClaims"],
        "legacyDecisionClaims": audit["legacyDecisionClaims"],
        "approvalsInherited": False,
        "decisionsInherited": False,
        "derivedReadinessInherited": False,
        "requiresSemanticReconciliation": True,
        "migratedAt": now_iso(),
    }
    try:
        create_case_at(
            destination,
            case_id=case_id,
            title=title,
            brief=f"V1 migration draft from {source}; reconcile all teaching semantics before review.",
            duration_minutes=duration,
            path_mode=path_mode,
            with_content=False,
            migration=migration_record,
        )
        preserved = preserve_v1_bytes(source, destination)
        append_legacy(
            destination / "01-courseware-contract.md",
            "V1 合同迁移输入",
            [source / "00-context.md", source / "01-teaching-design.md", source / "02-content-spec.md"],
        )
        append_legacy(
            destination / "02-presentation-script.md",
            "V1 呈现脚本迁移输入",
            [source / "03-presentation-script.md"],
        )
        if path_mode == "high-risk":
            append_legacy(
                destination / "visual-direction.md",
                "V1 视觉迁移输入",
                [source / "04-visual-direction.md"],
            )
        manifest_path = destination / "case.json"
        manifest = read_json(manifest_path)
        manifest["migration"]["preservedLegacy"] = preserved
        manifest["migration"]["sourcePreservedAfterMigration"] = sha256_directory(source) == source_before
        save_manifest(manifest_path, manifest)
        if not manifest["migration"]["sourcePreservedAfterMigration"]:
            raise RuntimeError("source case changed during migration")
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise
    return {
        "status": "migrated-as-unapproved-draft",
        "source": str(source),
        "destination": str(destination),
        "approvalsInherited": False,
        "decisionsInherited": False,
        "derivedReadiness": "not-ready",
    }


def main() -> int:
    args = parse_args()
    source = Path(args.source_case).resolve()
    try:
        if not source.is_dir():
            raise ValueError(f"source case directory does not exist: {source}")
        _, audit = audit_v1(source)
        if args.command == "audit":
            print(json.dumps(audit, ensure_ascii=False, indent=2))
            return 0
        result = migrate(source, Path(args.destination).resolve(), args.path_mode, args.case_id)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
