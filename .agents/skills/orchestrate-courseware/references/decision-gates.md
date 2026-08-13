# Decision gates

## Ask only material questions

Ask when the answer changes a learning objective/evidence, exact-content boundary, learner control, error/retry/reveal behavior, primary visual representation, costly asset route, static-export expectation, safety, authority, licensing, paid service, or online dependency.

Do not ask users to choose Project fields, DOM/Canvas/Phaser, component APIs, IDs, state organization, or ordinary implementation details. Record an explicit safe default for low-impact uncertainty.

## Use the available host surface

When `request_user_input` is exposed, call it directly. Do not check for or require Plan mode. Ask 1–3 questions per call, with 2–3 mutually exclusive options each. Put the recommendation first, label it as recommended, and describe the real result consequence in one sentence.

Persist each `DecisionPrompt` in `case.json` before asking. After a valid tool response, immediately persist the answer with `case_decision.py`; do not rely on chat history.

When the tool is unavailable:

- apply and record `safe-default` only when the case already contains a genuinely safe option that does not materially alter the requested outcome;
- otherwise keep the decision pending and ask one concise equivalent text question;
- persist the text answer as `user-text`;
- pause only while an unresolved blocking decision has no safe default and no user answer.

Tool absence is not a permanent `decision-blocked` state. Reuse the same decision ID when a response arrives.

## Embedded decision shape

```json
{
  "schemaVersion": 1,
  "id": "DEC-001",
  "stage": "intake",
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
  "safeDefaultOptionId": null,
  "response": null
}
```

Use the helper:

```text
python <skill-dir>/scripts/case_decision.py <case> add --id DEC-001 --stage intake --question <q> --reason <why> --option DEC-001-A <label> <impact> true --option DEC-001-B <label> <impact> false
python <skill-dir>/scripts/case_decision.py <case> answer DEC-001 --answered-by user-structured --selected DEC-001-A
python <skill-dir>/scripts/case_decision.py <case> answer DEC-001 --answered-by safe-default --selected DEC-001-A
python <skill-dir>/scripts/case_decision.py <case> answer DEC-001 --answered-by user-text --text <answer>
```

Adding or changing any decision invalidates current and downstream review scopes because decision hashes participate in every approval scope.

## Approval questions

For a review gate, show the exact scope hash plus a concise summary of what the human must judge. State what approval unlocks and that any covered input, decision, or byte change requires re-review.

Run `approve` only after the named human explicitly approves that exact presented scope. Never manufacture the reviewer or evidence. Fast mode may aggregate contract and script approval; standard and high-risk must preserve their sequential review scopes.
