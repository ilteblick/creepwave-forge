# Bugfix Flow Example

This example shows a defect investigation that hands a confirmed frontend fix direction to `frontend-engineer`.

```json
{
  "role": "bug-investigator",
  "status": "handoff_ready",
  "artifact_type": "bug-investigation",
  "artifact": "Bug Investigation Report\n\nSymptom: The orders page loses selected filters after refresh.\n\nReproduction Status: Reproduced.\n\nEvidence: Query params are read on initial render, but filter state is reset when the first data fetch completes.\n\nFix Direction: Preserve URL-derived filter state when applying the initial API response.",
  "transition": {
    "type": "handoff",
    "target_role": "frontend-engineer"
  },
  "handoff": {
    "source_role": "bug-investigator",
    "target_role": "frontend-engineer",
    "goal": "Fix orders page filter state reset after refresh.",
    "scope": "Frontend state handling for URL-derived filters on the orders page.",
    "confirmed": [
      "The issue is reproducible on refresh with status query params.",
      "The filter reset occurs after the first data fetch completes."
    ],
    "decisions": [
      "Fix ownership is frontend because API responses contain the requested filtered data."
    ],
    "assumptions": [
      "Existing frontend tests can cover URL query state initialization."
    ],
    "open_questions": [],
    "risks": [
      "Changing initialization order may regress default filter behavior."
    ],
    "artifacts": [
      {
        "name": "Bug investigation",
        "type": "bug-investigation",
        "summary": "Reproduction, evidence, and frontend fix direction for filter reset."
      }
    ],
    "next_action": "Update orders filter state initialization and add a regression test for refresh with status query params."
  }
}
```
