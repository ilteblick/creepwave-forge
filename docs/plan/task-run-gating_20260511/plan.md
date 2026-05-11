# Implementation Plan: Task Run Gating And Branch Naming

**Track ID:** task-run-gating_20260511
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-11
**Status:** [x] Complete

## Overview

Add a pre-run validation layer to task-backed starts and pass a task-derived branch seed into the existing branch creation path. Keep the ordinary prompt-backed runtime path stable.

## Phase 1: Pre-Run Task Gate <!-- checkpoint:6587e7e -->

Fail task-backed runs before any stateful side effect when the source task is missing or not marked for Forge.

### Tasks

- [x] Task 1.1: Add task marker validation in `runtime/forge-runner.mjs` inside `startRunFromTask`, after `fetchTaskFromSource` and before `startRun`, requiring `sourceTask.labels` to contain exact label `forge`. <!-- sha:476e006 -->
- [x] Task 1.2: Improve GitLab missing-task error clarity in `runtime/task-source-gitlab.mjs` or `runtime/task-source-client.mjs` so a 404 for issue fetch mentions the requested task id without leaking token/config secrets. <!-- sha:afbe03d -->
- [x] Task 1.3: Add MCP-level regression tests in `tests/task-source-mcp.test.mjs` for GitLab 404 and missing `forge` label, asserting no `forge/runs`, no `forge/active-run.json`, no label update request, and no branch change in a git temp project. <!-- sha:36a2c4f -->

### Verification

- [x] `node --test tests/task-source-mcp.test.mjs` fails before implementation and passes after the gate is added.

## Phase 2: Task-Derived Branch Names <!-- checkpoint:5aec41d -->

Reuse existing git helpers while letting task-backed runs choose a human-readable branch seed from task identity.

### Tasks

- [x] Task 2.1: Extend `runtime/git-workflow.mjs` with a task branch-name helper or optional `branchSlug`/`branchPrefix` input to `createRunBranchName`, preserving the current `forge/run/<prompt-slug>-<runId>` behavior by default. <!-- sha:c6abe22 -->
- [x] Task 2.2: Update `runtime/forge-runner.mjs` so `startRun` accepts an internal optional branch naming seed and `startRunFromTask` passes a seed built from `task-${sourceTask.id}-${sourceTask.title}`. <!-- sha:2cc4402 -->
- [x] Task 2.3: Add tests in `tests/git-workflow.test.mjs` for task branch slug formatting, numeric task id inclusion, title sanitization, length bounding, and unchanged prompt branch formatting. <!-- sha:2d292c0 -->
- [x] Task 2.4: Add a successful git-backed `forge_run_task` test in `tests/task-source-mcp.test.mjs` asserting the checked-out branch matches `forge/run/task-123-add-export-<runId>` or the implemented equivalent. <!-- sha:4f0aa06 -->

### Verification

- [x] `node --test tests/git-workflow.test.mjs tests/task-source-mcp.test.mjs` passes.

## Phase 3: Integration And Documentation <!-- checkpoint:ebe7122 -->

Document the new operator contract and run the focused plus full regression suite.

### Tasks

- [x] Task 3.1: Update `README.md` task-source workflow to say `forge_run_task` requires the tracker issue to already have label `forge`, fails before run creation otherwise, and names git branches from task id plus title. <!-- sha:ec3b179 -->
- [x] Task 3.2: Review `scripts/forge-mcp-server.mjs` output for whether the task-gate error is already clear through normal MCP error propagation; adjust only if the current message loses important task context. Existing MCP error propagation preserves `error.message`, so no formatter change was needed. <!-- sha:ce69c0a -->
- [x] Task 3.3: Run `npm test` and remove unused exports/imports or stale assertions introduced by the change. <!-- sha:e279e23 -->

### Verification

- [x] README matches actual branch format and label gate behavior.
- [x] `npm test` passes.

## Final Verification

- [x] All acceptance criteria from `spec.md` are covered by tests or documentation.
- [x] `node --test tests/task-source-mcp.test.mjs tests/git-workflow.test.mjs tests/forge-runner.test.mjs` passes.
- [x] `npm test` passes.
- [x] No token values are persisted in `forge/runs`, `forge/active-run.json`, MCP output, or test fixtures.

## Context Handoff

### Session Intent

Make `forge_run_task` refuse unmarked or missing tracker tasks before side effects and create task-recognizable run branches.

### Key Files

- `runtime/forge-runner.mjs`
- `runtime/git-workflow.mjs`
- `runtime/task-source-client.mjs`
- `runtime/task-source-gitlab.mjs`
- `scripts/forge-mcp-server.mjs`
- `tests/task-source-mcp.test.mjs`
- `tests/git-workflow.test.mjs`
- `tests/forge-runner.test.mjs`
- `README.md`

### Decisions Made

- Require exact marker label `forge` on task-backed starts; do not auto-add it before run start.
- Build task-backed branch names from task id plus title; leave plain prompt-backed branch naming unchanged.
- Keep gating in runtime (`startRunFromTask`) so all MCP callers get the same behavior.

### Risks

- If GitLab labels are treated case-insensitively by humans, exact matching may surprise users, but it aligns with the existing Forge label vocabulary.
- Branch name expectations need one canonical format in tests and README to avoid future drift.
- Historical note: this was superseded by `gitlab-sync-failfast_20260511`; task-backed starts now persist `task_source` during initial run creation so the first run commit includes task metadata.

---
_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
