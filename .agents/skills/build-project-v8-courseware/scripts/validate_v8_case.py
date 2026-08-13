#!/usr/bin/env python3
"""Validate Builder inputs and the persisted V8 implementation contract."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from v8_common import load_json, sha256_file, validate_capabilities, validate_case_readiness, within


REQUIRED_PLAN_HEADINGS = (
    "## 工程级不变量",
    "## 场景—状态实现矩阵",
    "## 共享机制",
    "## Runtime / Component 合同",
    "## 任务图",
    "## 验收矩阵",
)
CONTENT_ID_PATTERN = re.compile(r"^(CNT-\d{3,})(?:[#/:.].+)?$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a Project V8 courseware implementation case")
    parser.add_argument("--case-dir", required=True)
    parser.add_argument("--editor-root", required=True)
    parser.add_argument("--target", choices=("entry", "implementation", "evidence", "accepted"), default="implementation")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def validate_inventory_provenance(
    case_dir: Path,
    case: dict,
    capability_hash: str,
    errors: list[str],
) -> tuple[dict, str | None]:
    artifacts = case.get("artifacts")
    script = artifacts.get("presentationScript") if isinstance(artifacts, dict) else None
    script_hash = script.get("sha256") if isinstance(script, dict) else None
    readiness = case.get("derivedReadiness")
    readiness_hashes = readiness.get("artifactHashes") if isinstance(readiness, dict) else None
    readiness_script_hash = (
        readiness_hashes.get("presentationScript") if isinstance(readiness_hashes, dict) else None
    )
    if not isinstance(script_hash, str) or script_hash != readiness_script_hash:
        errors.append("case readiness does not bind the current presentation script hash")

    inventory = load_json(case_dir / "implementation" / "authoring-inventory.json")
    case_id = case.get("caseId")
    if inventory.get("caseId") != case_id:
        errors.append("Authoring Inventory caseId does not match case.json")
    if inventory.get("projectPath") != f"project/{case_id}.h5lesson":
        errors.append("Authoring Inventory projectPath does not match the case project")
    generated_from = inventory.get("generatedFrom")
    if not isinstance(generated_from, dict):
        errors.append("Authoring Inventory generatedFrom is missing")
    else:
        if generated_from.get("presentationScriptSha256") != script_hash:
            errors.append("Authoring Inventory uses a stale presentation script hash")
        if generated_from.get("capabilityIndexSha256") != capability_hash:
            errors.append("Authoring Inventory uses a stale Capability Index hash")

    exact_locations = readiness.get("exactContentLocations") if isinstance(readiness, dict) else None
    if not isinstance(exact_locations, dict) or not exact_locations:
        errors.append("case readiness has no exact content locations")
        exact_locations = {}
    else:
        for content_id, relative in exact_locations.items():
            if not isinstance(content_id, str) or not isinstance(relative, str):
                errors.append("case exact content locations must map string IDs to paths")
                continue
            try:
                location = within(case_dir, case_dir / relative)
            except ValueError as exc:
                errors.append(str(exc))
                continue
            if not location.exists():
                errors.append(f"exact content location is missing: {content_id}")

    entities: list[object] = []
    global_entities = inventory.get("globalEntities")
    if isinstance(global_entities, list):
        entities.extend(global_entities)
    scenes = inventory.get("scenes")
    if isinstance(scenes, list):
        for scene in scenes:
            if isinstance(scene, dict) and isinstance(scene.get("entities"), list):
                entities.extend(scene["entities"])
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        source_ref = entity.get("sourceRef")
        match = CONTENT_ID_PATTERN.fullmatch(source_ref) if isinstance(source_ref, str) else None
        if match and match.group(1) not in exact_locations:
            errors.append(
                f"Authoring Inventory sourceRef has no exact approved content location: {source_ref}"
            )
    return inventory, script_hash if isinstance(script_hash, str) else None


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    warnings: list[str] = []
    case_dir = Path(args.case_dir).resolve()
    editor_root = Path(args.editor_root).resolve()
    skill_dir = Path(__file__).resolve().parent.parent
    try:
        case = validate_case_readiness(case_dir, skill_dir)
        _, capability_hash = validate_capabilities(editor_root)
        if args.target != "entry":
            _, presentation_hash = validate_inventory_provenance(
                case_dir, case, capability_hash, errors
            )
            plan_path = case_dir / "03-development-plan.md"
            plan = plan_path.read_text(encoding="utf-8")
            for heading in REQUIRED_PLAN_HEADINGS:
                if heading not in plan:
                    errors.append(f"development plan is missing heading: {heading}")
            if "[待填写" in plan or "[待实现者填写" in plan:
                errors.append("development plan still contains placeholders")
            if capability_hash not in plan:
                errors.append("development plan does not bind the current Capability Index hash")
            if presentation_hash is not None and presentation_hash not in plan:
                errors.append("development plan does not bind the current presentation script hash")

            state = load_json(case_dir / "implementation" / "implementation-state.json")
            if state.get("capabilityIndexSha256") != capability_hash:
                errors.append("implementation state uses a stale Capability Index hash")
            if state.get("presentationScriptSha256") != presentation_hash:
                errors.append("implementation state uses a stale presentation script hash")
            if state.get("status") not in ("implemented", "verified"):
                errors.append("implementation state must be implemented or verified")
            project_hash = state.get("currentProjectSha256")
            project_path = within(case_dir, case_dir / "project" / f"{case.get('caseId')}.h5lesson")
            if not project_path.is_file():
                errors.append("Project V8 archive is missing")
            elif project_hash != sha256_file(project_path):
                errors.append("implementation state project hash is stale")
            else:
                npm = "npm.cmd" if sys.platform == "win32" else "npm"
                project_result = subprocess.run([
                    npm,
                    "run",
                    "--silent",
                    "validate:project",
                    "--",
                    str(project_path),
                ], cwd=editor_root, check=False, text=True, encoding="utf-8", capture_output=True)
                if project_result.returncode != 0:
                    errors.append("Project validation failed: " + (project_result.stdout.strip() or project_result.stderr.strip()))
                validator = skill_dir / "scripts" / "validate_authoring_inventory.py"
                inventory_result = subprocess.run([
                    sys.executable,
                    str(validator),
                    str(case_dir / "implementation" / "authoring-inventory.json"),
                    "--project",
                    str(project_path),
                    "--target",
                    "accepted" if args.target == "accepted" else "engineering-candidate",
                    "--json",
                ], check=False, text=True, encoding="utf-8", capture_output=True)
                if inventory_result.returncode != 0:
                    errors.append("Authoring Inventory failed: " + (inventory_result.stdout.strip() or inventory_result.stderr.strip()))

        if args.target in ("evidence", "accepted"):
            evidence_result = subprocess.run([
                sys.executable,
                str(skill_dir / "scripts" / "validate_evidence.py"),
                str(case_dir / "evidence" / "evidence-manifest.json"),
                "--json",
            ], check=False, text=True, encoding="utf-8", capture_output=True)
            if evidence_result.returncode != 0:
                errors.append("evidence manifest failed: " + (evidence_result.stdout.strip() or evidence_result.stderr.strip()))
            else:
                evidence = load_json(case_dir / "evidence" / "evidence-manifest.json")
                if evidence.get("pipelineStatus") != "passed":
                    errors.append("evidence target requires pipelineStatus passed")
                if args.target == "evidence" and evidence.get("outcomeStatus") not in (
                    "engineering candidate", "art candidate", "accepted",
                ):
                    errors.append("evidence target requires at least engineering candidate outcome")
                if args.target == "accepted" and evidence.get("outcomeStatus") != "accepted":
                    errors.append("accepted target requires accepted human outcome")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        errors.append(str(exc))

    report = {
        "validator": "build-project-v8-courseware-v1",
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
