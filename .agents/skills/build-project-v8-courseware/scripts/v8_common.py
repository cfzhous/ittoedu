#!/usr/bin/env python3
"""Shared deterministic checks for the Project V8 courseware Skill."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


EXPECTED_PROTOCOLS = {
    "project": 8,
    "runtime": 2,
    "runtimeAuthoring": 1,
    "componentSchema": 4,
    "componentRuntime": 4,
    "publishedLesson": 1,
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return value


def within(root: Path, candidate: Path) -> Path:
    resolved_root = root.resolve()
    resolved = candidate.resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError(f"path escapes expected root: {candidate}") from exc
    return resolved


def validate_case_readiness(case_dir: Path, skill_dir: Path) -> dict[str, Any]:
    validator = skill_dir.parent / "orchestrate-courseware" / "scripts" / "validate_case.py"
    if not validator.is_file():
        raise ValueError(f"orchestration validator is missing: {validator}")
    result = subprocess.run(
        [sys.executable, str(validator), str(case_dir), "--target", "implementation-ready", "--json"],
        check=False,
        text=True,
        encoding="utf-8",
        capture_output=True,
    )
    if result.returncode != 0:
        detail = result.stdout.strip() or result.stderr.strip()
        raise ValueError(f"courseware case is not implementation-ready: {detail}")
    case = load_json(case_dir / "case.json")
    if case.get("schemaVersion") != 2:
        raise ValueError("case.json must use schemaVersion 2")
    if case.get("targetProjectSchemaVersion") != 8:
        raise ValueError("case targetProjectSchemaVersion must be 8")
    readiness = case.get("derivedReadiness")
    if not isinstance(readiness, dict) or readiness.get("status") != "implementation-ready":
        raise ValueError("derivedReadiness must be implementation-ready; run validate_case.py --promote")
    if case.get("stage") != "implementation-ready":
        raise ValueError("case stage must be implementation-ready")
    return case


def validate_capabilities(editor_root: Path, *, run_check: bool = True) -> tuple[dict[str, Any], str]:
    if run_check:
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        result = subprocess.run(
            [npm, "run", "--silent", "check:ai-capabilities"],
            cwd=editor_root,
            check=False,
            text=True,
            encoding="utf-8",
            capture_output=True,
        )
        if result.returncode != 0:
            detail = result.stdout.strip() or result.stderr.strip()
            raise ValueError(f"Capability evidence is stale: {detail}")

    capability_dir = editor_root / "artifacts" / "ai-capabilities"
    index_path = capability_dir / "index.json"
    evidence_path = capability_dir / "generation-evidence.json"
    index = load_json(index_path)
    protocols = index.get("protocols")
    if not isinstance(protocols, dict):
        raise ValueError("Capability Index has no protocols object")
    for key, expected in EXPECTED_PROTOCOLS.items():
        if protocols.get(key) != expected:
            raise ValueError(f"Capability protocol {key} must be {expected}, got {protocols.get(key)!r}")

    headless = index.get("headlessBuild")
    if not isinstance(headless, dict) or headless.get("language") != "typescript":
        raise ValueError("Capability Index has no supported TypeScript headlessBuild contract")
    entrypoints = headless.get("entrypoints")
    if not isinstance(entrypoints, dict):
        raise ValueError("headlessBuild entrypoints are missing")
    for name in ("createProject", "projectArchive", "importComponentPackage", "projectSchema"):
        relative = entrypoints.get(name)
        if not isinstance(relative, str) or not within(editor_root, editor_root / relative).is_file():
            raise ValueError(f"headlessBuild entrypoint is unavailable: {name}")

    components = index.get("components")
    admission = components.get("packageAdmission") if isinstance(components, dict) else None
    expected_admission = {
        "requiredAvailability": "available",
        "allowedQualitiesForRelease": ["stable"],
        "experimentalRequiresExplicitCaseApproval": True,
        "releaseBlockersMustBeEmpty": True,
        "licenseStatusMustBe": "verified",
        "maintainerMustBeAssigned": True,
    }
    if not isinstance(admission, dict) or any(admission.get(key) != value for key, value in expected_admission.items()):
        raise ValueError("Capability Index has no supported component package admission contract")

    evidence = load_json(evidence_path)
    output = evidence.get("output")
    expected_index_hash = output.get("index.json", {}).get("sha256") if isinstance(output, dict) else None
    actual_index_hash = sha256_file(index_path)
    if expected_index_hash != actual_index_hash:
        raise ValueError("generation-evidence does not match index.json")
    return index, actual_index_hash
