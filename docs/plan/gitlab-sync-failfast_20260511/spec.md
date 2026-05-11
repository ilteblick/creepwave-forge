# Specification: GitLab Sync Fail Fast

**Track ID:** gitlab-sync-failfast_20260511
**Type:** Bug
**Created:** 2026-05-11
**Status:** Draft

## Summary

`forge_run_task` can exceed the MCP client timeout while waiting for an unbounded GitLab label synchronization request. The current lifecycle creates local run state, a branch, and a commit before task-backed tracker synchronization is guaranteed to complete, so a client-side timeout can leave a partially started run and confusing follow-up output such as `run is not task-backed`.

This track makes GitLab task synchronization bounded, diagnosable, and recoverable. Task-backed starts should fail before local side effects when GitLab cannot be reached or written quickly enough, and any post-start tracker sync failure should return a clear error or recoverable state instead of hanging until the MCP caller kills the tool.

## Acceptance Criteria

- [x] Every GitLab HTTP operation used by task fetch and label sync has an internal timeout shorter than the MCP 120 second limit and reports which operation timed out.
- [x] `forge_run_task` validates GitLab task readability, required `forge` marker, label creation, and issue label update before creating a local run, branch, active manifest, or commit.
- [x] Task-backed run metadata is persisted as part of initial run creation, before the first run README, active manifest, commit, or label sync that can observe the run.
- [x] Plain `forge_run` remains independent of `.env.forge` and does not make tracker HTTP requests.
- [x] A failed GitLab preflight leaves no `forge/runs`, no `forge/active-run.json`, no new branch, and no run commit.
- [x] A post-start tracker sync failure is bounded, redacts tokens, and leaves a retryable status visible in MCP output instead of timing out the whole tool call.
- [x] A dedicated retry path exists to resynchronize labels for an existing task-backed run without advancing Forge workflow state.
- [x] Tests cover timeout, preflight failure before side effects, task metadata persistence in the first commit/state, plain run no-op behavior, and retry sync.

## Dependencies

- Prior completed track `forge-label-sync_20260511` for label vocabulary and GitLab write-back behavior.
- Prior completed track `task-run-gating_20260511` for marker-label gating and task-derived branch names.
- Node built-in `AbortController` and `AbortSignal.timeout` availability or a small local fallback for current supported Node runtime.

## Out of Scope

- Adding non-GitLab tracker write-back implementations.
- Creating GitLab boards, lists, milestones, assignees, merge requests, or branches.
- Making local git and remote GitLab updates fully atomic; the implementation should be fail-fast before local side effects and recoverable after local side effects.
- Changing Forge role execution, approval semantics, or label vocabulary.

## Technical Notes

- Current GitLab calls live in `runtime/task-source-gitlab.mjs` and call `fetchImpl` without request-level timeout or operation context.
- Before this track, `runtime/forge-runner.mjs` called `startRun` from `startRunFromTask`, then added `result.run.task_source` after the first branch, manifest, commit, and plain-run label sync path had already run.
- `runtime/task-label-sync.mjs` currently treats missing `run.task_source` as a skipped no-op, which is correct for plain runs but misleading for task-start lifecycle internals.
- `scripts/forge-mcp-server.mjs` exposes task start/status/publish formatting but has no retry-only sync tool.
- Tests already use mocked `fetchImpl` in `tests/task-source-gitlab.test.mjs`, `tests/task-label-sync.test.mjs`, and `tests/task-source-mcp.test.mjs`, which is the right place for timeout and side-effect regression coverage.
