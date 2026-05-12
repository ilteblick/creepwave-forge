# Specification: Forge E2E Test Strategy

**Track ID:** e2e-test-strategy_20260512
**Type:** Feature
**Created:** 2026-05-12
**Status:** Draft

## Summary

Define a stable testing strategy for Creepwave Forge so workflow regressions can be caught without depending on a live task board for every run. The repository already has broad `node --test` coverage across contracts, runtime, MCP tools, GitLab task source behavior, label sync, and git workflow. The missing piece is an explicit test taxonomy, scripts that reflect that taxonomy, and a clear boundary between deterministic mocked e2e coverage and optional live-board smoke validation.

This track should make day-to-day test failures easier to interpret: a failure in mocked e2e means Forge workflow behavior regressed, while a live-board smoke failure means environment, credentials, permissions, network, or tracker state must be checked first.

## Acceptance Criteria

- [x] `package.json` exposes named scripts for core contract/runtime checks, MCP checks, mocked board integration, deterministic e2e, and full local regression.
- [x] Windows PowerShell usage is documented with `npm.cmd` so blocked `npm.ps1` execution policy is not mistaken for a test failure.
- [x] README documents the test taxonomy and when to run each command.
- [x] Live task-board validation is documented as optional smoke coverage and is not part of the default regression command.
- [x] Existing GitLab/task board tests remain mocked and deterministic by default.
- [x] Any new live-board smoke command fails fast with clear missing-environment guidance and does not create local Forge run state unless prerequisites are satisfied.
- [x] `npm.cmd test` continues to pass after the script/documentation changes.

## Dependencies

- Existing `package.json` Node test scripts.
- Existing tests under `tests/`, especially `forge-runner.test.mjs`, `mcp-server.test.mjs`, `task-source-mcp.test.mjs`, `task-source-gitlab.test.mjs`, `task-label-sync.test.mjs`, and `forge-board-labels.test.mjs`.
- Completed track `forge-task-source_20260510`.
- Completed track `forge-label-sync_20260511`.
- Completed or implemented behavior from `task-run-gating_20260511` and `gitlab-sync-failfast_20260511`.
- README sections for MCP tools, task source workflow, board labels, and command surface.

## Out of Scope

- Adding browser automation or Playwright; Forge currently has no browser UI.
- Adding a new tracker provider.
- Creating GitLab boards, issues, labels, branches, merge requests, or comments from tests beyond existing mocked behavior.
- Changing Forge role workflow semantics, approval gates, label vocabulary, or MCP tool contracts.
- Making live-board smoke tests mandatory in CI.

## Technical Notes

- Current default test command is `node --test` and passes locally through `npm.cmd test`.
- Plain `npm test` in PowerShell can fail before tests run because `npm.ps1` is blocked by local execution policy. This is environment setup noise, not a Forge regression.
- The deterministic e2e layer should exercise Forge workflow through public/runtime boundaries with temporary directories and mocked task sources.
- Live-board smoke coverage should be opt-in and guarded by explicit environment/config prerequisites because GitLab availability, credentials, labels, and issue state are external variables.
- Existing tests already verify most board failure modes with mocks: missing `.env.forge`, missing task, missing `forge` label, preflight failure before side effects, timeout context, token redaction, retry sync, and unchanged prompt-only runs.
