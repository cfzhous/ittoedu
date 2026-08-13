#!/usr/bin/env python3
"""Shared deterministic checks for the Project V8 courseware Skill."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
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

_CONTRACT_MODULE_NAME = "_courseware_orchestrate_contract_records"


def python_utf8_environment() -> dict[str, str]:
    """Keep nested validators deterministic on Windows code-page hosts."""
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    return environment


def utf8_process_options() -> dict[str, Any]:
    """Shared text-mode options for nested validator processes."""
    return {
        "check": False,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
        "env": python_utf8_environment(),
        "capture_output": True,
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


def _load_contract_parser(skill_dir: Path):
    """Load the orchestrator-owned parser without copying its contract grammar."""
    existing = sys.modules.get(_CONTRACT_MODULE_NAME)
    if existing is not None:
        return existing
    parser_path = skill_dir.parent / "orchestrate-courseware" / "scripts" / "contract_records.py"
    if not parser_path.is_file():
        raise ValueError(f"orchestration contract parser is missing: {parser_path}")
    spec = importlib.util.spec_from_file_location(_CONTRACT_MODULE_NAME, parser_path)
    if spec is None or spec.loader is None:
        raise ValueError(f"cannot load orchestration contract parser: {parser_path}")
    module = importlib.util.module_from_spec(spec)
    # dataclasses resolves the defining module through sys.modules while executing.
    sys.modules[_CONTRACT_MODULE_NAME] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(_CONTRACT_MODULE_NAME, None)
        raise
    if not callable(getattr(module, "parse_contract_records", None)):
        raise ValueError("orchestration contract parser has no parse_contract_records entrypoint")
    return module


def _contract_artifact_path(
    case_dir: Path,
    case: dict[str, Any] | None,
    artifact_key: str,
    fallback_name: str,
) -> tuple[Path, str | None]:
    artifacts = case.get("artifacts") if isinstance(case, dict) else None
    artifact = artifacts.get(artifact_key) if isinstance(artifacts, dict) else None
    relative = artifact.get("path") if isinstance(artifact, dict) else fallback_name
    expected_hash = artifact.get("sha256") if isinstance(artifact, dict) else None
    if not isinstance(relative, str) or not relative:
        raise ValueError(f"case artifact path is missing: {artifact_key}")
    path = within(case_dir, case_dir / relative)
    if not path.is_file():
        raise ValueError(f"case artifact is missing: {artifact_key}: {path}")
    actual_hash = sha256_file(path)
    if expected_hash is not None and expected_hash != actual_hash:
        raise ValueError(f"case artifact hash is stale: {artifact_key}")
    return path, actual_hash


def _record_fields(parsed: Any, prefix: str) -> dict[str, dict[str, str]]:
    records = getattr(parsed, "records", None)
    if not isinstance(records, dict):
        raise ValueError("orchestration contract parser returned no records mapping")
    output: dict[str, dict[str, str]] = {}
    for record_id, record in records.items():
        if not isinstance(record_id, str) or not record_id.startswith(prefix + "-"):
            continue
        fields = getattr(record, "fields", None)
        if not isinstance(fields, dict) or any(
            not isinstance(key, str) or not isinstance(value, str)
            for key, value in fields.items()
        ):
            raise ValueError(f"invalid parsed contract fields: {record_id}")
        output[record_id] = dict(fields)
    return output


def csv_contract_values(value: Any) -> list[str]:
    if not isinstance(value, str) or value.strip().casefold() in {"", "none", "无"}:
        return []
    return [
        item.strip().strip("`")
        for item in re.split(r"[,，]", value)
        if item.strip()
    ]


def contract_boolean(value: Any) -> bool | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().casefold()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    return None


def load_contract_facts(
    case_dir: Path,
    *,
    case: dict[str, Any] | None = None,
    skill_dir: Path | None = None,
) -> dict[str, Any]:
    """Reparse the approved RESP/AUTH/ACT/ESC truth from its Markdown sources.

    This intentionally derives facts on demand instead of persisting a second contract DSL.
    The helper fails closed if the orchestrator parser interface or approved bytes drift.
    """
    resolved_case_dir = case_dir.resolve()
    if case is None:
        case_path = resolved_case_dir / "case.json"
        case = load_json(case_path) if case_path.is_file() else None
    resolved_skill_dir = skill_dir or Path(__file__).resolve().parent.parent
    contract_path, contract_hash = _contract_artifact_path(
        resolved_case_dir, case, "coursewareContract", "01-courseware-contract.md"
    )
    script_path, script_hash = _contract_artifact_path(
        resolved_case_dir, case, "presentationScript", "02-presentation-script.md"
    )
    module = _load_contract_parser(resolved_skill_dir)
    parsed = module.parse_contract_records(
        contract_path.read_text(encoding="utf-8"),
        script_path.read_text(encoding="utf-8"),
    )
    parse_errors = getattr(parsed, "parse_errors", ())
    if parse_errors:
        raise ValueError("approved executable contracts no longer parse: " + "; ".join(map(str, parse_errors)))
    tolerance_cases = getattr(parsed, "tolerance_cases", None)
    capacity = getattr(parsed, "capacity", None)
    if not isinstance(tolerance_cases, dict) or not isinstance(capacity, dict):
        raise ValueError("orchestration contract parser returned an unsupported result")
    normalized_tolerance: dict[str, dict[str, str]] = {}
    for case_id, item in tolerance_cases.items():
        if not isinstance(case_id, str) or not isinstance(item, dict) or any(
            not isinstance(key, str) or not isinstance(value, str)
            for key, value in item.items()
        ):
            raise ValueError(f"invalid parsed tolerance case: {case_id!r}")
        normalized_tolerance[case_id] = dict(item)
    duration_minutes = case.get("durationMinutes") if isinstance(case, dict) else None
    if not isinstance(duration_minutes, int) or isinstance(duration_minutes, bool) or duration_minutes <= 0:
        contract_text = contract_path.read_text(encoding="utf-8")
        duration_match = re.search(r"^\s*-\s*总时长（分钟）：\s*(\d+)\s*$", contract_text, re.MULTILINE)
        duration_minutes = int(duration_match.group(1)) if duration_match else None
    non_response_values: list[int] = []
    for key in ("readingObservationSeconds", "sceneTransitionSeconds"):
        raw = capacity.get(key)
        if not isinstance(raw, str) or re.fullmatch(r"\d+", raw) is None:
            raise ValueError(f"approved response capacity has invalid {key}")
        non_response_values.append(int(raw))
    return {
        "coursewareContractSha256": contract_hash,
        "presentationScriptSha256": script_hash,
        "responses": _record_fields(parsed, "RESP"),
        "authoring": _record_fields(parsed, "AUTH"),
        "actions": _record_fields(parsed, "ACT"),
        "escapes": _record_fields(parsed, "ESC"),
        "toleranceCases": normalized_tolerance,
        "durationSeconds": duration_minutes * 60 if isinstance(duration_minutes, int) else None,
        "nonResponseSeconds": sum(non_response_values),
    }


def within(root: Path, candidate: Path) -> Path:
    resolved_root = root.resolve()
    resolved = candidate.resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError(f"path escapes expected root: {candidate}") from exc
    return resolved


def validate_case_readiness(
    case_dir: Path,
    skill_dir: Path,
    *,
    editor_root: Path | None = None,
    capability_index: Path | None = None,
) -> dict[str, Any]:
    validator = skill_dir.parent / "orchestrate-courseware" / "scripts" / "validate_case.py"
    if not validator.is_file():
        raise ValueError(f"orchestration validator is missing: {validator}")
    resolved_capability_index = capability_index or (
        editor_root / "artifacts" / "ai-capabilities" / "index.json"
        if editor_root is not None
        else None
    )
    if resolved_capability_index is None or not resolved_capability_index.is_file():
        raise ValueError(
            "implementation-ready validation requires an explicit current Capability Index"
        )
    result = subprocess.run(
        [
            sys.executable, "-X", "utf8", str(validator), str(case_dir),
            "--target", "implementation-ready",
            "--capability-index", str(resolved_capability_index.resolve()),
            "--json",
        ],
        **utf8_process_options(),
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
            **utf8_process_options(),
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
