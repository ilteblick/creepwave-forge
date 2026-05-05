---
name: handoff-writer
description: "Use when Codex needs role-to-role handoff material: BA to design/dev/QA, architect to implementation/QA, backend to frontend, dev to QA, review to fixes, or release notes to operations. Do NOT use to make new product, design, architecture, code, QA, or review decisions."
---

# Handoff Writer

## Purpose

Preserve context between roles so the next role receives clear scope, decisions, assumptions, risks, artifacts, open questions, and next action.

Accept output from any base role and prepare it for the next role. Do not make decisions for the next role; only structure and compress what is already known.

## Workflow

1. Identify source role, target role, user goal, scope, and expected next action.
2. Extract confirmed facts, decisions, constraints, artifacts, assumptions, risks, and unresolved questions.
3. Compress long context by removing discussion noise while preserving facts, decisions, constraints, risks, artifact links, and blockers.
4. Format the handoff for the target role's needs.
5. Include acceptance, verification, release, or operations notes only when relevant to the target role.
6. Stop at handoff quality; do not create new requirements, UX decisions, architecture, code, QA plans, or review findings.

## Expected Output

Use `Role Handoff` when work can be transferred safely:

- `Source Role`
- `Target Role`
- `Goal`
- `Scope`
- `Artifacts`
- `Confirmed`
- `Decisions`
- `Assumptions`
- `Risks`
- `Open Questions`
- `Next Action`

Use `Clarification Needed` when a safe handoff is impossible:

- `Known Context`
- `Missing Handoff Input`
- `Why It Blocks Transfer`
- `Safe Partial Handoff`
- `Suggested Source/Target Role`

Trigger `Clarification Needed` when the target role, goal, scope, confirmed decisions, blocking questions, or required artifacts are unclear enough that the next role would likely redo work or implement the wrong thing.

## Target Role Focus

Adjust emphasis by target role:

- `business-analyst`: unresolved rules, actors, statuses, permissions, money, legal/data constraints, acceptance criteria gaps.
- `ui-ux-designer`: user goals, flows, screen states, content needs, empty/loading/error states, UX constraints, design-system context.
- `solution-architect`: requirements, impacted domains, entities, contracts, integrations, constraints, risks, rollout concerns, adapter context.
- `backend-engineer`: entities, API/event contracts, data rules, state transitions, permissions, side effects, migrations, audit/logging, backend test expectations.
- `frontend-engineer`: visible states, fields, validations, user-facing messages, API/data assumptions, design handoff links, responsive/accessibility notes.
- `qa-engineer`: acceptance criteria, edge cases, roles, test data, negative scenarios, regression risks, environment assumptions.
- `code-reviewer`: changed behavior, intended contracts, known risks, sensitive paths, required tests, compatibility concerns.
- `handoff-writer`: source context, target audience, decisions, assumptions, open questions, artifacts, and required output type.

For operations or release handoff, include user-facing summary, release notes, rollout/rollback notes, monitoring expectations, and support risks only when requested or clearly needed.

## Provenance Rules

Keep provenance visible:

- `Confirmed`: facts from the user, source role output, adapter, code, tests, logs, or linked artifacts.
- `Decisions`: choices already made by the user or source role.
- `Assumptions`: reasonable but unconfirmed context the next role must verify or respect conditionally.
- `Open Questions`: unresolved items that could affect scope, correctness, risk, delivery order, or ownership.

Do not mix assumptions into confirmed facts. Do not silently convert open questions into decisions.

## Context Reading

Usually do not read code. Read code, diffs, or artifacts only when the handoff references concrete files, PRs, errors, screenshots, or implementation details and summarizing without checking would risk distorting the context.

Use project adapter context as the source of truth for stack, commands, domain terms, and local constraints when it is already available in the source material.

## Handoff Contract

When writing a handoff, preserve the shared fields from `contracts/handoff.schema.json`: `source_role`, `target_role`, `goal`, `scope`, `confirmed`, `decisions`, `assumptions`, `open_questions`, `risks`, `artifacts`, and `next_action`.

If any required field is unknown, keep it visible as an open question or use `Clarification Needed` instead of silently inventing missing context.

## Gotchas

- Do not add new decisions to make the handoff feel complete. Preserve gaps as `Open Questions` or `Clarification Needed`.
- Do not lose constraints, risks, permissions, rollout notes, or adapter facts while compressing long context.
- Do not produce a generic status update. Every handoff must name the target role and the concrete next action.
- Do not use the same handoff shape for every target role; emphasize what the receiver needs to act.
- Do not ask the next role to "investigate" unless the expected investigation output is explicit.
