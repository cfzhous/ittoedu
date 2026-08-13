# Response, assessment, authoring, and escape contracts

This reference defines the executable Markdown records that make a V2 case
implementable without turning every learning-evidence statement into a page
input. The approved Markdown remains the source of truth; the parser in
`scripts/contract_records.py` is a deterministic projection only.

## Record syntax

Define each record once under a Markdown heading whose ID has at least three
digits. Use exact ASCII field names and one `- field: value` line per field.

- `RESP-*` and `AUTH-*` live in `01-courseware-contract.md`.
- `ACT-*` and `ESC-*` live inside the relevant `SCN-*` block in
  `02-presentation-script.md`.
- Values `true`, `false`, and `none` are lowercase literals.
- Comma-separated references are unordered sets; IDs remain stable when prose
  or titles change.
- `contentRef` names one exact, explicitly defined `CNT-*`. Unstructured fragments such as
  `CNT-001#prompt` are rejected; split a separately governed sub-item into another `CNT-*`.

Changing any record byte changes its covering review scope hash. An older case
without these records is historical input, not `implementation-ready`; add the
records and obtain fresh approval rather than inheriting an old claim.

## Product capability profile

`## 产品能力剖面` contains three fields for each capability:

```text
- single-device: required
- single-deviceFallback: none
- single-deviceDecisionRef: none
```

Requirement values are `required | optional | not-required`. The fixed current
profile is single-device, teacher-display, and offline capable; it has no
multi-user aggregation. If a case requires a capability outside that profile,
record either a closed fallback mode (`none | single-device | teacher-display |
teacher-observed | paper | external-manual`) or an answered material `DEC-*`
whose `scopeRefs` contains the exact `capability:<capability-name>`. A fallback
cannot name the unavailable capability itself.
Do not infer capability needs by scanning words such as “全班” or “分布”.

Required capability names are:

- `single-device`
- `teacher-display`
- `offline`
- `multi-user-aggregation`

## RESP: evidence and response

Create one `RESP-*` for every response that must be observed or collected.
Every `EVD-*` needs at least one response, but the collection channel can be
oral, paper, teacher-observed, or discussion-only instead of digital.

```text
### RESP-001 判断并说明

- evidenceRef: EVD-001
- contentRef: CNT-001
- mode: digital-required
- responseType: choice
- requiredForProgress: true
- firstAttemptSeconds: 20
- retrySeconds: 10
- teacherDiscussionSeconds: 15
- authority: finite-auto
- navigationGate: hard
- teacherOverrideRef: ESC-001
- evaluatorCapabilityRef: EVAL-finite-choice-v1
- toleranceCaseRefs: TOL-001, TOL-002, TOL-003, TOL-004, TOL-005, TOL-006
- capacityOverrideDecisionRef: none
```

`mode` is one of:

- `digital-required`
- `digital-optional`
- `oral-check`
- `paper-work`
- `teacher-observed`
- `discussion-only`

`responseType` is one of:

- `choice`, `normalized-short`, `gesture`, `open-text`, `oral`, `paper`
- `drag`, `sort`, `circle-text`, `highlight`, `parameter-change`

Digital responses require a real `ACT-*` producer. A response marked
`requiredForProgress: true` requires an action marked
`requiredForCompletion: true`; capture prefill, direct state injection, or a
test-only completion path is not a producer.

## Capacity policy v1

The contract declares non-response time in `## 响应容量汇总`:

```text
- capacityPolicyVersion: 1
- readingObservationSeconds: 360
- sceneTransitionSeconds: 30
```

The validator calculates:

```text
reading/observation + scene transitions
+ sum(max(declared first attempt, type floor))
+ sum(retry reserve)
+ sum(teacher check/discussion)
<= durationMinutes * 60
```

Policy v1 minimums are:

| Response family | First attempt | Retry | Teacher check/discussion |
| --- | ---: | ---: | ---: |
| `choice` | 20 s | 10 s | 15 s |
| `normalized-short` | 35 s | 20 s | 20 s |
| `gesture`, `drag`, `sort`, `circle-text`, `highlight`, `parameter-change` | 45 s | 20 s | 30 s |
| `open-text`, `oral`, `paper` | 90 s | 0 s | 45 s |

A value below a floor needs `capacityOverrideDecisionRef` pointing to an
answered `DEC-*` whose `scopeRefs` contains the exact
`RESP-001#capacity` target. An answered unrelated decision is not an override.
The approved decision explains why the shorter value is safe.
Without it, readiness fails and the conservative floor is used in the total.
Response density above 1.5 per minute or more than three open-expression
responses is a warning; exceeding total duration is the hard blocker.

## Assessment authority

Only three authority values exist:

| Authority | Valid scope | Navigation rule |
| --- | --- | --- |
| `finite-auto` | `choice` through published `EVAL-finite-choice-v1` | may be hard only with `ESC-*` |
| `normalized-auto` | `normalized-short` through published `EVAL-normalized-short-v1` | may be hard only with tolerance cases and `ESC-*` |
| `human` | explanations, evidence use, generalization, argument, writing, semantic judgment | `soft | none`; never a machine hard gate |

Every automatic response names a stable `evaluatorCapabilityRef` and references
exact `TOL-*` rows from `## 自动判定容差矩阵`:

