# Implementation Plan: Branch Run Autodiscovery

**Track ID:** branch-run-autodiscovery_20260510
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-10
**Status:** [x] Complete

## Overview

Add branch-per-run startup and manifest-based run resolution. Keep existing explicit `runId` calls working, but make branch checkout plus `forge/active-run.json` the default way a new Codex window understands which run to continue.

## Phase 1: Git Branch Primitives <!-- checkpoint:97bd26e -->

Extend the git helper layer with safe branch creation and prompt slugging.

### Tasks

- [x] Task 1.1: Add branch creation helpers to `runtime/git-workflow.mjs`: create/switch branch from current HEAD, validate git branch-safe names, and return skipped metadata for non-git projects. <!-- sha:5461d8a -->
- [x] Task 1.2: Add prompt-to-branch slug helper in `runtime/git-workflow.mjs` or a small adjacent runtime helper, producing bounded lowercase slugs suitable for `forge/run/<slug>-<runId>`. <!-- sha:7473b94 -->
- [x] Task 1.3: Add tests in `tests/git-workflow.test.mjs` for branch creation, non-git skip behavior, slug sanitization, and duplicate branch failure behavior. <!-- sha:6cf0030 -->

### Verification

- [x] `node --test tests/git-workflow.test.mjs --test-reporter=dot` passes.
- [x] Git helper returns clear errors for real git failures and non-fatal skipped results for non-git paths.

## Phase 2: Branch-Per-Run Startup <!-- checkpoint:dca6f63 -->

Wire branch creation and initial run-state commit into `forge_run`.

### Tasks

- [x] Task 2.1: Update `runtime/forge-runner.mjs` `startRun` to create `forge/run/<slug>-<runId>` after `RunStore.createRun` when project path is a git worktree. <!-- sha:c03eedd -->
- [x] Task 2.2: Update `runtime/forge-runner.mjs` `startRun` to refresh `forge/active-run.json` after branch creation and create an initial scoped Forge-state commit. <!-- sha:b2e5455 -->
- [x] Task 2.3: Preserve non-git behavior in `runtime/forge-runner.mjs` by skipping branch creation and initial commit when `projectPath` is not a git worktree. <!-- sha:4c3c4d3 -->
- [x] Task 2.4: Add tests in `tests/forge-runner.test.mjs` that verify git `startRun` checks out a branch containing `runId`, writes the branch to `forge/active-run.json`, and creates the initial commit. <!-- sha:066320d -->

### Verification

- [x] `node --test tests/forge-runner.test.mjs --test-reporter=dot` passes.
- [x] Existing non-git start/submit/approve runner tests still pass.

## Phase 3: Active Run Resolution <!-- checkpoint:8e5fd28 -->

Make runtime and MCP tools resolve omitted `runId` from `forge/active-run.json`.

### Tasks

- [x] Task 3.1: Add centralized `resolveRunId` and branch validation in `runtime/forge-runner.mjs` or `runtime/run-store.mjs`, reading `forge/active-run.json` when `runId` is omitted. <!-- sha:65a5677 -->
- [x] Task 3.2: Update `continueRun`, `submitStep`, `approveStep`, `requestChanges`, `answerClarification`, `getStatus`, and `publishRunState` in `runtime/forge-runner.mjs` to accept optional `runId` through the centralized resolver. <!-- sha:009c95f -->
- [x] Task 3.3: Update MCP input schemas and handlers in `scripts/forge-mcp-server.mjs` so `runId` is optional for run-scoped tools, while `projectPath` and action-specific fields remain required. <!-- sha:ca23fd2 -->
- [x] Task 3.4: Add tests in `tests/mcp-server.test.mjs` for `forge_status`, `forge_continue`, `forge_submit_step`, `forge_approve`, and `forge_publish` working without `runId` after `forge_run` on a git branch. <!-- sha:d5c1d98 -->

### Verification

- [x] Omitted `runId` resolves successfully from `forge/active-run.json`.
- [x] Explicit `runId` remains backward-compatible.
- [x] Human-only approval behavior remains unchanged.

## Phase 4: Error Handling And Docs <!-- checkpoint:264bce4 -->

Make branch mismatch/missing manifest behavior explicit and document the expected workflow.

### Tasks

- [x] Task 4.1: Add tests in `tests/mcp-server.test.mjs` or `tests/forge-runner.test.mjs` for omitted `runId` with missing `forge/active-run.json` and for manifest branch mismatch against current git branch. <!-- sha:7b91034 -->
- [x] Task 4.2: Update `README.md` with the branch-per-run workflow: `forge_run` creates `forge/run/<slug>-<runId>`, second windows continue from `forge/active-run.json`, and explicit `runId` remains supported. <!-- sha:645d589 -->
- [x] Task 4.3: Review `.codex-plugin/plugin.json` and MCP descriptions in `scripts/forge-mcp-server.mjs` for wording that still implies manual `runId` is always required; update descriptions where useful. <!-- sha:4b449d8 -->

### Verification

- [x] `npm.cmd test -- --test-reporter=dot` passes.
- [x] README explains how branch name and `runId` are linked.

## Final Verification

- [x] All acceptance criteria from spec met.
- [x] Tests pass.
- [x] Non-git temp project behavior remains unchanged.
- [x] Git temp project `forge_run` creates a branch whose name includes `runId`.
- [x] Omitted-runId MCP flow works from `forge/active-run.json`.
- [x] Documentation matches implemented command names and branch policy.

## Context Handoff

### Session Intent

Complete Forge git handoff by creating one branch per run and allowing run-scoped tools to autodiscover the active run from the current branch manifest.

### Key Files

- `runtime/git-workflow.mjs`
- `runtime/forge-runner.mjs`
- `runtime/run-store.mjs`
- `scripts/forge-mcp-server.mjs`
- `README.md`
- `.codex-plugin/plugin.json`
- `tests/git-workflow.test.mjs`
- `tests/forge-runner.test.mjs`
- `tests/mcp-server.test.mjs`

### Decisions Made

- Branch name format is `forge/run/<slug>-<runId>` so humans can recognize the task and tools can verify the run ID.
- `forge_run` should make the initial branch and initial Forge-state commit in git worktrees.
- `runId` stays supported but becomes optional for run-scoped tools.
- Active-run autodiscovery is branch-local and backed by `forge/active-run.json`.
- Branch mismatch should fail before mutating state when the caller relies on omitted `runId`.

### Risks

- Branch creation can fail if the branch already exists; tests should preserve a clear error rather than silently switching to an unrelated run.
- Dirty working trees may carry unrelated local changes onto the new branch. The implementation should stage only Forge state and document that source-code changes are outside this workflow.
- Existing tests that assume `runId` is required in MCP schemas will need intentional updates.
- If a branch is renamed manually, `forge/active-run.json` branch validation may require a user to update or republish the manifest.

---
_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
