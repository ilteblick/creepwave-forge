# Creepwave Forge

Creepwave Forge is a local Codex plugin for role-based web application development workflows.

It routes one task through one active role at a time, validates each role output against shared contracts, persists role artifacts in the target project, and requires human approval before any transition is applied.

## Repository Shape

- `.codex-plugin/plugin.json` defines the installable Codex plugin.
- `.mcp.json` registers the local MCP server.
- `scripts/forge-mcp-server.mjs` exposes Forge MCP tools.
- `runtime/` contains run storage, project context loading, prompt building, validation, and transition orchestration.
- `contracts/` contains JSON schemas, artifact documentation, and examples.
- `skills/base/` contains reusable base role skills.
- `tests/` contains Node test coverage for contracts, runtime, and MCP behavior.

## Core Rule

Every run starts with `context-router`.

The router chooses the narrowest sufficient next role, for example `business-analyst`, `ui-ux-designer`, `solution-architect`, `backend-engineer`, `frontend-engineer`, `qa-engineer`, `bug-investigator`, `code-reviewer`, or `handoff-writer`.

## Project Context

Forge loads project context from the project path passed to `forge_run`.

Supported context files currently include root and nested `AGENTS.md` and `CLAUDE.md` files. Source paths are preserved in the role packet. Generated and dependency folders such as `.git`, `node_modules`, build outputs, and `forge/runs` are excluded.

At run start, Forge stores the full discovered context under `context/project-context.md`. Later role packets use that saved snapshot instead of rereading live project files, so one run stays consistent even if project instructions change mid-flow.

The full snapshot is kept for audit and debugging, but prompts receive role-scoped context. Root agent files are always included. Nested context is selected by deterministic path rules, so backend roles see backend/API/runtime context, frontend and design roles see web/UI/client context, QA and review roles see quality/test-oriented context, and `context-router` receives the full snapshot for routing.

## Run Directory

For each task, Forge creates:

```text
<projectRoot>/forge/runs/<runId>/
  run.json
  README.md
  context/
  steps/
  handoffs/
  artifacts/
  approvals/
  revision-requests/
  clarifications/
  consultations/
  timeline/
    001-context-router/
      README.md
      step.json
      artifact.md
      artifact.json
      handoff.json
      approval.json
      manifest.json
```

Start with `<projectRoot>/forge/runs/<runId>/README.md` when inspecting a run manually. It is generated from the canonical run files and gives a chronological overview of the role steps.

When you want everything about one step in one folder, open `timeline/<step-role>/`. Each generated step folder contains stable mirror filenames such as `step.json`, `artifact.md`, `handoff.json`, `approval.json`, and `README.md`. The `manifest.json` in that folder maps each mirror file back to its canonical source path.

Generated run folders remain ignored by git through `forge/runs/`.

Role-specific documents such as requirements, technical designs, UI/UX handoffs, QA plans, bug investigations, and review findings are stored as typed artifacts and referenced from handoff contracts.

## MCP Tools

- `forge_run`: start a project-scoped run and return the first `context-router` role packet.
- `forge_run_task`: start a project-scoped run from a tracker task configured by `.env.forge`.
- `forge_continue`: return the current role packet, or let the next role accept an approved handoff and start its role packet.
- `forge_submit_step`: validate and persist a Runtime Step Output from the active role.
- `forge_approve`: human-only approval gate; accept the pending role output after the latest user message explicitly approves it and prepare the resulting transition.
- `forge_request_changes`: reject the pending role output and ask the same role to revise it.
- `forge_answer`: save user clarification answers and resume the waiting role.
- `forge_status`: show run status, step trace, artifacts, pending approval, and next allowed actions.
- `forge_sync_task`: retry tracker label synchronization for an existing task-backed run without changing workflow state.

## Task Source Workflow

Forge can still run without any task board by calling `forge_run` with a plain prompt. Task-board integration is optional.

For ticket-based runs, put a local `.env.forge` file in the target project root:

```env
TASK_SOURCE_TYPE=gitlab
TASK_SOURCE_URL=https://gitlab.company.local/group/subgroup/project
TASK_SOURCE_TOKEN=xxxxxxxxx
# Optional; defaults to 10000.
TASK_SOURCE_REQUEST_TIMEOUT_MS=10000
```

`.env.forge` is local secret material and should not be committed. The token is used to read the configured tracker task and, for task-backed runs, to update Forge-owned labels on that task. The token is not written into Forge run artifacts, role prompts, or MCP output.

Start a tracker-backed run with:

```text
forge_run_task(projectPath, taskId)
```

For GitLab, `taskId` is an issue iid such as `#123` or `123`. Forge reads the issue title, description, labels, and non-system comments before creating any run state. GitLab API calls have their own request timeout, so a stuck GitLab endpoint fails with an operation-specific error such as `PUT issue #123 labels timed out after 10000ms` instead of waiting for the MCP client timeout.

The issue must already have the exact marker label `forge`; if the task is missing or unmarked, `forge_run_task` stops before creating a run, branch, active-run manifest, commit, or tracker label update.

After the marker check passes, `forge_run_task` performs a GitLab write preflight before local run creation. It ensures the initial Forge labels exist and performs an idempotent issue label update. If that preflight fails, Forge does not create local run state, does not switch branches, and does not create a run commit.

When preflight succeeds, Forge builds a normal Forge prompt from that task and starts the same `context-router` workflow used by `forge_run`.