```text
| toleranceCaseId | responseRef | category | input | expected |
| --- | --- | --- | --- | --- |
| TOL-001 | RESP-001 | canonical-correct | A | pass |
| TOL-002 | RESP-001 | correct-variant-1 | a | pass |
| TOL-003 | RESP-001 | correct-variant-2 | 图 A | pass |
| TOL-004 | RESP-001 | blank | EMPTY | fail |
| TOL-005 | RESP-001 | typical-near-miss | B | fail |
| TOL-006 | RESP-001 | substring-false-positive | 答案不是 A | fail |
```

The six categories are canonical correct, two correct variants, blank, a
typical near miss, and a substring/keyword false-positive trap. Inputs are
exact, pairwise-distinct approved test values; the blank row must use `EMPTY`
and no other row may use it. Escape a
literal Markdown pipe as `\|`. Expected values are `pass | fail` and must match
the category. `human` uses `none` for evaluator and tolerance fields and has no
TOL rows. Do not claim symbolic equivalence or hide a custom regex behind
`normalized-auto` unless the current Capability Index exposes a real, testable
call path.

Both published evaluators are versioned in `artifacts/ai-capabilities/index.json`.
Their shared module call is
`src/shared/assessmentEvaluators.ts#evaluateAssessment`; Runtime/Component
code uses the public `ctx.assessment.evaluate` surface. An ID that is absent,
unstable, type-incompatible, or lacks those published invocation paths blocks
readiness.

`navigationGate` is `hard | soft | none`. Every hard gate references an
existing `ESC-*`; a teacher must be able to continue from blank, error, and
incomplete states without first making the response machine-correct. A hard
gate's escape must be in the producing action's scene, include
`continue-incomplete`, require confirmation, and remain independent of
correctness.

## AUTH: authoring outcome

Freeze the maintenance result, not Native/Runtime/Component selection:

```text
### AUTH-001 Core prompt and feedback

- contentRef: CNT-001
- access: authoring-view
- layoutAdjustment: required
- styleAdjustment: basic
- requiredForAcceptance: true
```

`access` is `direct-canvas | authoring-view | structured-property |
developer-only`. Stable titles, prompts, body text, labels, core feedback,
teacher prompts, and formulas need at least a structured entry. Frequently
moved, resized, or rearranged content needs `direct-canvas` or `authoring-view`.
Only algorithm internals and non-configurable decoration should be
`developer-only`.

`layoutAdjustment` is `required | optional | none`; `styleAdjustment` is
`required | basic | none`. Every `CNT-*` needs AUTH coverage. The Builder may
choose any carrier that meets the outcome. Downgrading an approved access level
is a user-visible tradeoff and must return to orchestration for a new decision
and review; it cannot be waived only in implementation `differences`.

## ACT: required observable action

Create an `ACT-*` for every real student, teacher, or system action required by
the scene:

```text
##### ACT-001 Choose an answer

- sceneRef: SCN-001
- actor: student
- kind: click
- target: the visible A/B option controls
- evidenceProduced: RESP-001
- requiredForCompletion: true
- initiallyHiddenContentRefs: CNT-002
- revealedContentRefs: CNT-002
- preActionVisible: false
- errorBehavior: retain the choice and show an equal-parts hint
- retryBehavior: the same controls remain enabled
- revealBehavior: after this approved action, show the complete CNT-002 definition
- stableResult: the chosen answer and explanation remain visible
```

`actor` is `student | teacher | system`. `kind` is `click | select |
text-input | formula-input | drag | sort | circle-text | highlight |
parameter-change | oral | paper | teacher-command`. A target is a learner- or
teacher-visible object, not an internal event or state setter. Each scene has at
least one ACT record, and every digital response points back to a producing
action. A digital producer has `actor: student` and a response-compatible kind
(`choice` uses `click | select`; `normalized-short` uses `text-input |
formula-input`; other digital types use their matching public action).

`initiallyHiddenContentRefs` and `revealedContentRefs` are comma-separated
exact `CNT-*` sets or `none`. Put reveal timing on the action rather than on a
global content policy because the same exact content may be hidden in one
scene and already visible in another. If either field is non-`none`,
`revealedContentRefs` must be non-empty and a subset of
`initiallyHiddenContentRefs`; every reference must be explicitly declared by
the same `SCN-*`. In that case `preActionVisible` is the literal `false`, and
`revealBehavior` must name the learner-visible transition. This gives the
Builder a closed `initial hidden -> perform ACT-* -> visible` test and prevents
free prose from silently leaking an answer before the approved action.

## ESC: teacher escape

Every scene needs at least one escape record covering its blank, error, or
incomplete states:

```text
##### ESC-001 Recover or continue

- sceneRef: SCN-001
- stateRefs: STATE-001, STATE-002
- actions: retry, reveal, continue-incomplete, scene-picker, previous, replay
- confirmBeforeContinue: true
- independentOfCorrectness: true
```

Allowed actions are `retry | reveal | continue-incomplete | scene-picker |
previous | replay`. Include at least one. `continue-incomplete` requires an
explicit confirmation. `independentOfCorrectness` must be true: the escape
cannot depend on the student answering correctly or a human response being
machine-judged. Every `stateRefs` value must be defined in the same scene. The
scene script still specifies visible wording, recovery,
and stable results; these fields only make the promise mechanically traceable.
