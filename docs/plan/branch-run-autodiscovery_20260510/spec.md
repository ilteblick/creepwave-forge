# Specification: Branch Run Autodiscovery

**Track ID:** branch-run-autodiscovery_20260510
**Type:** Feature
**Created:** 2026-05-10
**Status:** Draft

## Summary

Complete the git handoff workflow by making a Forge run directly associated with a git branch and allowing MCP tools to continue the current branch's run without manually passing `runId`. The prior MVP added `forge/active-run.json`, approval commits, and explicit publish, but still requires humans or Codex to know the `runId` and does not create a run branch.

This track adds branch-per-run behavior on `forge_run`, branch-aware active-run validation, and optional `runId` resolution for continuation tools. After checkout/pull of a Forge branch, a new Codex window should be able to call `forge_status`, `forge_continue`, `forge_approve`, `forge_request_changes`, `forge_answer`, or `forge_publish` with only `projectPath` plus the action-specific fields.

## Acceptance Criteria

- [x] In a git worktree, `forge_run` creates and checks out a branch named `forge/run/<slug>-<runId>` where the branch name contains the generated `runId`.
- [x] `forge_run` writes `forge/active-run.json` on the new branch with `run_id`, `branch`, `status`, `current_role`, `step_index`, and `run_dir`.
- [x] `forge_run` creates an initial scoped Forge-state commit on the new branch so another device can pull the branch and discover the run.
- [x] Non-git project paths keep current behavior and do not fail because branch creation is unavailable.
- [x] `forge_status`, `forge_continue`, `forge_submit_step`, `forge_approve`, `forge_request_changes`, `forge_answer`, and `forge_publish` accept omitted `runId` and resolve it from `forge/active-run.json`.
- [x] When `runId` is omitted and no active manifest exists, MCP output clearly says the active run cannot be resolved from the current branch.
- [x] When `forge/active-run.json` names a different branch than the current git branch, branch-aware tools return a clear mismatch error before mutating state.
- [x] Tests cover branch creation, run ID in branch name, initial commit, omitted-runId tool resolution, missing manifest failure, and branch mismatch failure.

## Dependencies

- Completed track `approve-commit-mvp_20260510`.
- Existing `runtime/git-workflow.mjs` helper for git worktree detection, branch name reading, and scoped commits.
- Existing active-run manifest methods in `runtime/run-store.mjs`.
- Existing MCP tool definitions in `scripts/forge-mcp-server.mjs`.
- Node built-in test runner through `npm.cmd test`.

## Out of Scope

- Automatic push/pull.
- Remote branch discovery or run dashboards.
- Pull request creation.
- Conflict resolution beyond clear branch mismatch errors and normal git behavior.
- Committing source-code changes produced by role work.
- Supporting multiple active runs in one branch.

## Technical Notes

- Branch naming should be deterministic and filesystem/git-safe: slugify the prompt to a short lowercase segment, then append `runId`, for example `forge/run/build-filters-20260510123000-a1b2c3`.
- The branch must be created after `runId` exists. `startRun` currently creates the run before any git branch behavior, which is compatible with this flow.
- Initial run publish should stage only `forge/active-run.json` and `forge/runs/<runId>/`, matching the approval/publish scope from the prior MVP.
- MCP schemas currently require `runId` for all run-scoped tools. This track should make `runId` optional in schemas while retaining explicit `runId` support for scripts and tests.
- Runtime resolution should be centralized so every run-scoped operation uses the same manifest-loading and branch-validation rules.
