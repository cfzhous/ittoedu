# Courseware case V2 contracts

## Contents

1. Minimal directory
2. `case.json` shape
3. Adaptive review profiles
4. Exact-content closure
5. Hash, invalidation, and recovery
6. V1 audit and migration

## 1. Minimal directory

Every case starts with exactly three required files:

```text
<case>/
├── case.json
├── 01-courseware-contract.md
└── 02-presentation-script.md
```

Create `content/` only when content is large, separately sourced, or needs word-level traceability. Create `visual-direction.md` only for `high-risk`. Do not create `decisions.json`, a separate content-specification file, an implementation handoff, traceability JSON, or acceptance Markdown as parallel truth.

## 2. `case.json` shape

Use `schemaVersion: 2`, `targetProjectSchemaVersion: 8`, `authoringMode: "ppt-compatible"`, and one `pathMode`: `fast | standard | high-risk`.

Top-level responsibilities:

- `inputs`: original request or faithful summary, sources, constraints, assumptions;
- `artifacts`: paths, file/directory kind, required flag, authoring status, and current ready hash;
- `reviews`: path-specific human review scopes and approvals;
- `reviewHistory`: invalidated prior scope claims for audit;
- `decisions`: embedded `DecisionPrompt` records and responses;
- `blockingDecisionIds`: exact unresolved blocking decision IDs;
- `derivedReadiness`: validator-owned readiness, hashes, exact-content locations, and blockers;
- `resultStatus`: outcome vocabulary only; orchestration tools leave it `pending` and never create `accepted`.

The artifact keys and paths are fixed:

| Key | Kind | Path | Required |
| --- | --- | --- | --- |
| `coursewareContract` | file | `01-courseware-contract.md` | always |
| `presentationScript` | file | `02-presentation-script.md` | always |
| `contentBundle` | directory | `content/` | optional |
| `visualDirection` | file | `visual-direction.md` | high-risk only |

`derivedReadiness` is machine-derived:

```json
{
  "status": "not-ready | implementation-ready",
  "evaluatedAt": "ISO-8601",
  "validator": "courseware-case-v2",
  "artifactHashes": {},
  "approvedReviewHashes": {},
  "exactContentLocations": {},
  "blockingReasons": []
}
```

It is not an artifact, a human approval, or an outcome status. A Builder must rerun validation rather than trust a copied field.

## 3. Adaptive review profiles

Reviews approve exact scopes, not abstract file names. Each review records `covers`, `dependsOn`, `status`, and an exact `scopeSha256`; an approved review also records a named human, time, and explicit evidence.

| Path | Required human reviews |
| --- | --- |
| `fast` | `experience`: contract + optional content + presentation script in one aggregate scope |
| `standard` | `contract`: contract + optional content; then `presentationScript`, bound to the approved contract scope |
| `high-risk` | standard reviews; then `visualDirection`, bound to the approved presentation scope |

Do not use `fast` merely to reduce review work. Use it only when supplied content, objectives, evidence, presentation intent, and material decisions are already complete enough for one coherent review. `approvedBy` must name a human; the tools and validator reject common Codex, AI, agent, builder, bot, and automation identities.

Approval operations:

```text
python <skill-dir>/scripts/case_artifact.py <case> ready coursewareContract
python <skill-dir>/scripts/case_artifact.py <case> ready presentationScript
python <skill-dir>/scripts/case_artifact.py <case> review-ready <review-key>
python <skill-dir>/scripts/case_artifact.py <case> approve <review-key> --approved-by <human> --evidence <explicit-approval>
```

For standard/high-risk paths, approve upstream reviews before preparing downstream review scopes.

## 4. Exact-content closure

Exact content may live in the contract, presentation script, or `content/*.md`, but every `CNT-*` definition must exist once and include:

- complete learner-visible wording, givens, definitions, choices, teacher prompts, or source text;
- expected response and complete explanation/reasoning;
- accepted alternatives and rejected boundaries;
- typical errors, causes, first feedback, escalation, and repaired evidence;
- difficulty, prerequisite, source, and review status;
- reveal order, instructional time, notation, unit, diagram, media, and accessibility needs.

Use stable IDs: `SRC-*`, `DEC-*`, `OBJ-*`, `EVD-*`, `STG-*`, `CNT-*`, `ERR-*`, `FORM-*`, `SCN-*`, `STATE-*`, `VIS-*`. The script must reference every content item it presents and must not reference unknown objectives, evidence, or content.

A cold-start Builder must not need chat, an old implementation, or subject-matter guessing to recover visible text, correct answers, feedback, or reveal behavior. File layout may vary; semantic closure may not.

## 5. Hash, invalidation, and recovery

A review scope hash covers:

1. the canonical `inputs` hash;
2. the canonical embedded `decisions` hash;
3. current hashes and presence/status of every covered file or directory;
4. current upstream review scope hashes.

Directory hashes include sorted relative file names and every file hash. Changing inputs, a decision response, contract bytes, script bytes, any `content/` file, or visual bytes invalidates the direct review and every dependent review. Retain invalidated claims in `reviewHistory`; never keep them active.

Recover from files:

1. Run `case_artifact.py <case> status` and `validate_case.py <case> --target draft --json`.
2. Resolve blocking decisions from `case.json`.
3. Reconcile changed artifacts, run `ready`, and re-review only invalidated scopes and their dependents.
4. Run `validate_case.py <case> --target implementation-ready --promote`.

`--promote` persists either a fresh `implementation-ready` result or a fresh `not-ready` result. It never approves reviews and never changes `resultStatus` to `accepted`.

## 6. V1 audit and migration

Treat V1 as untrusted historical input, even when it claims `approved` or `implementation-ready`.

```text
python <skill-dir>/scripts/migrate_case_v1.py <v1-case> audit
python <skill-dir>/scripts/migrate_case_v1.py <v1-case> migrate --destination <new-v2-case> --path-mode <mode>
```

Migration is copy-on-create: it refuses an existing destination, fingerprints and preserves the source, creates V2 draft files, copies every V1 source byte unchanged under `legacy-v1/` with a file/tree SHA-256 inventory, records legacy status/hash claims for audit, and sets all V2 reviews to pending. The `legacy-v1/` tree is evidence, never current V2 truth. Migration does not inherit approvals, decision responses, readiness, or acceptance. Reconcile migrated material into V2 sections, re-ask material decisions, remove placeholders/duplicates, and obtain fresh path reviews.
