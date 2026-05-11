# Implementation Plan: GitLab Sync Fail Fast

**Track ID:** gitlab-sync-failfast_20260511
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-11
**Status:** [x] Complete

## Overview

Add bounded GitLab HTTP operations, move task-backed tracker validation ahead of local run side effects, persist task metadata during initial run creation, and expose a retry-only label sync path. Keep prompt-only `forge_run` behavior unchanged.

## Phase 1: Bounded GitLab Client <!-- checkpoint:f4a385e -->

Introduce operation-aware timeouts at the GitLab integration boundary so MCP calls fail with a specific error before the client-level 120 second timeout.

### Tasks

- [x] Task 1.1: Add timeout helpers in `runtime/task-source-gitlab.mjs` for wrapped `fetchImpl` calls, including operation names such as `GET issue #123`, `GET issue #123 notes`, `POST label forge:running`, and `PUT issue #123 labels`. <!-- sha:e8c786f -->
- [x] Task 1.2: Update `fetchGitLabTask`, `fetchJson`, `fetchGitLabIssue`, `ensureGitLabLabels`, and `updateGitLabIssueLabels` in `runtime/task-source-gitlab.mjs` to use the timeout wrapper while preserving mocked `fetchImpl` compatibility. <!-- sha:599fa7c -->
- [x] Task 1.3: Add tests in `tests/task-source-gitlab.test.mjs` for timeout rejection, operation-specific error messages, existing HTTP error messages, and token redaction compatibility through `runtime/task-label-sync.mjs`. <!-- sha:7dac035 -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/task-source-gitlab.test.mjs tests/task-label-sync.test.mjs`

## Phase 2: Task Start Preflight <!-- checkpoint:b90f3cd -->

Ensure task-backed starts prove GitLab read/write readiness before creating local run artifacts, branches, or commits.

### Tasks

- [x] Task 2.1: Add a task label sync preflight function in `runtime/task-label-sync.mjs` or a new small runtime module that loads `.env.forge`, computes initial labels for an awaiting `context-router` run, ensures desired labels, and performs an idempotent issue label update before local run creation. <!-- sha:f9dd997 -->
- [x] Task 2.2: Refactor `runtime/forge-runner.mjs` so `startRunFromTask` calls task fetch, marker validation, and GitLab sync preflight before `startRun` or any git operation. <!-- sha:2ad6eb9 -->
- [x] Task 2.3: Update `tests/task-source-mcp.test.mjs` to assert GitLab label write timeout or 5xx during preflight leaves no `forge/runs`, no `forge/active-run.json`, no branch change, and no run commit. <!-- sha:c0085d4 -->
- [x] Task 2.4: Keep existing missing-task and missing-marker tests in `tests/task-source-mcp.test.mjs` passing without tracker label writes. <!-- sha:4c2689c -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/task-source-mcp.test.mjs`

## Phase 3: Task Metadata and Retry Sync <!-- checkpoint:3f596cd -->

Make task-backed state observable from the first persisted run state and add a manual recovery path for bounded post-start sync failures.

### Tasks

- [x] Task 3.1: Extend `RunStore.createRun` in `runtime/run-store.mjs` to accept optional `taskSource` metadata and persist it in `run.json` during initial creation. <!-- sha:cdb2d66 -->
- [x] Task 3.2: Update `runtime/forge-runner.mjs` so `startRunFromTask` passes `taskSourceMetadata(sourceTask)` into initial run creation instead of mutating `result.run.task_source` after the first commit. <!-- sha:57e116e -->
- [x] Task 3.3: Adjust `startRun` and `syncLabelsForRun` behavior in `runtime/forge-runner.mjs` so plain runs still report skipped sync, while task-backed post-start sync errors are bounded and returned or persisted as retryable tracker sync failure data rather than hanging. <!-- sha:07874e3 -->
- [x] Task 3.4: Add a retry-only runtime function in `runtime/forge-runner.mjs`, for example `syncTaskRunLabels`, that resolves an existing run and calls `syncTaskLabels` without advancing workflow state or committing unrelated role transitions. <!-- sha:a82fbf2 -->
- [x] Task 3.5: Add a new MCP tool in `scripts/forge-mcp-server.mjs`, for example `forge_sync_task`, with formatting that shows source, task id, desired labels, applied labels, skipped reason, or retryable error. <!-- sha:48c96e9 -->
- [x] Task 3.6: Add tests in `tests/run-store.test.mjs`, `tests/forge-runner.test.mjs`, and `tests/task-source-mcp.test.mjs` for task metadata in initial run state, first commit/state consistency, retry sync success, retry sync failure redaction, and unchanged plain `forge_run` no-op behavior. <!-- sha:cbf34ec -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/run-store.test.mjs tests/forge-runner.test.mjs tests/task-source-mcp.test.mjs`

## Phase 4: Docs & Cleanup <!-- checkpoint:6f7dc93 -->

Document the new fail-fast and recovery contract and remove any obsolete lifecycle assumptions.

### Tasks

- [x] Task 4.1: Update `README.md` to document GitLab request timeouts, fail-fast preflight requirements, retryable post-start sync failures, and the new `forge_sync_task` recovery command. <!-- sha:915a38b -->
- [x] Task 4.2: Update `contracts/run-state.schema.json` if tracker sync failure metadata is persisted on the run. <!-- sha:1b4fd27 -->
- [x] Task 4.3: Remove stale assumptions in comments or docs that imply task metadata is added only after run creation. <!-- sha:bb5cc4a -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/task-source-gitlab.test.mjs tests/task-label-sync.test.mjs tests/task-source-mcp.test.mjs tests/run-store.test.mjs tests/forge-runner.test.mjs`
- [x] `npm.cmd test`

## Final Verification

- [x] All acceptance criteria from `spec.md` are met.
- [x] Tests pass.
- [x] Linter clean or not applicable for this repository.
- [x] Build succeeds or not applicable for this repository.
- [x] Documentation is up to date.

## Context Handoff

### Session Intent

Prevent `forge_run_task` from hanging behind unbounded GitLab label sync and leaving partial local run state after MCP client timeout.

### Key Files

- `runtime/task-source-gitlab.mjs`
- `runtime/task-label-sync.mjs`
- `runtime/forge-runner.mjs`
- `runtime/run-store.mjs`
- `scripts/forge-mcp-server.mjs`
- `contracts/run-state.schema.json`
- `tests/task-source-gitlab.test.mjs`
- `tests/task-label-sync.test.mjs`
- `tests/task-source-mcp.test.mjs`
- `tests/run-store.test.mjs`
- `tests/forge-runner.test.mjs`
- `README.md`

### Decisions Made

- GitLab task starts should fail before local side effects when tracker read/write preflight cannot complete.
- GitLab HTTP calls need request-level deadlines and operation names rather than relying on the MCP caller timeout.
- Local and remote state cannot be made fully atomic, so post-start failures must be bounded, visible, and retryable.
- `task_source` belongs in initial run creation for task-backed starts, not as a later mutation after branch/commit.
- Plain `forge_run` must keep its existing no-config, no-fetch behavior.

### Risks

- Preflight label update may briefly set the issue to the initial running label before local run creation fails for an unrelated local git/filesystem reason.
- Timeout behavior in tests must account for custom mocked `fetchImpl` implementations that do not support AbortSignal unless the wrapper handles both native and mock cases cleanly.
- Persisting tracker sync failure metadata requires schema and formatter updates to avoid invalid run states.

---

_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
