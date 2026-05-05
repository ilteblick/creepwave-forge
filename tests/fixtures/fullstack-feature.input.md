# Fixture: Fullstack Feature

User task:

Add a status filter to the orders table.

Expected role path:

1. `business-analyst` clarifies behavior, roles, statuses, and acceptance criteria.
2. `solution-architect` defines API/data/UI split, compatibility, risks, and rollout notes.
3. `ui-ux-designer` defines table filter behavior, states, content, and accessibility notes.
4. `backend-engineer` implements API/domain/data support when the contract requires it.
5. `frontend-engineer` implements table UI, API integration, states, and tests.
6. `qa-engineer` validates positive, negative, boundary, permission, and regression coverage.
7. `code-reviewer` reviews changed behavior, contracts, tests, permissions, and regressions.

Expected contract:

Each role-to-role transfer must include a handoff object compatible with `contracts/handoff.schema.json`.
