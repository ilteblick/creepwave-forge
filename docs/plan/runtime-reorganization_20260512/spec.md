# Specification: Runtime Reorganization

**Track ID:** runtime-reorganization_20260512
**Type:** Refactor
**Created:** 2026-05-12
**Status:** Draft

## Summary

The top-level `runtime/` directory has grown into a flat collection of Forge runtime modules. The files are still cohesive, but the current shape hides natural ownership boundaries: run persistence, role/prompt contracts, task-board integration, git handoff, project context loading, and the high-level runner facade all sit in one namespace.

This refactor will reorganize runtime modules around those responsibilities while preserving the public behavior of MCP tools and existing tests. The work should start with low-risk move-only structure changes, then reduce `runtime/forge-runner.mjs` by extracting stable internal runner helpers behind a compatibility facade.

## Acceptance Criteria

- [x] Runtime modules are grouped into responsibility-based subdirectories instead of remaining as one flat `runtime/` namespace.
- [x] Existing public imports used by `scripts/forge-mcp-server.mjs` and tests remain stable through a compatibility facade or explicit import updates.
- [x] `runtime/forge-runner.mjs` remains the public runner entrypoint but delegates internal workflow slices to smaller runner modules.
- [x] Task-source and label-sync modules live together under a clear task-board integration boundary.
- [x] Run storage, artifact storage, and timeline rendering live under a clear run-state boundary.
- [x] Contract/prompt/role validation helpers live under a clear core workflow boundary.
- [x] Runtime tests, MCP tests, task-source tests, and full `npm.cmd test` pass after the reorganization.
- [x] README repository-shape documentation reflects the new runtime layout.

## Dependencies

- Existing Node ESM module layout and relative imports.
- Existing test scripts in `package.json`, especially `test:core`, `test:mcp`, `test:board:mock`, and `test`.
- Existing MCP entrypoint `scripts/forge-mcp-server.mjs`, which currently imports runner APIs from `runtime/forge-runner.mjs` and labels from `runtime/forge-board-labels.mjs`.

## Out of Scope

- Changing Forge workflow semantics, run state schemas, task-board behavior, or label vocabulary.
- Renaming MCP tool names or changing tool input/output contracts.
- Adding a bundler, TypeScript migration, package exports map, or new runtime dependency.
- Redesigning tests beyond import-path and focused regression updates needed for the refactor.

## Technical Notes

- `runtime/forge-runner.mjs` is the main hub at roughly 679 lines and exports the public runner API: `startRun`, `startRunFromTask`, `continueRun`, `submitStep`, `approveStep`, `requestChanges`, `rejectHandoff`, `answerClarification`, `getStatus`, `publishRunState`, and `syncTaskRunLabels`.
- `scripts/forge-mcp-server.mjs` depends on `runtime/forge-runner.mjs` and `runtime/forge-board-labels.mjs`; preserving those import surfaces reduces MCP blast radius.
- Existing completed tracks indicate heavy coverage around approval gates, task source, label sync, git handoff, and branch autodiscovery. This refactor must treat those behaviors as regression-sensitive.
- No deploy infrastructure was detected in the repository, so the implementation plan does not include a deploy phase.
