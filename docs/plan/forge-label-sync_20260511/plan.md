# Implementation Plan: Forge Label Sync

**Track ID:** forge-label-sync_20260511
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-11
**Status:** [x] Complete

## Overview

Add tracker write-back for task-backed Forge runs by persisting non-secret task metadata, implementing GitLab label ensure/update operations, and calling sync after every runtime state change. Keep prompt-only `forge_run` completely read/write independent from task-source config.

## Phase 1: Persist Task Source And Label Diff Contract <!-- checkpoint:ddf6ebb -->

Store enough non-secret task identity to synchronize labels after the initial `forge_run_task` call and define a reusable diff for Forge-owned labels.

### Tasks

- [x] Task 1.1: Update `contracts/run-state.schema.json` and `runtime/run-store.mjs` usage expectations to allow an optional non-secret `task_source` object on runs with `type`, `task_id`, `task_url`, and `source_url`. <!-- sha:0e20517 -->
- [x] Task 1.2: Historical implementation: `startRunFromTask` persisted `run.task_source` immediately after `startRun`; this was later superseded by `gitlab-sync-failfast_20260511`, which persists task metadata during initial run creation. <!-- sha:b26067d -->
- [x] Task 1.3: Extend `runtime/forge-board-labels.mjs` with helpers for Forge-owned labels and final-label computation, for example `isForgeOwnedLabel(label)` and `mergeForgeLabels(currentLabels, desiredLabels)`. <!-- sha:5ba3512 -->
- [x] Task 1.4: Add tests in `tests/run-store.test.mjs`, `tests/forge-runner.test.mjs`, and `tests/forge-board-labels.test.mjs` for persisted task metadata, token non-persistence, stale `forge:*`/`forge-role:*` removal, and unrelated label preservation. <!-- sha:96fff40 -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/run-store.test.mjs tests/forge-runner.test.mjs tests/forge-board-labels.test.mjs`

## Phase 2: GitLab Label Write Client <!-- checkpoint:3494c8b -->

Add GitLab write operations behind the existing task-source boundary, with idempotent label creation and clear non-secret errors.

### Tasks

- [x] Task 2.1: Extend `runtime/task-source-gitlab.mjs` with `ensureGitLabLabels`, `updateGitLabIssueLabels`, and `syncGitLabTaskLabels`, reusing `parseGitLabProjectUrl` and `normalizeGitLabIssueIid`. <!-- sha:ca62522 -->
- [x] Task 2.2: Add `runtime/task-label-sync.mjs` that loads `.env.forge`, no-ops for runs without `task_source`, dispatches by source type, computes desired labels via `labelsForRun(run)`, and returns a concise sync summary. <!-- sha:e76b0ca -->
- [x] Task 2.3: Add tests in `tests/task-source-gitlab.test.mjs` and `tests/task-label-sync.test.mjs` using mocked `fetchImpl` for creating missing labels, ignoring already-existing label creation conflicts, preserving unrelated labels, removing stale Forge labels, and redacting tokens from errors. <!-- sha:8ce0f65 -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/task-source-gitlab.test.mjs tests/task-label-sync.test.mjs`

## Phase 3: Runtime Integration <!-- checkpoint:75f4254 -->

Call label sync at each state transition so the board always reflects the current Forge state.

### Tasks

- [x] Task 3.1: Update `runtime/forge-runner.mjs` to call task label sync after `startRunFromTask`, `submitStep`, `approveStep`, `requestChanges`, `answerClarification`, and `publishRunState` when the run is task-backed. <!-- sha:2bd45a4 -->
- [x] Task 3.2: Include label sync summaries in returned runtime results and update `scripts/forge-mcp-server.mjs` formatting to show applied labels and whether tracker sync was skipped or completed. <!-- sha:cca8f9d -->
- [x] Task 3.3: Add MCP/runtime tests in `tests/task-source-mcp.test.mjs` or `tests/forge-runner.test.mjs` that simulate a task run through running, waiting approval, next role, needs input, and complete states while asserting issue label updates after each transition. <!-- sha:bf322bd -->
- [x] Task 3.4: Add regression tests proving plain `forge_run` works without `.env.forge` and never attempts tracker label writes. <!-- sha:c8eb16e -->

### Verification

- [x] `npm.cmd run test:runtime -- --test-reporter=dot`
- [x] `npm.cmd test -- --test-reporter=dot tests/task-source-mcp.test.mjs tests/forge-runner.test.mjs`

## Phase 4: Docs & Cleanup <!-- checkpoint:50c2846 -->

Document the write behavior and verify the full suite.

### Tasks

- [x] Task 4.1: Update `README.md` to explain that task-backed runs now write labels, create missing labels, require tracker write permissions, and leave prompt-only `forge_run` unchanged. <!-- sha:93ef5cb -->
- [x] Task 4.2: Update `docs/plan/forge-task-source_20260510/spec.md` or README notes only if needed to clarify that the previous read-only behavior has been superseded by this track. <!-- sha:f3caa9b -->
- [x] Task 4.3: Run full tests and manually scan run artifacts/MCP output for token leakage, especially `run.task_source`, sync summaries, and error paths. <!-- sha:3ebc982 -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot`
- [x] Manual scan confirms `TASK_SOURCE_TOKEN` is never persisted or printed.

## Final Verification

- [x] All acceptance criteria from spec met
- [x] Tests pass
- [x] Linter clean where applicable (no lint script configured)
- [x] Documentation up to date
- [x] Existing prompt-only Forge flow unchanged

## Context Handoff

### Session Intent

Implement automatic tracker label synchronization for task-backed Forge runs so each issue has exactly `forge`, one current status label, and one current role label when applicable.

### Key Files

- `contracts/run-state.schema.json`
- `runtime/forge-board-labels.mjs`
- `runtime/forge-runner.mjs`
- `runtime/run-store.mjs`
- `runtime/task-label-sync.mjs`
- `runtime/task-source-config.mjs`
- `runtime/task-source-gitlab.mjs`
- `scripts/forge-mcp-server.mjs`
- `README.md`
- `tests/forge-board-labels.test.mjs`
- `tests/forge-runner.test.mjs`
- `tests/run-store.test.mjs`
- `tests/task-label-sync.test.mjs`
- `tests/task-source-gitlab.test.mjs`
- `tests/task-source-mcp.test.mjs`

### Decisions Made

- Write-back applies only to task-backed runs with persisted non-secret `run.task_source`.
- Prompt-only `forge_run` remains independent of `.env.forge` and does not write labels.
- GitLab is the only write implementation in this track.
- Label sync owns only `forge`, `forge:*`, and `forge-role:*`; unrelated tracker labels are preserved.
- Missing labels should be created automatically before issue update.
- `forge:ready` is replaced by `forge:running` once Forge starts.

### Risks

- GitLab label update APIs replace the full labels list, so stale-label cleanup must preserve unrelated labels exactly.
- Self-hosted GitLab URL prefixes must continue to work with both read and write endpoints.
- Sync failures after local run state changes can leave board state stale; error messages should be explicit enough for retry.
- Token leakage risk increases with write errors; tests must cover thrown error paths and formatted MCP output.

---
_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
