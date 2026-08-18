#!/usr/bin/env python3
"""Validate evidence hashes and prevent automation from granting acceptance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

from validate_behavior_spec import GATES, validate_spec
from validate_authoring_target_snapshot import validate_snapshot
from v8_common import load_contract_facts, sha256_file, within


OUTCOMES = {"unusable", "placeholder", "engineering candidate", "art candidate", "accepted"}
PIPELINE_STATUSES = {"not-run", "failed", "passed"}
DELIVERY_ARTIFACT_KINDS = {
    "project", "html", "web-package", "pdf", "pptx", "screenshot", "contact-sheet", "recording",
}
VERIFICATION_ARTIFACT_KINDS = {
    "behavior-spec", "behavior-report", "authoring-inventory", "authoring-target-snapshot",
    "authoring-session-report",
}
ARTIFACT_KINDS = DELIVERY_ARTIFACT_KINDS | VERIFICATION_ARTIFACT_KINDS
AUTOMATION_REVIEWERS = {"automation", "codex", "chatgpt", "gpt", "ai", "builder", "agent"}
AUTOMATION_REVIEWER_PHRASES = {
    "人工智能", "大模型", "自动化", "自动审批", "自动验收", "智能体", "机器人", "聊天机器人",
}
ARTIFACT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
ARTIFACT_KIND_RE = re.compile(r"^[a-z][a-z0-9-]*$")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)
DELIVERY_FINGERPRINT_ALGORITHMS = {
    "html": "raw-sha256-v1",
    "webPackage": "zip-members-sha256-v1",
    "pdf": "pdf-info-time-normalized-sha256-v1",
    "pptx": "pptx-members-core-time-normalized-sha256-v1",
}
SCENE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
RECORDING_EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi"}
MAX_INSPECTED_ZIP_MEMBER_BYTES = 16 * 1024 * 1024


def canonical_sha256(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def acceptance_scope(value: dict) -> str:
    return canonical_sha256({
        "schemaVersion": value.get("schemaVersion"),
        "caseId": value.get("caseId"),
        "pipelineStatus": value.get("pipelineStatus"),
        "outcomeStatus": value.get("outcomeStatus"),
        "inputs": value.get("inputs"),
        "commands": value.get("commands"),
        "artifacts": value.get("artifacts"),
        "editRoundTrips": value.get("editRoundTrips"),
        "sceneEvidence": value.get("sceneEvidence"),
        "requiredFrames": value.get("requiredFrames"),
        "differences": value.get("differences"),
        "remainingRisks": value.get("remainingRisks"),
        "verification": value.get("verification"),
    })


def value_matches(expected: Any, actual: Any) -> bool:
    """Return true when actual contains the expected JSON subset."""
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(
            key in actual and value_matches(child, actual[key]) for key, child in expected.items()
        )
    if isinstance(expected, list):
        return expected == actual
    return expected == actual


def normalized_assessment_input(evaluator_id: str, value: str) -> str:
    if evaluator_id == "EVAL-normalized-short-v1":
        return " ".join(unicodedata.normalize("NFKC", value).strip().split()).casefold()
    return value.strip()


def validate_host_evidence_session(
    test_id: str,
    result: dict[str, Any],
    errors: list[str],
) -> list[dict[str, Any]] | None:
    records = result.get("hostEvidence")
    if not isinstance(records, list) or not records:
        errors.append(f"behavior report {test_id} has no host-owned evidence session")
        return None
    session_keys = {"schemaVersion", "kind", "sessionId", "sequence", "afterStepId"}
    assessment_keys = {
        "schemaVersion", "kind", "sessionId", "sequence", "scope", "sceneId", "responseId",
        "evaluatorId", "input", "acceptedValues", "normalizedInput", "status", "afterStepId",
    }
    action_keys = {
        "schemaVersion", "kind", "sessionId", "sequence", "scope", "sceneId", "actId",
        "responseId", "actionKind", "eventType", "afterStepId",
    }
    teacher_keys = {
        "schemaVersion", "kind", "sessionId", "sequence", "action", "phase", "sceneId",
        "stateId", "bypassNavigationGuards", "eventType", "afterStepId",
    }
    action_kinds = {
        "click", "select", "text-input", "formula-input", "drag", "sort", "circle-text",
        "highlight", "parameter-change", "oral", "paper", "teacher-command",
    }
    session_starts = [record for record in records if isinstance(record, dict) and record.get("kind") == "session-start"]
    session_id = session_starts[0].get("sessionId") if len(session_starts) == 1 else None
    uuid_v4 = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        re.IGNORECASE,
    )
    session_valid = (
        len(session_starts) == 1
        and isinstance(records[0], dict)
        and records[0] is session_starts[0]
        and set(session_starts[0]) == session_keys
        and session_starts[0].get("schemaVersion") == 1
        and session_starts[0].get("sequence") == 0
        and session_starts[0].get("afterStepId") is None
        and isinstance(session_id, str)
        and uuid_v4.fullmatch(session_id) is not None
    )
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            session_valid = False
            continue
        if record.get("sessionId") != session_id or record.get("sequence") != index:
            session_valid = False
        kind = record.get("kind")
        if kind == "assessment-evaluated":
            if (
                set(record) != assessment_keys
                or record.get("schemaVersion") != 1
                or record.get("scope") not in {"scene", "global"}
                or (record.get("scope") == "scene" and not isinstance(record.get("sceneId"), str))
                or (record.get("scope") == "global" and record.get("sceneId") is not None)
                or not isinstance(record.get("responseId"), str)
                or not re.fullmatch(r"RESP-\d{3,}", record["responseId"])
                or not isinstance(record.get("evaluatorId"), str)
                or not isinstance(record.get("input"), str)
                or not isinstance(record.get("acceptedValues"), list)
                or any(not isinstance(item, str) for item in record["acceptedValues"])
                or not isinstance(record.get("normalizedInput"), str)
                or record.get("status") not in {"pass", "fail"}
                or (record.get("afterStepId") is not None and not isinstance(record.get("afterStepId"), str))
            ):
                session_valid = False
        elif kind == "action-recorded":
            if (
                set(record) != action_keys
                or record.get("schemaVersion") != 1
                or record.get("scope") not in {"scene", "global"}
                or (record.get("scope") == "scene" and not isinstance(record.get("sceneId"), str))
                or (record.get("scope") == "global" and record.get("sceneId") is not None)
                or not isinstance(record.get("actId"), str)
                or not re.fullmatch(r"ACT-\d{3,}", record["actId"])
                or (
                    record.get("responseId") is not None
                    and (
                        not isinstance(record.get("responseId"), str)
                        or not re.fullmatch(r"RESP-\d{3,}", record["responseId"])
                    )
                )
                or record.get("actionKind") not in action_kinds
                or not isinstance(record.get("eventType"), str)
                or re.fullmatch(r"[A-Za-z][A-Za-z0-9_.:-]{0,127}", record["eventType"]) is None
                or (record.get("afterStepId") is not None and not isinstance(record.get("afterStepId"), str))
            ):
                session_valid = False
        elif kind == "teacher-escape-recorded":
            phase = record.get("phase")
            expected_keys = teacher_keys | ({"accepted"} if phase != "requested" else set())
            if (
                set(record) != expected_keys
                or record.get("schemaVersion") != 1
                or record.get("action") not in {"previous", "next", "scene-picker", "replay"}
                or phase not in {"requested", "confirmation-required", "completed"}
                or (
                    record.get("sceneId") is not None
                    and (not isinstance(record.get("sceneId"), str) or not record["sceneId"])
                )
                or (
                    record.get("stateId") is not None
                    and (not isinstance(record.get("stateId"), str) or not record["stateId"])
                )
                or not isinstance(record.get("bypassNavigationGuards"), bool)
                or (phase == "requested" and "accepted" in record)
                or (phase == "confirmation-required" and record.get("accepted") is not False)
                or (phase == "completed" and not isinstance(record.get("accepted"), bool))
                or record.get("eventType") != "click"
                or (record.get("afterStepId") is not None and not isinstance(record.get("afterStepId"), str))
            ):
                session_valid = False
        elif kind != "session-start":
            session_valid = False
    if not session_valid:
        errors.append(f"behavior report {test_id} host evidence session/sequence/shape is invalid")
        return None
    return records


def validate_host_assessment_trace(
    test_id: str,
    expected: dict[str, Any],
    result: dict[str, Any],
    assessment: dict[str, Any],
    errors: list[str],
) -> bool:
    records = validate_host_evidence_session(test_id, result, errors)
    if records is None:
        return False

    action_step_ids = [
        step.get("id") for step in expected.get("steps", [])
        if isinstance(step, dict) and step.get("action") not in {"wait-visible", "reload"}
    ]
    response_id = assessment.get("responseId")
    evaluator_id = assessment.get("evaluatorRef")
    input_value = expected.get("input")
    expected_status = expected.get("expectedResult")
    accepted_values = assessment.get("acceptedValues")
    if not (
        len(action_step_ids) == 1
        and isinstance(response_id, str)
        and isinstance(evaluator_id, str)
        and isinstance(input_value, str)
        and expected_status in {"pass", "fail"}
        and isinstance(accepted_values, list)
    ):
        errors.append(f"behavior report {test_id} cannot derive an exact host assessment expectation")
        return False
    expected_normalized = normalized_assessment_input(evaluator_id, input_value)
    matches = [
        record for record in records
        if isinstance(record, dict)
        and record.get("kind") == "assessment-evaluated"
        and record.get("responseId") == response_id
        and record.get("evaluatorId") == evaluator_id
        and record.get("input") == input_value
        and record.get("acceptedValues") == accepted_values
        and record.get("normalizedInput") == expected_normalized
        and record.get("status") == expected_status
        and record.get("afterStepId") == action_step_ids[0]
        and (
            record.get("scope") == "global" and record.get("sceneId") is None
            or record.get("scope") == "scene" and record.get("sceneId") == expected.get("sceneId")
        )
    ]
    if len(matches) != 1:
        errors.append(
            f"behavior report {test_id} lacks exactly one host assessment trace bound to RESP/TOL/step"
        )
        return False
    return True


def validate_host_action_trace(
    test_id: str,
    expected: dict[str, Any],
    result: dict[str, Any],
    errors: list[str],
) -> bool:
    records = validate_host_evidence_session(test_id, result, errors)
    if records is None:
        return False
    act_refs = [
        ref for ref in expected.get("contractRefs", [])
        if isinstance(ref, str) and ref.startswith("ACT-")
    ]
    response_refs = [
        ref for ref in expected.get("contractRefs", [])
        if isinstance(ref, str) and ref.startswith("RESP-")
    ]
    action_kind = expected.get("actionKind")
    allowed_step_actions = {
        "click": {"click"},
        "select": {"click", "select-option"},
        "text-input": {"fill"},
        "formula-input": {"fill"},
        "drag": {"drag"},
        "sort": {"drag"},
        "circle-text": {"click", "drag"},
        "highlight": {"click", "drag"},
        "parameter-change": {"fill", "select-option", "press"},
        "teacher-command": {"click", "press"},
    }
    action_step_ids = [
        step.get("id") for step in expected.get("steps", [])
        if isinstance(step, dict) and step.get("action") in allowed_step_actions.get(action_kind, set())
    ]
    action_steps = {
        step.get("id"): step for step in expected.get("steps", [])
        if isinstance(step, dict) and step.get("id") in action_step_ids
    }
    event_types_by_step_action = {
        "click": {"click"},
        "fill": {"input", "change"},
        "press": {"keydown", "keyup"},
        "select-option": {"input", "change"},
        "check": {"click", "change"},
        "drag": {
            "pointerdown", "pointermove", "pointerup", "mousedown", "mousemove", "mouseup",
            "dragstart", "drag", "drop", "dragend",
        },
    }
    expected_response_id = response_refs[0] if len(response_refs) == 1 else None
    if len(act_refs) != 1 or len(action_step_ids) != 1:
        errors.append(f"behavior report {test_id} cannot derive an exact host action expectation")
        return False
    matches = [
        record for record in records
        if record.get("kind") == "action-recorded"
        and record.get("actId") == act_refs[0]
        and record.get("responseId") == expected_response_id
        and record.get("actionKind") == action_kind
        and record.get("afterStepId") == action_step_ids[0]
        and record.get("eventType") in event_types_by_step_action.get(
            action_steps[action_step_ids[0]].get("action"), set()
        )
        and (
            record.get("scope") == "global" and record.get("sceneId") is None
            or record.get("scope") == "scene" and record.get("sceneId") == expected.get("sceneId")
        )
    ]
    if len(matches) != 1:
        errors.append(f"behavior report {test_id} lacks exactly one host action trace bound to ACT/RESP/step")
        return False
    return True


def _expected_teacher_bypass(
    event: dict[str, Any],
    teacher_events: list[dict[str, Any]],
) -> bool | None:
    match = event.get("match") if isinstance(event.get("match"), dict) else {}
    action = match.get("action")
    if action in {"previous", "scene-picker", "replay"}:
        return True
    if action != "next":
        return None
    confirmation_steps = {
        item.get("afterStepId")
        for item in teacher_events
        if isinstance(item.get("match"), dict)
        and item["match"].get("action") == "next"
        and item["match"].get("phase") == "confirmation-required"
    }
    if not confirmation_steps:
        return False
    return event.get("afterStepId") not in confirmation_steps


def validate_host_teacher_escape_trace(
    test_id: str,
    expected: dict[str, Any],
    result: dict[str, Any],
    errors: list[str],
) -> bool:
    records = validate_host_evidence_session(test_id, result, errors)
    if records is None:
        return False
    teacher_events = [
        event for event in expected.get("witnessedEvents", [])
        if isinstance(event, dict)
        and event.get("name") == "courseware-teacher-escape-action"
    ]
    teacher_records = [
        record for record in records
        if record.get("kind") == "teacher-escape-recorded"
    ]
    if not teacher_events or len(teacher_records) != len(teacher_events):
        errors.append(
            f"behavior report {test_id} lacks an exact host teacher escape trace count"
        )
        return False
    for event, record in zip(teacher_events, teacher_records, strict=True):
        expected_bypass = _expected_teacher_bypass(event, teacher_events)
        event_match = event.get("match") if isinstance(event.get("match"), dict) else {}
        if not (
            record.get("afterStepId") == event.get("afterStepId")
            and record.get("eventType") == "click"
            and expected_bypass is not None
            and record.get("bypassNavigationGuards") is expected_bypass
            and value_matches(event_match, record)
        ):
            errors.append(
                f"behavior report {test_id} host teacher escape trace is out of order or is not "
                "bound to source scene/state/action/phase/step"
            )
            return False
    return True


def computed_behavior_gates(
    spec: dict[str, Any],
    spec_file_hash: str,
    report: Any,
    case_root: Path,
    editor_root: Path | None,
    errors: list[str],
) -> dict[str, dict[str, Any]]:
    gate_results = {gate: {"status": "failed", "testIds": []} for gate in GATES}
    try:
        contract = (
            load_contract_facts(case_root)
            if (case_root / "01-courseware-contract.md").is_file()
            else None
        )
        capability_index = (
            json.loads((editor_root / "artifacts" / "ai-capabilities" / "index.json").read_text(encoding="utf-8"))
            if editor_root is not None
            else None
        )
        spec_errors, _, computed = validate_spec(spec, contract, capability_index)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        spec_errors, computed = [str(exc)], {}
    for error in spec_errors:
        errors.append("behavior spec: " + error)
    capacity = computed.get("capacity") if isinstance(computed, dict) else None
    gate_results["responseCapacity"] = {
        "status": capacity.get("status") if isinstance(capacity, dict) else "failed",
        "testIds": [],
    }
    if not isinstance(report, dict) or report.get("schemaVersion") != 2:
        errors.append("behavior report must be a schemaVersion 2 object")
        return gate_results
    if report.get("caseId") != spec.get("caseId"):
        errors.append("behavior report caseId does not match spec")
    if report.get("specSha256") != spec_file_hash:
        errors.append("behavior report specSha256 is stale")
    for key in ("coursewareContractSha256", "presentationScriptSha256", "developmentPlanSha256"):
        if report.get(key) != spec.get(key):
            errors.append(f"behavior report {key} does not match spec")
    runner_hash = report.get("runnerSha256")
    if not isinstance(runner_hash, str) or not SHA256_RE.fullmatch(runner_hash):
        errors.append("behavior report runnerSha256 is required")
    elif editor_root is None:
        errors.append("--editor-root is required to verify behavior report runnerSha256")
    else:
        runner_path = editor_root / "scripts" / "run-courseware-behavior.ts"
        if not runner_path.is_file() or runner_hash != sha256_file(runner_path):
            errors.append("behavior report runnerSha256 is stale")
    runtime_errors = report.get("errors")
    if runtime_errors != []:
        errors.append("behavior report must contain an empty top-level errors array")
    target = report.get("target")
    if not isinstance(target, dict):
        errors.append("behavior report target is required")
    else:
        target_path = target.get("path")
        target_hash = target.get("sha256")
        if not isinstance(target_path, str) or not isinstance(target_hash, str) or not SHA256_RE.fullmatch(target_hash):
            errors.append("behavior report target requires path and SHA-256")
        else:
            try:
                portable = portable_relative_path(target_path)
                resolved = within(case_root, case_root.joinpath(*portable.parts))
                if not resolved.is_file():
                    errors.append("behavior report target file is missing")
                elif sha256_file(resolved) != target_hash.lower():
                    errors.append("behavior report target hash is stale")
            except ValueError as exc:
                errors.append(f"behavior report target: {exc}")

    expected_tests = {
        test.get("id"): test
        for test in spec.get("tests", [])
        if isinstance(test, dict) and isinstance(test.get("id"), str)
    }
    report_tests_raw = report.get("tests")
    report_tests: dict[str, dict[str, Any]] = {}
    if not isinstance(report_tests_raw, list):
        errors.append("behavior report tests must be an array")
        report_tests_raw = []
    for index, result in enumerate(report_tests_raw):
        if not isinstance(result, dict) or not isinstance(result.get("id"), str):
            errors.append(f"behavior report tests[{index}] has no id")
            continue
        test_id = result["id"]
        if test_id in report_tests:
            errors.append(f"behavior report repeats test: {test_id}")
        report_tests[test_id] = result
    missing = sorted(set(expected_tests) - set(report_tests))
    extra = sorted(set(report_tests) - set(expected_tests))
    if missing:
        errors.append("behavior report is missing tests: " + ", ".join(missing))
    if extra:
        errors.append("behavior report contains unknown tests: " + ", ".join(extra))

    passed_test_ids: set[str] = set()
    assessments = {
        item.get("responseId"): item
        for item in spec.get("assessments", [])
        if isinstance(item, dict) and isinstance(item.get("responseId"), str)
    }
    for test_id, expected in expected_tests.items():
        result = report_tests.get(test_id)
        if not isinstance(result, dict):
            continue
        test_ok = result.get("status") == "passed" and result.get("gate") == expected.get("gate")
        expected_steps = [item.get("id") for item in expected.get("steps", []) if isinstance(item, dict)]
        actual_steps = result.get("steps")
        if not isinstance(actual_steps, list):
            errors.append(f"behavior report {test_id} steps must be an array")
            test_ok = False
            actual_steps = []
        actual_step_map = {
            item.get("id"): item for item in actual_steps
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        if set(actual_step_map) != set(expected_steps):
            errors.append(f"behavior report {test_id} step IDs do not match spec")
            test_ok = False
        if any(item.get("status") != "passed" for item in actual_step_map.values()):
            errors.append(f"behavior report {test_id} contains a failed step")
            test_ok = False
        expected_assertions = [
            item.get("id")
            for item in [*expected.get("preAssertions", []), *expected.get("assertions", [])]
            if isinstance(item, dict)
        ]
        actual_assertions = result.get("assertions")
        if not isinstance(actual_assertions, list):
            errors.append(f"behavior report {test_id} assertions must be an array")
            test_ok = False
            actual_assertions = []
        actual_assertion_map = {
            item.get("id"): item for item in actual_assertions
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        if set(actual_assertion_map) != set(expected_assertions):
            errors.append(f"behavior report {test_id} assertion IDs do not match spec")
            test_ok = False
        if any(item.get("status") != "passed" for item in actual_assertion_map.values()):
            errors.append(f"behavior report {test_id} contains a failed assertion")
            test_ok = False
        witnessed = result.get("witnessedEvents", [])
        if not isinstance(witnessed, list):
            errors.append(f"behavior report {test_id} witnessedEvents must be an array")
            witnessed = []
            test_ok = False
        for expected_event in expected.get("witnessedEvents", []):
            if not isinstance(expected_event, dict):
                continue
            matching = [
                event for event in witnessed
                if isinstance(event, dict)
                and event.get("name") == expected_event.get("name")
                and value_matches(expected_event.get("match", {}), event.get("detail", {}))
                and event.get("afterStepId") == expected_event.get("afterStepId")
            ]
            if not matching:
                errors.append(f"behavior report {test_id} did not witness {expected_event.get('name')}")
                test_ok = False
        if result.get("runtimeErrors", []) != []:
            errors.append(f"behavior report {test_id} contains page/console errors")
            test_ok = False
        if expected.get("gate") == "assessmentTolerance":
            response_refs = [
                ref for ref in expected.get("contractRefs", [])
                if isinstance(ref, str) and ref.startswith("RESP-")
            ]
            assessment = assessments.get(response_refs[0]) if len(response_refs) == 1 else None
            if isinstance(assessment, dict) and assessment.get("mode") in {"finite-auto", "normalized-auto"}:
                if not validate_host_assessment_trace(test_id, expected, result, assessment, errors):
                    test_ok = False
        if expected.get("gate") == "requiredActions":
            if not validate_host_action_trace(test_id, expected, result, errors):
                test_ok = False
        if expected.get("gate") in {"teacherControl", "teacherEscape"}:
            if not validate_host_teacher_escape_trace(test_id, expected, result, errors):
                test_ok = False
        if test_ok:
            passed_test_ids.add(test_id)

    requirements = spec.get("gateRequirements", {})
    for gate in GATES:
        if gate == "responseCapacity":
            continue
        required = requirements.get(gate, []) if isinstance(requirements, dict) else []
        status = "passed" if required and all(test_id in passed_test_ids for test_id in required) else "failed"
        gate_results[gate] = {"status": status, "testIds": list(required) if isinstance(required, list) else []}

    reported_gates = report.get("gates")
    if reported_gates != gate_results:
        errors.append("behavior report gates do not match validator-computed gates")
    summary = report.get("summary")
    expected_summary = {
        "passed": len(passed_test_ids),
        "failed": len(expected_tests) - len(passed_test_ids),
    }
    if summary != expected_summary:
        errors.append("behavior report summary does not match test results")
    return gate_results


def reviewer_is_automated(reviewer: str) -> bool:
    normalized = unicodedata.normalize("NFKC", reviewer).casefold()
    ascii_tokens = set(re.findall(r"[a-z0-9]+", normalized))
    if ascii_tokens & AUTOMATION_REVIEWERS:
        return True
    if re.search(r"(?<![a-z0-9])a[\W_]*i(?![a-z0-9])", normalized):
        return True
    compact = re.sub(r"\s+", "", normalized)
    return any(phrase in compact for phrase in AUTOMATION_REVIEWER_PHRASES)


def portable_relative_path(relative: str) -> PurePosixPath:
    if "\\" in relative:
        raise ValueError("artifact path must use portable '/' separators")
    pure = PurePosixPath(relative)
    if not relative or pure.is_absolute() or re.match(r"^[A-Za-z]:", relative):
        raise ValueError("artifact path must be relative to caseRoot")
    if any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError("artifact path must not contain empty, '.' or '..' segments")
    return pure


def read_head_tail(path: Path, size: int = 1024 * 1024) -> tuple[bytes, bytes, int]:
    length = path.stat().st_size
    with path.open("rb") as handle:
        head = handle.read(size)
        if length <= size:
            return head, head, length
        handle.seek(max(0, length - size))
        return head, handle.read(size), length


def zip_index(archive: zipfile.ZipFile) -> tuple[dict[str, zipfile.ZipInfo], list[str]]:
    members: dict[str, zipfile.ZipInfo] = {}
    folded_names: set[str] = set()
    errors: list[str] = []
    for info in archive.infolist():
        name = info.filename
        pure = PurePosixPath(name)
        if (
            not name
            or "\\" in name
            or pure.is_absolute()
            or any(part in {"", ".", ".."} for part in pure.parts)
        ):
            errors.append(f"unsafe ZIP member path: {name!r}")
            continue
        folded = name.casefold()
        if folded in folded_names:
            errors.append(f"duplicate ZIP member path: {name}")
            continue
        folded_names.add(folded)
        members[name] = info
        if info.flag_bits & 0x1:
            errors.append(f"encrypted ZIP member is not allowed: {name}")
    return members, errors


def read_zip_member(
    archive: zipfile.ZipFile,
    members: dict[str, zipfile.ZipInfo],
    name: str,
) -> bytes:
    info = members.get(name)
    if info is None:
        raise ValueError(f"ZIP member is missing: {name}")
    if info.is_dir() or info.file_size <= 0:
        raise ValueError(f"ZIP member is empty: {name}")
    if info.file_size > MAX_INSPECTED_ZIP_MEMBER_BYTES:
        raise ValueError(f"ZIP member is too large to inspect safely: {name}")
    return archive.read(info)


def validate_project_artifact(path: Path) -> list[str]:
    errors: list[str] = []
    if path.suffix.lower() != ".h5lesson":
        errors.append("project artifact must use the .h5lesson extension")
        return errors
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            errors.extend(zip_errors)
            try:
                project = json.loads(read_zip_member(archive, members, "project.json").decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError, RuntimeError, zipfile.BadZipFile) as exc:
                errors.append(f"invalid Project V8 project.json: {exc}")
                return errors
            if not isinstance(project, dict) or project.get("schemaVersion") != 8:
                errors.append("project.json must declare Project Schema V8")
            if not isinstance(project, dict) or not isinstance(project.get("id"), str) or not project.get("id"):
                errors.append("project.json must contain a non-empty project id")
            if not isinstance(project, dict) or not isinstance(project.get("scenes"), list) or not project.get("scenes"):
                errors.append("project.json must contain at least one scene")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        errors.append(f"project artifact is not a readable ZIP container: {exc}")
    return errors


def project_scene_ids(path: Path) -> set[str] | None:
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            if zip_errors:
                return None
            project = json.loads(read_zip_member(archive, members, "project.json").decode("utf-8"))
        if not isinstance(project, dict) or project.get("schemaVersion") != 8:
            return None
        scenes = project.get("scenes")
        if not isinstance(scenes, list) or not scenes:
            return None
        identifiers = [scene.get("id") for scene in scenes if isinstance(scene, dict)]
        if len(identifiers) != len(scenes) or any(
            not isinstance(scene_id, str) or not SCENE_ID_RE.fullmatch(scene_id)
            for scene_id in identifiers
        ):
            return None
        return set(identifiers)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, RuntimeError, zipfile.BadZipFile):
        return None


def validate_html_artifact(path: Path) -> list[str]:
    if path.suffix.lower() not in {".html", ".htm"}:
        return ["html artifact must use the .html or .htm extension"]
    try:
        head, tail, length = read_head_tail(path)
        if length < 32:
            return ["html artifact is implausibly small"]
        # Chunk boundaries can split a multi-byte code point in a large HTML file.
        # Replacement decoding preserves the structural tag check without a false
        # rejection at that inspection boundary.
        head_text = head.decode("utf-8-sig", errors="replace").casefold()
        tail_text = tail.decode("utf-8", errors="replace").casefold()
    except OSError as exc:
        return [f"html artifact is not readable: {exc}"]
    errors: list[str] = []
    if "<html" not in head_text:
        errors.append("html artifact has no opening <html> element")
    if "</html>" not in tail_text:
        errors.append("html artifact has no closing </html> element")
    return errors


def validate_web_package(path: Path) -> list[str]:
    errors: list[str] = []
    if path.suffix.lower() != ".zip":
        errors.append("web-package artifact must use the .zip extension")
        return errors
    required = ("index.html", "course-data.js", "player/player.iife.js", "player/player.css")
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            errors.extend(zip_errors)
            contents: dict[str, bytes] = {}
            for name in required:
                try:
                    contents[name] = read_zip_member(archive, members, name)
                except (ValueError, RuntimeError, zipfile.BadZipFile) as exc:
                    errors.append(str(exc))
            index_html = contents.get("index.html")
            if index_html is not None:
                try:
                    index_text = index_html.decode("utf-8-sig").casefold()
                    if "<html" not in index_text or "</html>" not in index_text:
                        errors.append("web-package index.html is not a complete HTML document")
                except UnicodeDecodeError as exc:
                    errors.append(f"web-package index.html is not UTF-8: {exc}")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        errors.append(f"web-package artifact is not a readable ZIP container: {exc}")
    return errors


def validate_pdf_artifact(path: Path) -> list[str]:
    if path.suffix.lower() != ".pdf":
        return ["pdf artifact must use the .pdf extension"]
    head, tail, length = read_head_tail(path, 4096)
    errors: list[str] = []
    if length < 32 or not head.startswith(b"%PDF-"):
        errors.append("pdf artifact has no valid PDF header")
    if b"%%EOF" not in tail.rstrip()[-1024:]:
        errors.append("pdf artifact has no PDF end marker")
    return errors


def validate_pptx_artifact(path: Path) -> list[str]:
    errors: list[str] = []
    if path.suffix.lower() != ".pptx":
        errors.append("pptx artifact must use the .pptx extension")
        return errors
    required = ("[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml")
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            errors.extend(zip_errors)
            contents: dict[str, bytes] = {}
            for name in required:
                try:
                    contents[name] = read_zip_member(archive, members, name)
                except (ValueError, RuntimeError, zipfile.BadZipFile) as exc:
                    errors.append(str(exc))
            content_types = contents.get("[Content_Types].xml", b"").lower()
            relationships = contents.get("_rels/.rels", b"").lower()
            presentation = contents.get("ppt/presentation.xml", b"").lower()
            if content_types and b"presentationml.presentation.main+xml" not in content_types:
                errors.append("pptx content types do not declare a presentation document")
            if relationships and b"officedocument" not in relationships:
                errors.append("pptx root relationships have no Office document target")
            if presentation and b"<p:presentation" not in presentation:
                errors.append("pptx presentation.xml has no presentation root")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        errors.append(f"pptx artifact is not a readable OOXML ZIP container: {exc}")
    return errors


def jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or not data.startswith(b"\xff\xd8\xff"):
        return None
    index = 2
    sof_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while index + 4 <= len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        while index < len(data) and data[index] == 0xFF:
            index += 1
        if index >= len(data):
            break
        marker = data[index]
        index += 1
        if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
            continue
        if index + 2 > len(data):
            break
        segment_length = int.from_bytes(data[index:index + 2], "big")
        if segment_length < 2 or index + segment_length > len(data):
            break
        if marker in sof_markers and segment_length >= 7:
            height = int.from_bytes(data[index + 3:index + 5], "big")
            width = int.from_bytes(data[index + 5:index + 7], "big")
            return width, height
        index += segment_length
    return None


def image_dimensions(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix == ".png":
        if (
            len(data) >= 45
            and data.startswith(b"\x89PNG\r\n\x1a\n")
            and data[8:12] == b"\x00\x00\x00\x0d"
            and data[12:16] == b"IHDR"
            and data[-12:-8] == b"\x00\x00\x00\x00"
            and data[-8:-4] == b"IEND"
        ):
            return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
        return None
    if suffix in {".jpg", ".jpeg"}:
        if not data.endswith(b"\xff\xd9"):
            return None
        return jpeg_dimensions(data)
    if (
        suffix == ".webp"
        and len(data) >= 30
        and data[:4] == b"RIFF"
        and data[8:12] == b"WEBP"
        and int.from_bytes(data[4:8], "little") + 8 <= len(data)
    ):
        chunk = data[12:16]
        if chunk == b"VP8X":
            return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
        if chunk == b"VP8L" and data[20] == 0x2F:
            bits = int.from_bytes(data[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if chunk == b"VP8 " and len(data) >= 30 and data[23:26] == b"\x9d\x01\x2a":
            return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
    return None


def validate_image_artifact(path: Path, kind: str) -> list[str]:
    if path.suffix.lower() not in IMAGE_EXTENSIONS:
        return [f"{kind} artifact must use PNG, JPEG or WebP"]
    try:
        dimensions = image_dimensions(path)
    except OSError as exc:
        return [f"{kind} artifact is unreadable: {exc}"]
    if dimensions is None or dimensions[0] <= 0 or dimensions[1] <= 0:
        return [f"{kind} artifact has no recognizable image header and dimensions"]
    if kind == "screenshot" and dimensions != (1280, 720):
        return [
            f"screenshot artifact must be exactly 1280x720, got {dimensions[0]}x{dimensions[1]}"
        ]
    return []


def mp4_top_level_boxes(path: Path) -> tuple[list[tuple[bytes, int]], bool]:
    length = path.stat().st_size
    boxes: list[tuple[bytes, int]] = []
    offset = 0
    with path.open("rb") as handle:
        while offset < length:
            if length - offset < 8:
                return boxes, False
            handle.seek(offset)
            header = handle.read(16)
            if len(header) < 8:
                return boxes, False
            size = int.from_bytes(header[:4], "big")
            box_type = header[4:8]
            header_size = 8
            if size == 1:
                if len(header) < 16:
                    return boxes, False
                size = int.from_bytes(header[8:16], "big")
                header_size = 16
            elif size == 0:
                size = length - offset
            if size < header_size or offset + size > length:
                return boxes, False
            boxes.append((box_type, size))
            offset += size
    return boxes, offset == length


def validate_recording_artifact(path: Path) -> list[str]:
    suffix = path.suffix.lower()
    if suffix not in RECORDING_EXTENSIONS:
        return ["recording artifact must use MP4/MOV, WebM/Matroska or AVI"]
    head, _, length = read_head_tail(path, 4096)
    valid = False
    if suffix in {".mp4", ".m4v", ".mov"} and len(head) >= 16 and head[4:8] == b"ftyp":
        boxes, structurally_valid = mp4_top_level_boxes(path)
        box_sizes = {box_type: size for box_type, size in boxes}
        valid = (
            structurally_valid
            and boxes[0][0] == b"ftyp"
            and box_sizes.get(b"ftyp", 0) >= 16
            and box_sizes.get(b"moov", 0) > 8
            and box_sizes.get(b"mdat", 0) > 8
        )
    elif suffix in {".webm", ".mkv"}:
        valid = head.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in head.lower()
    elif suffix == ".avi":
        valid = len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"AVI "
    return [] if valid else ["recording artifact has no recognizable media container header"]


def validate_delivery_artifact(kind: str, path: Path) -> list[str]:
    if kind == "project":
        return validate_project_artifact(path)
    if kind == "html":
        return validate_html_artifact(path)
    if kind == "web-package":
        return validate_web_package(path)
    if kind == "pdf":
        return validate_pdf_artifact(path)
    if kind == "pptx":
        return validate_pptx_artifact(path)
    if kind in {"screenshot", "contact-sheet"}:
        return validate_image_artifact(path, kind)
    if kind == "recording":
        return validate_recording_artifact(path)
    return []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a Project V8 evidence manifest")
    parser.add_argument("manifest")
    parser.add_argument("--structural-only", action="store_true")
    parser.add_argument("--editor-root")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    try:
        manifest_path = Path(args.manifest).resolve()
        editor_root = Path(args.editor_root).resolve() if args.editor_root else None
        value = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.get("schemaVersion") not in {1, 2}:
            raise ValueError("evidence manifest must use schemaVersion 1 or 2")
        schema_version = value.get("schemaVersion")
        outcome = value.get("outcomeStatus")
        if outcome not in OUTCOMES:
            errors.append(f"invalid outcomeStatus: {outcome!r}")
        pipeline_status = value.get("pipelineStatus")
        if pipeline_status not in PIPELINE_STATUSES:
            errors.append(f"invalid pipelineStatus: {pipeline_status!r}")
        candidate_or_higher = outcome in {"engineering candidate", "art candidate", "accepted"}
        if candidate_or_higher and not args.structural_only:
            errors.append(
                "candidate evidence requires validate_v8_case trusted behavior replay; "
                "standalone validate_evidence is structural-only"
            )
        if outcome in {"art candidate", "accepted"}:
            errors.append(
                f"{outcome} cannot be issued by the local evidence validator without an "
                "external trusted human review receipt"
            )
        case_root_value = value.get("caseRoot", "..")
        if case_root_value != "..":
            errors.append("caseRoot must be exactly '..' from the evidence directory")
            case_root_value = ".."
        if manifest_path.parent.name != "evidence":
            errors.append("evidence manifest must live in the case evidence/ directory")
        case_root = (manifest_path.parent / case_root_value).resolve()
        inputs = value.get("inputs")
        if not isinstance(inputs, dict):
            errors.append("inputs must be an object")
            inputs = {}
        required_input_keys = (
            (
                "coursewareContractSha256", "presentationScriptSha256", "capabilityIndexSha256",
                "developmentPlanSha256", "behaviorSpecSha256", "projectSha256",
            )
            if schema_version == 2
            else ()
        )
        for key in required_input_keys:
            if (
                key == "projectSha256"
                and not candidate_or_higher
                and inputs.get(key) is None
            ):
                continue
            if not isinstance(inputs.get(key), str) or not SHA256_RE.fullmatch(inputs[key]):
                errors.append(f"inputs.{key} must be a SHA-256")
        if schema_version == 2:
            try:
                approved_contract = load_contract_facts(case_root)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                errors.append(f"approved contract cannot be loaded: {exc}")
            else:
                for key in ("coursewareContractSha256", "presentationScriptSha256"):
                    if inputs.get(key) != approved_contract.get(key):
                        errors.append(f"inputs.{key} is stale")
            if editor_root is not None:
                capability_path = editor_root / "artifacts" / "ai-capabilities" / "index.json"
                if not capability_path.is_file() or inputs.get("capabilityIndexSha256") != sha256_file(capability_path):
                    errors.append("inputs.capabilityIndexSha256 is stale")
            development_plan_path = case_root / "03-development-plan.md"
            if not development_plan_path.is_file():
                errors.append("03-development-plan.md is missing")
            elif inputs.get("developmentPlanSha256") != sha256_file(development_plan_path):
                errors.append("inputs.developmentPlanSha256 is stale")
        artifacts = value.get("artifacts")
        if not isinstance(artifacts, list):
            errors.append("artifacts must be an array")
            artifacts = []
        seen_ids: set[str] = set()
        seen_paths: dict[str, str] = {}
        delivered_kinds: set[str] = set()
        artifact_paths_by_id: dict[str, str] = {}
        artifact_kinds_by_id: dict[str, str] = {}
        artifact_hashes_by_id: dict[str, str] = {}
        artifact_files_by_id: dict[str, Path] = {}
        delivered_project_scene_ids: set[str] | None = None
        for artifact in artifacts:
            if not isinstance(artifact, dict):
                errors.append("artifact entry must be an object")
                continue
            artifact_id = artifact.get("id")
            relative = artifact.get("path")
            expected_hash = artifact.get("sha256")
            artifact_kind = artifact.get("kind")
            if not isinstance(artifact_id, str) or not ARTIFACT_ID_RE.fullmatch(artifact_id):
                errors.append("artifact id is required and must be a portable stable identifier")
                continue
            if artifact_id in seen_ids:
                errors.append(f"duplicate artifact id: {artifact_id}")
            seen_ids.add(artifact_id)
            if not isinstance(artifact_kind, str) or not ARTIFACT_KIND_RE.fullmatch(artifact_kind):
                errors.append(f"{artifact_id}: kind is required and must be a portable lower-case identifier")
            elif schema_version == 2 and artifact_kind not in ARTIFACT_KINDS:
                errors.append(f"{artifact_id}: unsupported schemaVersion 2 artifact kind: {artifact_kind}")
            else:
                delivered_kinds.add(artifact_kind)
                artifact_kinds_by_id.setdefault(artifact_id, artifact_kind)
            if not isinstance(relative, str) or not isinstance(expected_hash, str):
                errors.append(f"{artifact_id}: path and sha256 are required")
                continue
            if not SHA256_RE.fullmatch(expected_hash):
                errors.append(f"{artifact_id}: sha256 must contain 64 hexadecimal characters")
            else:
                artifact_hashes_by_id.setdefault(artifact_id, expected_hash.lower())
            try:
                portable = portable_relative_path(relative)
                path = within(case_root, case_root.joinpath(*portable.parts))
            except ValueError as exc:
                errors.append(f"{artifact_id}: {exc}")
                continue
            path_key = str(path).casefold()
            reused_by = seen_paths.get(path_key)
            if reused_by is not None:
                errors.append(f"duplicate artifact path: {relative} is already used by {reused_by}")
            else:
                seen_paths[path_key] = artifact_id
            artifact_paths_by_id[artifact_id] = relative
            artifact_files_by_id[artifact_id] = path
            if not path.is_file():
                errors.append(f"{artifact_id}: evidence file is missing")
            else:
                if SHA256_RE.fullmatch(expected_hash) and sha256_file(path) != expected_hash.lower():
                    errors.append(f"{artifact_id}: evidence hash is stale")
                if candidate_or_higher and isinstance(artifact_kind, str):
                    format_errors = validate_delivery_artifact(artifact_kind, path)
                    for format_error in format_errors:
                        errors.append(f"{artifact_id}: {format_error}")
                    if artifact_kind == "project" and not format_errors:
                        delivered_project_scene_ids = project_scene_ids(path)

        behavior_gates = {gate: {"status": "not-evaluated", "testIds": []} for gate in GATES}
        if candidate_or_higher:
            if schema_version != 2:
                errors.append("schemaVersion 1 evidence is historical only and cannot become a candidate")
            if pipeline_status != "passed":
                errors.append("candidate or accepted outcome requires pipelineStatus passed")
            required_delivery_kinds = {"project", "html", "web-package", "pdf", "pptx"}
            if outcome in {"art candidate", "accepted"}:
                required_delivery_kinds.update({"screenshot", "contact-sheet"})
            if value.get("recordingRequired") is True:
                required_delivery_kinds.add("recording")
            missing_kinds = sorted(required_delivery_kinds - delivered_kinds)
            if missing_kinds:
                errors.append("delivery evidence is missing artifact kinds: " + ", ".join(missing_kinds))
            project_artifact_ids = [
                artifact_id for artifact_id in seen_ids
                if artifact_kinds_by_id.get(artifact_id) == "project"
            ]
            expected_project_path = f"project/{value.get('caseId')}.h5lesson"
            if len(project_artifact_ids) != 1:
                errors.append("candidate evidence must declare exactly one Project V8 artifact")
            else:
                project_artifact_id = project_artifact_ids[0]
                if artifact_paths_by_id.get(project_artifact_id) != expected_project_path:
                    errors.append(f"project artifact path must be exactly {expected_project_path}")
                if artifact_hashes_by_id.get(project_artifact_id) != inputs.get("projectSha256"):
                    errors.append("inputs.projectSha256 does not match the project artifact")
                state_path = case_root / "implementation" / "implementation-state.json"
                try:
                    state = json.loads(state_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError) as exc:
                    errors.append(f"implementation state is unreadable: {exc}")
                else:
                    if not isinstance(state, dict):
                        errors.append("implementation state must be an object")
                    elif state.get("currentProjectSha256") != inputs.get("projectSha256"):
                        errors.append("inputs.projectSha256 does not match implementation state")
            commands = value.get("commands")
            if commands != []:
                errors.append(
                    "self-reported command results are forbidden; commands must be the closed empty set "
                    "and validate_v8_case must execute the trusted validation plan in the current process"
                )

            verification = value.get("verification")
            if not isinstance(verification, dict):
                errors.append("candidate or accepted outcome requires verification bindings")
                verification = {}

            def verification_json(
                key: str,
                expected_kind: str,
                expected_path: str,
            ) -> tuple[dict[str, Any] | None, str | None]:
                artifact_id = verification.get(key)
                if not isinstance(artifact_id, str) or artifact_id not in seen_ids:
                    errors.append(f"verification.{key} must reference an artifact")
                    return None, None
                if artifact_kinds_by_id.get(artifact_id) != expected_kind:
                    errors.append(f"verification.{key} must reference kind {expected_kind}")
                    return None, artifact_id
                if artifact_paths_by_id.get(artifact_id) != expected_path:
                    errors.append(f"verification.{key} must reference {expected_path}")
                path = artifact_files_by_id.get(artifact_id)
                if path is None or not path.is_file():
                    return None, artifact_id
                try:
                    loaded = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                    errors.append(f"{artifact_id}: invalid JSON verification artifact: {exc}")
                    return None, artifact_id
                if not isinstance(loaded, dict):
                    errors.append(f"{artifact_id}: verification JSON root must be an object")
                    return None, artifact_id
                return loaded, artifact_id

            behavior_spec, behavior_spec_id = verification_json(
                "behaviorSpecArtifactId", "behavior-spec", "implementation/behavior-spec.json"
            )
            behavior_report, _ = verification_json(
                "behaviorReportArtifactId", "behavior-report", "evidence/behavior-report.json"
            )
            inventory, inventory_artifact_id = verification_json(
                "authoringInventoryArtifactId", "authoring-inventory", "implementation/authoring-inventory.json"
            )
            target_snapshot, _ = verification_json(
                "authoringTargetSnapshotArtifactId",
                "authoring-target-snapshot",
                "implementation/authoring-target-snapshot.json",
            )
            authoring_session, _ = verification_json(
                "authoringSessionReportArtifactId",
                "authoring-session-report",
                "evidence/authoring-session-report.json",
            )
            if behavior_spec is not None and behavior_spec_id is not None:
                behavior_spec_hash = artifact_hashes_by_id.get(behavior_spec_id, "")
                if inputs.get("behaviorSpecSha256") != behavior_spec_hash:
                    errors.append("inputs.behaviorSpecSha256 does not match the behavior-spec artifact")
                if behavior_spec.get("caseId") != value.get("caseId"):
                    errors.append("behavior spec caseId does not match evidence manifest")
                if behavior_spec.get("presentationScriptSha256") != inputs.get("presentationScriptSha256"):
                    errors.append("behavior spec presentationScriptSha256 does not match evidence inputs")
                if behavior_spec.get("coursewareContractSha256") != inputs.get("coursewareContractSha256"):
                    errors.append("behavior spec coursewareContractSha256 does not match evidence inputs")
                if behavior_spec.get("developmentPlanSha256") != inputs.get("developmentPlanSha256"):
                    errors.append("behavior spec developmentPlanSha256 does not match evidence inputs")
                behavior_gates = computed_behavior_gates(
                    behavior_spec,
                    behavior_spec_hash,
                    behavior_report,
                    case_root,
                    editor_root,
                    errors,
                )
                report_target = behavior_report.get("target") if isinstance(behavior_report, dict) else None
                if isinstance(report_target, dict):
                    matching_html = [
                        artifact_id for artifact_id in seen_ids
                        if artifact_kinds_by_id.get(artifact_id) == "html"
                        and artifact_paths_by_id.get(artifact_id) == report_target.get("path")
                        and artifact_hashes_by_id.get(artifact_id) == str(report_target.get("sha256", "")).lower()
                    ]
                    if not matching_html:
                        errors.append("behavior report target is not the delivered HTML artifact")

            inventory_entities: dict[str, dict[str, Any]] = {}
            required_entity_ids: set[str] = set()
            if inventory is None or inventory.get("schemaVersion") != 2:
                errors.append("authoring inventory verification artifact must use schemaVersion 2")
            else:
                generated_from = inventory.get("generatedFrom")
                if not isinstance(generated_from, dict):
                    errors.append("authoring inventory generatedFrom is missing")
                else:
                    for input_key in (
                        "coursewareContractSha256",
                        "presentationScriptSha256",
                        "capabilityIndexSha256",
                        "developmentPlanSha256",
                    ):
                        if generated_from.get(input_key) != inputs.get(input_key):
                            errors.append(f"authoring inventory {input_key} does not match evidence inputs")
                raw_entities: list[Any] = []
                raw_entities.extend(inventory.get("globalEntities", []) if isinstance(inventory.get("globalEntities"), list) else [])
                for scene in inventory.get("scenes", []) if isinstance(inventory.get("scenes"), list) else []:
                    if isinstance(scene, dict) and isinstance(scene.get("entities"), list):
                        raw_entities.extend(scene["entities"])
                for entity in raw_entities:
                    if not isinstance(entity, dict) or not isinstance(entity.get("id"), str):
                        continue
                    inventory_entities[entity["id"]] = entity
                    if entity.get("requiredForAcceptance") is True:
                        category = entity.get("editability")
                        if category in {"developer", "blocked"}:
                            errors.append(f"required authoring entity remains {category}: {entity['id']}")
                        else:
                            required_entity_ids.add(entity["id"])
                if not inventory_entities:
                    errors.append("authoring inventory has no entities to verify")
                if not required_entity_ids:
                    errors.append("authoring inventory has no candidate-required editable entities")

            session_entity_ids: set[str] = set()
            authoring_session_error_start = len(errors)
            if not isinstance(authoring_session, dict):
                errors.append("candidate requires an editor-authoring-session-v1 receipt")
            else:
                if authoring_session.get("schemaVersion") != 1 or authoring_session.get("receiptType") != "editor-authoring-session-v1":
                    errors.append("authoring session receipt has an unsupported schema/type")
                if authoring_session.get("caseId") != value.get("caseId"):
                    errors.append("authoring session receipt caseId does not match manifest")
                session_inputs = authoring_session.get("inputs")
                expected_session_inputs = {
                    "projectSha256": inputs.get("projectSha256"),
                    "inventorySha256": (
                        artifact_hashes_by_id.get(inventory_artifact_id, "")
                        if inventory_artifact_id is not None else None
                    ),
                    "coursewareContractSha256": inputs.get("coursewareContractSha256"),
                    "presentationScriptSha256": inputs.get("presentationScriptSha256"),
                    "developmentPlanSha256": inputs.get("developmentPlanSha256"),
                    "capabilityIndexSha256": inputs.get("capabilityIndexSha256"),
                }
                if session_inputs != expected_session_inputs:
                    errors.append("authoring session receipt inputs do not match current evidence bytes")
                if authoring_session.get("errors") != []:
                    errors.append("authoring session receipt contains errors")
                runner_hash = authoring_session.get("runnerSha256")
                if not isinstance(runner_hash, str) or not SHA256_RE.fullmatch(runner_hash):
                    errors.append("authoring session receipt runnerSha256 is invalid")
                if editor_root is not None:
                    runner_path = editor_root / "scripts" / "run-courseware-authoring.ts"
                    if not runner_path.is_file() or runner_hash != sha256_file(runner_path):
                        errors.append("authoring session receipt runnerSha256 is stale")
                editor_build = authoring_session.get("editorBuild")
                if (
                    not isinstance(editor_build, dict)
                    or set(editor_build) != {"renderer", "main", "player"}
                    or any(
                        not isinstance(item, str) or not SHA256_RE.fullmatch(item)
                        for item in editor_build.values()
                    )
                ):
                    errors.append("authoring session editorBuild must bind renderer/main/player SHA-256 values")
                session_entities = authoring_session.get("entities")
                if not isinstance(session_entities, list):
                    errors.append("authoring session entities must be an array")
                    session_entities = []
                for entity in session_entities:
                    if not isinstance(entity, dict) or entity.get("status") != "passed":
                        errors.append("authoring session receipt contains a failed/unsupported entity")
                        continue
                    entity_id = entity.get("inventoryEntityId")
                    if not isinstance(entity_id, str) or entity_id in session_entity_ids:
                        errors.append(f"authoring session has invalid/duplicate entity id: {entity_id}")
                        continue
                    inventory_entity = inventory_entities.get(entity_id)
                    if inventory_entity is None or entity.get("binding") != inventory_entity.get("binding"):
                        errors.append(f"authoring session entity is not bound to inventory: {entity_id}")
                        continue
                    if entity.get("carrier") != "native-scene-text":
                        errors.append(f"authoring session entity uses an unsupported carrier: {entity_id}")
                    binding_parts = str(entity.get("binding", "")).split(":")
                    expected_node_id = binding_parts[3] if len(binding_parts) == 5 else None
                    if entity.get("selectedNodeId") != expected_node_id:
                        errors.append(f"authoring session selected node does not match binding: {entity_id}")
                    if (
                        entity.get("canvasSelectionVerified") is not True
                        or entity.get("saved") is not True
                        or entity.get("reopened") is not True
                        or entity.get("errors") != []
                    ):
                        errors.append(f"authoring session lacks selection/save/reopen proof: {entity_id}")
                    probe_value = entity.get("probeValue")
                    if not isinstance(probe_value, str) or not probe_value:
                        errors.append(f"authoring session has no deterministic probe value: {entity_id}")
                    bounds = entity.get("renderedBounds")
                    if not isinstance(bounds, dict) or set(bounds) != {"x", "y", "width", "height"}:
                        errors.append(f"authoring session renderedBounds is invalid: {entity_id}")
                    else:
                        x, y, width, height = (
                            bounds.get("x"), bounds.get("y"), bounds.get("width"), bounds.get("height")
                        )
                        if (
                            any(not isinstance(number, (int, float)) or isinstance(number, bool) for number in (x, y, width, height))
                            or width <= 0 or height <= 0 or x < 0 or y < 0
                            or x + width > 1280 or y + height > 720
                        ):
                            errors.append(f"authoring session renderedBounds exceeds 1280x720: {entity_id}")
                    observation_state_id = entity.get("observationStateId")
                    if observation_state_id is not None and (
                        not isinstance(observation_state_id, str) or not observation_state_id
                    ):
                        errors.append(f"authoring session observationStateId is invalid: {entity_id}")
                    player_observation = entity.get("player")
                    html_observation = entity.get("html")
                    if (
                        not isinstance(player_observation, dict)
                        or player_observation.get("changed") is not True
                        or not isinstance(html_observation, dict)
                        or html_observation.get("changed") is not True
                    ):
                        errors.append(f"authoring session lacks Player/HTML visual change proof: {entity_id}")
                    else:
                        player_hashes = (
                            player_observation.get("beforeSha256"),
                            player_observation.get("afterSha256"),
                        )
                        html_hashes = (
                            html_observation.get("beforeSha256"),
                            html_observation.get("afterSha256"),
                        )
                        if any(not isinstance(item, str) or not SHA256_RE.fullmatch(item) for item in player_hashes):
                            errors.append(f"authoring session Player screenshot hashes are invalid: {entity_id}")
                        elif player_hashes[0] == player_hashes[1]:
                            errors.append(f"authoring session Player screenshots did not change: {entity_id}")
                        if any(not isinstance(item, str) or not SHA256_RE.fullmatch(item) for item in html_hashes):
                            errors.append(f"authoring session HTML hashes are invalid: {entity_id}")
                        elif html_hashes[0] == html_hashes[1]:
                            errors.append(f"authoring session HTML screenshots did not change: {entity_id}")
                    session_entity_ids.add(entity_id)
                if session_entity_ids != required_entity_ids:
                    errors.append(
                        "authoring session required entity coverage differs from inventory; "
                        f"missing={sorted(required_entity_ids - session_entity_ids)!r}, "
                        f"unknown={sorted(session_entity_ids - required_entity_ids)!r}"
                    )
                exporter = authoring_session.get("exporter")
                if not isinstance(exporter, dict) or exporter.get("kind") != "editor-single-html-ui-v1":
                    errors.append("authoring session has no trusted Editor single-HTML export receipt")
                elif exporter.get("viewport") != {"width": 1280, "height": 720}:
                    errors.append("authoring export receipt viewport must be exactly 1280x720")
                elif any(
                    not isinstance(exporter.get(key), str)
                    or not SHA256_RE.fullmatch(exporter.get(key))
                    for key in ("exportedSha256", "deliverySha256")
                ):
                    errors.append("authoring export receipt hashes are invalid")
                elif exporter.get("deliveryMatches") is not True:
                    errors.append("fresh Editor UI export does not match the delivered HTML")
                else:
                    deliveries = exporter.get("deliveries")
                    expected_deliveries = {
                        "html": "html",
                        "webPackage": "web-package",
                        "pdf": "pdf",
                        "pptx": "pptx",
                    }
                    if not isinstance(deliveries, dict) or set(deliveries) != set(expected_deliveries):
                        errors.append("authoring export receipt must bind exactly HTML/web-package/PDF/PPTX")
                        deliveries = {}
                    for receipt_kind, artifact_kind in expected_deliveries.items():
                        delivery = deliveries.get(receipt_kind)
                        if not isinstance(delivery, dict):
                            errors.append(f"authoring export receipt is missing {receipt_kind}")
                            continue
                        fresh_hash = delivery.get("exportedSha256")
                        delivered_hash = delivery.get("deliverySha256")
                        canonical_hash = delivery.get("canonicalSha256")
                        if (
                            not isinstance(fresh_hash, str)
                            or not SHA256_RE.fullmatch(fresh_hash)
                            or not isinstance(delivered_hash, str)
                            or not SHA256_RE.fullmatch(delivered_hash)
                            or fresh_hash != delivered_hash
                            or delivery.get("matches") is not True
                        ):
                            errors.append(f"authoring export receipt {receipt_kind} hashes do not match")
                            continue
                        if (
                            delivery.get("algorithm") != DELIVERY_FINGERPRINT_ALGORITHMS[receipt_kind]
                            or not isinstance(canonical_hash, str)
                            or not SHA256_RE.fullmatch(canonical_hash)
                        ):
                            errors.append(
                                f"authoring export receipt {receipt_kind} canonical fingerprint is invalid"
                            )
                        matching_delivery = [
                            artifact_id for artifact_id in seen_ids
                            if artifact_kinds_by_id.get(artifact_id) == artifact_kind
                            and artifact_paths_by_id.get(artifact_id) == delivery.get("path")
                            and artifact_hashes_by_id.get(artifact_id) == fresh_hash
                        ]
                        if len(matching_delivery) != 1:
                            errors.append(
                                f"authoring export receipt {receipt_kind} is not bound to exactly one artifact"
                            )
                    matching_html = [
                        artifact_id for artifact_id in seen_ids
                        if artifact_kinds_by_id.get(artifact_id) == "html"
                        and artifact_paths_by_id.get(artifact_id) == exporter.get("checkedDeliveryPath")
                        and artifact_hashes_by_id.get(artifact_id) == exporter.get("exportedSha256")
                        and artifact_hashes_by_id.get(artifact_id) == exporter.get("deliverySha256")
                    ]
                    if len(matching_html) != 1:
                        errors.append("authoring export receipt is not bound to exactly one delivered HTML artifact")
                    html_delivery = deliveries.get("html") if isinstance(deliveries, dict) else None
                    if not isinstance(html_delivery, dict) or (
                        html_delivery.get("path") != exporter.get("checkedDeliveryPath")
                        or html_delivery.get("exportedSha256") != exporter.get("exportedSha256")
                        or html_delivery.get("deliverySha256") != exporter.get("deliverySha256")
                        or html_delivery.get("matches") != exporter.get("deliveryMatches")
                    ):
                        errors.append("authoring export receipt legacy HTML projection differs from deliveries.html")
                    report_target = behavior_report.get("target") if isinstance(behavior_report, dict) else None
                    if not isinstance(report_target, dict) or (
                        report_target.get("path") != exporter.get("checkedDeliveryPath")
                        or report_target.get("sha256") != exporter.get("exportedSha256")
                    ):
                        errors.append(
                            "Behavior target must be the exact HTML freshly exported by the trusted authoring runner"
                        )

            if len(errors) != authoring_session_error_start or session_entity_ids != required_entity_ids:
                behavior_gates["authoringOutcome"] = {
                    "status": "failed",
                    "testIds": behavior_gates.get("authoringOutcome", {}).get("testIds", []),
                }

            if target_snapshot is not None and inventory is not None and inventory_artifact_id is not None:
                project_ids = [
                    artifact_id for artifact_id in seen_ids
                    if artifact_kinds_by_id.get(artifact_id) == "project"
                ]
                project_file = artifact_files_by_id.get(project_ids[0]) if len(project_ids) == 1 else None
                if project_file is not None:
                    try:
                        contract = load_contract_facts(case_root)
                        errors.extend(
                            "authoring target snapshot: " + error
                            for error in validate_snapshot(
                                target_snapshot,
                                inventory,
                                project_file,
                                contract,
                                artifact_hashes_by_id.get(inventory_artifact_id, ""),
                                "implementation",
                            )
                        )
                    except (OSError, ValueError, json.JSONDecodeError) as exc:
                        errors.append(f"authoring target snapshot contract validation failed: {exc}")

            # Legacy manifest-authored round-trip narratives remain in the acceptance scope, but are
            # deliberately non-authoritative. Only the currently replayed editor-authoring-session-v1
            # receipt above may satisfy authoringOutcome coverage.
            round_trips = value.get("editRoundTrips")
            if not isinstance(round_trips, list):
                errors.append("editRoundTrips must be an array (descriptive only; trusted authoring receipt is authoritative)")
            for gate, result in behavior_gates.items():
                if result.get("status") != "passed":
                    errors.append(f"engineering candidate gate failed: {gate}")
            scene_evidence = value.get("sceneEvidence")
            declared_scenes: dict[str, str] = {}
            if not isinstance(scene_evidence, list) or not scene_evidence:
                errors.append("candidate or accepted outcome requires sceneEvidence declarations")
            else:
                for index, scene in enumerate(scene_evidence):
                    if not isinstance(scene, dict):
                        errors.append(f"sceneEvidence[{index}] must be an object")
                        continue
                    scene_id = scene.get("sceneId")
                    scene_type = scene.get("sceneType")
                    if not isinstance(scene_id, str) or not SCENE_ID_RE.fullmatch(scene_id):
                        errors.append(f"sceneEvidence[{index}] has no portable sceneId")
                        continue
                    if scene_id in declared_scenes:
                        errors.append(f"duplicate sceneEvidence declaration: {scene_id}")
                    if scene_type not in {"interactive", "static"}:
                        errors.append(f"sceneEvidence[{index}] has invalid sceneType")
                        continue
                    declared_scenes[scene_id] = scene_type
                if delivered_project_scene_ids is not None:
                    declared_scene_ids = set(declared_scenes)
                    missing_scene_declarations = sorted(delivered_project_scene_ids - declared_scene_ids)
                    unknown_scene_declarations = sorted(declared_scene_ids - delivered_project_scene_ids)
                    if missing_scene_declarations:
                        errors.append(
                            "sceneEvidence is missing Project V8 scenes: "
                            + ", ".join(missing_scene_declarations)
                        )
                    if unknown_scene_declarations:
                        errors.append(
                            "sceneEvidence declares scenes absent from Project V8: "
                            + ", ".join(unknown_scene_declarations)
                        )
            required_frames = value.get("requiredFrames")
            if outcome == "engineering candidate":
                if required_frames != []:
                    errors.append(
                        "engineering candidate requiredFrames must be empty; locally unverifiable visual "
                        "claims belong to external art review"
                    )
            elif not isinstance(required_frames, list) or not required_frames:
                errors.append("candidate or accepted outcome requires requiredFrames evidence")
            else:
                seen_frame_keys: set[tuple[str, str]] = set()
                seen_frame_artifacts: set[str] = set()
                seen_frame_hashes: set[str] = set()
                roles_by_scene: dict[str, set[str]] = {}
                for index, frame in enumerate(required_frames):
                    if not isinstance(frame, dict):
                        errors.append(f"requiredFrames[{index}] must be an object")
                        continue
                    scene_id = frame.get("sceneId")
                    role = frame.get("role")
                    artifact_id = frame.get("artifactId")
                    state_id = frame.get("stateId")
                    capture_method = frame.get("captureMethod")
                    if not isinstance(scene_id, str) or not scene_id:
                        errors.append(f"requiredFrames[{index}] has no sceneId")
                    if role not in ("pre-interaction", "feedback", "stable-result", "static-stable"):
                        errors.append(f"requiredFrames[{index}] has invalid role")
                    if not isinstance(state_id, str) or not SCENE_ID_RE.fullmatch(state_id):
                        errors.append(f"requiredFrames[{index}] requires a stable stateId")
                    if capture_method not in {
                        "behavior-runner-v2", "editor-ui-capture-v1", "static-export-capture-v1",
                    }:
                        errors.append(f"requiredFrames[{index}] has invalid captureMethod provenance")
                    if frame.get("projectSha256") != inputs.get("projectSha256"):
                        errors.append(f"requiredFrames[{index}] projectSha256 is stale")
                    if frame.get("viewport") != {"width": 1280, "height": 720}:
                        errors.append(f"requiredFrames[{index}] viewport must be exactly 1280x720")
                    if not isinstance(artifact_id, str) or artifact_id not in seen_ids:
                        errors.append(f"requiredFrames[{index}] references missing artifact")
                    elif artifact_id not in artifact_paths_by_id:
                        errors.append(f"requiredFrames[{index}] artifact has no validated path")
                    elif artifact_kinds_by_id.get(artifact_id) != "screenshot":
                        errors.append(f"requiredFrames[{index}] must reference a screenshot artifact")
                    elif artifact_id in seen_frame_artifacts:
                        errors.append(f"requiredFrames[{index}] reuses a screenshot from another frame slot")
                    elif artifact_hashes_by_id.get(artifact_id) in seen_frame_hashes:
                        errors.append(f"requiredFrames[{index}] reuses identical screenshot bytes")
                    else:
                        seen_frame_artifacts.add(artifact_id)
                        artifact_hash = artifact_hashes_by_id.get(artifact_id)
                        if artifact_hash is not None:
                            seen_frame_hashes.add(artifact_hash)
                    key = (str(scene_id), str(role))
                    if key in seen_frame_keys:
                        errors.append(f"duplicate required frame: {scene_id}/{role}")
                    seen_frame_keys.add(key)
                    if isinstance(scene_id, str) and isinstance(role, str):
                        roles_by_scene.setdefault(scene_id, set()).add(role)
                    if isinstance(scene_id, str) and scene_id not in declared_scenes:
                        errors.append(f"requiredFrames[{index}] scene is not declared in sceneEvidence")
                for scene_id, scene_type in declared_scenes.items():
                    expected_roles = (
                        {"pre-interaction", "feedback", "stable-result"}
                        if scene_type == "interactive"
                        else {"static-stable"}
                    )
                    actual_roles = roles_by_scene.get(scene_id, set())
                    missing_roles = sorted(expected_roles - actual_roles)
                    unexpected_roles = sorted(actual_roles - expected_roles)
                    if missing_roles:
                        errors.append(
                            f"sceneEvidence {scene_id} is missing required frame roles: {', '.join(missing_roles)}"
                        )
                    if unexpected_roles:
                        errors.append(
                            f"sceneEvidence {scene_id} has roles inconsistent with {scene_type}: "
                            + ", ".join(unexpected_roles)
                        )

        current_scope = acceptance_scope(value)

        acceptance = value.get("humanAcceptance")
        if outcome == "accepted":
            if not isinstance(acceptance, dict):
                errors.append("accepted outcome requires humanAcceptance")
            else:
                for key in ("reviewer", "approvedAt", "approvalEvidence", "explicitOpinion"):
                    if not isinstance(acceptance.get(key), str) or not acceptance.get(key).strip():
                        errors.append(f"humanAcceptance is missing {key}")
                if acceptance.get("decision") != "accepted":
                    errors.append("humanAcceptance decision must be accepted")
                reviewer = str(acceptance.get("reviewer", "")).strip()
                if reviewer_is_automated(reviewer):
                    errors.append("automation cannot be the acceptance reviewer")
                if acceptance.get("scopeSha256") != current_scope:
                    errors.append("humanAcceptance scopeSha256 does not match the current evidence scope")
        elif acceptance is not None and isinstance(acceptance, dict) and acceptance.get("decision") == "accepted":
            errors.append("human acceptance record and outcomeStatus disagree")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        errors.append(str(exc))

    report = {
        "validator": "project-v8-evidence-v2",
        "assurance": "structural-only" if args.structural_only else "standalone",
        "status": "passed" if not errors else "failed",
        "currentAcceptanceScopeSha256": current_scope if "current_scope" in locals() else None,
        "computedGates": behavior_gates if "behavior_gates" in locals() else {},
        "blockedCapabilities": (
            ["editor-authoring-session-replay-v1"]
            if candidate_or_higher and schema_version == 2
            else []
        ) if "candidate_or_higher" in locals() else [],
        "errors": errors,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"status: {report['status']}")
        for error in errors:
            print(f"ERROR: {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
