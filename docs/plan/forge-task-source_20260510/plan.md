# Implementation Plan: Forge Task Source MVP

**Track ID:** forge-task-source_20260510
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-10
**Status:** [x] Complete

## Overview

Add a project-local task-source entrypoint around the existing Forge runtime. The implementation should keep the run lifecycle unchanged and layer ticket loading plus board-label reporting around `startRun`, `getStatus`, and the existing role/status contracts.

## Phase 1: Config And Label Contract <!-- checkpoint:1adaca3 -->

Define the local `.env.forge` contract and the deterministic label mapping before wiring tracker calls.

### Tasks

- [x] Task 1.1: Add `.env.forge` to [`.gitignore`](../../../.gitignore) so task-source credentials are not committed. <!-- sha:4669ab0 -->
- [x] Task 1.2: Add `runtime/task-source-config.mjs` to load `<projectPath>/.env.forge`, parse simple `KEY=value` lines, require `TASK_SOURCE_TYPE`, `TASK_SOURCE_URL`, and `TASK_SOURCE_TOKEN`, and redact token values from thrown or returned diagnostic objects. <!-- sha:25b7f69 -->
- [x] Task 1.3: Add `runtime/forge-board-labels.mjs` with marker, status, and role label constants plus `labelsForRun(run)` and `statusLabelForRunStatus(status)` helpers matching the spec mapping. <!-- sha:fc8e293 -->
- [x] Task 1.4: Add `tests/task-source-config.test.mjs` and `tests/forge-board-labels.test.mjs` for valid config, missing file, missing keys, token redaction, every internal status mapping, and every known role label. <!-- sha:62be147 -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/task-source-config.test.mjs tests/forge-board-labels.test.mjs`

## Phase 2: Task Source Fetch And Prompt Building <!-- checkpoint:30ee52f -->

Fetch one external ticket and turn it into the same kind of user prompt Forge already understands.

### Tasks

- [x] Task 2.1: Add `runtime/task-source-client.mjs` with `fetchTaskFromSource({ projectPath, taskId, fetchImpl })`, dispatching by `TASK_SOURCE_TYPE` and returning a normalized task object without exposing tokens. <!-- sha:f5d37dc -->
- [x] Task 2.2: Add `runtime/task-source-gitlab.mjs` for the first supported source: derive GitLab API base and encoded project path from `TASK_SOURCE_URL`, fetch issue details by iid, and fetch notes/comments when available. <!-- sha:b134b84 -->
- [x] Task 2.3: Add `runtime/task-prompt-builder.mjs` to build a Forge prompt containing source type, source URL, task id, title, description, labels, comments, and a clear instruction to route through Forge normally. <!-- sha:a4803c6 -->
- [x] Task 2.4: Add `tests/task-source-gitlab.test.mjs` and `tests/task-prompt-builder.test.mjs` using mocked `fetchImpl`, covering URL parsing, issue id handling for `#123` and `123`, comment inclusion, and token non-leakage. <!-- sha:b49e29d -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot tests/task-source-gitlab.test.mjs tests/task-prompt-builder.test.mjs`

## Phase 3: MCP Entrypoint And Status Display <!-- checkpoint:45d67c4 -->

Expose the simple command surface and make current board labels visible in Forge outputs.

### Tasks

- [x] Task 3.1: Update `runtime/forge-runner.mjs` with `startRunFromTask({ projectPath, taskId })`, which fetches the source task, builds the prompt, calls the existing `startRun`, and records non-secret task metadata in the run when useful. <!-- sha:982a6f5 -->
- [x] Task 3.2: Update `scripts/forge-mcp-server.mjs` to add a `forge_run_task` tool with required `projectPath` and `taskId`, returning the normal first role packet plus source task summary and recommended labels. <!-- sha:eaafff1 -->
- [x] Task 3.3: Update `formatStatusResult` in `scripts/forge-mcp-server.mjs` so `forge_status` includes the recommended board labels from `runtime/forge-board-labels.mjs`. <!-- sha:401935c -->
- [x] Task 3.4: Add tests in `tests/mcp-server.test.mjs` or a focused `tests/task-source-mcp.test.mjs` for `forge_run_task`, missing `.env.forge`, mocked task fetch success, and status output showing `forge:running`, `forge:waiting-approval`, `forge:needs-input`, and `forge:done`. <!-- sha:20c2bca -->

### Verification

- [x] `npm.cmd run test:runtime -- --test-reporter=dot`

## Phase 4: Docs & Cleanup <!-- checkpoint:0525673 -->

Document the workflow and keep the implementation small enough to remain a Forge entrypoint, not a separate adapter system.

### Tasks

- [x] Task 4.1: Update [README.md](../../../README.md) with the `.env.forge` format, the `forge_run_task` workflow, the board-label vocabulary, and the internal status-to-label mapping. <!-- sha:35e53ab -->
- [x] Task 4.2: Update `contracts/artifacts.md` only if task-source metadata is persisted in run state or artifacts; otherwise explicitly leave runtime artifacts unchanged. <!-- sha:020cdbd -->
- [x] Task 4.3: Run full tests, remove unused exports/imports, and check that no token value is written into `forge/runs`, `forge/active-run.json`, MCP output, or test snapshots. <!-- sha:433bdab -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot`
- [x] Manual scan confirms `.env.forge` is ignored and tokens are not persisted.

## Final Verification

- [x] All acceptance criteria from spec met
- [x] Tests pass
- [x] Linter clean where applicable (no lint script configured)
- [x] Documentation up to date
- [x] Existing `forge_run`, `forge_continue`, `forge_submit_step`, `forge_approve`, `forge_request_changes`, `forge_answer`, `forge_status`, and `forge_publish` behavior unchanged

## Context Handoff

### Session Intent

Implement a minimal tracker-ticket entrypoint for Forge using project-local `.env.forge` and board labels that reflect current Forge state.

### Key Files

- `.gitignore`
- `README.md`
- `contracts/artifacts.md`
- `runtime/task-source-config.mjs`
- `runtime/task-source-client.mjs`
- `runtime/task-source-gitlab.mjs`
- `runtime/task-prompt-builder.mjs`
- `runtime/forge-board-labels.mjs`
- `runtime/forge-runner.mjs`
- `scripts/forge-mcp-server.mjs`
- `tests/task-source-config.test.mjs`
- `tests/task-source-gitlab.test.mjs`
- `tests/task-prompt-builder.test.mjs`
- `tests/forge-board-labels.test.mjs`
- `tests/task-source-mcp.test.mjs` or `tests/mcp-server.test.mjs`

### Decisions Made

- Use `.env.forge` with `TASK_SOURCE_TYPE`, `TASK_SOURCE_URL`, and `TASK_SOURCE_TOKEN` as the per-project local contract.
- Do not introduce project adapters in this track; add only thin source-client code needed for task fetching.
- Start with GitLab support because it is the known current board, but keep config names tracker-neutral.
- Keep tracker tokens out of Forge persisted state, role prompts, and MCP output.
- Expose recommended board labels rather than requiring label mutation in the first implementation.

### Risks

- GitLab self-hosted deployments can live under a URL prefix; URL parsing must preserve the API prefix when present.
- Different trackers use different task id formats; normalize only the currently implemented source and fail clearly for unsupported sources.
- Automatic label mutation would require wider token scopes; this MVP should avoid silently needing write permissions.
- Prompt construction can leak secrets if config objects are interpolated directly; tests must cover token non-leakage.

---
_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
