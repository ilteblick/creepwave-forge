# Specification: Task Run Gating And Branch Naming

**Track ID:** task-run-gating_20260511
**Type:** Feature
**Created:** 2026-05-11
**Status:** Draft

## Summary

Tighten `forge_run_task` so a tracker task is a real gate, not just prompt material. A task-based run must fail before creating a Forge run, branch, active manifest, or tracker write when the source task cannot be fetched or when the task is not explicitly marked with the `forge` label.

Task-based branch names should also identify the tracker task instead of the generic generated task prompt. For GitLab-backed starts, the run branch should include the task number and a slug from the task title, while plain `forge_run` keeps the existing prompt-based branch behavior.

## Acceptance Criteria

- [x] `forge_run_task` still fetches the configured task before any run, branch, manifest, commit, or label synchronization side effect.
- [x] If GitLab returns a missing task response, `forge_run_task` fails with a clear error and leaves no `forge/runs`, `forge/active-run.json`, or new git branch behind.
- [x] If the fetched task does not contain the exact marker label `forge`, `forge_run_task` fails with a clear error and leaves no run state, active manifest, branch, commit, or tracker label update behind.
- [x] If the fetched task contains `forge`, `forge_run_task` proceeds normally and syncs current Forge labels as it does today.
- [x] Task-backed run branches are named from the task identity, for example `forge/run/task-123-add-export-<runId>` or equivalent, and include both the task number and task-title slug.
- [x] Plain prompt-backed `forge_run` branch names remain unchanged.
- [x] Tests cover missing task, missing `forge` label, successful labeled GitLab task branch naming, and unchanged plain `forge_run` naming.
- [x] README documents that `forge_run_task` requires a pre-existing `forge` label and uses task-derived branch names.

## Dependencies

- Existing task source entrypoint in `runtime/forge-runner.mjs`.
- Existing GitLab source client in `runtime/task-source-gitlab.mjs`.
- Existing branch helpers in `runtime/git-workflow.mjs`.
- Existing MCP formatting in `scripts/forge-mcp-server.mjs`.
- Existing tests in `tests/task-source-mcp.test.mjs`, `tests/forge-runner.test.mjs`, and `tests/git-workflow.test.mjs`.
- Completed tracks `forge-task-source_20260510`, `branch-run-autodiscovery_20260510`, and `forge-label-sync_20260511`.

## Out of Scope

- Adding new tracker providers beyond the current GitLab source.
- Creating the initial `forge` marker label automatically before run start.
- Changing the status/role label vocabulary or label sync diff semantics.
- Renaming branches for already-created runs.
- Pushing branches, creating merge requests, or changing approval/publish commit policy.

## Technical Notes

- `startRunFromTask` already calls `fetchTaskFromSource` before `startRun`, so the main gap is label gating and branch seed customization.
- `startRun` currently calls `createRunBranch({ run, store })`, and `createRunBranch` always uses `run.user_prompt`; add a narrow option for branch naming input rather than changing prompt content.
- Keep task metadata token-free. Do not add `.env.forge` values to prompts, run JSON, manifest JSON, errors, or test snapshots.
- Use the existing `slugifyBranchSegment` sanitization for title-derived branch slugs.
- Treat the `forge` marker label as exact and case-sensitive to match the current board label vocabulary.
