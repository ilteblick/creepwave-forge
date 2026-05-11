# Specification: Forge Label Sync

**Track ID:** forge-label-sync_20260511
**Type:** Feature
**Created:** 2026-05-11
**Status:** Complete

## Summary

Extend the task-source workflow so Forge writes its current state back to the tracker task. For GitLab-backed task runs, Forge should ensure the required Forge labels exist, remove stale Forge status/role labels from the issue, and apply exactly the current labels: marker `forge`, one `forge:*` status, and one `forge-role:*` role when the run has an active role.

This builds on the completed read-only task-source MVP. The existing `forge_run` prompt-only workflow must remain unchanged. Write-back applies only to task-backed runs that have source task metadata and task-source credentials.

## Acceptance Criteria

- [x] `forge_run_task` creates missing GitLab labels needed for the current Forge state and applies `forge`, the current `forge:*` status, and the current `forge-role:*` role to the issue.
- [x] Label sync is performed after every Forge state change for task-backed runs: start, submit step, approve, request changes, answer clarification, and publish/status refresh where applicable.
- [x] Sync removes stale Forge-owned labels from the issue before applying the current set, while preserving unrelated labels.
- [x] Terminal or non-active-role states apply `forge` plus the current status label and remove all `forge-role:*` labels.
- [x] GitLab label creation is idempotent: existing labels are reused, already-existing create failures do not fail the run, and missing labels are created before issue update.
- [x] Tracker write errors fail clearly for task-backed runs and do not leak `TASK_SOURCE_TOKEN`.
- [x] Plain `forge_run` runs without `.env.forge` still work and do not attempt tracker writes.
- [x] Tests cover GitLab label creation, stale label cleanup, unrelated label preservation, start/run transition sync points, terminal state sync, write-error messages, and unchanged prompt-only runs.

## Dependencies

- Completed track `forge-task-source_20260510`.
- Existing `runtime/forge-board-labels.mjs` label vocabulary and `labelsForRun(run)` helper.
- Existing task-source config loader in `runtime/task-source-config.mjs`.
- Existing GitLab URL parsing and issue fetch logic in `runtime/task-source-gitlab.mjs`.
- Existing run lifecycle in `runtime/forge-runner.mjs`.
- Existing MCP tool surface in `scripts/forge-mcp-server.mjs`.
- Node built-in test runner through `npm.cmd test`.

## Out of Scope

- Non-GitLab write-back implementations.
- Automatic task discovery from boards or queues.
- Creating GitLab boards, lists, milestones, assignees, branches, or merge requests.
- Automatic comments on tracker issues.
- Background synchronization or webhooks.
- Permission/scope negotiation UI; the token is assumed to have write rights.

## Technical Notes

- The current task-source MVP intentionally did not persist task metadata in run state. Label sync needs enough non-secret metadata to resume writes after `forge_submit_step`, `forge_approve`, `forge_answer`, and `forge_status`. Add a minimal `task_source` object to `run.json`, for example:

  ```json
  {
    "type": "gitlab",
    "task_id": "123",
    "task_url": "https://...",
    "source_url": "https://..."
  }
  ```

- Never persist `TASK_SOURCE_TOKEN`. Load credentials from `.env.forge` at sync time.
- Use existing `labelsForRun(run)` as the desired Forge-owned label set.
- Treat Forge-owned labels as:
  - marker: `forge`
  - statuses: all `forge:*`
  - roles: all `forge-role:*`
- GitLab implementation should:
  - read current issue labels or use labels from the fetched issue when available;
  - ensure desired labels exist via project labels API;
  - compute final labels as `(current labels - forge-owned labels) + desired labels`;
  - update the issue labels with a PUT request.
- `forge:ready` is a pre-run board label. Once Forge starts, it should be replaced by `forge:running`.
- To avoid surprise writes for prompt-only runs, sync should no-op when `run.task_source` is absent.
