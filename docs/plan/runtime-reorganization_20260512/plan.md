# Implementation Plan: Runtime Reorganization

**Track ID:** runtime-reorganization_20260512
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-12
**Status:** [ ] Not Started

## Overview

Reorganize `runtime/` by responsibility while keeping the existing Forge behavior and MCP surface stable. Start with low-risk file moves and import updates, then split `runtime/forge-runner.mjs` behind its existing public facade.

## Phase 1: Runtime Module Boundaries <!-- checkpoint:34b51c7 -->

Create the new folder layout and move cohesive modules without changing behavior.

### Tasks

- [x] Task 1.1: Move run-state modules from `runtime/artifact-store.mjs`, `runtime/run-store.mjs`, and `runtime/run-timeline-index.mjs` into `runtime/runs/`, then update imports in `runtime/forge-runner.mjs`, `tests/artifact-store.test.mjs`, `tests/run-store.test.mjs`, and `tests/run-timeline-index.test.mjs`. <!-- sha:b425381 -->
- [x] Task 1.2: Move task-board modules from `runtime/task-source-client.mjs`, `runtime/task-source-config.mjs`, `runtime/task-source-gitlab.mjs`, `runtime/task-prompt-builder.mjs`, `runtime/task-label-sync.mjs`, and `runtime/forge-board-labels.mjs` into `runtime/tasks/`, then update imports in `runtime/forge-runner.mjs`, `scripts/forge-mcp-server.mjs`, and `tests/task-*.test.mjs`. <!-- sha:d68029b -->
- [x] Task 1.3: Move core workflow helpers from `runtime/contract-loader.mjs`, `runtime/prompt-builder.mjs`, `runtime/role-context-selector.mjs`, `runtime/skill-registry.mjs`, `runtime/step-validator.mjs`, and `runtime/transition-policy.mjs` into `runtime/core/`, then update imports in runner, tests, and dependent moved modules. <!-- sha:8dda780 -->
- [x] Task 1.4: Move `runtime/project-context-loader.mjs` into `runtime/context/` and `runtime/git-workflow.mjs` into `runtime/git/`, then update imports in `runtime/forge-runner.mjs`, `tests/project-context-loader.test.mjs`, `tests/git-workflow.test.mjs`, and any task-source MCP tests that initialize git behavior. <!-- sha:73c5df2 -->
- [x] Task 1.5: Add compatibility re-export files at the old top-level runtime paths that are imported outside `runtime/`, at minimum `runtime/forge-board-labels.mjs`, and any others needed to keep public or test-facing imports intentionally stable. <!-- sha:e84572a -->

### Verification

- [x] Run `npm.cmd run test:core`.
- [x] Run `npm.cmd run test:board:mock`.
- [x] Confirm `rg "../runtime/" scripts tests README.md` shows only intentional public import paths or updated paths.

## Phase 2: Runner Decomposition

Reduce `runtime/forge-runner.mjs` by extracting internal workflow slices while keeping the public runner API unchanged.

### Tasks

- [x] Task 2.1: Create `runtime/runner/persistence.mjs` for internal helpers currently in `runtime/forge-runner.mjs`: `refreshRunReadme`, `refreshActiveRunManifest`, `createRunBranch`, `commitRunState`, `persistTransferState`, and `runStateCommitPaths`. <!-- sha:4b66026 -->
- [x] Task 2.2: Create `runtime/runner/status.mjs` for `buildStatus`, `nextAllowedActions`, and status-related helper logic, then update `runtime/forge-runner.mjs` to delegate `getStatus` without changing the returned object shape. <!-- sha:d33ea97 -->
- [x] Task 2.3: Create `runtime/runner/task-run.mjs` for task-backed helpers currently in `runtime/forge-runner.mjs`: `taskSourceMetadata`, `taskBranchSlug`, `assertForgeTaskLabel`, `syncLabelsForRun`, and the internal flow used by `startRunFromTask` and `syncTaskRunLabels`. <!-- sha:2f77e9e -->
- [x] Task 2.4: Create `runtime/runner/step-actions.mjs` for shared pending-step helpers such as `loadPendingStep`, `loadReferencedArtifacts`, `loadTextArtifacts`, `clearPendingApproval`, and transition application logic used by submit, approve, revision, rejection, and clarification paths. <!-- sha:f566ac2 -->
- [x] Task 2.5: Keep `runtime/forge-runner.mjs` as the facade exporting the same functions, with orchestration code only where it keeps the flow easier to read than another abstraction. <!-- sha:7929460 -->

### Verification

