# Implementation Plan: Approval Handoff Gate

**Track ID:** approval-handoff-gate_20260511
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-11
**Status:** [x] Complete

## Overview

Split approval from next-role execution by adding a persisted receiver-side waiting state. `forge_approve` will accept the previous role output and prepare the next role handoff; `forge_continue` will be the explicit action that starts or resumes the next role packet.

## Phase 1: State Model <!-- checkpoint:c9163ed -->

Add the new workflow state and make status/label surfaces understand it before changing transition behavior.

### Tasks

- [x] Task 1.1: Add `awaiting_role_acceptance` to `contracts/run-state.schema.json` and update contract tests in `tests/contract-validator.test.mjs`. <!-- sha:3cd4223 -->
- [x] Task 1.2: Update `runtime/forge-board-labels.mjs` and `tests/forge-board-labels.test.mjs` with a distinct label for the new state, preferably `forge:waiting-role`, while preserving current labels for approval, clarification, blocked, and complete. <!-- sha:00830da -->
- [x] Task 1.3: Update status action policy in `runtime/forge-runner.mjs` so `awaiting_role_acceptance` allows `forge_continue` and does not allow `forge_submit_step`. <!-- sha:d7b5a68 -->

### Verification

- [x] Run `npm.cmd run test:contracts -- --test-reporter=dot`.
- [x] Run focused label and transition tests with `node --test tests/forge-board-labels.test.mjs tests/contract-validator.test.mjs`.

## Phase 2: Approval And Continue Flow <!-- checkpoint:aa3bcd4 -->

Change runtime behavior so approval prepares a handoff and explicit continue starts the target role.

### Tasks

- [x] Task 2.1: Refactor `applyApprovedTransition()` in `runtime/forge-runner.mjs` so `handoff`, `consultation_request`, and `consultation_response` set `current_role`, `previous_handoff`, `previous_transition`, and any `role_stack` changes, then set status to `awaiting_role_acceptance` instead of `awaiting_role_output`. <!-- sha:4326b94 -->
- [x] Task 2.2: Keep `clarification_request`, `complete`, and `blocked` branches in `runtime/forge-runner.mjs` on their current statuses, with focused tests proving they do not pass through `awaiting_role_acceptance`. <!-- sha:ac7ab19 -->
- [x] Task 2.3: Change `approveStep()` in `runtime/forge-runner.mjs` so it never builds or returns a role packet for `awaiting_role_acceptance`; it should commit and sync the accepted handoff state only. <!-- sha:e5d7c2a -->
- [x] Task 2.4: Extend `continueRun()` in `runtime/forge-runner.mjs` so when the run is `awaiting_role_acceptance` with `current_role`, it moves to `awaiting_role_output`, saves the run, refreshes README/active manifest as needed, syncs labels, and returns the role packet. <!-- sha:d96d190 -->
- [x] Task 2.5: Update `tests/forge-runner.test.mjs` for handoff, consultation request, consultation response, clarification, completion, and git commit behavior under the new two-step approval/continue flow. <!-- sha:d279955 -->

### Verification

- [x] Run `node --test tests/forge-runner.test.mjs`.
- [x] Inspect generated run README in a test fixture or manual run to confirm status changes are chronological and readable.

## Phase 3: MCP And Task Board Surfaces <!-- checkpoint:aa3bcd4 -->

Make tool output and task-backed label sync match the new human workflow.

### Tasks

- [x] Task 3.1: Update `scripts/forge-mcp-server.mjs` so `forge_approve` formats non-terminal handoff approval as an accepted handoff result, not the old immediate role-packet formatter. <!-- sha:a260e45 -->
- [x] Task 3.2: Update `formatStatusResult()` and `formatRolePacketResult()` in `scripts/forge-mcp-server.mjs` so `awaiting_role_acceptance` tells the human or next role to inspect and call `forge_continue`, while `awaiting_role_output` remains the executable role state. <!-- sha:a260e45 -->
- [x] Task 3.3: Update `tests/mcp-server.test.mjs` so approval output contains no `Step 2` role packet, and a separate `forge_continue` call returns the next role packet. <!-- sha:a260e45 -->
- [x] Task 3.4: Update task-backed flow expectations in `tests/task-source-mcp.test.mjs`, `tests/task-label-sync.test.mjs`, and any GitLab label tests touched by the new `forge:waiting-role` mapping. <!-- sha:3085074 -->

### Verification

- [x] Run `node --test tests/mcp-server.test.mjs tests/task-source-mcp.test.mjs tests/task-label-sync.test.mjs tests/task-source-gitlab.test.mjs`.
- [x] Confirm MCP text does not instruct Codex to execute the next role from an approval result.

## Phase 4: Docs & Cleanup <!-- checkpoint:f70d091 -->

Document the corrected workflow and run the full suite.

### Tasks

- [x] Task 4.1: Update `README.md` sections for MCP tools, board labels, internal status mapping, Human Approval Workflow, and Git Handoff MVP to describe approval as handoff acceptance and `forge_continue` as role start. <!-- sha:027e316 -->
- [x] Task 4.2: Search for stale wording in `runtime/prompt-builder.mjs`, `scripts/forge-mcp-server.mjs`, `README.md`, and `docs/plan/**` that implies approval executes the next role, then update only current product docs and runtime prompts. <!-- sha:d724f53 -->
- [x] Task 4.3: Remove dead code or outdated helper names introduced by the refactor in `runtime/forge-runner.mjs` and `scripts/forge-mcp-server.mjs`. <!-- sha:0534eb6 -->

### Verification

- [x] Run `npm.cmd test -- --test-reporter=dot`.
- [x] Run `rg -n "approve.*execute|Step Approved|awaiting_role_acceptance|forge:waiting-role|forge:running" README.md runtime scripts tests contracts` and verify wording/status mappings are intentional.

## Final Verification

- [x] All acceptance criteria from spec met.
- [x] Tests pass.
- [x] Linter clean where applicable.
- [x] Build succeeds where applicable.
- [x] Documentation up to date.

## Context Handoff

_Summary for /build to load at session start - keeps context compact._

### Session Intent

Make Forge approval accept the previous role output and prepare handoff, while `forge_continue` explicitly starts the next role.

### Key Files

- `contracts/run-state.schema.json`
- `runtime/forge-runner.mjs`
- `runtime/forge-board-labels.mjs`
- `scripts/forge-mcp-server.mjs`
- `tests/forge-runner.test.mjs`
- `tests/mcp-server.test.mjs`
- `tests/task-source-mcp.test.mjs`
- `tests/task-label-sync.test.mjs`
- `tests/task-source-gitlab.test.mjs`
- `tests/forge-board-labels.test.mjs`
- `tests/contract-validator.test.mjs`
- `README.md`

### Decisions Made

- Use a distinct persisted state instead of overloading `awaiting_role_output`, because this preserves the human distinction between accepted handoff and started role work.
- Reuse `forge_continue` as the explicit next-role start action instead of adding a new MCP tool, because `forge_continue` already represents "return the next active role packet".
- Use a distinct board label for the new state so task boards can show that work is waiting on the receiving role, not actively running.

### Risks

- Existing tests and docs assume `forge_approve` returns the next role packet; all MCP and task-backed tests must be updated together to avoid inconsistent workflow messages.
- If label names are already used in a downstream board, adding `forge:waiting-role` requires GitLab label creation permissions like the other Forge labels.
- `forge_continue` will now mutate state when accepting a handoff, so tests should cover idempotent behavior and commit/manifest expectations.

---
_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
