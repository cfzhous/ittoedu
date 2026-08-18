#!/usr/bin/env python3
"""Initialize a non-overwriting, real-API Project V8 implementation workspace."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from v8_common import (
    load_contract_facts,
    sha256_file,
    validate_capabilities,
    validate_case_readiness,
    within,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize a Project V8 implementation workspace")
    parser.add_argument("--case-dir", required=True)
    parser.add_argument("--editor-root", required=True)
    return parser.parse_args()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render(source: Path, destination: Path, replacements: dict[str, str]) -> None:
    text = source.read_text(encoding="utf-8")
    for token, value in replacements.items():
        text = text.replace(token, value)
    destination.write_text(text, encoding="utf-8")


def typescript_import_prefix(editor_root: Path, implementation_dir: Path) -> str:
    """Return an import prefix that stays valid when case/editor use different drives.

    ``os.path.relpath`` raises ``ValueError`` for cross-drive Windows paths.  Node's
    ESM resolver accepts absolute ``file:`` URLs, so use one whenever a relative
    path cannot honestly represent the editor root.
    """
    try:
        relative = os.path.relpath(editor_root, implementation_dir).replace("\\", "/")
    except ValueError:
        return editor_root.resolve().as_uri()
    return relative if relative.startswith(".") else "./" + relative


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    editor_root = Path(args.editor_root).resolve()
    skill_dir = Path(__file__).resolve().parent.parent
    try:
        if not case_dir.is_dir():
            raise ValueError(f"case directory is missing: {case_dir}")
        if not (editor_root / "package.json").is_file():
            raise ValueError(f"editor root is invalid: {editor_root}")
        case = validate_case_readiness(case_dir, skill_dir, editor_root=editor_root)
        contract = load_contract_facts(case_dir, case=case, skill_dir=skill_dir)
        _, capability_hash = validate_capabilities(editor_root)

        artifacts = case.get("artifacts")
        script = artifacts.get("presentationScript") if isinstance(artifacts, dict) else None
        script_path_value = script.get("path") if isinstance(script, dict) else None
        if not isinstance(script_path_value, str):
            raise ValueError("presentationScript artifact path is missing")
        script_path = within(case_dir, case_dir / script_path_value)
        presentation_hash = sha256_file(script_path)
        if script.get("sha256") != presentation_hash:
            raise ValueError("presentation script hash is stale")

        targets = [
            case_dir / "03-development-plan.md",
            case_dir / "implementation",
            case_dir / "evidence",
            case_dir / "project",
            case_dir / "tasks",
        ]
        existing = [str(path) for path in targets if path.exists()]
        if existing:
            raise ValueError("refusing to overwrite existing implementation paths: " + ", ".join(existing))

        abandoned_staging = sorted(case_dir.glob(".v8-init-*"))
        if abandoned_staging:
            raise ValueError(
                "an earlier initialization staging path needs inspection: "
                + ", ".join(str(path) for path in abandoned_staging)
            )

        staging = case_dir / f".v8-init-{os.getpid()}"
        staging.mkdir()
        installed: list[Path] = []
        try:
            for name in ("implementation", "evidence", "project", "tasks"):
                (staging / name).mkdir()
            templates = skill_dir / "assets" / "case-templates"
            implementation_dir = case_dir / "implementation"
            import_prefix = typescript_import_prefix(editor_root, implementation_dir)
            case_id = str(case.get("caseId"))
            title = str(case.get("title"))
            replacements = {
                "{{CASE_ID}}": case_id,
                "{{CASE_ID_UNDERSCORE}}": re.sub(r"[^a-zA-Z0-9_]", "_", case_id),
                "{{TITLE}}": title,
                "{{TITLE_JSON}}": json.dumps(title, ensure_ascii=False),
                "{{PRESENTATION_SHA256}}": presentation_hash,
                "{{COURSEWARE_CONTRACT_SHA256}}": contract["coursewareContractSha256"],
                "{{CAPABILITY_SHA256}}": capability_hash,
                "{{EDITOR_IMPORT_PREFIX}}": import_prefix,
            }
            render(templates / "03-development-plan.md", staging / "03-development-plan.md", replacements)
            development_plan_hash = sha256_file(staging / "03-development-plan.md")
            replacements["{{DEVELOPMENT_PLAN_SHA256}}"] = development_plan_hash
            render(templates / "build.ts", staging / "implementation" / "build.ts", replacements)
            render(templates / "patch.ts", staging / "implementation" / "patch.ts", replacements)
            render(
                templates / "behavior-spec.json",
                staging / "implementation" / "behavior-spec.json",
                replacements,
            )
            behavior_spec_hash = sha256_file(staging / "implementation" / "behavior-spec.json")

            write_json(staging / "implementation" / "authoring-inventory.json", {
                "schemaVersion": 2,
                "caseId": case_id,
                "projectPath": f"project/{case_id}.h5lesson",
                "generatedFrom": {
                    "coursewareContractSha256": contract["coursewareContractSha256"],
                    "presentationScriptSha256": presentation_hash,
                    "capabilityIndexSha256": capability_hash,
                    "developmentPlanSha256": development_plan_hash,
                },
                "globalEntities": [],
                "scenes": [],
            })
            inventory_hash = sha256_file(staging / "implementation" / "authoring-inventory.json")
            replacements["{{AUTHORING_INVENTORY_SHA256}}"] = inventory_hash
            render(
                templates / "authoring-target-snapshot.json",
                staging / "implementation" / "authoring-target-snapshot.json",
                replacements,
            )
            target_snapshot_hash = sha256_file(
                staging / "implementation" / "authoring-target-snapshot.json"
            )
            write_json(staging / "implementation" / "implementation-state.json", {
                "schemaVersion": 2,
                "caseId": case_id,
                "status": "planned",
                "createdAt": now_iso(),
                "coursewareContractSha256": contract["coursewareContractSha256"],
                "presentationScriptSha256": presentation_hash,
                "capabilityIndexSha256": capability_hash,
                "developmentPlanSha256": development_plan_hash,
                "behaviorSpecSha256": behavior_spec_hash,
                "authoringInventorySha256": inventory_hash,
                "authoringTargetSnapshotSha256": target_snapshot_hash,
                "currentProjectSha256": None,
                "tasks": [],
            })
            write_json(staging / "evidence" / "evidence-manifest.json", {
                "schemaVersion": 2,
                "caseId": case_id,
                "caseRoot": "..",
                "pipelineStatus": "not-run",
                "outcomeStatus": "placeholder",
                "generatedBy": "build-project-v8-courseware",
                "inputs": {
                    "coursewareContractSha256": contract["coursewareContractSha256"],
                    "presentationScriptSha256": presentation_hash,
                    "capabilityIndexSha256": capability_hash,
                    "developmentPlanSha256": development_plan_hash,
                    "behaviorSpecSha256": behavior_spec_hash,
                    "projectSha256": None,
                },
                "commands": [],
                "artifacts": [],
                "editRoundTrips": [],
                "requiredFrames": [],
                "differences": [],
                "remainingRisks": [],
                "verification": {
                    "behaviorSpecArtifactId": None,
                    "behaviorReportArtifactId": None,
                    "authoringInventoryArtifactId": None,
                    "authoringTargetSnapshotArtifactId": None,
                    "authoringSessionReportArtifactId": None,
                },
                "humanAcceptance": None,
            })

            for child in sorted(staging.iterdir(), key=lambda path: path.name):
                destination = case_dir / child.name
                child.rename(destination)
                installed.append(destination)
        except Exception:
            for destination in reversed(installed):
                if destination.is_dir():
                    shutil.rmtree(destination)
                elif destination.exists():
                    destination.unlink()
            raise
        finally:
            shutil.rmtree(staging, ignore_errors=True)

        print(json.dumps({
            "status": "initialized",
            "caseDir": str(case_dir),
            "presentationScriptSha256": presentation_hash,
            "coursewareContractSha256": contract["coursewareContractSha256"],
            "capabilityIndexSha256": capability_hash,
            "developmentPlanSha256": development_plan_hash,
            "behaviorSpecSha256": behavior_spec_hash,
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
