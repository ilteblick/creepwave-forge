# Fixture: Review To Fix

User task:

Review a diff that changes order permissions and then route concrete findings to the owner.

Expected role path:

1. `code-reviewer` reports only actionable findings with severity, evidence, impact, suggested fix, and missing test when relevant.
2. `backend-engineer` fixes findings that affect API, domain, data, permission, transaction, migration, integration, or backend tests.
3. `frontend-engineer` fixes findings that affect UI behavior, state, routing, API consumption, validation, accessibility, or frontend tests.
4. `qa-engineer` validates regression coverage when the finding changes observable behavior or permissions.

Expected contract:

Review findings must be passed as artifacts with target role, confirmed evidence, risks, and concrete next action through `contracts/handoff.schema.json`.
