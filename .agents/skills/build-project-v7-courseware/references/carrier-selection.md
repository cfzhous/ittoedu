# Project V7 carrier selection

## Decision order

Start from the approved learner experience, not from available code.

| Need | Default carrier | Reason |
| --- | --- | --- |
| Stable prompt, label, image, diagram, feedback, summary | Native node | Directly visible and editable |
| Stable attempt/error/success/completion variation | Named presentation state | Deterministic, reviewable, exportable |
| Click/state/navigation/audio/video mapping | Declarative interaction | Inspectable trigger–condition–action |
| One-scene continuous drag, algorithm, custom DOM/SVG/Canvas, transient effect | `scene.runtime` | Course-specific behavior without false reuse |
| Course-wide guard, state coordination, persistent course-specific behavior | `globalRuntime` | One course-level implementation |
| Repeated configurable experiment/question/tool | Scene component | Reuse and independent configuration justify lifecycle |
| Repeated persistent HUD/tool across scenes | Global component | Reuse plus persistent instance semantics |

## Component admission test

Use a component only when at least one strong condition and no simpler carrier apply:

- the same behavior is used more than once with meaningful content/configuration variation;
- it needs a stable public Props contract for independent authoring;
- it has a lifecycle or release boundary worth maintaining independently;
- it is already a published component whose applicability has been verified.

Do not use these as reasons by themselves:

- the code is long;
- the visual is important;
- the interaction is complicated;
- a component was used in a prior case;
- it may be reusable someday.

First successful use creates a case implementation or candidate pattern, not an automatic published component.

## Runtime admission test

Use runtime for course-specific behavior that cannot be cleanly expressed as stable states and declarative rules. Keep stable text and major UI in native nodes where practical. Runtime may own a complete course-specific continuous experiment region when splitting it would weaken causality, but must register visible content, edit targets, lifecycle, and capture behavior.

## Record the reason

For each runtime/component, put a technical mapping entry in traceability:

```json
{
  "id": "scene-lab::runtime",
  "kind": "runtime",
  "beatIds": ["BEAT-004"],
  "carrierReason": "One-scene continuous linked geometry and graph behavior; no reuse contract."
}
```

If `carrierReason` would still be true for a native state or declarative rule, reconsider the carrier.
