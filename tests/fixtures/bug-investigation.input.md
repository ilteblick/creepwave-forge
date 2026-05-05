# Fixture: Bug Investigation

User task:

The customer form clears field-level validation errors after a failed submit and retry.

Expected role path:

1. `bug-investigator` reproduces or narrows the defect, separates evidence from hypotheses, and names regression coverage.
2. `frontend-engineer` fixes UI state handling when the cause points to rendering, form state, or API consumption.
3. `qa-engineer` validates the regression path and related disabled, pending, error, and retry states.
4. `code-reviewer` reviews the fix for behavior, test coverage, and regression risk.

Expected contract:

The bug report and every transfer after it must preserve evidence, assumptions, open questions, risks, artifacts, and next action through `contracts/handoff.schema.json`.
