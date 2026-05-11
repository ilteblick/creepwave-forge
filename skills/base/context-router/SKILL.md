---
name: context-router
description: "Use when Codex receives a user task plus prepared project context and must choose the next base role skill: route to the narrowest sufficient role, preserve context, surface conflicts, and produce a concise handoff. Do NOT use to implement, review, debug, design, test, or load adapters directly."
---

# Context Router

## Purpose

Choose the next Creepwave Forge base role for the user task and prepare a handoff. This skill routes work only; it does not analyze requirements, design UX, plan architecture, implement code, investigate bugs, review code, or write QA plans.

Project facts belong in adapter/project context. Treat prepared project context as input to preserve, not as something to invent or expand.

## Workflow

1. Read the user task, prepared project context, and any incoming handoff.
2. Select the narrowest base role that can own the next useful step.
3. Route clear backend-only controller or endpoint work to `backend-engineer` only when it does not change a consumer-facing API contract; route cross-layer, contract-impacting, risky, data-changing, permission-sensitive, integration-heavy, or ownership-unclear work to `solution-architect`.
4. Respect an explicit user role request when it is compatible with the task and context.
5. Preserve relevant context, conflicts, assumptions, and risks in the handoff.
6. Stop after routing.

## Expected Output

Return a valid Runtime Step Output with `artifact_type: "selected-role"` and a `handoff` compatible with `contracts/handoff.schema.json`.

The artifact should be concise and include:

- `Selected Role`
- `Reason`
- `Context Passed`
- `Conflict/Error`

Use `status: "handoff_ready"` with a `handoff` transition when routing can proceed. Use `status: "blocked"` only when the input is insufficient for even a routing decision.

## Routing Policy

Do not use keyword matching as the decision model. Use the role descriptions, project context, user intent, and risk profile.

Available target roles:

- `business-analyst`: Requirements, business rules, user stories, acceptance criteria, scope clarification, and product behavior decisions.
- `ui-ux-designer`: User flows, screen structure, layouts, interaction states, empty/loading/error states, accessibility, and design handoffs.
- `solution-architect`: Cross-layer technical design, API/data flow, module boundaries, migrations, rollout strategy, permissions, integrations, and ownership clarification.
- `backend-engineer`: Backend APIs, controllers, services, domain logic, database changes, migrations, jobs, auth, permissions, transactions, integrations, and backend verification.
- `frontend-engineer`: Frontend pages, components, forms, tables, routing, state, API integration, UI behavior, responsive behavior, accessibility, and frontend verification.
- `qa-engineer`: Test plans, behavior cases, regression checklists, validation summaries, QA coverage review, and automation candidates.
- `bug-investigator`: Failing tests, logs, stack traces, screenshots, regressions, flaky behavior, production symptoms, reproduction evidence, and root-cause direction.
- `code-reviewer`: Code, diff, PR, implementation-plan, security, performance, compatibility, test-gap, and maintainability review.
- `handoff-writer`: Role-to-role handoff material, implementation summaries, release notes, QA handoffs, operations notes, and final transfer documents.

Decision rules:

- Choose `business-analyst` when the next useful step is to define scope, rules, acceptance criteria, user stories, or resolve product ambiguity before design or implementation.
- Choose `ui-ux-designer` when the request asks for user experience, workflow, information architecture, screen structure, or visual/interaction handoff without implementation.
- Choose `solution-architect` when the request crosses frontend/backend/data/integration boundaries, requires contract design decisions across consumers/providers, affects permissions or tenant boundaries, requires migration/rollout planning, or has unclear technical ownership. If a backend controller or endpoint change is consumed by a frontend application or external client, choose `solution-architect` first when it changes authorization, response/request shape, URL, HTTP method, permissions, error semantics, or tenant scoping.
- Choose `backend-engineer` when the request is clear backend-only implementation or verification involving APIs, controllers, services, database, jobs, auth, permissions, or integrations, and no consumer-facing API contract decision is involved or the contract decision is already designed.
- Choose `frontend-engineer` when the request is clear frontend-only implementation or verification involving pages, components, forms, tables, state, routing, styling, accessibility, or frontend API usage.
- Choose `qa-engineer` when the request asks for a test plan, regression matrix, validation checklist, QA assessment, or behavior coverage without implementation.
- Choose `bug-investigator` when the input describes a symptom, failure, stack trace, flaky behavior, regression, or unclear defect and the root cause is not already known.
- Choose `code-reviewer` when the request asks to review code, a diff, a pull request, an implementation plan, or completed changes for defects and risks.
- Choose `handoff-writer` when the task is to package known work into a concise transfer artifact and no new product, design, architecture, implementation, QA, or review decision is needed.

Pick the narrowest sufficient role. Prefer a specialist role for clear single-layer work, including backend-owned API implementation that does not affect frontend or external clients. Choose `solution-architect` when a safe next step requires cross-layer design, rollout thinking, consumer-facing API contract decisions, migration strategy, integration boundaries, permission or tenant-boundary decisions, or ownership clarification.

When project context conflicts with the user request, do not resolve the conflict. Route to the role best suited to handle it and record the conflict in `Conflict/Error`, `risks`, or `open_questions`.

## Gotchas

- Do not perform the downstream role's work.
- Do not invent missing project facts.
- Do not route by backend keywords alone: controller or endpoint changes that affect a frontend application, external client, authorization, request/response shape, URL, method, permissions, error semantics, or tenant scoping are API contract-impact work for `solution-architect`.
- Do not choose a broad role just to be conservative when a narrow role can safely own the next step.
- Do not silently discard user-requested roles, artifacts, constraints, or conflicts.

## Handoff Contract

When routing to another role, preserve the shared handoff fields from `contracts/handoff.schema.json`: `source_role`, `target_role`, `goal`, `scope`, `confirmed`, `decisions`, `assumptions`, `open_questions`, `risks`, `artifacts`, and `next_action`.

Set `source_role` to `context-router`, set `target_role` to the selected role, and make `next_action` concrete enough that the target role can start without redoing routing.
