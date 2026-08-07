---
name: build-project-v7-courseware
description: Implement, validate, and export an approved interactive courseware experience as a Project V7 lesson. Use when Codex is given a hash-valid implementation-ready courseware case and must map approved presentation beats to scenes, states, native nodes, interactions, runtimes, components, editable content, HTML/PDF/PPTX outputs, traceability, and outcome evidence. Also use to resume or audit such an implementation. Refuse to invent or repair missing teaching content during this Skill.
---

# Build Project V7 Courseware

Implement an approved experience contract without redesigning it. Treat the case artifacts as product truth and Project V7 as engineering truth.

## Entry gate

1. Read the workspace `AGENTS.md`.
2. Fully read `docs/AI_COURSEWARE_ORCHESTRATION.md` and `docs/AI_COURSEWARE_AUTHORING.md`, plus referenced runtime/component/export specifications required by the selected carriers.
3. Read `case.json`, approved teaching design, content spec, presentation script, visual direction, and handoff from the case directory.
4. Run:

```text
python <skill-dir>/scripts/validate_handoff.py <case-dir>
```

Stop on any missing artifact, unresolved decision, stale hash, unapproved content, or placeholder. Do not infer missing requirements from chat, an old implementation, a visual reference, or a convenient component.

## Build the traceability map first

Read [traceability-contract.md](references/traceability-contract.md). Populate `06-traceability.json` before implementation with one entry per `BEAT-*` and the approved source hashes.

For every beat map:

- scene and stable state IDs;
- learner action triggers;
- immediate feedback and branch IDs;
- all learner-visible content bindings;
- formula IDs and representation;
- static review frame and evidence paths.

Keep the mapping current while building. Every learner-facing Project object must be mapped or explicitly excluded with a non-teaching reason. Never add custom traceability fields to Project V7 merely to satisfy this Skill.

## Select the shortest sufficient carrier

Read [carrier-selection.md](references/carrier-selection.md) before creating runtime or component code.

Use this priority:

1. Stable, directly editable visuals → native nodes and named presentation states.
2. Enumerable trigger/condition/action → `scene.interactions` or `globalInteractions`.
3. Course-specific continuous behavior, algorithmic judgment, or transient visuals → scene/global runtime.
4. Repeated, parameterized, independently maintained behavior with real lifecycle value → component.

Record a reason for every runtime and component. “Complex,” “many lines,” and “might be reusable” are insufficient component reasons. Do not componentize complete pages or ordinary title, prompt, feedback, and summary content.

## Protect content and presentation fidelity

For each beat, compare the implementation against:

- complete initial information;
- learner action and teacher checkpoint;
- immediate causal response;
- error, hint, retry, and recovery branches;
- stable end state and transition;
- reveal policy and time intent;
- editable visible-content inventory;
- static review frame.

If implementation requires changing any of these, stop and return to `$orchestrate-courseware`. Technical convenience cannot authorize a script change.

## Implement a core sample first

Choose the highest-risk beat or connected beat sequence. Implement only enough surrounding structure to evaluate it.

Capture the real 1280×720 initial, interaction, and stable result frames. Compare them with the approved script and visual direction. Report separately:

- `pipeline status`;
- `outcome status`: `unusable | placeholder | engineering candidate | art candidate | accepted`.

Do not expand the whole lesson until the sample reaches `art candidate` and the required human visual/interaction gate approves it. Concept art is not completion evidence.

## Implement Project V7

After sample approval:

1. Generate Project V7 directly; do not build a detached webpage first.
2. Keep all artificial learner-visible text in `TextNode.text`, runtime `content.values`, or component `props.content`.
3. Express stable page differences as named states; use runtime/components for behavior and transient effects.
4. Define replay, restart, navigation, course state, lifecycle, visibility, suspend/resume, deterministic capture, and destroy semantics.
5. Preserve offline behavior and use no undeclared network dependency.
6. Keep HTML interactive. Give PDF/PPTX intentional stable frames and document static differences.
7. Do not claim unsupported long-document, infinite-canvas, mixed-surface, online scoring, or editor-integrated AI features.

## Formula and subject typography

Read [formula-typography.md](references/formula-typography.md) whenever the case contains formulas, scientific notation, specialized symbols, or structured tables.

Never render display fractions with `½`, `⅓`, other diagonal Unicode fraction glyphs, or raw `1/2` text. Use a structured stacked representation and test HTML plus static exports. Keep Formula IDs traceable to the content spec.

Run the scanner against source and outputs:

```text
python <skill-dir>/scripts/validate_formula_markup.py <path> [<path> ...]
```

The scanner catches known unsafe forms; it does not replace screenshot review.

## Validate implementation fidelity

Run traceability validation against the actual Project JSON or `.h5lesson`:

```text
python <skill-dir>/scripts/validate_traceability.py <case-dir> --project <project-or-h5lesson>
```

Then run the workspace's Project, unit, integration, browser, lifecycle, offline, PDF, and PPTX checks required by the handoff. Validate real learner paths, not only state/event existence.

Freeze and score the first complete generation before manual post-hoc content repair. Record the first-pass hashes and score in `07-acceptance.md`; later improvement is a revision, not evidence that the first-pass workflow succeeded.

## Stop and return upstream when

- the handoff is invalid or stale;
- the problem, answer, difficulty, timing, or content volume must change;
- the initial view or reveal order is insufficient;
- a required visual/interaction route is not feasible within approved constraints;
- a paid, online, licensed, or architecture-changing dependency becomes necessary;
- HTML/PDF/PPTX differences exceed the approved contract.

Do not hide a blocked design decision inside implementation.

## Outcome gate

Provide actual HTML, screenshots, recordings, editable-text evidence, PDF/PPTX evidence, traceability report, pipeline report, and known differences. An automated build may write only `pending`; only explicit human review can set `accepted`.
