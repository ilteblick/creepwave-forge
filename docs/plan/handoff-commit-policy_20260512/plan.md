# Implementation Plan: Handoff Commit Policy

**Track ID:** handoff-commit-policy_20260512
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-12
**Status:** [ ] Not Started

## Overview

Make git durability match the workflow model: every state another person or role is expected to act on must be committed automatically. Keep commits scoped to Forge state and keep GitLab label sync as a recoverable side effect.

## Phase 1: Commit Policy Core <!-- checkpoint:cfc2557 -->

Centralize the post-state-change persistence pattern so each transfer command saves files, refreshes readmes/manifests, syncs labels, and commits in a predictable order.

### Tasks

- [x] Task 1.1: Update `runtime/forge-runner.mjs` to add a reusable helper for transfer-state commits after label sync, using existing `commitRunState()` and `runStateCommitPaths(run)`. <!-- sha:cd951df -->
- [x] Task 1.2: Update `runtime/forge-runner.mjs` `submitStep()` so pending approval state is committed after `syncLabelsForRun()`, and include `gitCommit` in the returned result. <!-- sha:d3ac41f -->
- [x] Task 1.3: Update `runtime/forge-runner.mjs` `continueRun()` so promotion from `awaiting_role_acceptance` to `awaiting_role_output` refreshes the active manifest, syncs labels, commits the started-role state, and returns `gitCommit`. <!-- sha:0775d88 -->
- [x] Task 1.4: Update `runtime/forge-runner.mjs` `requestChanges()` and `answerClarification()` so both commit their resumed-work states after label sync and return `gitCommit`. <!-- sha:cdb5f79 -->
- [x] Task 1.5: Add focused tests in `tests/forge-runner.test.mjs` proving `forge_submit_step`, `forge_continue`, `requestChanges`, and `answerClarification` create scoped commits in git worktrees and skip safely outside git. <!-- sha:544f56a -->

### Verification

- [x] `npm.cmd test -- tests/forge-runner.test.mjs tests/git-workflow.test.mjs`

## Phase 2: Receiver Rejection <!-- checkpoint:f490a89 -->

Add a first-class way for the next role to reject an accepted handoff before starting active work.

### Tasks

- [x] Task 2.1: Define the receiver rejection behavior in `runtime/forge-runner.mjs`: valid only in `awaiting_role_acceptance`, requires instructions, returns to the previous/sending role, stores a revision/return artifact, clears receiver wait state, syncs labels, and commits. <!-- sha:eac34ad -->
- [x] Task 2.2: Add an MCP tool in `scripts/forge-mcp-server.mjs`, for example `forge_reject_handoff`, with required `projectPath` and `instructions`, resolving `runId` from `forge/active-run.json`. <!-- sha:acf0757 -->
- [x] Task 2.3: Update `nextAllowedActions()` in `runtime/forge-runner.mjs` and status formatting in `scripts/forge-mcp-server.mjs` so `awaiting_role_acceptance` shows both `forge_continue` and the rejection command. <!-- sha:fc54ba1 -->
- [x] Task 2.4: Add tests in `tests/forge-runner.test.mjs` and `tests/mcp-server.test.mjs` for receiver rejection, invalid-status rejection, commit creation, and returned role packet for the sending role. <!-- sha:01c64e0 -->
- [x] Task 2.5: Add task-backed label tests in `tests/task-source-mcp.test.mjs` proving receiver rejection updates the issue from `forge:waiting-role` back to `forge:running` with the sending role label. <!-- sha:c465ab3 -->

### Verification

- [x] `npm.cmd test -- tests/forge-runner.test.mjs tests/mcp-server.test.mjs tests/task-source-mcp.test.mjs`

## Phase 3: MCP Output And Docs

Make the command surface impossible to misread during operator handoff.

### Tasks

- [x] Task 3.1: Update `scripts/forge-mcp-server.mjs` formatters so `forge_submit_step`, `forge_continue`, `forge_request_changes`, `forge_answer`, and receiver rejection output show commit status and tracker sync status. <!-- sha:4a3e7b4 -->
- [~] Task 3.2: Update `README.md` Human Approval Workflow, Git Handoff MVP, Revision Workflow, and Clarification Workflow sections to describe the new auto-commit invariant.
- [ ] Task 3.3: Update `README.md` status/command table to list every human command per run status: `forge_approve`, `forge_request_changes`, `forge_continue`, receiver rejection, `forge_answer`, `forge_publish`, `forge_sync_task`, and `forge_status`.
- [ ] Task 3.4: Add or adjust MCP snapshot-style assertions in `tests/mcp-server.test.mjs` so command output mentions commits and does not instruct manual `forge_publish` for the normal path.

### Verification

- [ ] `npm.cmd test -- tests/mcp-server.test.mjs tests/task-source-mcp.test.mjs`

## Phase 4: Docs & Cleanup

Tighten edge cases and remove obsolete guidance.

### Tasks

- [ ] Task 4.1: Review `runtime/forge-runner.mjs` for duplicate save/readme/manifest/sync/commit blocks and keep the smallest clear helper API.
- [ ] Task 4.2: Review `README.md` and existing docs under `docs/plan/approve-commit-mvp_20260510/` for wording that says request changes and clarification answers are local by default; update only active public docs, leaving historical specs intact.
- [ ] Task 4.3: Run full tests from `package.json` and fix any contract or runtime regressions.

### Verification

- [ ] `npm.cmd test`

## Final Verification

- [ ] All acceptance criteria from `spec.md` are met.
- [ ] Full test suite passes.
- [ ] README matches the actual command behavior.
- [ ] GitLab task-backed happy path can be described without requiring manual `forge_publish`.

## Context Handoff

### Session Intent

Implement durable Forge handoffs so every transfer-visible state is committed and the receiving role can reject an accepted handoff before starting.

### Key Files

- `runtime/forge-runner.mjs`
- `runtime/git-workflow.mjs`
- `runtime/forge-board-labels.mjs`
- `scripts/forge-mcp-server.mjs`
- `contracts/run-state.schema.json`
- `README.md`
- `tests/forge-runner.test.mjs`
- `tests/mcp-server.test.mjs`
- `tests/task-source-mcp.test.mjs`
- `tests/forge-board-labels.test.mjs`

### Decisions Made

- Normal transfer commands should auto-commit Forge state; `forge_publish` remains for manual retries and abnormal handoff needs.
- Commit after label sync so `tracker_sync` changes in `run.json` are included in the commit when possible.
- Receiver rejection belongs before `forge_continue`, while the run is still in `awaiting_role_acceptance`.

### Risks

- Label sync can fail after local state changes; tests must define whether the commit records `tracker_sync.status = failed` rather than blocking local durability.
- Receiver rejection needs a clear return-role source. Use the previous approved step/transition metadata rather than trusting free-form user input.
- More automatic commits may surprise operators if source-code changes are staged accidentally; keep using scoped Forge paths only.

---
_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
