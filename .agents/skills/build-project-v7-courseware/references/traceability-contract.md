# Script-to-implementation traceability contract

## Purpose

`06-traceability.json` is an external authoring record. It does not extend Project V7. It must prove both directions:

1. every approved `BEAT-*` has an implementation and evidence path;
2. every learner-facing implementation object has an approved script basis or an explicit non-teaching exclusion.

## Schema V1

```json
{
  "schemaVersion": 1,
  "caseId": "example",
  "sourceArtifacts": {
    "teachingDesign": { "version": "1.0", "sha256": "..." },
    "contentSpec": { "version": "1.0", "sha256": "..." },
    "presentationScript": { "version": "1.0", "sha256": "..." },
    "visualDirection": { "version": "1.0", "sha256": "..." }
  },
  "beats": [
    {
      "beatId": "BEAT-001",
      "sceneIds": ["scene-intro"],
      "stateIds": ["intro-open", "intro-complete"],
      "nodeIds": ["intro-title", "intro-prompt"],
      "interactionIds": ["lock-prediction"],
      "runtimeIds": [],
      "contentBindings": ["node:intro-prompt.text"],
      "formulaIds": [],
      "evidencePaths": ["evidence/beat-001-complete.png"],
      "staticReview": "intro-open"
    }
  ],
  "implementationObjects": [
    {
      "id": "intro-prompt",
      "kind": "node",
      "beatIds": ["BEAT-001"],
      "learnerFacing": true
    }
  ],
  "coverageExclusions": [
    {
      "id": "decorative-grid",
      "kind": "node",
      "reason": "Non-instructional background decoration."
    }
  ],
  "formulas": [
    {
      "formulaId": "FORM-001",
      "representation": "dom-stacked-fraction",
      "implementationIds": ["formula-area"],
      "evidencePaths": ["evidence/formula-area-html.png", "evidence/formula-area-pptx.png"]
    }
  ]
}
```

## Stable Project identifiers

Use actual Project scene, state, node, and interaction IDs. For runtime entries use:

- `scene:<scene-id>:runtime`;
- `global:runtime`.

Component instances are nodes, so map their node ID and use `kind: "component"` when a distinct component reason/evidence is useful.

## Coverage rules

- Every `BEAT-*` in the approved script appears exactly once in `beats`.
- Every beat has at least one scene, stable state, and evidence path.
- All mapped IDs exist in the delivered Project.
- Every scene state, learner-facing node, interaction, runtime, and component instance appears in `implementationObjects` or `coverageExclusions`.
- Exclusions require a concrete reason; do not exclude prompts, instructions, feedback, formula, learner control, answer, or summary content.
- All `beatIds` referenced by implementation objects exist in the approved script.
- `sourceArtifacts` hashes equal the currently approved hashes.
- Formula entries reference `FORM-*` from the content specification and include actual HTML and static-export evidence when the representation differs.

The validator checks structure and ID coverage. Human review still decides whether the mapping is semantically faithful.
