# Specification: Handoff Commit Policy

**Track ID:** handoff-commit-policy_20260512
**Type:** Feature
**Created:** 2026-05-12
**Status:** Complete

## Summary

Forge already separates role execution, human approval, and next-role acceptance, and task-backed runs already synchronize GitLab board labels after state changes. The gap is that not every handoff-visible state change is committed. `forge_submit_step`, `forge_continue`, `forge_request_changes`, and `forge_answer` currently mutate local run files and labels without an automatic git commit, so another role or device can pull a branch and miss the latest transfer state unless the operator remembers `forge_publish`.

This track makes transfer boundaries explicit and durable. Every command that creates work for another human/role or publishes human feedback should commit Forge run state automatically when the project is a git worktree. It also adds an explicit receiver-side rejection path from `awaiting_role_acceptance`, because the current workflow lets the receiving role start with `forge_continue` but has no first-class way to send the accepted handoff back before starting.

## Acceptance Criteria

- [x] `forge_submit_step` persists the pending role output, updates task labels to `forge:waiting-approval`, and commits the pending approval state when git is available.
- [x] `forge_continue` from `awaiting_role_acceptance` starts the receiving role, updates labels to `forge:running`, and commits that role-acceptance/start state.
- [x] `forge_request_changes` records human revision feedback, updates labels to `forge:running`, and commits the revision request state.
- [x] `forge_answer` records clarification answers, updates labels to `forge:running`, and commits the answered-clarification state.
- [x] A receiving role can reject an approved handoff while the run is in `awaiting_role_acceptance`; the run returns to the sending role with a persisted revision/return artifact, updated labels, and a commit.
- [x] `forge_publish` remains available but becomes an explicit retry/manual publishing tool rather than a required normal workflow step.
- [x] MCP output and README text clearly state which human commands are allowed per status and that normal transfer state changes are auto-committed.
- [x] Runtime, MCP, git, and task-label tests cover all transfer commands, including non-git skip behavior and GitLab sync failure recording without losing the commit invariant where possible.

## Dependencies

- Prior track `approve-commit-mvp_20260510` for scoped Forge-state commits.
- Prior track `approval-handoff-gate_20260511` for `awaiting_role_acceptance`.
- Prior track `forge-label-sync_20260511` for GitLab label synchronization.
- Runtime files: `runtime/forge-runner.mjs`, `runtime/git-workflow.mjs`, `runtime/forge-board-labels.mjs`.
- MCP surface: `scripts/forge-mcp-server.mjs`.
- Contracts: `contracts/run-state.schema.json`, `contracts/approval.schema.json`, and possibly a new rejection/return artifact contract if revision requests are not sufficient.

## Out of Scope

- Committing source-code changes produced by roles.
- Automatic push, pull, merge conflict handling, or pull request creation.
- Adding non-GitLab tracker providers.
- Making GitLab and git operations fully atomic across network and local repository boundaries.
- Replacing the existing role transition graph.

## Technical Notes

- The existing helper `commitScopedPaths()` already stages only `forge/active-run.json` and `forge/runs/<runId>/`; reuse it through `commitRunState()`.
- Today `approveStep()` commits after applying approval. The same pattern should be moved into or reused by `submitStep()`, `continueRun()`, `requestChanges()`, `answerClarification()`, and the new receiver rejection command.
- `syncLabelsForRun()` can mutate `run.tracker_sync` after the main state save. To keep committed state aligned with visible tracker sync results, commit should happen after label sync, or there should be a second scoped commit when tracker sync changes `run.json`.
- `forge_submit_step` currently intentionally tells Codex to stop and show the pending output. That behavior should remain; the change is only that the pending output is committed before stopping.
- The receiver rejection path should only be valid in `awaiting_role_acceptance`, before `forge_continue` promotes the target role to active work.
