# Decision gates

## Decide what to ask

Ask only when the answer materially changes one or more of:

- learning objective, evidence, or content boundary;
- teacher-led versus learner-led experience;
- error, branch, retry, reveal, or checkpoint behavior;
- visual metaphor, primary representation, or costly asset route;
- HTML interaction versus static-export expectation;
- safety, authority, licensing, paid service, or online dependency.

Use an explicit, traceable default for low-impact uncertainty. Do not ask users to choose Project fields, DOM/Phaser, component APIs, IDs, or ordinary code organization.

## Persist `DecisionPrompt`

Store each prompt in `decisions.json`:

```json
{
  "id": "DEC-001",
  "stage": "teaching-design-review",
  "question": "...",
  "reason": "...",
  "blocking": true,
  "minSelections": 1,
  "maxSelections": 1,
  "options": [
    {
      "id": "DEC-001-A",
      "label": "...",
      "description": "...",
      "recommended": true
    }
  ],
  "response": null
}
```

Options must be mutually exclusive when only one may be selected. Put the recommendation first and explain the product consequence, not a vague quality label.

## Preflight the host

For Codex, structured choices require a mode and tool surface that exposes `request_user_input`. The Skill cannot switch modes. When unavailable:

1. persist the prompt unchanged;
2. set `stage` to `decision-blocked`;
3. tell the user which capability is missing and how to resume;
4. do not paste the choices as an ordinary question and pretend the gate passed.

On resume, reuse the same decision ID. Record selected option IDs, `answeredBy`, and `answeredAt`. Keep superseded decisions for audit with a clear supersession link.

## Artifact approval prompts

For a review gate, show a concise artifact summary and ask one decision:

- approve this exact version;
- request revision;
- reject/stop where materially distinct.

State what approval unlocks and which future changes invalidate it. Do not combine approval of teaching design, content spec, and presentation script into one ambiguous decision.
