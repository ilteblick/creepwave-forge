---
name: context-router
description: "Use when Codex receives a user task plus prepared project context and must choose the next base role skill: route to the narrowest sufficient role, preserve context, surface conflicts, and produce a concise handoff. Do NOT use to implement, review, debug, design, test, or load adapters directly."
---

# Context Router

## Purpose

Choose the next Creepwave Forge base role skill for a project task and pass the prepared project context to that role.

The normal entry point is a project-level `project-context` skill. That skill loads the concrete project facts, then calls `context-router` with the user task and prepared context.

Do not use this skill as the place to store project facts. Project facts belong in adapter/project skills. This skill only routes and prepares a role handoff.

## Input Contract

Expect:

- User task or request
- Prepared project context from the project-level `project-context`

If project context is missing or structurally invalid, stop with `Project Context Missing/Invalid` instead of guessing.

## Workflow

1. Read the user task and prepared project context.
2. Select the narrowest base role skill that can handle the task.
3. Route cross-layer, risky, or ambiguous tasks to `solution-architect`.
4. Respect explicit role or artifact requests when they fit the task.
5. Preserve project context and any user/context conflict in the handoff.
6. Stop after routing; do not implement, review, design, test, or investigate inside this skill.

## Expected Output

Provide a concise handoff:

- `Selected Role`
- `Reason`
- `Context Passed`
- `Conflict/Error`

## Routing Guidance

Pick the narrowest sufficient role. If the request crosses layers, has unclear ownership, or may affect contracts, data, permissions, integrations, rollout, or multiple teams, route to `solution-architect`.

Respect explicit artifact requests:

- Requirements, user stories, acceptance criteria -> `business-analyst`
- Screen design, user flow, UX states -> `ui-ux-designer`
- Frontend page, component, form, table, UI behavior -> `frontend-engineer`
- Backend API, service, database, migration, auth, job -> `backend-engineer`
- Cross-layer feature or risky technical design -> `solution-architect`
- Bug, failing test, stack trace, production symptom -> `bug-investigator`
- Code, diff, PR, or implementation review -> `code-reviewer`
- Test plan, test cases, regression checklist -> `qa-engineer`

If the user request conflicts with project context, do not resolve the conflict inside the router. Include it in `Conflict/Error` and route to the role best suited to resolve it.

## Example

Input:

- User task: "Add a status filter to the orders table."
- Project context: "DigitalLogist uses Ant Design tables; order status data is already returned by the orders API; frontend lives in `apps/web`; tests run with `pnpm test:web`."

Output:

- `Selected Role`: `frontend-engineer`
- `Reason`: The task is limited to frontend table behavior because project context says status data already exists in the API response.
- `Context Passed`: DigitalLogist, Ant Design tables, `apps/web`, orders API already includes status, `pnpm test:web`.
- `Conflict/Error`: None.

## Gotchas

- Do not route without valid prepared project context; stop with `Project Context Missing/Invalid`.
- Do not resolve user/context conflicts inside the router; pass the conflict to the selected role.
- Do not route simple single-layer tasks to `solution-architect` unless ownership, risk, or required contracts are unclear.

## Out of Scope

- Do not find or load adapters as the primary workflow.
- Do not invent missing project facts.
- Do not implement features.
- Do not write full technical designs.
- Do not perform code review, QA, or bug investigation.
- Do not update project adapters unless explicitly asked.

## Handoff Contract

When routing to another role, preserve the shared handoff fields from `contracts/handoff.schema.json`: `source_role`, `target_role`, `goal`, `scope`, `confirmed`, `decisions`, `assumptions`, `open_questions`, `risks`, `artifacts`, and `next_action`.

Router handoffs should keep prepared project context intact, surface user/context conflicts, and name the selected role and concrete next action without doing the target role's work.

## Quality Bar

The router succeeds when the selected role is appropriate, the project context is carried forward without loss, conflicts are visible, and the router does not perform the downstream role's work.
