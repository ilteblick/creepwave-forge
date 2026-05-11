# Creepwave Forge Artifacts

This document defines the semantic contract shared by the Forge runtime and base roles. The schemas in this directory are the validation source of truth; this file explains how humans and roles should use them.

## Runtime Step Output

Every active role returns exactly one Runtime Step Output compatible with `contracts/step-output.schema.json`.

Required fields:

- `role`: the active role that produced the output.
- `status`: role-level result: `needs_clarification`, `handoff_ready`, `blocked`, or `complete`.
- `artifact_type`: the kind of document produced by the role.
- `artifact`: the role's markdown/plain-text output.
- `transition`: the requested runtime transition.
- `handoff`: a shared role-to-role transfer object.

The runtime validates the output, persists the artifact, then pauses in `awaiting_approval`. It does not apply the transition until a human approves it.

## Handoff Object

Every role-to-role transfer preserves these fields from `contracts/handoff.schema.json`:

- `source_role`: role that produced the handoff.
- `target_role`: role expected to act next.
- `goal`: user or product outcome being pursued.
- `scope`: bounded work area for this transfer.
- `confirmed`: facts from the user, project context, code, tests, logs, or prior role output.
- `decisions`: choices already made by the user or source role.
- `assumptions`: unconfirmed context the next role must treat conditionally.
- `open_questions`: unresolved items that could affect correctness, scope, risk, or ownership.
- `risks`: known or open risks that should shape the next role's work.
- `artifacts`: relevant role documents, files, or links.
- `next_action`: concrete action expected from the target role.

Do not mix assumptions into `confirmed`. Do not convert open questions into decisions. Keep `next_action` specific enough that the target role can act without redoing routing or discovery.

## Artifact Types

- `requirements`: BA requirements, business rules, scenarios, acceptance criteria.
- `technical-design`: architecture, contracts, data, rollout, and role work split.
- `ui-ux-handoff`: screens, flows, states, interactions, content, accessibility, design-system notes.
- `backend-summary`: backend implementation behavior, contracts, data impact, permissions, tests, risks.
- `frontend-summary`: frontend implementation behavior, UI states, API assumptions, responsive/accessibility notes, tests, risks.
- `qa-plan`: test areas, cases, data, environment, automation candidates, blockers, residual risks.
- `qa-validation`: executed validation results, defects, coverage gaps, blocked areas, residual risks.
- `bug-investigation`: reproduction, evidence, cause confidence, fix direction, regression coverage.
- `review-findings`: concrete review findings, severity, evidence, impact, suggested fix, test gaps.
- `role-handoff`: compressed transfer material between roles.
- `release-notes`: release, rollout, rollback, support, or operations notes.
- `selected-role`: `context-router` role selection artifact.
- `clarification`: user answers to role questions.
- `revision-request`: human request for the same role to redo or refine its prior output.
- `approval`: human approval record for a pending role output.
- `context`: captured project context loaded from agent files.
- `other`: project-specific artifact that does not fit a standard type.

Role-specific documents stay as artifacts. Do not add role-specific fields to the shared handoff unless the contract itself changes.

## Transition Types

- `handoff`: transfer ownership to `transition.target_role`.
- `clarification_request`: stop and ask the user; after the answer, the same role resumes.
- `consultation_request`: ask another role for input without permanently transferring ownership.
- `consultation_response`: return input to the role that requested consultation.
- `complete`: no next role is needed.
- `blocked`: runtime, tool, project, or external constraints prevent safe progress.

For `handoff`, `consultation_request`, and `consultation_response`, `transition.target_role` must match `handoff.target_role`. `consultation_response` must return to the role at the top of the runtime role stack.

## Human Approval Semantics

`forge_submit_step` persists the role output and moves the run to `awaiting_approval`. It must not advance to the next role.

While approval is pending, the human can:

- approve with `forge_approve`, allowing the runtime to apply the transition;
- request changes with `forge_request_changes`, which stores a `revision-request` artifact and keeps the same active role;
- answer clarification questions with `forge_answer` when the approved transition is `clarification_request`.

Approval is runtime state, not a role status. This keeps role outputs portable and prevents accidental handoffs before a person accepts the artifact.

## Role Expectations

- `context-router` produces `selected-role` and a handoff to the narrowest sufficient next role.
- `business-analyst` produces `requirements` or `clarification` and routes unresolved design/architecture/implementation work to the correct role.
- `ui-ux-designer` produces `ui-ux-handoff` and routes frontend implementation to `frontend-engineer`.
- `solution-architect` produces `technical-design` and splits actionable work by role.
- `backend-engineer` produces `backend-summary` after backend changes or a backend plan when blocked.
- `frontend-engineer` produces `frontend-summary` after frontend changes or a frontend plan when blocked.
- `qa-engineer` produces `qa-plan` before validation or `qa-validation` after checks.
- `bug-investigator` produces `bug-investigation` with reproduction status, evidence, cause confidence, and fix direction.
- `code-reviewer` produces `review-findings` with defect-first findings or explicit no-findings residual risk.
- `handoff-writer` produces `role-handoff` when known work must be packaged without creating new decisions.

## Project Context

Project facts come from the project path where Forge is invoked. The runtime captures supported agent instruction files, records their source paths, and passes that context to every role packet. Roles may use project facts from those files, but they should keep uncertain facts in assumptions or open questions.