Task-backed runs synchronize labels back to the tracker after every Forge state change. Forge creates missing GitLab labels when needed, removes stale Forge-owned labels from the issue, preserves unrelated labels, and applies the current Forge label set. The GitLab token therefore needs write-capable API permissions. Plain `forge_run` prompt-only runs do not read `.env.forge` and do not write tracker labels.

If a tracker sync fails after the local run and initial commit already exist, Forge records a retryable `tracker_sync` failure in `run.json` and returns a `Tracker Label Sync` failure section instead of hanging. Use `forge_sync_task(projectPath, runId)` to retry label synchronization without advancing the Forge workflow.

## Board Labels

Use `forge` as the marker label for tasks that participate in the Forge process.

Status labels:

```text
forge:ready
forge:running
forge:waiting-role
forge:waiting-approval
forge:needs-input
forge:blocked
forge:done
forge:failed
```

Role labels:

```text
forge-role:context-router
forge-role:business-analyst
forge-role:solution-architect
forge-role:ui-ux-designer
forge-role:backend-engineer
forge-role:frontend-engineer
forge-role:bug-investigator
forge-role:qa-engineer
forge-role:code-reviewer
forge-role:handoff-writer
```

For task-backed runs, Forge writes these labels to the issue. For prompt-only runs, `forge_status` prints the labels for visibility but skips tracker sync. The internal status mapping is:

```text
created / awaiting_role_output    -> forge:running
awaiting_role_acceptance          -> forge:waiting-role
awaiting_approval                 -> forge:waiting-approval
needs_clarification               -> forge:needs-input
blocked / paused                  -> forge:blocked
complete                          -> forge:done
runtime/tool error                -> forge:failed
```

## Human Approval Workflow

`forge_submit_step` never advances the run by itself. It stores the role output, saves the role artifact, records the outgoing handoff, and moves the run to `awaiting_approval`.

While approval is pending, the human chooses one path:

- approve with `forge_approve`;
- request same-role changes with `forge_request_changes`;
- inspect the current state with `forge_status`.

Codex must stop after `forge_submit_step` reports `awaiting_approval`. It must not call `forge_approve` from its own judgment. The MCP `forge_approve` tool requires `humanApproval`, which must be copied from an explicit human approval message such as "approve", "продолжай", or "апрув".

For non-terminal handoff, consultation request, and consultation response transitions, `forge_approve` accepts the previous role output and moves the run to `awaiting_role_acceptance`. No role packet is returned from approval. The receiving role must inspect the accepted handoff and call `forge_continue`; only then does Forge move to `awaiting_role_output` and return the executable role packet.

For clarification, completion, or blocked transitions, `forge_approve` moves directly to `needs_clarification`, `complete`, or `blocked`.

## Git Handoff MVP

Forge keeps local review loops quiet and commits only accepted or explicitly published run state.

- In a git worktree, `forge_run` creates and checks out one branch per run using `forge/run/<slug>-<runId>`.
- `forge_run_task` uses the task identity for that slug: `forge/run/task-<taskId>-<task-title>-<runId>`, for example `forge/run/task-123-add-export-20260511123000-a1b2c3`.
- The generated branch name includes the run ID, so the git branch and Forge run are directly linked.
- `forge_run` writes `forge/active-run.json` and creates an initial scoped Forge-state commit on that branch.
- `forge_approve` accepts the approved output, refreshes `forge/active-run.json`, stages `forge/active-run.json` and `forge/runs/<runId>/`, and creates a scoped git commit when the project path is inside a git worktree. Non-terminal handoffs commit the `awaiting_role_acceptance` state.
- `forge_continue` from `awaiting_role_acceptance` records that the receiving role has started, refreshes `forge/active-run.json`, and returns the next role packet.
- `forge_request_changes` and `forge_answer` update local run files but do not create git commits by default.
- `forge_publish` commits the current run state without approving or changing workflow state. Use it when pending approval, revision feedback, or clarification state must be transferred to another device through git.
- Non-git project paths keep working; git publishing is skipped instead of failing the Forge workflow.

The active-run manifest is branch-local:

```text
<projectRoot>/forge/active-run.json
```

A second Codex window or another device can pull the branch, read that manifest, recover the `run_id`, and call `forge_status`, `forge_continue`, `forge_submit_step`, `forge_approve`, `forge_request_changes`, `forge_answer`, or `forge_publish` against the same run without passing `runId`. Passing `runId` explicitly remains supported.

Approval commits include only Forge run state by default. Source-code changes from role work remain a separate commit policy decision.

## Revision Workflow

When the human requests changes, Forge stores a `revision-request` artifact, clears the pending approval, keeps the same active role, and builds the next role packet with the revision instructions included.

This supports feedback like "rewrite the spec", "make the design denser", or "route this to architect instead".

## Clarification Workflow

A role can return `status: "needs_clarification"` with `transition.type: "clarification_request"`.

After human approval, the run waits in `needs_clarification`. The human answers with `forge_answer`; Forge stores the answer under `clarifications/` and returns the same role as the next active role.

## Consultation Workflow

Roles can consult each other without permanently transferring ownership.

`consultation_request` pushes the current role onto the role stack and sends a packet to the consulted role. `consultation_response` must return to the role at the top of that stack.

## Development

Run tests:

```powershell
npm.cmd test -- --test-reporter=dot
```

Run contract tests:

```powershell
npm.cmd run test:contracts -- --test-reporter=dot
```

Run runtime/MCP tests:

```powershell
npm.cmd run test:runtime -- --test-reporter=dot
```
