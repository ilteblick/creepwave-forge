# Specification: Approve Commit MVP

**Track ID:** approve-commit-mvp_20260510
**Type:** Feature
**Created:** 2026-05-10
**Status:** Draft

## Summary

Add MVP git handoff behavior to Creepwave Forge so a run can be continued from another Codex window or device after a human-approved transition. The MVP keeps local review/revision loops lightweight: only accepted or explicitly published run state is committed, not every state mutation.

The core behavior is: `forge_approve` applies the approved transition, updates run files, writes a tracked active-run manifest, stages Forge run state, and creates a git commit. `forge_request_changes` and `forge_answer` remain local by default. A separate publish command can commit current pending state when a human wants to transfer feedback or an unapproved pending step through git.

## Acceptance Criteria

- [x] `forge_approve` creates a git commit after a successful transition when the project path is inside a git worktree.
- [x] The approval commit includes Forge state needed to resume the run from a fresh checkout: active manifest, run files, approvals, timeline, artifacts, and run README.
- [x] `forge_request_changes` does not auto-commit by default.
- [x] `forge_answer` does not auto-commit by default.
- [x] A dedicated publish path exists to commit the current run state without approving it.
- [x] New Codex sessions can determine the active run from a tracked manifest in the current branch.
- [x] Non-git project paths keep current behavior and do not fail because git is unavailable.
- [x] Tests cover approve auto-commit, local-only request changes, local-only clarification answer, publish behavior, and manifest-based active run discovery.

## Dependencies

- Existing runtime state model in `runtime/forge-runner.mjs` and `runtime/run-store.mjs`.
- Existing MCP tool surface in `scripts/forge-mcp-server.mjs`.
- Node built-in test runner through `npm.cmd test`.
- Git CLI available in normal project worktrees.

## Out of Scope

- Automatic branch creation on `forge_run`.
- Automatic push/pull.
- PR creation or remote branch listing.
- Multi-run task dashboard.
- Committing source-code changes produced by role work.
- Distributed conflict resolution beyond normal git non-fast-forward behavior.

## Technical Notes

- Current runs are stored under `<projectRoot>/forge/runs/<runId>/`, and `.gitignore` currently ignores `forge/runs/`. The MVP must make the selected Forge state commit-capable without forcing all local run scratch data into every commit unintentionally.
- Prefer a small git helper module instead of embedding `git` command calls directly in `forge-runner.mjs`.
- The tracked manifest should be stable and small, for example `forge/active-run.json`, containing `run_id`, `status`, `current_role`, `step_index`, `branch`, `run_dir`, and update timestamp.
- Approval commit should stage only Forge state and manifest paths by default. Source-code changes should remain outside this MVP unless explicitly included later.
- Publish should be explicit because pending/revision state may be a local draft until a human decides to transfer it.
