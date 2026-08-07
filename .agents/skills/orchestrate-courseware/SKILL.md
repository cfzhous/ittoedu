---
name: orchestrate-courseware
description: Design, review, persist, and approve interactive courseware before implementation. Use when Codex receives a teaching topic, lesson plan,教材、题目、课程标准或素材，需要诊断上下文、提出结构化高影响决策、生成或修订教学设计、教学内容规格、教学呈现脚本、视觉方向和 implementation-ready 交接记录，或从落盘课例档案恢复这些阶段。不得用此 Skill 直接生成 Project V7 工程。
---

# Orchestrate Courseware

Turn a teaching request into an approved, file-backed experience contract. Treat chat as transport, never as the only source of truth.

## Non-negotiable rules

1. Persist before progressing. Create or resume a case directory before drafting substantive content.
2. Read the workspace `AGENTS.md`. When present, fully read `docs/AI_COURSEWARE_ORCHESTRATION.md`; read subject packs and authoritative sources selected for this case.
3. Keep the order `context → decisions → teaching design → content spec → presentation script → visual direction → handoff`.
4. Never generate Project nodes, runtime code, component code, or exports in this Skill.
5. Write only `draft` or `ready-for-review`. Record `approved` only after explicit human approval of that exact artifact version.
6. Bind approval to SHA-256. Any content change invalidates that approval and downstream readiness.
7. Do not infer missing approved content from old chat, a compressed summary, an implementation, a template, or a component.
8. Never label pipeline checks as teaching, visual, or outcome acceptance.

## Start or resume a case

If no case exists, run:

```text
python <skill-dir>/scripts/init_case.py --root <workspace> --case-id <stable-id> --title <title> --duration-minutes <minutes>
```

If a case exists:

1. Read `case.json` and `decisions.json`.
2. Run `validate_case.py <case-dir> --target draft`.
3. Recompute artifact hashes and detect stale approvals.
4. Load only the approved upstream artifacts and current-stage draft needed now.
5. State the recovered stage and blockers briefly; continue from files, not memory.

Read [artifact-contracts.md](references/artifact-contracts.md) before creating or changing case artifacts.

## Stage 1: Context and decisions

Record the original request, source register, authority order, constraints, missing information, conflicts, and explicit assumptions in `00-context.md`.

Create a `DecisionPrompt` only for choices that materially change learning goals, evidence, content scope, learner control, key presentation, visual direction, delivery semantics, cost, licensing, or safety. Read [decision-gates.md](references/decision-gates.md) before asking.

Before displaying structured choices, preflight the host. For Codex, require a mode exposing `request_user_input`. If unavailable:

- persist the complete prompt in `decisions.json`;
- set the case stage to `decision-blocked`;
- explain how to resume;
- do not silently convert the options into ordinary prose;
- do not claim that the Skill can switch host mode.

## Stage 2: Teaching design

Draft `01-teaching-design.md` without technical carriers. Require:

- audience, prerequisites, use context, and duration;
- observable objectives and evidence IDs;
- content boundary, misconceptions, strategy, sequence, assessment, and constraints;
- explicit `objective → evidence → teaching stage` coverage;
- a plausible total-time model.

Run structural validation, mark the artifact ready, present a human-readable review, and wait for explicit approval. Use `case_artifact.py` to record readiness and approval.

## Stage 3: Content specification

Draft `02-content-spec.md` as the authoritative answer to “what exactly is taught.” Do not proceed with titles or activity labels alone.

For every `CNT-*` item include the complete learner-facing prompt, all givens, expected response, reasoning, accepted alternatives, misconceptions, feedback principles, difficulty justification, prerequisites, reveal policy, timing, source, and notation/media requirements. Include a whole-course capacity table.

For exact-content subjects, independently verify facts, solutions, distractors, units, and answer boundaries before review. When current or high-stakes sources are needed, use authoritative sources and record them.

## Stage 4: Presentation script

Draft `03-presentation-script.md`. Every `BEAT-*` must reference approved content and state:

- teaching purpose and objective/evidence references;
- initial view and all information visible before learner action;
- teacher action, learner action, immediate response, branches, and recovery;
- stable end state and transition;
- visible content, reveal policy, media, motion, teacher checkpoint, and time budget;
- evidence to capture and an intentional HTML/PDF/PPTX review frame.

Reject any action that starts before the learner has enough information. Reject orphan classification, ordering, dragging, or selection that does not contribute to an objective, misconception repair, or evidence. A final summary must derive from prior evidence.

## Stage 5: Visual direction

Draft `04-visual-direction.md` when visual or interaction risk is material. Otherwise record `not-required` with a concrete low-risk reason; do not silently skip it.

Freeze visual hierarchy, subject-specific representation, composition differences, interaction causality, typography, key frames, asset/licensing needs, and avoidances. Treat concepts and reference images as targets, not completion evidence.

## Stage 6: Handoff

Draft `05-implementation-handoff.md` only after the upstream artifacts are approved. Include exact paths, versions, approved hashes, decision IDs, authoritative content, assets, editability, delivery formats, expected static differences, acceptance evidence, and change-control rules.

Run:

```text
python <skill-dir>/scripts/validate_case.py <case-dir> --target implementation-ready --promote
```

Only after it passes may the case stage become `implementation-ready`. Hand off to `$build-project-v7-courseware`; do not start implementation here.

## Approval operations

Use the helper rather than hand-editing hashes:

```text
python <skill-dir>/scripts/case_artifact.py <case-dir> ready <artifact-key>
python <skill-dir>/scripts/case_artifact.py <case-dir> approve <artifact-key> --evidence <explicit-user-approval>
python <skill-dir>/scripts/case_artifact.py <case-dir> reject <artifact-key> --evidence <user-feedback>
python <skill-dir>/scripts/case_artifact.py <case-dir> not-required visualDirection --reason <low-risk-reason>
python <skill-dir>/scripts/case_artifact.py <case-dir> status
```

Run `approve` only after the user explicitly approves the exact artifact presented. Never manufacture approval evidence or approve on the user's behalf.

## Review discipline

Read [review-rubrics.md](references/review-rubrics.md) before each human gate. Present only what the user must judge, what approval unlocks, and what later changes would invalidate it.

Stop when blocked. Do not solve a process failure by polishing a downstream implementation.
