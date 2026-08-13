#!/usr/bin/env python3
"""Validate observable Project V8 behavior specs and capacity math."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from v8_common import csv_contract_values, load_contract_facts, load_json


GATES = (
    "teacherControl",
    "teacherEscape",
    "requiredActions",
    "assessmentTolerance",
    "authoringOutcome",
    "responseCapacity",
)
BROWSER_GATES = set(GATES) - {"responseCapacity"}
ACTIONS = {"click", "fill", "press", "select-option", "check", "drag", "wait-visible", "reload"}
ASSERTIONS = {"visible", "hidden", "text", "value", "attribute", "count", "enabled", "url"}
AUTO_ASSESSMENT_VARIANTS = {"exact", "accepted-variant", "rejected"}
HUMAN_ASSESSMENT_VARIANTS = {"human-recorded"}
ASSESSMENT_MODES = {"finite-auto", "normalized-auto", "human"}
ACT_STEP_ACTIONS = {
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
ID_RE = re.compile(r"^[A-Z][A-Z0-9]*-\d{3,}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
EVENT_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]{0,127}$")
FORBIDDEN_TEXT = (
    "window.__",
    "__h5_lesson",
    "__h5lesson",
    "editorstore",
    "runtimestore",
    "evaluate(",
    "page.evaluate",
    "dispatchaction",
    "setstate(",
)


def canonical_sha256(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def is_sha256(value: Any) -> bool:
    return isinstance(value, str) and SHA256_RE.fullmatch(value) is not None


def contains_forbidden(value: Any) -> str | None:
    if isinstance(value, str):
        lowered = value.casefold()
        return next((token for token in FORBIDDEN_TEXT if token in lowered), None)
    if isinstance(value, list):
        for item in value:
            found = contains_forbidden(item)
            if found:
                return found
    if isinstance(value, dict):
        for item in value.values():
            found = contains_forbidden(item)
            if found:
                return found
    return None


def validate_capacity(value: Any, errors: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append("responseCapacity must be an object")
        return {"status": "failed", "plannedSeconds": None, "durationSeconds": None}
    duration = value.get("durationSeconds")
    non_response = value.get("nonResponseSeconds")
    if not isinstance(duration, int) or isinstance(duration, bool) or duration <= 0:
        errors.append("responseCapacity.durationSeconds must be a positive integer")
    if not isinstance(non_response, int) or isinstance(non_response, bool) or non_response < 0:
        errors.append("responseCapacity.nonResponseSeconds must be a non-negative integer")
    items = value.get("items")
    if not isinstance(items, list) or not items:
        errors.append("responseCapacity.items must contain at least one RESP item")
        items = []
    seen: set[str] = set()
    item_seconds = 0
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"responseCapacity.items[{index}] must be an object")
            continue
        response_id = item.get("responseId")
        if not isinstance(response_id, str) or not re.fullmatch(r"RESP-\d{3,}", response_id):
            errors.append(f"responseCapacity.items[{index}].responseId must be RESP-*")
        elif response_id in seen:
            errors.append(f"duplicate responseCapacity item: {response_id}")
        else:
            seen.add(response_id)
        segments = (
            ("baselineCount", "baselineSecondsEach", True),
            ("retryCount", "retrySecondsEach", False),
            ("discussionCount", "discussionSecondsEach", False),
        )
        for count_key, seconds_key, positive_count in segments:
            count = item.get(count_key)
            seconds = item.get(seconds_key)
            count_valid = (
                isinstance(count, int)
                and not isinstance(count, bool)
                and (count > 0 if positive_count else count >= 0)
            )
            if not count_valid:
                qualifier = "positive" if positive_count else "non-negative"
                errors.append(f"responseCapacity.items[{index}].{count_key} must be a {qualifier} integer")
            seconds_valid = isinstance(seconds, int) and not isinstance(seconds, bool) and seconds >= 0
            if not seconds_valid or (isinstance(count, int) and count > 0 and seconds == 0):
                errors.append(
                    f"responseCapacity.items[{index}].{seconds_key} must be positive when {count_key} is non-zero"
                )
            if count_valid and seconds_valid:
                item_seconds += count * seconds
    planned = non_response + item_seconds if isinstance(non_response, int) and not isinstance(non_response, bool) and non_response >= 0 else None
    if isinstance(duration, int) and not isinstance(duration, bool) and duration > 0 and isinstance(planned, int) and planned > duration:
        errors.append(f"response capacity exceeds duration: {planned}s > {duration}s")
    passed = isinstance(duration, int) and duration > 0 and isinstance(planned, int) and planned <= duration and bool(items)
    return {"status": "passed" if passed else "failed", "plannedSeconds": planned, "durationSeconds": duration}


def _none_contract_value(value: Any) -> bool:
    return str(value or "").strip().casefold() in {"", "none", "无"}


def _contract_int(record_id: str, fields: dict[str, str], key: str, errors: list[str]) -> int | None:
    raw = fields.get(key, "")
    if re.fullmatch(r"\d+", raw) is None:
        errors.append(f"approved contract {record_id}.{key} is not an integer")
        return None
    return int(raw)


def validate_contract_alignment(
    value: dict[str, Any],
    contract: dict[str, Any],
    capability_index: dict[str, Any] | None,
    errors: list[str],
) -> None:
    """Require the executable JSON to be a lossless view of approved records."""
    if value.get("coursewareContractSha256") != contract.get("coursewareContractSha256"):
        errors.append("coursewareContractSha256 does not match the approved courseware contract")
    if value.get("presentationScriptSha256") != contract.get("presentationScriptSha256"):
        errors.append("presentationScriptSha256 does not match the approved presentation script")

    responses = contract["responses"]
    actions = contract["actions"]
    escapes = contract["escapes"]
    authoring = contract["authoring"]
    tolerances = contract["toleranceCases"]
    assessments = {
        item.get("responseId"): item
        for item in value.get("assessments", [])
        if isinstance(item, dict) and isinstance(item.get("responseId"), str)
    }
    if set(assessments) != set(responses):
        missing = sorted(set(responses) - set(assessments))
        extra = sorted(set(assessments) - set(responses))
        errors.append(
            "assessments RESP IDs differ from the approved contract"
            + (f"; missing: {', '.join(missing)}" if missing else "")
            + (f"; unknown: {', '.join(extra)}" if extra else "")
        )

    evaluators = (
        capability_index.get("assessmentEvaluators")
        if isinstance(capability_index, dict)
        else None
    )
    evaluator_map: dict[str, dict[str, Any]] = {}
    if isinstance(evaluators, list):
        evaluator_map = {
            item.get("id"): item
            for item in evaluators
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
    elif isinstance(evaluators, dict):
        evaluator_map = {
            key: item for key, item in evaluators.items()
            if isinstance(key, str) and isinstance(item, dict)
        }

    for response_id, fields in responses.items():
        assessment = assessments.get(response_id)
        if not isinstance(assessment, dict):
            continue
        authority = fields.get("authority")
        expected_system_authority = "teacher" if authority == "human" else "system"
        expected_tolerances = csv_contract_values(fields.get("toleranceCaseRefs"))
        expected_override = None if _none_contract_value(fields.get("teacherOverrideRef")) else fields.get("teacherOverrideRef")
        expected_evaluator = None if _none_contract_value(fields.get("evaluatorCapabilityRef")) else fields.get("evaluatorCapabilityRef")
        expected_accepted_values = [
            tolerance.get("input")
            for tolerance in tolerances.values()
            if tolerance.get("responseRef") == response_id and tolerance.get("expected") == "pass"
        ]
        expected = {
            "collectionMode": fields.get("mode"),
            "responseType": fields.get("responseType"),
            "mode": authority,
            "authority": expected_system_authority,
            "navigationGate": fields.get("navigationGate"),
            "teacherOverrideRef": expected_override,
            "evaluatorRef": expected_evaluator,
            "toleranceCaseRefs": expected_tolerances,
        }
        for key, expected_value in expected.items():
            if assessment.get(key) != expected_value:
                errors.append(
                    f"assessment {response_id}.{key} must equal approved contract value {expected_value!r}"
                )
        if authority == "human":
            if "acceptedValues" in assessment:
                errors.append(f"assessment {response_id}: human assessment must not declare acceptedValues")
        elif assessment.get("acceptedValues") != expected_accepted_values:
            errors.append(
                f"assessment {response_id}.acceptedValues must equal the approved passing TOL inputs "
                f"{expected_accepted_values!r}"
            )
        if expected_evaluator is not None and capability_index is not None:
            evaluator = evaluator_map.get(str(expected_evaluator))
            if evaluator is None:
                errors.append(f"assessment {response_id} evaluator is absent from Capability Index: {expected_evaluator}")
            else:
                if evaluator.get("status") != "stable":
                    errors.append(f"assessment {response_id} evaluator is not stable: {expected_evaluator}")
                supported_authorities = evaluator.get("authorities")
                if not isinstance(supported_authorities, list) or authority not in supported_authorities:
                    errors.append(f"assessment {response_id} evaluator does not support authority {authority}")
                response_types = evaluator.get("responseTypes")
                if not isinstance(response_types, list) or fields.get("responseType") not in response_types:
                    errors.append(
                        f"assessment {response_id} evaluator does not support response type {fields.get('responseType')}"
                    )
                invocation = evaluator.get("invocation")
                if not isinstance(invocation, dict) or not all(
                    isinstance(invocation.get(key), str) and invocation[key]
                    for key in ("module", "export")
                ):
                    errors.append(f"assessment {response_id} evaluator has no executable invocation")
                elif invocation.get("runtime") != "ctx.assessment.evaluate":
                    errors.append(
                        f"assessment {response_id} evaluator runtime must be ctx.assessment.evaluate"
                    )

    tests = [item for item in value.get("tests", []) if isinstance(item, dict)]
    known_refs = set(responses) | set(actions) | set(escapes) | set(authoring) | set(tolerances)
    refs_by_gate: dict[str, set[str]] = {gate: set() for gate in BROWSER_GATES}
    tolerance_tests: dict[str, list[dict[str, Any]]] = {}
    escape_state_coverage: dict[str, set[str]] = {}
    for test in tests:
        gate = test.get("gate")
        refs = test.get("contractRefs") if isinstance(test.get("contractRefs"), list) else []
        unknown = sorted(set(refs) - known_refs)
        if unknown:
            errors.append(f"{test.get('id')}: contractRefs are not approved: {', '.join(unknown)}")
        if gate in refs_by_gate:
            refs_by_gate[str(gate)].update(refs)
        if gate == "teacherControl":
            escape_refs = [ref for ref in refs if ref in escapes]
            if len(escape_refs) != 1:
                errors.append(f"{test.get('id')}: teacherControl must bind exactly one approved ESC-*")
            steps = [step for step in test.get("steps", []) if isinstance(step, dict)]
            control_steps = [
                step for step in steps
                if step.get("action") == "click"
                and isinstance(step.get("selector"), str)
                and re.fullmatch(
                    r"\[data-teacher-escape='(previous|continue-incomplete|scene-picker|replay)'\]",
                    step["selector"],
                )
            ]
            if len(control_steps) != 1 or len(steps) != 1:
                errors.append(
                    f"{test.get('id')}: teacherControl must execute exactly one top-level "
                    "[data-teacher-escape] click"
                )
            else:
                step = control_steps[0]
                hook = re.fullmatch(r"\[data-teacher-escape='([^']+)'\]", step["selector"])
                product_action = {
                    "continue-incomplete": "next",
                    "previous": "previous",
                    "scene-picker": "scene-picker",
                    "replay": "replay",
                }.get(hook.group(1) if hook else "")
                step_id = step.get("id")
                project_state_id = test.get("projectStateId")
                if not isinstance(project_state_id, str) or not project_state_id:
                    errors.append(f"{test.get('id')}.projectStateId must bind the source Project state")
                events = test.get("witnessedEvents", [])
                for phase, accepted in (("requested", None), ("completed", True)):
                    matching = any(
                        isinstance(event, dict)
                        and event.get("name") == "courseware-teacher-escape-action"
                        and isinstance(event.get("match"), dict)
                        and event["match"].get("sceneId") == test.get("sceneId")
                        and event["match"].get("stateId") == project_state_id
                        and event["match"].get("action") == product_action
                        and event["match"].get("phase") == phase
                        and (accepted is None or event["match"].get("accepted") is accepted)
                        and event.get("afterStepId") == step_id
                        for event in events
                    )
                    if not matching:
                        errors.append(
                            f"{test.get('id')}: teacherControl needs host {phase} witness for the "
                            "source scene/state/action and exact afterStepId"
                        )
                assertions = [item for item in test.get("assertions", []) if isinstance(item, dict)]
                if not any(
                    item.get("type") in {"visible", "hidden", "text", "value", "attribute", "count", "url"}
                    and item.get("selector") not in {None, "body", "html"}
                    for item in assertions
                ):
                    errors.append(
                        f"{test.get('id')}: teacherControl needs a non-body observable state-change assertion"
                    )
        if gate == "requiredActions":
            action_refs = [ref for ref in refs if ref in actions]
            if len(action_refs) != 1:
                errors.append(f"{test.get('id')}: requiredActions test must bind exactly one approved ACT-*")
            else:
                action = actions[action_refs[0]]
                for key, contract_key in (("actionKind", "kind"), ("actor", "actor")):
                    if test.get(key) != action.get(contract_key):
                        errors.append(
                            f"{test.get('id')}.{key} must equal approved {action_refs[0]}.{contract_key}"
                        )
                if test.get("scriptSceneRef") != action.get("sceneRef"):
                    errors.append(f"{test.get('id')}.scriptSceneRef must equal approved {action_refs[0]}.sceneRef")
                steps = [step for step in test.get("steps", []) if isinstance(step, dict)]
                allowed_actions = ACT_STEP_ACTIONS.get(str(action.get("kind")), set())
                action_steps = [step for step in steps if step.get("action") in allowed_actions]
                if len(action_steps) != 1:
                    errors.append(
                        f"{test.get('id')}: approved ACT kind {action.get('kind')} needs exactly one matching "
                        f"runner step from {sorted(allowed_actions)!r}; oral/paper require an external "
                        "trusted physical-action receipt"
                    )
                action_step_ids = {step.get("id") for step in action_steps}
                act_events = [
                    event for event in test.get("witnessedEvents", [])
                    if isinstance(event, dict)
                    and event.get("name") == "courseware-action-completed"
                    and isinstance(event.get("match"), dict)
                    and event["match"].get("actId") == action_refs[0]
                    and event["match"].get("sceneRef") == action.get("sceneRef")
                    and event["match"].get("actionKind") == action.get("kind")
                    and event.get("afterStepId") in action_step_ids
                ]
                if len(act_events) != 1:
                    errors.append(
                        f"{test.get('id')}: exactly one ACT witness must bind actId/sceneRef/actionKind and afterStepId"
                    )
                hidden_refs = csv_contract_values(action.get("initiallyHiddenContentRefs"))
                revealed_refs = csv_contract_values(action.get("revealedContentRefs"))
                if hidden_refs or revealed_refs:
                    hidden_assertions = {
                        assertion.get("contentRef") for assertion in test.get("preAssertions", [])
                        if isinstance(assertion, dict) and assertion.get("type") == "hidden"
                    }
                    visible_assertions = {
                        assertion.get("contentRef") for assertion in test.get("assertions", [])
                        if isinstance(assertion, dict) and assertion.get("type") == "visible"
                    }
                    if hidden_assertions != set(hidden_refs):
                        errors.append(
                            f"{test.get('id')}: preAssertions hidden CNT coverage must equal "
                            f"{action_refs[0]}.initiallyHiddenContentRefs"
                        )
                    if not set(revealed_refs).issubset(visible_assertions):
                        errors.append(
                            f"{test.get('id')}: post-action visible assertions miss approved revealed CNT refs"
                        )
                produced = action.get("evidenceProduced")
                if not _none_contract_value(produced):
                    response_refs = [ref for ref in refs if ref.startswith("RESP-")]
                    if response_refs != [produced]:
                        errors.append(
                            f"{test.get('id')}: contractRefs must bind exactly approved ACT evidenceProduced {produced}"
                        )
                    matching_event = any(
                        isinstance(event, dict)
                        and event.get("name") == "courseware-response-submitted"
                        and isinstance(event.get("match"), dict)
                        and event["match"].get("responseId") == produced
                        for event in test.get("witnessedEvents", [])
                    )
                    if not matching_event:
                        errors.append(
                            f"{test.get('id')}: ACT evidenceProduced {produced} needs a public submission event"
                        )
                elif any(isinstance(ref, str) and ref.startswith("RESP-") for ref in refs):
                    errors.append(
                        f"{test.get('id')}: ACT without evidenceProduced must not bind a RESP-*"
                    )
        if gate == "teacherEscape":
            escape_refs = [ref for ref in refs if ref in escapes]
            if len(escape_refs) != 1:
                errors.append(f"{test.get('id')}: teacherEscape test must bind exactly one approved ESC-*")
            else:
                escape = escapes[escape_refs[0]]
                if test.get("scriptSceneRef") != escape.get("sceneRef"):
                    errors.append(f"{test.get('id')}.scriptSceneRef must equal approved {escape_refs[0]}.sceneRef")
                if test.get("stateRef") not in csv_contract_values(escape.get("stateRefs")):
                    errors.append(f"{test.get('id')}.stateRef must be an approved {escape_refs[0]} state")
                elif isinstance(test.get("stateRef"), str):
                    escape_state_coverage.setdefault(escape_refs[0], set()).add(test["stateRef"])
                if test.get("escapeAction") not in csv_contract_values(escape.get("actions")):
                    errors.append(f"{test.get('id')}.escapeAction must be an approved {escape_refs[0]} action")
                if test.get("confirmBeforeContinue") != (escape.get("confirmBeforeContinue") == "true"):
                    errors.append(f"{test.get('id')}.confirmBeforeContinue differs from {escape_refs[0]}")
                if test.get("independentOfCorrectness") != (escape.get("independentOfCorrectness") == "true"):
                    errors.append(f"{test.get('id')}.independentOfCorrectness differs from {escape_refs[0]}")
                action_steps = [
                    step for step in test.get("steps", [])
                    if isinstance(step, dict)
                    and step.get("action") in {"click", "press"}
                    and isinstance(step.get("selector"), str)
                    and re.fullmatch(
                        r"\[data-teacher-escape=['\"](?:previous|continue-incomplete|scene-picker|replay)['\"]\]",
                        step["selector"],
                    )
                ]
                step_ids = {step.get("id") for step in action_steps}
                product_action = {
                    "continue-incomplete": "next",
                    "previous": "previous",
                    "scene-picker": "scene-picker",
                    "replay": "replay",
                }.get(test.get("escapeAction"))
                if product_action is None:
                    errors.append(
                        f"{test.get('id')}: approved escape action has no published teacher escape UI: "
                        f"{test.get('escapeAction')}"
                    )
                project_state_id = test.get("projectStateId")
                if not isinstance(project_state_id, str) or not project_state_id:
                    errors.append(f"{test.get('id')}.projectStateId must bind the observable Project state")
                events = test.get("witnessedEvents", [])
                # The product freezes the source scene/state before navigation and uses that
                # same approved context for requested/confirmation/completed evidence.
                missing_requested_steps = [
                    step_id for step_id in step_ids
                    if not any(
                        isinstance(event, dict)
                        and event.get("name") == "courseware-teacher-escape-action"
                        and isinstance(event.get("match"), dict)
                        and event["match"].get("sceneId") == test.get("sceneId")
                        and event["match"].get("stateId") == project_state_id
                        and event["match"].get("action") == product_action
                        and event["match"].get("phase") == "requested"
                        and event.get("afterStepId") == step_id
                        for event in events
                    )
                ]
                if missing_requested_steps:
                    errors.append(
                        f"{test.get('id')}: every ESC interaction needs a requested witness binding the real "
                        f"source sceneId/stateId/action and afterStepId; missing={missing_requested_steps!r}"
                    )
                final_step_id = action_steps[-1].get("id") if action_steps else None
                matching_escape_event = any(
                    isinstance(event, dict)
                    and event.get("name") == "courseware-teacher-escape-action"
                    and isinstance(event.get("match"), dict)
                    and event["match"].get("action") == product_action
                    and event["match"].get("sceneId") == test.get("sceneId")
                    and event["match"].get("stateId") == project_state_id
                    and event["match"].get("phase") == "completed"
                    and event["match"].get("accepted") is True
                    and event.get("afterStepId") == final_step_id
                    for event in events
                )
                if not matching_escape_event:
                    errors.append(
                        f"{test.get('id')}: ESC completion must bind action, phase=completed, "
                        "accepted=true, source scene/state and the final afterStepId"
                    )
                if test.get("confirmBeforeContinue") is True and test.get("escapeAction") == "continue-incomplete":
                    if len(action_steps) < 2:
                        errors.append(f"{test.get('id')}: confirmed continue needs two visible click/press steps")
                    else:
                        first_step_id = action_steps[0].get("id")
                        confirmation_event = any(
                            isinstance(event, dict)
                            and event.get("name") == "courseware-teacher-escape-action"
                            and isinstance(event.get("match"), dict)
                            and event["match"].get("sceneId") == test.get("sceneId")
                            and event["match"].get("stateId") == project_state_id
                            and event["match"].get("action") == "next"
                            and event["match"].get("phase") == "confirmation-required"
                            and event["match"].get("accepted") is False
                            and event.get("afterStepId") == first_step_id
                            for event in events
                        )
                        if not confirmation_event:
                            errors.append(
                                f"{test.get('id')}: first confirmed continue step needs the real "
                                "confirmation-required/accepted=false event"
                            )
        if gate == "assessmentTolerance":
            response_ids = [ref for ref in refs if ref in responses]
            if len(response_ids) != 1:
                errors.append(f"{test.get('id')}: assessmentTolerance must bind exactly one approved RESP-*")
                continue
            assessment = assessments.get(response_ids[0])
            if isinstance(assessment, dict) and assessment.get("mode") == "human":
                tolerance_ids = [ref for ref in refs if ref.startswith("TOL-")]
                if tolerance_ids:
                    errors.append(f"{test.get('id')}: human assessment must not reference TOL-*")
                if test.get("variant") != "human-recorded":
                    errors.append(f"{test.get('id')}: human assessment variant must be human-recorded")
                matching_event = any(
                    isinstance(event, dict)
                    and event.get("name") in {
                        "courseware-assessment-recorded", "courseware-response-submitted",
                    }
                    and isinstance(event.get("match"), dict)
                    and event["match"].get("responseId") == response_ids[0]
                    for event in test.get("witnessedEvents", [])
                )
                if not matching_event:
                    errors.append(
                        f"{test.get('id')}: human assessment needs a public recorded/submitted event"
                    )
                continue
            tolerance_ids = [ref for ref in refs if ref in tolerances]
            if len(tolerance_ids) != 1:
                errors.append(f"{test.get('id')}: each automatic tolerance test must bind exactly one TOL-*")
                continue
            tolerance_id = tolerance_ids[0]
            tolerance_tests.setdefault(tolerance_id, []).append(test)
            tolerance = tolerances[tolerance_id]
            if response_ids != [tolerance.get("responseRef")]:
                errors.append(f"{test.get('id')}: TOL responseRef must be the sole RESP-* contractRef")
            for key, expected_key in (
                ("toleranceCaseId", "toleranceCaseId"),
                ("input", "input"),
                ("expectedResult", "expected"),
            ):
                if test.get(key) != tolerance.get(expected_key):
                    errors.append(
                        f"{test.get('id')}.{key} must equal approved {tolerance_id} value {tolerance.get(expected_key)!r}"
                    )
            expected_passed = tolerance.get("expected") == "pass"
            action_steps = [
                step for step in test.get("steps", [])
                if isinstance(step, dict) and step.get("action") not in {"wait-visible", "reload"}
            ]
            if len(action_steps) != 1:
                errors.append(
                    f"{test.get('id')}: automatic tolerance test needs exactly one actionable step "
                    "for host trace afterStepId binding"
                )
            matching_event = any(
                isinstance(event, dict)
                and event.get("name") == "courseware-assessment-result"
                and isinstance(event.get("match"), dict)
                and event["match"].get("responseId") == tolerance.get("responseRef")
                and event["match"].get("passed") is expected_passed
                for event in test.get("witnessedEvents", [])
            )
            if not matching_event:
                errors.append(
                    f"{test.get('id')}: public assessment event must bind {tolerance.get('responseRef')} passed={expected_passed}"
                )

    for gate, expected_ids, prefix in (
        ("requiredActions", set(actions), "ACT"),
        ("teacherEscape", set(escapes), "ESC"),
        ("authoringOutcome", set(authoring), "AUTH"),
    ):
        actual = {ref for ref in refs_by_gate[gate] if ref.startswith(prefix + "-")}
        if actual != expected_ids:
            errors.append(
                f"{gate} {prefix} coverage must exactly match approved IDs; "
                f"missing={sorted(expected_ids - actual)!r}, unknown={sorted(actual - expected_ids)!r}"
            )
    if set(tolerance_tests) != set(tolerances):
        errors.append(
            "assessmentTolerance must contain one independent test per approved TOL-*; "
            f"missing={sorted(set(tolerances) - set(tolerance_tests))!r}, "
            f"unknown={sorted(set(tolerance_tests) - set(tolerances))!r}"
        )
    for tolerance_id, bound_tests in tolerance_tests.items():
        if len(bound_tests) != 1:
            errors.append(f"{tolerance_id} must be exercised by exactly one independent behavior test")
    for escape_id, escape in escapes.items():
        expected_states = set(csv_contract_values(escape.get("stateRefs")))
        actual_states = escape_state_coverage.get(escape_id, set())
        if actual_states != expected_states:
            errors.append(
                f"{escape_id} teacherEscape state coverage must be exact; "
                f"missing={sorted(expected_states - actual_states)!r}, "
                f"unknown={sorted(actual_states - expected_states)!r}"
            )

    capacity = value.get("responseCapacity")
    if isinstance(capacity, dict):
        if capacity.get("durationSeconds") != contract.get("durationSeconds"):
            errors.append("responseCapacity.durationSeconds differs from approved lesson duration")
        if capacity.get("nonResponseSeconds") != contract.get("nonResponseSeconds"):
            errors.append("responseCapacity.nonResponseSeconds differs from approved capacity inputs")
        items = {
            item.get("responseId"): item
            for item in capacity.get("items", [])
            if isinstance(item, dict) and isinstance(item.get("responseId"), str)
        }
        for response_id, fields in responses.items():
            item = items.get(response_id)
            if not isinstance(item, dict):
                continue
            first = _contract_int(response_id, fields, "firstAttemptSeconds", errors)
            retry = _contract_int(response_id, fields, "retrySeconds", errors)
            discussion = _contract_int(response_id, fields, "teacherDiscussionSeconds", errors)
            expected_capacity = {
                "baselineCount": 1,
                "baselineSecondsEach": first,
                "retryCount": 1 if retry else 0,
                "retrySecondsEach": retry,
                "discussionCount": 1 if discussion else 0,
                "discussionSecondsEach": discussion,
            }
            for key, expected_value in expected_capacity.items():
                if item.get(key) != expected_value:
                    errors.append(f"responseCapacity {response_id}.{key} must equal {expected_value!r}")


def validate_spec(
    value: Any,
    contract: dict[str, Any] | None = None,
    capability_index: dict[str, Any] | None = None,
) -> tuple[list[str], list[str], dict[str, Any]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(value, dict) or value.get("schemaVersion") != 2:
        return ["behavior spec must be a schemaVersion 2 object"], warnings, {}
    case_id = value.get("caseId")
    if not isinstance(case_id, str) or not case_id.strip():
        errors.append("caseId is required")
    for key in ("coursewareContractSha256", "presentationScriptSha256", "developmentPlanSha256"):
        if not is_sha256(value.get(key)):
            errors.append(f"{key} must be a lowercase SHA-256")
    forbidden = contains_forbidden(value)
    if forbidden:
        errors.append(f"behavior spec contains forbidden internal-control token: {forbidden}")

    assessments = value.get("assessments")
    if not isinstance(assessments, list) or not assessments:
        errors.append("assessments must contain every RESP contract")
        assessments = []
    assessments_by_id: dict[str, dict[str, Any]] = {}
    for index, assessment in enumerate(assessments):
        label = f"assessments[{index}]"
        if not isinstance(assessment, dict):
            errors.append(f"{label} must be an object")
            continue
        unknown = sorted(set(assessment) - {
            "responseId", "collectionMode", "responseType", "mode", "authority",
            "navigationGate", "teacherOverrideRef", "evaluatorRef", "acceptedValues", "toleranceCaseRefs",
        })
        if unknown:
            errors.append(f"{label}: unknown fields are forbidden: {', '.join(unknown)}")
        response_id = assessment.get("responseId")
        mode = assessment.get("mode")
        authority = assessment.get("authority")
        if not isinstance(response_id, str) or not re.fullmatch(r"RESP-\d{3,}", response_id):
            errors.append(f"{label}.responseId must be RESP-*")
            continue
        if response_id in assessments_by_id:
            errors.append(f"duplicate assessment response: {response_id}")
        assessments_by_id[response_id] = assessment
        if mode not in ASSESSMENT_MODES:
            errors.append(f"{label}.mode is invalid")
        if mode == "human":
            if authority != "teacher":
                errors.append(f"{label}: human assessment authority must be teacher")
            if assessment.get("evaluatorRef") is not None or assessment.get("toleranceCaseRefs") != []:
                errors.append(f"{label}: human assessment cannot declare an automatic evaluator/tolerance")
        elif mode in {"finite-auto", "normalized-auto"}:
            if authority != "system":
                errors.append(f"{label}: automatic assessment authority must be system")
            if not isinstance(assessment.get("evaluatorRef"), str) or not assessment["evaluatorRef"].strip():
                errors.append(f"{label}.evaluatorRef is required for automatic assessment")
            tolerance_refs = assessment.get("toleranceCaseRefs")
            if not isinstance(tolerance_refs, list) or not tolerance_refs or any(
                not isinstance(item, str) or not re.fullmatch(r"TOL-\d{3,}", item)
                for item in tolerance_refs
            ):
                errors.append(f"{label}.toleranceCaseRefs must contain TOL-* IDs")

    gate_requirements = value.get("gateRequirements")
    if not isinstance(gate_requirements, dict):
        errors.append("gateRequirements must be an object")
        gate_requirements = {}
    unknown_gates = sorted(set(gate_requirements) - set(GATES))
    if unknown_gates:
        errors.append("gateRequirements contains unknown gates: " + ", ".join(unknown_gates))

    tests = value.get("tests")
    if not isinstance(tests, list):
        errors.append("tests must be an array")
        tests = []
    tests_by_id: dict[str, dict[str, Any]] = {}
    assessment_variants: dict[str, set[str]] = {}
    for index, test in enumerate(tests):
        prefix = f"tests[{index}]"
        if not isinstance(test, dict):
            errors.append(f"{prefix} must be an object")
            continue
        test_id = test.get("id")
        gate = test.get("gate")
        if not isinstance(test_id, str) or not re.fullmatch(r"BEH-\d{3,}", test_id):
            errors.append(f"{prefix}.id must be BEH-*")
            continue
        if test_id in tests_by_id:
            errors.append(f"duplicate behavior test id: {test_id}")
        tests_by_id[test_id] = test
        unknown_test_keys = sorted(set(test) - {
            "id", "gate", "contractRefs", "sceneId", "variant", "toleranceCaseId",
            "input", "expectedResult", "actionKind", "actor", "scriptSceneRef", "stateRef", "projectStateId", "escapeAction",
            "confirmBeforeContinue", "independentOfCorrectness", "timeoutMs",
            "steps", "preAssertions", "assertions", "witnessedEvents",
        })
        if unknown_test_keys:
            errors.append(f"{test_id}: unknown fields are forbidden: {', '.join(unknown_test_keys)}")
        timeout = test.get("timeoutMs", 10_000)
        if not isinstance(timeout, int) or isinstance(timeout, bool) or not 100 <= timeout <= 60_000:
            errors.append(f"{test_id}: timeoutMs must be an integer from 100 to 60000")
        if gate not in BROWSER_GATES:
            errors.append(f"{test_id}: gate must be one of the five observable browser gates")
        refs = test.get("contractRefs")
        if not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or not ID_RE.fullmatch(ref) for ref in refs):
            errors.append(f"{test_id}: contractRefs must contain stable contract IDs")
            refs = []
        required_ref_prefix = {
            "teacherEscape": "ESC-",
            "requiredActions": "ACT-",
            "assessmentTolerance": "RESP-",
            "authoringOutcome": "AUTH-",
        }.get(str(gate))
        if required_ref_prefix and not any(ref.startswith(required_ref_prefix) for ref in refs):
            errors.append(f"{test_id}: {gate} must reference {required_ref_prefix}*")
        steps = test.get("steps")
        if not isinstance(steps, list) or not steps:
            errors.append(f"{test_id}: steps must be a non-empty array")
            steps = []
        seen_step_ids: set[str] = set()
        for step_index, step in enumerate(steps):
            label = f"{test_id}.steps[{step_index}]"
            if not isinstance(step, dict):
                errors.append(f"{label} must be an object")
                continue
            step_id = step.get("id")
            action = step.get("action")
            if not isinstance(step_id, str) or not re.fullmatch(r"STEP-\d{3,}", step_id):
                errors.append(f"{label}.id must be STEP-*")
            elif step_id in seen_step_ids:
                errors.append(f"{test_id}: duplicate step id {step_id}")
            else:
                seen_step_ids.add(step_id)
            if action not in ACTIONS:
                errors.append(f"{label}.action is invalid")
            allowed_step_keys = {"id", "action", "selector", "timeoutMs"}
            if action in {"fill", "select-option"}:
                allowed_step_keys.add("value")
            if action == "press":
                allowed_step_keys.add("key")
            if action == "drag":
                allowed_step_keys.add("targetSelector")
            unknown_step_keys = sorted(set(step) - allowed_step_keys)
            if unknown_step_keys:
                errors.append(f"{label}: unknown fields are forbidden: {', '.join(unknown_step_keys)}")
            if action != "reload" and (not isinstance(step.get("selector"), str) or not step["selector"].strip()):
                errors.append(f"{label}.selector is required")
            if any(key in step for key in ("x", "y", "position", "coordinates")):
                errors.append(f"{label}: coordinate input is forbidden")
            step_timeout = step.get("timeoutMs", timeout)
            if not isinstance(step_timeout, int) or isinstance(step_timeout, bool) or not 100 <= step_timeout <= 60_000:
                errors.append(f"{label}.timeoutMs must be an integer from 100 to 60000")
            if action in {"fill", "select-option"} and not isinstance(step.get("value"), str):
                errors.append(f"{label}.value is required")
            if action == "press" and (not isinstance(step.get("key"), str) or not step["key"].strip()):
                errors.append(f"{label}.key is required")
            if action == "drag" and (not isinstance(step.get("targetSelector"), str) or not step["targetSelector"].strip()):
                errors.append(f"{label}.targetSelector is required")
        pre_assertions = test.get("preAssertions", [])
        if not isinstance(pre_assertions, list):
            errors.append(f"{test_id}.preAssertions must be an array")
            pre_assertions = []
        assertions = test.get("assertions")
        if not isinstance(assertions, list) or not assertions:
            errors.append(f"{test_id}: assertions must be a non-empty array")
            assertions = []
        seen_assertion_ids: set[str] = set()
        for assertion_phase, phase_assertions in (
            ("preAssertions", pre_assertions), ("assertions", assertions),
        ):
          for assertion_index, assertion in enumerate(phase_assertions):
            label = f"{test_id}.{assertion_phase}[{assertion_index}]"
            if not isinstance(assertion, dict):
                errors.append(f"{label} must be an object")
                continue
            assertion_id = assertion.get("id")
            assertion_type = assertion.get("type")
            unknown_assertion_keys = sorted(set(assertion) - {
                "id", "type", "selector", "expected", "name", "match", "timeoutMs", "contentRef",
            })
            if unknown_assertion_keys:
                errors.append(f"{label}: unknown fields are forbidden: {', '.join(unknown_assertion_keys)}")
            if not isinstance(assertion_id, str) or not re.fullmatch(r"AST-\d{3,}", assertion_id):
                errors.append(f"{label}.id must be AST-*")
            elif assertion_id in seen_assertion_ids:
                errors.append(f"{test_id}: duplicate assertion id {assertion_id}")
            else:
                seen_assertion_ids.add(assertion_id)
            if assertion_type not in ASSERTIONS:
                errors.append(f"{label}.type is invalid")
            if assertion_type != "url" and (not isinstance(assertion.get("selector"), str) or not assertion["selector"].strip()):
                errors.append(f"{label}.selector is required")
            if assertion_type in {"text", "value", "attribute", "count", "url"} and "expected" not in assertion:
                errors.append(f"{label}.expected is required")
            if assertion_type == "attribute" and (not isinstance(assertion.get("name"), str) or not assertion["name"].strip()):
                errors.append(f"{label}.name is required")
            if assertion_type == "count" and (not isinstance(assertion.get("expected"), int) or isinstance(assertion.get("expected"), bool) or assertion["expected"] < 0):
                errors.append(f"{label}.expected must be a non-negative integer")
            if assertion_type == "text" and assertion.get("match", "exact") not in {"exact", "contains"}:
                errors.append(f"{label}.match must be exact or contains")
            assertion_timeout = assertion.get("timeoutMs", timeout)
            if not isinstance(assertion_timeout, int) or isinstance(assertion_timeout, bool) or not 100 <= assertion_timeout <= 60_000:
                errors.append(f"{label}.timeoutMs must be an integer from 100 to 60000")
        witnessed = test.get("witnessedEvents", [])
        if not isinstance(witnessed, list):
            errors.append(f"{test_id}.witnessedEvents must be an array")
            witnessed = []
        for event_index, event in enumerate(witnessed):
            label = f"{test_id}.witnessedEvents[{event_index}]"
            if isinstance(event, dict):
                unknown_event_keys = sorted(set(event) - {"name", "match", "afterStepId"})
                if unknown_event_keys:
                    errors.append(f"{label}: unknown fields are forbidden: {', '.join(unknown_event_keys)}")
            if not isinstance(event, dict) or not isinstance(event.get("name"), str) or not EVENT_RE.fullmatch(event["name"]):
                errors.append(f"{label}.name is invalid")
            elif event["name"].startswith("__"):
                errors.append(f"{label}: private event names are forbidden")
            if isinstance(event, dict) and "match" in event and not isinstance(event.get("match"), dict):
                errors.append(f"{label}.match must be an object")
            if isinstance(event, dict):
                after_step_id = event.get("afterStepId")
                if not isinstance(after_step_id, str) or after_step_id not in seen_step_ids:
                    errors.append(f"{label}.afterStepId must reference an executed test step")
        if gate == "assessmentTolerance":
            variant = test.get("variant")
            if not witnessed:
                errors.append(f"{test_id}: assessmentTolerance test needs a witnessed public result event")
            for response_id in (ref for ref in refs if ref.startswith("RESP-")):
                assessment = assessments_by_id.get(response_id)
                if assessment is None:
                    errors.append(f"{test_id}: {response_id} is absent from assessments")
                    continue
                allowed_variants = (
                    HUMAN_ASSESSMENT_VARIANTS
                    if assessment.get("mode") == "human"
                    else AUTO_ASSESSMENT_VARIANTS
                )
                if variant not in allowed_variants:
                    errors.append(
                        f"{test_id}: variant {variant!r} is invalid for {assessment.get('mode')} assessment"
                    )
                assessment_variants.setdefault(response_id, set()).add(str(variant))

    for gate in GATES:
        required = gate_requirements.get(gate)
        if not isinstance(required, list) or any(not isinstance(item, str) for item in required):
            errors.append(f"gateRequirements.{gate} must be an array of test IDs")
            continue
        if gate in BROWSER_GATES and not required:
            errors.append(f"gateRequirements.{gate} must name at least one test")
        if gate == "responseCapacity" and required:
            errors.append("gateRequirements.responseCapacity must be empty; capacity is recomputed")
        for test_id in required:
            test = tests_by_id.get(test_id)
            if test is None:
                errors.append(f"gateRequirements.{gate} references missing test: {test_id}")
            elif test.get("gate") != gate:
                errors.append(f"gateRequirements.{gate} references a {test.get('gate')} test: {test_id}")
    assigned = [test_id for ids in gate_requirements.values() if isinstance(ids, list) for test_id in ids]
    unassigned = sorted(set(tests_by_id) - set(assigned))
    if unassigned:
        errors.append("tests are not assigned to a gate: " + ", ".join(unassigned))
    for response_id, assessment in assessments_by_id.items():
        variants = assessment_variants.get(response_id, set())
        required_variants = (
            HUMAN_ASSESSMENT_VARIANTS
            if assessment.get("mode") == "human"
            else AUTO_ASSESSMENT_VARIANTS
        )
        missing = sorted(required_variants - variants)
        if missing:
            errors.append(f"{response_id}: assessmentTolerance is missing variants: {', '.join(missing)}")
    capacity_response_ids = {
        item.get("responseId") for item in value.get("responseCapacity", {}).get("items", [])
        if isinstance(item, dict) and isinstance(item.get("responseId"), str)
    } if isinstance(value.get("responseCapacity"), dict) else set()
    if capacity_response_ids != set(assessments_by_id):
        errors.append("responseCapacity items must match assessments RESP IDs exactly")

    capacity = validate_capacity(value.get("responseCapacity"), errors)
    if contract is not None:
        validate_contract_alignment(value, contract, capability_index, errors)
    computed = {
        "specSha256": canonical_sha256(value),
        "capacity": capacity,
        "testIds": sorted(tests_by_id),
        "gateRequirements": {gate: list(gate_requirements.get(gate, [])) for gate in GATES},
    }
    return errors, warnings, computed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a Project V8 observable behavior spec")
    parser.add_argument("spec")
    parser.add_argument("--case-dir")
    parser.add_argument("--capability-index")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        value = json.loads(Path(args.spec).read_text(encoding="utf-8"))
        contract = load_contract_facts(Path(args.case_dir)) if args.case_dir else None
        capability_index = load_json(Path(args.capability_index)) if args.capability_index else None
        errors, warnings, computed = validate_spec(value, contract, capability_index)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        errors, warnings, computed = [str(exc)], [], {}
    report = {
        "validator": "project-v8-behavior-spec-v2",
        "status": "passed" if not errors else "failed",
        "computed": computed,
        "errors": errors,
        "warnings": warnings,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"status: {report['status']}")
        for error in errors:
            print(f"ERROR: {error}")
        for warning in warnings:
            print(f"WARNING: {warning}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
