# Implementation Plan: Approve Commit MVP

**Track ID:** approve-commit-mvp_20260510
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-10
**Status:** [x] Complete

## Overview

Introduce branch-resumable Forge run state with a conservative commit policy: auto-commit only after `forge_approve`, and add an explicit publish command for handoff without approval. Keep non-git projects and local revision loops working as they do today.

## Phase 1: Git State Primitives <!-- checkpoint:b24113c -->

Add small runtime helpers for active-run metadata and scoped git commits.

### Tasks

- [x] Task 1.1: Add `runtime/git-workflow.mjs` with helpers to detect git worktrees, read current branch, stage scoped Forge paths, and create commits with no-op behavior when there is nothing staged. <!-- sha:5e2b90f -->
- [x] Task 1.2: Add active-run manifest support in `runtime/run-store.mjs`, writing `forge/active-run.json` with `run_id`, `status`, `current_role`, `step_index`, `branch`, `run_dir`, and `updated_at`. <!-- sha:d22670f -->
- [x] Task 1.3: Update `.gitignore` so MVP run state can be committed deliberately; document or encode the intended tracked paths for `forge/active-run.json` and `forge/runs/<runId>/**`. <!-- sha:22d034b -->
- [x] Task 1.4: Add unit tests in `tests/run-store.test.mjs` for manifest writing and active run discovery from `forge/active-run.json`. <!-- sha:1c30ecc -->

### Verification

- [x] `npm.cmd run test:runtime -- --test-reporter=dot` passes for `run-store` coverage.
- [x] A temp project without `.git` can still create and load runs.

## Phase 2: Approve Commit Boundary <!-- checkpoint:bb1d645 -->

Wire git publishing into the approval transition only.

### Tasks

- [x] Task 2.1: Update `runtime/forge-runner.mjs` so `approveStep` refreshes the active-run manifest after applying the transition. <!-- sha:5b05ea8 -->
- [x] Task 2.2: Update `runtime/forge-runner.mjs` so `approveStep` creates a scoped commit after successful state persistence when the project is a git worktree. <!-- sha:d434978 -->
- [x] Task 2.3: Ensure `requestChanges` and `answerClarification` update local run files but do not call the git commit helper. <!-- sha:9553213 -->
- [x] Task 2.4: Add tests in `tests/forge-runner.test.mjs` that initialize a temp git repo and verify `approveStep` creates a commit while `requestChanges` and `answerClarification` do not. <!-- sha:b96bdbc -->

### Verification

- [x] Approval from `awaiting_approval` creates one commit containing Forge state.
- [x] Request changes and clarification answers remain local unless publish is used.
- [x] Existing approval, revision, clarification, consultation, completion, and blocked tests still pass.

## Phase 3: Explicit Publish Command <!-- checkpoint:6bc6fc4 -->

Add a user-controlled way to transfer pending state through git without approving it.

### Tasks

- [x] Task 3.1: Add `publishRunState` in `runtime/forge-runner.mjs` that writes the active-run manifest, refreshes README/timeline, and creates a scoped commit for the current run state. <!-- sha:10ae5e6 -->
- [x] Task 3.2: Add MCP tool definition and handler for `forge_publish` in `scripts/forge-mcp-server.mjs` with required `projectPath` and `runId`, plus optional `message`. <!-- sha:2fc0223 -->
- [x] Task 3.3: Update `formatStatusResult` in `scripts/forge-mcp-server.mjs` so `awaiting_approval`, `needs_clarification`, and `revision_requested` statuses mention `forge_publish` as an optional transfer action, not as a required next action. <!-- sha:39e06fb -->
- [x] Task 3.4: Add tests in `tests/mcp-server.test.mjs` for `forge_publish` argument validation and formatted output. <!-- sha:03ef926 -->

### Verification

- [x] `forge_publish` can commit pending approval state without applying the transition.
- [x] `forge_publish` does not replace the human-only approval gate.
- [x] Status output clearly separates required workflow actions from optional git transfer.

## Phase 4: Docs & Cleanup <!-- checkpoint:5f73534 -->

Document the MVP policy and keep the implementation small.

### Tasks

- [x] Task 4.1: Update `README.md` with the MVP git handoff policy: approve auto-commits, request changes/answers stay local, publish transfers pending state. <!-- sha:55de215 -->
- [x] Task 4.2: Update `contracts/run-state.schema.json` only if new persisted run fields are required; otherwise keep git metadata in `forge/active-run.json`. <!-- sha:5300f93 -->
- [x] Task 4.3: Remove unused helper code and keep git command errors explicit but non-fatal for non-git project paths. <!-- sha:3b162db -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot` passes.
- [x] README explains how a second Codex window discovers the current run from the branch manifest.

## Final Verification

- [x] All acceptance criteria from spec met.
- [x] Tests pass.
- [x] Non-git temp project behavior remains unchanged.
- [x] Git temp project approval produces a commit with only Forge state.
- [x] Documentation matches implemented command names and commit policy.

## Context Handoff

### Session Intent

Implement MVP git handoff for Creepwave Forge with auto-commit on approval and explicit publish for pending state transfer.

### Key Files

- `runtime/forge-runner.mjs`
- `runtime/run-store.mjs`
- `runtime/git-workflow.mjs`
- `scripts/forge-mcp-server.mjs`
- `contracts/run-state.schema.json`
- `.gitignore`
- `README.md`
- `tests/forge-runner.test.mjs`
- `tests/run-store.test.mjs`
- `tests/mcp-server.test.mjs`

### Decisions Made

- Auto-commit happens on `approve`, because approval is the accepted transition boundary.
- `request_changes` and `answer` remain local by default to avoid noisy commits during review/revision loops.
- `forge_publish` is explicit and exists for asynchronous handoff through git without approval.
- Active run discovery uses a small tracked manifest in the current branch instead of guessing from local run folders.
- Source-code changes are not automatically included in approval commits in this MVP.

### Risks

- `.gitignore` changes must avoid accidentally tracking unrelated local scratch runs.
- Git commit tests need isolated temp repos with local user config.
- If source-code changes are intentionally part of role output, this MVP will not commit them automatically; that should be a separate policy decision.
- Concurrent approvals across devices still rely on normal git push/pull conflict handling.

---
_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
