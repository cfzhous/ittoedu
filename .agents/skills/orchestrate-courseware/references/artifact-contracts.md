# Courseware case artifact contracts

## Contents

1. Directory contract
2. Manifest and approval contract
3. ID conventions
4. Artifact requirements
5. Stage and invalidation rules

## 1. Directory contract

Use one directory per case:

```text
docs/courseware-cases/<case-id>/
├── case.json
├── decisions.json
├── 00-context.md
├── 01-teaching-design.md
├── 02-content-spec.md
├── 03-presentation-script.md
├── 04-visual-direction.md
├── 05-implementation-handoff.md
├── 06-traceability.json
└── 07-acceptance.md
```

Markdown is the human-reviewable content truth. JSON stores state, structured decisions, hashes, and implementation mapping; do not duplicate full teaching content into JSON.

## 2. Manifest and approval contract

`case.json` uses `schemaVersion: 1` and `authoringMode: "ppt-compatible"`. Each artifact entry contains:

- `path`: path relative to the case directory;
- `version`: artifact version such as `0.1` or `1.0`;
- `status`: `missing | draft | ready-for-review | approved | rejected | not-required`;
- `sha256`: hash of the exact reviewed bytes;
- `approvedBy`, `approvedAt`, and `approvalEvidence` for approved artifacts;
- `notRequiredReason` only when a stage is genuinely optional.

Only a human can authorize `approved`. The helper script may persist that authorization but cannot supply it. If an approved file hash changes, invalidate that approval and all dependent readiness.

Use these artifact keys:

```text
context
teachingDesign
contentSpec
presentationScript
visualDirection
implementationHandoff
traceability
acceptance
```

## 3. ID conventions

Use stable, unique, case-local IDs:

- `SRC-001`: source;
- `DEC-001`: decision;
- `OBJ-001`: learning objective;
- `EVD-001`: evidence of learning;
- `STG-001`: teaching stage;
- `CNT-001`: authoritative content item;
- `ERR-001`: misconception or error path;
- `FORM-001`: formula or notation item;
- `BEAT-001`: presentation beat;
- `VIS-001`: visual reference or frame;
- `ACC-001`: acceptance evidence.

Never use array positions as identity. Preserve IDs across revisions unless the concept itself is removed.

## 4. Artifact requirements

### `00-context.md`

Require original request, current mode, audience facts, source register with authority, constraints, missing information, conflicts, and assumptions. Record unavailable future capabilities as out of scope.

### `01-teaching-design.md`

Require audience and prerequisites, duration, objectives, evidence, core content, difficulties, strategy, sequence, assessment, constraints, source references, and an objective/evidence/stage coverage table.

### `02-content-spec.md`

For each `CNT-*`, require:

- complete learner-visible prompt and givens;
- expected response and complete reasoning;
- accepted alternatives and rejected boundaries;
- misconceptions and feedback principles;
- difficulty/cognitive-demand justification;
- prerequisite and source references;
- reveal policy and estimated minutes;
- formula, notation, unit, diagram, table, and media requirements.

Require a capacity table whose planned minutes reconcile with the lesson duration. Interaction count and page count are not instructional capacity.

### `03-presentation-script.md`

For each `BEAT-*`, require the fields in the template. `requiredVisibleBeforeAction` must be concrete enough for a cold-start implementer to construct the initial view. Branches must name condition, response, and recovery/next state.

### `04-visual-direction.md`

Require goals, avoidances, subject representation, hierarchy, typography, palette, composition plan, interaction causality, motion, key frames, assets/licenses, accessibility, and static export expectations.

### `05-implementation-handoff.md`

Require approved artifact paths, versions, hashes, decisions, authoritative content, assets, assumptions, editability, delivery formats, expected static differences, evidence, and change-control return points.

## 5. Stage and invalidation rules

Use this order:

```text
intake
→ context-ready
→ awaiting-decisions | decision-blocked
→ teaching-design-review
→ content-spec-review
→ presentation-script-review
→ visual-review
→ implementation-ready
```

Changing an artifact invalidates all dependent artifacts:

- context → every later artifact;
- teaching design → content spec and later;
- content spec → presentation script and later;
- presentation script → visual direction, handoff, traceability, acceptance;
- visual direction → handoff, traceability, acceptance;
- handoff → traceability and acceptance.

Do not delete downstream work automatically. Retain it as a draft needing reconciliation, and remove its approval.
