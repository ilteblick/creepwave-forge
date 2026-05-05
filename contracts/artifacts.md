# Creepwave Forge Artifacts

This file defines the shared role-to-role artifact contract for the base skills.

## Handoff Object

When one role passes work to another role, it should preserve the same fields as `contracts/handoff.schema.json`:

- `source_role`: role that produced the handoff.
- `target_role`: role expected to act next.
- `goal`: user or product outcome being pursued.
- `scope`: bounded work area for this transfer.
- `confirmed`: facts from the user, adapter, code, tests, logs, or prior role output.
- `decisions`: choices already made by the user or source role.
- `assumptions`: unconfirmed context the next role must treat conditionally.
- `open_questions`: unresolved items that could affect correctness, scope, risk, or ownership.
- `risks`: known or open risks that should shape the next role's work.
- `artifacts`: relevant requirements, designs, implementation summaries, validation output, findings, files, or links.
- `next_action`: concrete action expected from the target role.

## Artifact Types

- `requirements`: BA requirements, business rules, scenarios, acceptance criteria.
- `technical-design`: architecture, contracts, data, rollout, work split.
- `ui-ux-handoff`: screens, flows, states, interactions, content, accessibility.
- `backend-summary`: backend implementation behavior, contracts, data, tests, risks.
- `frontend-summary`: frontend implementation behavior, UI states, API assumptions, tests, risks.
- `qa-plan`: test areas, test cases, data, environment, automation candidates.
- `qa-validation`: executed validation results, defects, coverage gaps, residual risk.
- `bug-investigation`: reproduction, evidence, cause confidence, fix direction, regression coverage.
- `review-findings`: concrete review findings, severity, evidence, fix guidance, test gaps.
- `role-handoff`: compressed transfer between roles.
- `release-notes`: release, rollout, rollback, support, or operations notes.
- `other`: any project-specific artifact that does not fit the standard types.

## Contract Rules

- Do not mix assumptions into `confirmed`.
- Do not convert open questions into decisions.
- Keep `next_action` specific enough that the target role can act without redoing discovery.
- Include empty arrays when a field has no values. Do not omit required fields.
- Use project adapters as the source of truth for stack, commands, domain terms, and local constraints when available.