- [x] Run `node --test tests/forge-runner.test.mjs`.
- [x] Run `node --test tests/mcp-server.test.mjs tests/task-source-mcp.test.mjs`.
- [x] Compare the exported names from `runtime/forge-runner.mjs` before and after decomposition using `rg "^export async function|^export function" runtime/forge-runner.mjs`.

## Phase 3: Import Hygiene And Regression Guardrails

Tighten import conventions after the physical reorganization.

### Tasks

- [ ] Task 3.1: Review `runtime/` imports with `rg "^import .*\\.\\./|from './|from \"./" runtime` and normalize paths so each subdirectory imports through the nearest clear boundary instead of reaching across unrelated folders when avoidable.
- [ ] Task 3.2: Add or adjust focused tests only where the refactor exposes a missing guard, prioritizing `tests/forge-runner.test.mjs`, `tests/mcp-server.test.mjs`, `tests/task-source-mcp.test.mjs`, and moved module tests.
- [ ] Task 3.3: Run the layered scripts from `package.json`: `npm.cmd run test:core`, `npm.cmd run test:mcp`, `npm.cmd run test:board:mock`, and `npm.cmd test`.

### Verification

- [ ] Full `npm.cmd test` passes.
- [ ] No moved module leaves a stale top-level implementation file behind; top-level runtime files are either public facades or intentional compatibility shims.
- [ ] No behavior-oriented test expectation changes were made solely to accommodate the refactor.

## Phase 4: Docs & Cleanup

Update project documentation and remove refactor debris.

### Tasks

- [ ] Task 4.1: Update `README.md` Repository Shape so `runtime/` describes `core/`, `runs/`, `tasks/`, `context/`, `git/`, `runner/`, and the public `forge-runner.mjs` facade.
- [ ] Task 4.2: Update any README sections that reference direct runtime file paths such as `runtime/forge-board-labels.mjs`, `runtime/task-source-config.mjs`, or `runtime/task-source-gitlab.mjs` if those references should now point to subdirectories.
- [ ] Task 4.3: Remove unused imports, stale compatibility shims that are not needed, and any temporary notes introduced during the refactor.

### Verification

- [ ] README matches the final runtime layout.
- [ ] `git status --short` shows only intentional refactor, test, and documentation changes.
- [ ] Final `npm.cmd test` passes.

## Final Verification

- [ ] All acceptance criteria from spec met.
- [ ] Tests pass.
- [ ] Linter clean, if a lint command exists.
- [ ] Build succeeds, if a build command exists.
- [ ] Documentation up to date.

## Context Handoff

_Summary for /build to load at session start - keeps context compact._

### Session Intent

Reorganize the growing flat `runtime/` directory into responsibility-based subdirectories and reduce `forge-runner.mjs` while preserving Forge behavior.

### Key Files

- `runtime/forge-runner.mjs`
- `runtime/forge-board-labels.mjs`
- `runtime/task-source-client.mjs`
- `runtime/task-source-config.mjs`
- `runtime/task-source-gitlab.mjs`
- `runtime/task-prompt-builder.mjs`
- `runtime/task-label-sync.mjs`
- `runtime/artifact-store.mjs`
- `runtime/run-store.mjs`
- `runtime/run-timeline-index.mjs`
- `runtime/contract-loader.mjs`
- `runtime/prompt-builder.mjs`
- `runtime/role-context-selector.mjs`
- `runtime/skill-registry.mjs`
- `runtime/step-validator.mjs`
- `runtime/transition-policy.mjs`
- `runtime/project-context-loader.mjs`
- `runtime/git-workflow.mjs`
- `scripts/forge-mcp-server.mjs`
- `tests/*.test.mjs`
- `README.md`

### Decisions Made

- Keep `runtime/forge-runner.mjs` as the public facade because MCP and tests already depend on that entrypoint.
- Use responsibility-based folders rather than a generic `utils/` split: `core/`, `runs/`, `tasks/`, `context/`, `git/`, and `runner/`.
- Preserve compatibility shims for old top-level runtime paths only where they reduce churn or protect a public import surface.
- Split runner internals after move-only structure changes, so import errors and behavior regressions are easier to isolate.

### Risks

- Relative ESM import updates are mechanical but broad; missing one will fail fast at test startup.
- `forge-runner.mjs` contains workflow-sensitive state transitions, git commits, tracker sync, and active-run manifest updates, so decomposition must avoid behavior changes.
- Compatibility shims can hide stale architecture if overused; keep them intentional and documented.
- Task-backed flows are regression-sensitive because they combine GitLab fetch, label sync, local run state, branch creation, and commits.

---

_Generated by /plan. Tasks marked [~] in progress and [x] complete by /build._
