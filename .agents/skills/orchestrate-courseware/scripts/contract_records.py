#!/usr/bin/env python3
"""Parse and validate the executable Markdown contracts used by a V2 courseware case.

The Markdown files remain the review-scoped source of truth.  This module only
turns fixed record headings and ``- field: value`` lines into deterministic
data so validators and downstream builders do not have to infer prose.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ID_PATTERN = re.compile(r"^(RESP|AUTH|ACT|ESC)-\d{3,}$")
TOLERANCE_ID_PATTERN = re.compile(r"^TOL-\d{3,}$")
REFERENCE_PATTERN = re.compile(r"^[A-Z][A-Z0-9]*-[A-Za-z0-9._-]+$")
FIELD_PATTERN = re.compile(r"^-\s*([A-Za-z][A-Za-z0-9-]*)\s*[：:]\s*(.*?)\s*$")
RECORD_HEADING_PATTERN = re.compile(
    r"^(?P<marks>#{3,6})\s+(?P<id>(?:RESP|AUTH|ACT|ESC)-\d{3,})\b(?P<title>[^\n]*)$",
    re.MULTILINE,
)

RESPONSE_MODES = {
    "digital-required",
    "digital-optional",
    "oral-check",
    "paper-work",
    "teacher-observed",
    "discussion-only",
}
RESPONSE_TYPES = {
    "choice",
    "normalized-short",
    "gesture",
    "open-text",
    "oral",
    "paper",
    "drag",
    "sort",
    "circle-text",
    "highlight",
    "parameter-change",
}
ASSESSMENT_AUTHORITIES = {"finite-auto", "normalized-auto", "human"}
NAVIGATION_GATES = {"hard", "soft", "none"}
AUTHORING_ACCESS = {"direct-canvas", "authoring-view", "structured-property", "developer-only"}
LAYOUT_ADJUSTMENTS = {"required", "optional", "none"}
STYLE_ADJUSTMENTS = {"required", "basic", "none"}
ACTORS = {"student", "teacher", "system"}
ACTION_KINDS = {
    "click",
    "select",
    "text-input",
    "formula-input",
    "drag",
    "sort",
    "circle-text",
    "highlight",
    "parameter-change",
    "oral",
    "paper",
    "teacher-command",
}
ESCAPE_ACTIONS = {"retry", "reveal", "continue-incomplete", "scene-picker", "previous", "replay"}
PRODUCT_REQUIREMENT_VALUES = {"required", "optional", "not-required"}
PRODUCT_CAPABILITIES = ("single-device", "teacher-display", "offline", "multi-user-aggregation")
CURRENTLY_UNSUPPORTED_CAPABILITIES = {"multi-user-aggregation"}
CAPABILITY_FALLBACKS = {
    "none",
    "single-device",
    "teacher-display",
    "offline",
    "multi-user-aggregation",
    "teacher-observed",
    "paper",
    "external-manual",
}

AUTOMATIC_AUTHORITY_RESPONSE_TYPES = {
    "finite-auto": {"choice"},
    "normalized-auto": {"normalized-short"},
}
DIGITAL_ACTION_KINDS = {
    "choice": {"click", "select"},
    "normalized-short": {"text-input", "formula-input"},
    "gesture": {"click", "drag"},
    "open-text": {"text-input"},
    "drag": {"drag"},
    "sort": {"sort"},
    "circle-text": {"circle-text"},
    "highlight": {"highlight"},
    "parameter-change": {"parameter-change"},
}
INTERNAL_TARGET_PATTERN = re.compile(
    r"(?:\b(?:window|document|page)\s*\.|\bevaluate\s*\(|\bsetPresentationState\b|"
    r"\bdispatchEvent\b|\bquerySelector\b|\bgetElementById\b|__\w+)",
    re.IGNORECASE,
)

RESPONSE_FIELDS = {
    "evidenceRef",
    "contentRef",
    "mode",
    "responseType",
    "requiredForProgress",
    "firstAttemptSeconds",
    "retrySeconds",
    "teacherDiscussionSeconds",
    "authority",
    "navigationGate",
    "teacherOverrideRef",
    "evaluatorCapabilityRef",
    "toleranceCaseRefs",
    "capacityOverrideDecisionRef",
}
AUTHORING_FIELDS = {
    "contentRef",
    "access",
    "layoutAdjustment",
    "styleAdjustment",
    "requiredForAcceptance",
}
ACTION_FIELDS = {
    "sceneRef",
    "actor",
    "kind",
    "target",
    "evidenceProduced",
    "requiredForCompletion",
    "initiallyHiddenContentRefs",
    "revealedContentRefs",
    "preActionVisible",
    "errorBehavior",
    "retryBehavior",
    "revealBehavior",
    "stableResult",
}
ESCAPE_FIELDS = {
    "sceneRef",
    "stateRefs",
    "actions",
    "confirmBeforeContinue",
    "independentOfCorrectness",
}
FIELDS_BY_PREFIX = {
    "RESP": RESPONSE_FIELDS,
    "AUTH": AUTHORING_FIELDS,
    "ACT": ACTION_FIELDS,
    "ESC": ESCAPE_FIELDS,
}

# Versioned policy values.  A valid answered DEC-* may explicitly authorize a
# lower value; otherwise both the validation error and conservative capacity
# calculation use these floors.
CAPACITY_POLICY_VERSION = 1
TYPE_MINIMUM_SECONDS = {
    "choice": (20, 10, 15),
    "normalized-short": (35, 20, 20),
    "gesture": (45, 20, 30),
    "drag": (45, 20, 30),
    "sort": (45, 20, 30),
    "circle-text": (45, 20, 30),
    "highlight": (45, 20, 30),
    "parameter-change": (45, 20, 30),
    "open-text": (90, 0, 45),
    "oral": (90, 0, 45),
    "paper": (90, 0, 45),
}
TOLERANCE_CATEGORIES = {
    "canonical-correct",
    "correct-variant-1",
    "correct-variant-2",
    "blank",
    "typical-near-miss",
    "substring-false-positive",
}


@dataclass(frozen=True)
class ContractRecord:
    record_id: str
    title: str
    fields: dict[str, str]
    source: str
    line: int

    @property
    def prefix(self) -> str:
        return self.record_id.split("-", 1)[0]


@dataclass(frozen=True)
class ParsedContracts:
    records: dict[str, ContractRecord]
    tolerance_cases: dict[str, dict[str, str]]
    product_profile: dict[str, str]
    capacity: dict[str, str]
    parse_errors: tuple[str, ...]

    def of_type(self, prefix: str) -> list[ContractRecord]:
        return [record for record in self.records.values() if record.prefix == prefix]


def _strip_code(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value.startswith("`") and value.endswith("`"):
        return value[1:-1].strip()
    return value


def _section_fields(text: str, heading: str) -> tuple[dict[str, str], list[str]]:
    match = re.search(
        rf"^##\s+{re.escape(heading)}\s*$([\s\S]*?)(?=^##\s|\Z)",
        text,
        re.MULTILINE,
    )
    if not match:
        return {}, [f"missing section: ## {heading}"]
    fields: dict[str, str] = {}
    errors: list[str] = []
    for line in match.group(1).splitlines():
        field = FIELD_PATTERN.match(line)
        if not field:
            continue
        key, value = field.group(1), _strip_code(field.group(2))
        if key in fields:
            errors.append(f"## {heading} has duplicate field: {key}")
        else:
            fields[key] = value
    return fields, errors


def _record_blocks(text: str, source: str) -> tuple[list[ContractRecord], list[str]]:
    matches = list(RECORD_HEADING_PATTERN.finditer(text))
    records: list[ContractRecord] = []
    errors: list[str] = []
    for match in matches:
        level = len(match.group("marks"))
        next_peer = re.search(rf"^#{{1,{level}}}\s+", text[match.end():], re.MULTILINE)
        end = match.end() + next_peer.start() if next_peer else len(text)
        body = text[match.end():end]
        record_id = match.group("id")
        title = match.group("title").strip()
        fields: dict[str, str] = {}
        for line in body.splitlines():
            field = FIELD_PATTERN.match(line)
            if not field:
                continue
            key, value = field.group(1), _strip_code(field.group(2))
            if key in fields:
                errors.append(f"{record_id} has duplicate field: {key}")
            else:
                fields[key] = value
        line_number = text.count("\n", 0, match.start()) + 1
        records.append(ContractRecord(record_id, title, fields, source, line_number))
    return records, errors


def _split_markdown_row(line: str) -> list[str]:
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|") and not body.endswith(r"\|"):
        body = body[:-1]
    return [cell.strip().replace(r"\|", "|") for cell in re.split(r"(?<!\\)\|", body)]


def _tolerance_matrix(contract_text: str) -> tuple[dict[str, dict[str, str]], list[str]]:
    match = re.search(
        r"^##\s+自动判定容差矩阵\s*$([\s\S]*?)(?=^##\s|\Z)",
        contract_text,
        re.MULTILINE,
    )
    if not match:
        return {}, ["missing section: ## 自动判定容差矩阵"]
    rows = [line for line in match.group(1).splitlines() if line.strip().startswith("|")]
    expected_header = ["toleranceCaseId", "responseRef", "category", "input", "expected"]
    if len(rows) < 2 or _split_markdown_row(rows[0]) != expected_header:
        return {}, ["automatic tolerance matrix must use columns: " + ", ".join(expected_header)]
    cases: dict[str, dict[str, str]] = {}
    errors: list[str] = []
    for line in rows[2:]:
        cells = _split_markdown_row(line)
        if len(cells) != len(expected_header):
            errors.append("automatic tolerance matrix row must contain exactly five cells")
            continue
        value = dict(zip(expected_header, cells))
        case_id = value["toleranceCaseId"].strip("`")
        value["toleranceCaseId"] = case_id
        value["responseRef"] = value["responseRef"].strip("`")
        value["input"] = _strip_code(value["input"])
        value["expected"] = value["expected"].strip("`")
        if not TOLERANCE_ID_PATTERN.fullmatch(case_id):
            errors.append(f"invalid tolerance case ID: {case_id!r}")
            continue
        if case_id in cases:
            errors.append(f"duplicate tolerance case ID: {case_id}")
            continue
        cases[case_id] = value
    return cases, errors


def parse_contract_records(contract_text: str, script_text: str) -> ParsedContracts:
    errors: list[str] = []
    contract_records, contract_errors = _record_blocks(contract_text, "01-courseware-contract.md")
    script_records, script_errors = _record_blocks(script_text, "02-presentation-script.md")
    errors.extend(contract_errors)
    errors.extend(script_errors)
    records: dict[str, ContractRecord] = {}
    for record in (*contract_records, *script_records):
        if not ID_PATTERN.fullmatch(record.record_id):
            errors.append(f"invalid executable contract ID: {record.record_id}")
            continue
        if record.record_id in records:
            errors.append(f"duplicate executable contract ID: {record.record_id}")
            continue
        records[record.record_id] = record
        expected_source = (
            "01-courseware-contract.md" if record.prefix in {"RESP", "AUTH"}
            else "02-presentation-script.md"
        )
        if record.source != expected_source:
            errors.append(f"{record.record_id} must be defined in {expected_source}")
        expected_fields = FIELDS_BY_PREFIX[record.prefix]
        missing = expected_fields - set(record.fields)
        unknown = set(record.fields) - expected_fields
        if missing:
            errors.append(f"{record.record_id} is missing fields: {', '.join(sorted(missing))}")
        if unknown:
            errors.append(f"{record.record_id} has unknown fields: {', '.join(sorted(unknown))}")
    product_profile, product_errors = _section_fields(contract_text, "产品能力剖面")
    capacity, capacity_errors = _section_fields(contract_text, "响应容量汇总")
    tolerance_cases, tolerance_errors = _tolerance_matrix(contract_text)
    errors.extend(product_errors)
    errors.extend(capacity_errors)
    errors.extend(tolerance_errors)
    return ParsedContracts(records, tolerance_cases, product_profile, capacity, tuple(errors))


def _csv(value: str) -> list[str]:
    if value.strip().lower() in {"", "none", "无"}:
        return []
    return [item.strip().strip("`") for item in re.split(r"[,，]", value) if item.strip()]


def _boolean(record: ContractRecord, key: str, errors: list[str]) -> bool | None:
    value = record.fields.get(key)
    if value == "true":
        return True
    if value == "false":
        return False
    errors.append(f"{record.record_id}.{key} must be true or false")
    return None


def _nonnegative_int(record: ContractRecord, key: str, errors: list[str]) -> int | None:
    value = record.fields.get(key, "")
    if not re.fullmatch(r"\d+", value):
        errors.append(f"{record.record_id}.{key} must be a non-negative integer")
        return None
    return int(value)


def _base_content_ref(value: str) -> str:
    return re.split(r"[#.]", value, maxsplit=1)[0]


def _is_none(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"", "none", "无"}


def _known_answered_decisions(
    decisions: Iterable[dict[str, Any]],
) -> tuple[set[str], set[str], dict[str, set[str]]]:
    known: set[str] = set()
    answered: set[str] = set()
    scopes: dict[str, set[str]] = {}
    for decision in decisions:
        decision_id = decision.get("id")
        if isinstance(decision_id, str):
            known.add(decision_id)
            raw_scopes = decision.get("scopeRefs", [])
            scopes[decision_id] = (
                {value for value in raw_scopes if isinstance(value, str)}
                if isinstance(raw_scopes, list)
                else set()
            )
            if decision.get("response"):
                answered.add(decision_id)
    return known, answered, scopes


def validate_executable_contracts(
    parsed: ParsedContracts,
    *,
    objective_ids: set[str],
    evidence_ids: set[str],
    content_ids: set[str],
    scene_ids: set[str],
    scene_content_map: dict[str, set[str]],
    state_ids: set[str],
    state_scene_map: dict[str, str],
    decisions: Iterable[dict[str, Any]],
    duration_minutes: int | None,
    evaluator_registry: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[str], list[str], dict[str, Any]]:
    """Validate cross-record semantics and return errors, warnings, summary."""

    del objective_ids  # Reserved for an explicitly versioned objective mapping extension.
    errors = list(parsed.parse_errors)
    warnings: list[str] = []
    known_decisions, answered_decisions, decision_scopes = _known_answered_decisions(decisions)
    evaluator_registry = evaluator_registry or {}
    responses = parsed.of_type("RESP")
    authoring = parsed.of_type("AUTH")
    actions = parsed.of_type("ACT")
    escapes = parsed.of_type("ESC")

    for prefix, values in (("RESP", responses), ("AUTH", authoring), ("ACT", actions), ("ESC", escapes)):
        if not values:
            errors.append(f"no {prefix}-* executable contract records found")

    expected_profile_fields = set(PRODUCT_CAPABILITIES)
    for capability in PRODUCT_CAPABILITIES:
        expected_profile_fields.update({f"{capability}Fallback", f"{capability}DecisionRef"})
    missing_profile = expected_profile_fields - set(parsed.product_profile)
    unknown_profile = set(parsed.product_profile) - expected_profile_fields
    if missing_profile:
        errors.append("product profile is missing fields: " + ", ".join(sorted(missing_profile)))
    if unknown_profile:
        errors.append("product profile has unknown fields: " + ", ".join(sorted(unknown_profile)))
    for capability in PRODUCT_CAPABILITIES:
        requirement = parsed.product_profile.get(capability)
        fallback = parsed.product_profile.get(f"{capability}Fallback")
        decision_ref = parsed.product_profile.get(f"{capability}DecisionRef")
        if requirement not in PRODUCT_REQUIREMENT_VALUES:
            errors.append(
                f"product profile {capability} must be required, optional, or not-required"
            )
        if fallback not in CAPABILITY_FALLBACKS:
            errors.append(
                f"product profile {capability}Fallback must use a closed fallback mode"
            )
        elif fallback == capability:
            errors.append(
                f"product profile {capability}Fallback cannot claim the unsupported capability itself"
            )
        if not _is_none(decision_ref):
            if decision_ref not in known_decisions:
                errors.append(f"product profile {capability} references unknown decision: {decision_ref}")
            elif decision_ref not in answered_decisions:
                errors.append(f"product profile {capability} decision is unresolved: {decision_ref}")
            elif f"capability:{capability}" not in decision_scopes.get(decision_ref, set()):
                errors.append(
                    f"product profile {capability} decision {decision_ref} is not scoped to "
                    f"capability:{capability}"
                )
        if capability in CURRENTLY_UNSUPPORTED_CAPABILITIES and requirement == "required":
            if _is_none(fallback) and _is_none(decision_ref):
                errors.append(
                    f"unsupported required capability {capability} needs a fallback or answered DEC-*"
                )

    if parsed.capacity.get("capacityPolicyVersion") != str(CAPACITY_POLICY_VERSION):
        errors.append(f"capacityPolicyVersion must be {CAPACITY_POLICY_VERSION}")
    capacity_fields = {"capacityPolicyVersion", "readingObservationSeconds", "sceneTransitionSeconds"}
    missing_capacity = capacity_fields - set(parsed.capacity)
    unknown_capacity = set(parsed.capacity) - capacity_fields
    if missing_capacity:
        errors.append("response capacity summary is missing fields: " + ", ".join(sorted(missing_capacity)))
    if unknown_capacity:
        errors.append("response capacity summary has unknown fields: " + ", ".join(sorted(unknown_capacity)))
    non_response_seconds = 0
    for key in ("readingObservationSeconds", "sceneTransitionSeconds"):
        value = parsed.capacity.get(key, "")
        if not re.fullmatch(r"\d+", value):
            errors.append(f"response capacity {key} must be a non-negative integer")
        else:
            non_response_seconds += int(value)

    response_ids = {record.record_id for record in responses}
    escape_ids = {record.record_id for record in escapes}
    action_ids = {record.record_id for record in actions}
    authoring_ids = {record.record_id for record in authoring}
    del action_ids, authoring_ids
    tolerance_ids = set(parsed.tolerance_cases)
    for decision_id, scopes in decision_scopes.items():
        for scope_ref in scopes:
            if scope_ref.endswith("#capacity"):
                response_ref = scope_ref.removesuffix("#capacity")
                if response_ref not in response_ids:
                    errors.append(f"{decision_id} scopeRefs references unknown response: {response_ref}")
            elif scope_ref.startswith("capability:"):
                capability_ref = scope_ref.split(":", 1)[1]
                if capability_ref not in PRODUCT_CAPABILITIES:
                    errors.append(f"{decision_id} scopeRefs references unknown capability: {capability_ref}")
    tolerance_inputs_by_response: dict[str, dict[str, str]] = {}
    for case_id, tolerance_case in parsed.tolerance_cases.items():
        response_ref = tolerance_case.get("responseRef", "")
        category = tolerance_case.get("category", "")
        expected = tolerance_case.get("expected", "")
        if response_ref not in response_ids:
            errors.append(f"{case_id} references unknown response: {response_ref}")
        if category not in TOLERANCE_CATEGORIES:
            errors.append(f"{case_id} has invalid tolerance category: {category}")
        required_expected = "pass" if category.startswith("correct-") or category == "canonical-correct" else "fail"
        if expected not in {"pass", "fail"}:
            errors.append(f"{case_id}.expected must be pass or fail")
        elif category in TOLERANCE_CATEGORIES and expected != required_expected:
            errors.append(f"{case_id} category {category} must expect {required_expected}")
        exact_input = tolerance_case.get("input", "")
        if not exact_input:
            errors.append(f"{case_id}.input must freeze an exact test value")
        elif category == "blank" and exact_input != "EMPTY":
            errors.append(f"{case_id} blank input must use the exact EMPTY sentinel")
        elif category != "blank" and exact_input == "EMPTY":
            errors.append(f"{case_id} may use EMPTY only for the blank category")
        normalized_input = exact_input.strip()
        prior = tolerance_inputs_by_response.setdefault(response_ref, {})
        if normalized_input in prior:
            errors.append(
                f"{case_id}.input conflicts with {prior[normalized_input]}; "
                "all six tolerance inputs must be distinct"
            )
        else:
            prior[normalized_input] = case_id
    covered_evidence: set[str] = set()
    capacity_response_seconds = 0
    response_required: dict[str, bool] = {}
    digital_response_ids: set[str] = set()
    referenced_tolerance_ids: set[str] = set()
    for record in responses:
        fields = record.fields
        evidence_ref = fields.get("evidenceRef", "")
        raw_content_ref = fields.get("contentRef", "")
        content_ref = _base_content_ref(raw_content_ref)
        if evidence_ref not in evidence_ids:
            errors.append(f"{record.record_id} references unknown evidence: {evidence_ref}")
        else:
            covered_evidence.add(evidence_ref)
        if content_ref not in content_ids:
            errors.append(f"{record.record_id} references unknown content: {fields.get('contentRef', '')}")
        elif raw_content_ref != content_ref:
            errors.append(
                f"{record.record_id}.contentRef must name an exact defined CNT-*; "
                "unstructured fragments are forbidden"
            )
        mode = fields.get("mode")
        response_type = fields.get("responseType")
        authority = fields.get("authority")
        gate = fields.get("navigationGate")
        if mode not in RESPONSE_MODES:
            errors.append(f"{record.record_id}.mode has invalid value: {mode}")
        if response_type not in RESPONSE_TYPES:
            errors.append(f"{record.record_id}.responseType has invalid value: {response_type}")
        if authority not in ASSESSMENT_AUTHORITIES:
            errors.append(f"{record.record_id}.authority has invalid value: {authority}")
        if gate not in NAVIGATION_GATES:
            errors.append(f"{record.record_id}.navigationGate has invalid value: {gate}")
        required = _boolean(record, "requiredForProgress", errors)
        response_required[record.record_id] = required is True
        if mode in {"digital-required", "digital-optional"}:
            digital_response_ids.add(record.record_id)
        if authority == "human":
            if gate == "hard":
                errors.append(f"{record.record_id} uses human authority and cannot be a hard navigation gate")
            if not _is_none(fields.get("evaluatorCapabilityRef")):
                errors.append(f"{record.record_id} uses human authority and evaluatorCapabilityRef must be none")
            if not _is_none(fields.get("toleranceCaseRefs")):
                errors.append(f"{record.record_id} uses human authority and toleranceCaseRefs must be none")
        elif authority in {"finite-auto", "normalized-auto"}:
            evaluator_ref = fields.get("evaluatorCapabilityRef")
            if mode not in {"digital-required", "digital-optional"}:
                errors.append(
                    f"{record.record_id} automatic authority requires a digital response mode"
                )
            if _is_none(evaluator_ref) or not REFERENCE_PATTERN.fullmatch(str(evaluator_ref)):
                errors.append(f"{record.record_id} automatic authority needs a stable evaluatorCapabilityRef")
            else:
                allowed_types = AUTOMATIC_AUTHORITY_RESPONSE_TYPES.get(str(authority), set())
                if response_type not in allowed_types:
                    errors.append(
                        f"{record.record_id} authority {authority} is incompatible with "
                        f"responseType {response_type}"
                    )
                evaluator = evaluator_registry.get(str(evaluator_ref))
                if not evaluator:
                    errors.append(
                        f"{record.record_id} references unpublished evaluator capability: {evaluator_ref}"
                    )
                else:
                    authorities = evaluator.get("authorities", [])
                    response_types = evaluator.get("responseTypes", [])
                    if authority not in authorities or response_type not in response_types:
                        errors.append(
                            f"{record.record_id} evaluator {evaluator_ref} is incompatible with "
                            f"{authority}/{response_type}"
                        )
            raw_tolerance_refs = _csv(fields.get("toleranceCaseRefs", ""))
            tolerance_refs = set(raw_tolerance_refs)
            if len(raw_tolerance_refs) != len(tolerance_refs):
                errors.append(f"{record.record_id}.toleranceCaseRefs contains duplicate IDs")
            referenced_tolerance_ids.update(tolerance_refs)
            unknown_tolerance_refs = tolerance_refs - tolerance_ids
            if unknown_tolerance_refs:
                errors.append(
                    f"{record.record_id} references unknown tolerance cases: "
                    + ", ".join(sorted(unknown_tolerance_refs))
                )
            referenced_cases = [
                parsed.tolerance_cases[case_id]
                for case_id in tolerance_refs
                if case_id in parsed.tolerance_cases
                and parsed.tolerance_cases[case_id].get("responseRef") == record.record_id
            ]
            referenced_categories = {case.get("category", "") for case in referenced_cases}
            missing_tolerance = TOLERANCE_CATEGORIES - referenced_categories
            if missing_tolerance:
                errors.append(
                    f"{record.record_id} toleranceCaseRefs is missing cases for categories: "
                    + ", ".join(sorted(missing_tolerance))
                )
            duplicate_categories = sorted(
                category for category in TOLERANCE_CATEGORIES
                if sum(case.get("category") == category for case in referenced_cases) > 1
            )
            if duplicate_categories or len(referenced_cases) != len(TOLERANCE_CATEGORIES):
                errors.append(
                    f"{record.record_id} must reference exactly one tolerance case per category"
                )
        teacher_override = fields.get("teacherOverrideRef", "")
        if gate == "hard":
            if teacher_override not in escape_ids:
                errors.append(f"{record.record_id} hard gate needs a valid teacherOverrideRef")
        elif not _is_none(teacher_override) and teacher_override not in escape_ids:
            errors.append(f"{record.record_id} references unknown teacher override: {teacher_override}")

        timings = [
            _nonnegative_int(record, "firstAttemptSeconds", errors),
            _nonnegative_int(record, "retrySeconds", errors),
            _nonnegative_int(record, "teacherDiscussionSeconds", errors),
        ]
        if response_type in TYPE_MINIMUM_SECONDS and all(value is not None for value in timings):
            minimums = TYPE_MINIMUM_SECONDS[response_type]
            override_ref = fields.get("capacityOverrideDecisionRef", "")
            has_shortfall = any(value < floor for value, floor in zip(timings, minimums))
            valid_override = (
                override_ref in answered_decisions
                and f"{record.record_id}#capacity" in decision_scopes.get(override_ref, set())
            )
            if not _is_none(override_ref) and override_ref not in known_decisions:
                errors.append(f"{record.record_id} references unknown capacity override decision: {override_ref}")
            elif not _is_none(override_ref) and override_ref not in answered_decisions:
                errors.append(f"{record.record_id} capacity override decision is unresolved: {override_ref}")
            elif (
                not _is_none(override_ref)
                and override_ref in answered_decisions
                and not valid_override
            ):
                errors.append(
                    f"{record.record_id} capacity override decision {override_ref} is not scoped to "
                    f"{record.record_id}#capacity"
                )
            if has_shortfall and not valid_override:
                errors.append(
                    f"{record.record_id} declares time below {response_type} policy minimum without an answered DEC-* override"
                )
            effective = timings if valid_override else [max(value, floor) for value, floor in zip(timings, minimums)]
            capacity_response_seconds += sum(effective)

    orphan_tolerance_cases = tolerance_ids - referenced_tolerance_ids
    if orphan_tolerance_cases:
        errors.append(
            "tolerance cases are not referenced by an automatic RESP-*: "
            + ", ".join(sorted(orphan_tolerance_cases))
        )

    missing_evidence = evidence_ids - covered_evidence
    if missing_evidence:
        errors.append("learning evidence lacks RESP-* coverage: " + ", ".join(sorted(missing_evidence)))

    authored_content = set()
    for record in authoring:
        fields = record.fields
        raw_content_ref = fields.get("contentRef", "")
        content_ref = _base_content_ref(raw_content_ref)
        if content_ref not in content_ids:
            errors.append(f"{record.record_id} references unknown content: {fields.get('contentRef', '')}")
        else:
            authored_content.add(content_ref)
        if raw_content_ref != content_ref:
            errors.append(
                f"{record.record_id}.contentRef must name an exact defined CNT-*; "
                "unstructured fragments are forbidden"
            )
        if fields.get("access") not in AUTHORING_ACCESS:
            errors.append(f"{record.record_id}.access has invalid value: {fields.get('access')}")
        if fields.get("layoutAdjustment") not in LAYOUT_ADJUSTMENTS:
            errors.append(
                f"{record.record_id}.layoutAdjustment has invalid value: {fields.get('layoutAdjustment')}"
            )
        if fields.get("styleAdjustment") not in STYLE_ADJUSTMENTS:
            errors.append(
                f"{record.record_id}.styleAdjustment has invalid value: {fields.get('styleAdjustment')}"
            )
        _boolean(record, "requiredForAcceptance", errors)
    missing_authoring = content_ids - authored_content
    if missing_authoring:
        errors.append("exact content lacks AUTH-* coverage: " + ", ".join(sorted(missing_authoring)))

    produced_responses: set[str] = set()
    required_produced_responses: set[str] = set()
    scene_action_coverage: set[str] = set()
    response_action_scenes: dict[str, set[str]] = {}
    for record in actions:
        fields = record.fields
        scene_ref = fields.get("sceneRef", "")
        if scene_ref not in scene_ids:
            errors.append(f"{record.record_id} references unknown scene: {scene_ref}")
        else:
            scene_action_coverage.add(scene_ref)
        if fields.get("actor") not in ACTORS:
            errors.append(f"{record.record_id}.actor has invalid value: {fields.get('actor')}")
        if fields.get("kind") not in ACTION_KINDS:
            errors.append(f"{record.record_id}.kind has invalid value: {fields.get('kind')}")
        target = fields.get("target", "")
        if _is_none(target):
            errors.append(f"{record.record_id}.target must identify a visible or physical action target")
        elif INTERNAL_TARGET_PATTERN.search(target):
            errors.append(
                f"{record.record_id}.target exposes an internal API instead of a visible or physical target"
            )
        evidence_produced = fields.get("evidenceProduced", "")
        if not _is_none(evidence_produced):
            if evidence_produced not in response_ids:
                errors.append(f"{record.record_id} references unknown response: {evidence_produced}")
            else:
                produced_responses.add(evidence_produced)
                response_action_scenes.setdefault(evidence_produced, set()).add(scene_ref)
                response_record = parsed.records[evidence_produced]
                if response_record.fields.get("mode") in {"digital-required", "digital-optional"}:
                    if fields.get("actor") != "student":
                        errors.append(
                            f"{record.record_id} produces digital response {evidence_produced} "
                            "and actor must be student"
                        )
                    compatible_kinds = DIGITAL_ACTION_KINDS.get(
                        response_record.fields.get("responseType", ""), set()
                    )
                    if fields.get("kind") not in compatible_kinds:
                        errors.append(
                            f"{record.record_id}.kind {fields.get('kind')} is incompatible with "
                            f"digital responseType {response_record.fields.get('responseType')}"
                        )
        required = _boolean(record, "requiredForCompletion", errors)
        if required and evidence_produced in response_ids:
            required_produced_responses.add(evidence_produced)

        raw_initially_hidden = _csv(fields.get("initiallyHiddenContentRefs", ""))
        raw_revealed = _csv(fields.get("revealedContentRefs", ""))
        initially_hidden = set(raw_initially_hidden)
        revealed = set(raw_revealed)
        if len(raw_initially_hidden) != len(initially_hidden):
            errors.append(f"{record.record_id}.initiallyHiddenContentRefs contains duplicate IDs")
        if len(raw_revealed) != len(revealed):
            errors.append(f"{record.record_id}.revealedContentRefs contains duplicate IDs")
        for field_name, references in (
            ("initiallyHiddenContentRefs", initially_hidden),
            ("revealedContentRefs", revealed),
        ):
            unknown_content_refs = references - content_ids
            if unknown_content_refs:
                errors.append(
                    f"{record.record_id}.{field_name} references unknown content: "
                    + ", ".join(sorted(unknown_content_refs))
                )
            if scene_ref in scene_ids:
                foreign_content_refs = (
                    references & content_ids
                ) - scene_content_map.get(scene_ref, set())
                if foreign_content_refs:
                    errors.append(
                        f"{record.record_id}.{field_name} references content not declared by "
                        f"{scene_ref}: " + ", ".join(sorted(foreign_content_refs))
                    )
        if initially_hidden or revealed:
            if not revealed:
                errors.append(
                    f"{record.record_id}.revealedContentRefs must be non-empty when an "
                    "initially-hidden/reveal policy is declared"
                )
            missing_from_initial = revealed - initially_hidden
            if missing_from_initial:
                errors.append(
                    f"{record.record_id}.revealedContentRefs must be a subset of "
                    f"initiallyHiddenContentRefs: {', '.join(sorted(missing_from_initial))}"
                )
            if fields.get("preActionVisible") != "false":
                errors.append(
                    f"{record.record_id}.preActionVisible must be false when content is "
                    "initially hidden or revealed"
                )
            if _is_none(fields.get("revealBehavior")):
                errors.append(
                    f"{record.record_id}.revealBehavior must freeze the visible reveal path "
                    "when content is initially hidden or revealed"
                )
        for key in ("preActionVisible", "stableResult"):
            if _is_none(fields.get(key)):
                errors.append(f"{record.record_id}.{key} must freeze the observable behavior")
    missing_scene_actions = scene_ids - scene_action_coverage
    if missing_scene_actions:
        errors.append("scenes lack ACT-* coverage: " + ", ".join(sorted(missing_scene_actions)))
    missing_digital_actions = digital_response_ids - produced_responses
    if missing_digital_actions:
        errors.append("digital responses lack real ACT-* producers: " + ", ".join(sorted(missing_digital_actions)))
    required_without_action = {
        response_id for response_id, required in response_required.items()
        if required and response_id not in required_produced_responses
    }
    if required_without_action:
        errors.append(
            "progress-required responses lack required ACT-* producers: "
            + ", ".join(sorted(required_without_action))
        )

    scene_escape_coverage: set[str] = set()
    for record in escapes:
        fields = record.fields
        scene_ref = fields.get("sceneRef", "")
        if scene_ref not in scene_ids:
            errors.append(f"{record.record_id} references unknown scene: {scene_ref}")
        else:
            scene_escape_coverage.add(scene_ref)
        state_refs = set(_csv(fields.get("stateRefs", "")))
        if not state_refs:
            errors.append(f"{record.record_id}.stateRefs must cover error, blank, or incomplete states")
        unknown_states = state_refs - state_ids
        if unknown_states:
            errors.append(f"{record.record_id} references unknown states: {', '.join(sorted(unknown_states))}")
        foreign_states = {
            state_ref for state_ref in state_refs
            if state_scene_map.get(state_ref) not in {None, scene_ref}
        }
        if foreign_states:
            errors.append(
                f"{record.record_id} references states from another scene: "
                + ", ".join(sorted(foreign_states))
            )
        escape_actions = set(_csv(fields.get("actions", "")))
        if not escape_actions:
            errors.append(f"{record.record_id}.actions must contain at least one teacher escape")
        unknown_escape_actions = escape_actions - ESCAPE_ACTIONS
        if unknown_escape_actions:
            errors.append(
                f"{record.record_id}.actions has invalid values: {', '.join(sorted(unknown_escape_actions))}"
            )
        confirm = _boolean(record, "confirmBeforeContinue", errors)
        independent = _boolean(record, "independentOfCorrectness", errors)
        if "continue-incomplete" in escape_actions and confirm is not True:
            errors.append(f"{record.record_id} continue-incomplete requires explicit confirmation")
        if independent is not True:
            errors.append(f"{record.record_id} must remain available independently of response correctness")

    escape_by_id = {record.record_id: record for record in escapes}
    for response in responses:
        if response.fields.get("navigationGate") != "hard":
            continue
        override_ref = response.fields.get("teacherOverrideRef", "")
        override = escape_by_id.get(override_ref)
        if override is None:
            continue
        actions_value = set(_csv(override.fields.get("actions", "")))
        if "continue-incomplete" not in actions_value:
            errors.append(
                f"{response.record_id} hard gate override {override_ref} must include continue-incomplete"
            )
        if override.fields.get("confirmBeforeContinue") != "true":
            errors.append(
                f"{response.record_id} hard gate override {override_ref} must confirm before continue"
            )
        if override.fields.get("independentOfCorrectness") != "true":
            errors.append(
                f"{response.record_id} hard gate override {override_ref} must be independent of correctness"
            )
        producer_scenes = response_action_scenes.get(response.record_id, set())
        if producer_scenes and producer_scenes != {override.fields.get("sceneRef")}:
            errors.append(
                f"{response.record_id} hard gate override {override_ref} must be in the same scene "
                "as its producing ACT-*"
            )
    missing_scene_escapes = scene_ids - scene_escape_coverage
    if missing_scene_escapes:
        errors.append("scenes lack ESC-* coverage: " + ", ".join(sorted(missing_scene_escapes)))

    total_capacity_seconds = non_response_seconds + capacity_response_seconds
    duration_seconds = duration_minutes * 60 if isinstance(duration_minutes, int) else None
    if duration_seconds is None:
        errors.append("durationMinutes must be an integer for response capacity validation")
    elif total_capacity_seconds > duration_seconds:
        errors.append(
            f"response capacity requires {total_capacity_seconds}s, exceeding lesson duration {duration_seconds}s"
        )
    if duration_minutes and len(responses) / duration_minutes > 1.5:
        warnings.append("response density exceeds 1.5 RESP records per lesson minute; review cognitive load")
    open_response_count = sum(
        record.fields.get("responseType") in {"open-text", "oral", "paper"} for record in responses
    )
    if open_response_count > 3:
        warnings.append("more than three open-expression responses are planned; review discussion capacity")

    summary = {
        "schemaVersion": 1,
        "recordIds": {
            prefix: sorted(record.record_id for record in parsed.of_type(prefix))
            for prefix in ("RESP", "AUTH", "ACT", "ESC")
        },
        "capacityPolicyVersion": CAPACITY_POLICY_VERSION,
        "toleranceCaseIds": sorted(parsed.tolerance_cases),
        "evaluatorCapabilityRefs": sorted({
            record.fields.get("evaluatorCapabilityRef", "")
            for record in responses
            if record.fields.get("authority") in {"finite-auto", "normalized-auto"}
        }),
        "nonResponseSeconds": non_response_seconds,
        "responseSeconds": capacity_response_seconds,
        "totalCapacitySeconds": total_capacity_seconds,
        "lessonDurationSeconds": duration_seconds,
    }
    return list(dict.fromkeys(errors)), list(dict.fromkeys(warnings)), summary


def _as_json(parsed: ParsedContracts) -> dict[str, Any]:
    return {
        "records": {
            record_id: {
                "title": record.title,
                "fields": record.fields,
                "source": record.source,
                "line": record.line,
            }
            for record_id, record in sorted(parsed.records.items())
        },
        "productProfile": parsed.product_profile,
        "capacity": parsed.capacity,
        "toleranceCases": parsed.tolerance_cases,
        "parseErrors": list(parsed.parse_errors),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse Courseware V2 executable Markdown records")
    parser.add_argument("contract")
    parser.add_argument("script")
    args = parser.parse_args()
    try:
        contract_text = Path(args.contract).read_text(encoding="utf-8")
        script_text = Path(args.script).read_text(encoding="utf-8")
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    parsed = parse_contract_records(contract_text, script_text)
    print(json.dumps(_as_json(parsed), ensure_ascii=False, indent=2))
    return 1 if parsed.parse_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
