# Specification: Forge Task Source MVP

**Track ID:** forge-task-source_20260510
**Type:** Feature
**Created:** 2026-05-10
**Status:** Complete

## Summary

Add a minimal task-board entrypoint for Forge so a human can keep using an existing tracker board, mark a ticket with Forge labels, and ask Codex to run Forge from a ticket id. Each project provides local credentials in `.env.forge`; Forge reads the source task, starts a normal run with the ticket content as the prompt, and exposes a consistent board-label vocabulary for showing Forge state.

This MVP intentionally avoids a full project adapter layer. It introduces a small task-source config loader and the first thin source client, with the public workflow staying simple: `Forge task #123` from a project root that contains `.env.forge`.

Follow-up track `forge-label-sync_20260511` supersedes the read-only label behavior from this MVP by writing Forge labels back to task-backed GitLab issues.

## Acceptance Criteria

- [x] Projects can define `.env.forge` with `TASK_SOURCE_TYPE`, `TASK_SOURCE_URL`, and `TASK_SOURCE_TOKEN`, and Forge rejects missing or malformed values with clear errors.
- [x] `.env.forge` is documented as local-only secret material and the repository ignores `.env.forge`.
- [x] Forge supports a task-based MCP entrypoint that accepts `projectPath` and `taskId`, reads `.env.forge`, fetches the task title/body/metadata, and starts a normal `context-router` run.
- [x] The task-based run prompt includes enough source context for roles: source type, source URL, task id, task title, description, labels, and comments when available.
- [x] Forge defines the board labels `forge`, `forge:*`, and `forge-role:*`, including a deterministic mapping from internal run statuses and `current_role` to labels.
- [x] Status output for task-based runs shows the recommended board labels for the current Forge state.
- [x] First source support covers GitLab project URLs because it is the current known tracker, while the config contract remains tracker-neutral for later `github`, `jira`, `youtrack`, or `linear`.
- [x] Tests cover env parsing, missing config errors, task prompt construction, status-to-label mapping, and the new MCP entrypoint without requiring a real tracker network call.

## Dependencies

- Existing Forge MCP surface in `scripts/forge-mcp-server.mjs`.
- Existing run lifecycle in `runtime/forge-runner.mjs`.
- Existing run state schema in `contracts/run-state.schema.json`.
- Existing role set in `runtime/transition-policy.mjs` and `runtime/skill-registry.mjs`.
- Node built-in test runner through `npm.cmd test`.
- Native `fetch` in the supported Node runtime for tracker API requests.

## Out of Scope

- Full project adapters.
- Automatic webhook processing.
- Automatic polling or background workers.
- Automatic assignment of concrete humans.
- Creating branches, commits, merge requests, or pull requests beyond the current Forge run branch behavior.
- Supporting every tracker in the first implementation.
- Storing tracker tokens in Forge run artifacts.
- Directly pushing source-code changes to protected branches.

## Technical Notes

- Keep `.env.forge` out of run artifacts and prompt context. The run may store task source metadata, but never token values.
- Prefer a small `runtime/task-source-config.mjs` parser over adding a dotenv dependency. The needed syntax is simple `KEY=value` lines with comments and blank lines.
- Treat `TASK_SOURCE_URL` as the project/repository/board URL. For GitLab, derive API base and URL-encoded project path from that single URL.
- Add a task-source client boundary, but keep it implementation-level rather than presenting it as a project adapter concept.
- Suggested labels:
  - marker: `forge`
  - statuses: `forge:ready`, `forge:running`, `forge:waiting-approval`, `forge:needs-input`, `forge:blocked`, `forge:done`, `forge:failed`
  - roles: `forge-role:context-router`, `forge-role:business-analyst`, `forge-role:solution-architect`, `forge-role:ui-ux-designer`, `forge-role:backend-engineer`, `forge-role:frontend-engineer`, `forge-role:bug-investigator`, `forge-role:qa-engineer`, `forge-role:code-reviewer`, `forge-role:handoff-writer`
- Internal status mapping:
  - `created` and `awaiting_role_output` -> `forge:running`
  - `awaiting_approval` -> `forge:waiting-approval`
  - `needs_clarification` -> `forge:needs-input`
  - `blocked` and `paused` -> `forge:blocked`
  - `complete` -> `forge:done`
  - runtime/tool errors -> `forge:failed`
