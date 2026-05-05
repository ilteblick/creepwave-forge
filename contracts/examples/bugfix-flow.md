# Bugfix Flow Handoff Example

```json
{
  "source_role": "bug-investigator",
  "target_role": "frontend-engineer",
  "goal": "Fix the customer form losing validation errors after retry.",
  "scope": "Frontend customer form retry and validation state behavior.",
  "confirmed": [
    "The issue reproduces after a failed submit followed by retry.",
    "The API returns field-level validation errors."
  ],
  "decisions": [],
  "assumptions": [
    "The existing API error shape is correct and should not change."
  ],
  "open_questions": [],
  "risks": [
    "Changing submit state handling can regress disabled and pending button behavior."
  ],
  "artifacts": [
    {
      "name": "Bug Investigation Report",
      "type": "bug-investigation",
      "summary": "Validation errors are cleared by local retry state before the response is rendered."
    }
  ],
  "next_action": "Preserve field-level validation errors through retry and add a regression test for failed submit followed by retry."
}
```
