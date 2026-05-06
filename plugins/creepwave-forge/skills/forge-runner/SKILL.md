---
name: forge-runner
description: Use when the user asks to run Creepwave Forge, Forge runtime, step-by-step skill orchestration, or role handoff routing from Codex. Prefer the plugin MCP tools instead of shell commands.
---

# Forge Runner

## Purpose

Run Creepwave Forge through the local plugin tools so the user does not need to invoke npm or Node commands manually.

Use this skill when the user asks to start Forge, run a prompt through Forge, inspect a Forge run, or avoid console commands for the step-by-step runtime.

## Workflow

1. Call the `forge_run` MCP tool with the user's task as `prompt`.
2. Use `projectPath` when the user names a concrete workspace. Default Tracking-reforged project path is `C:\projects\tracking-reforged`.
3. Use `adapterName` when the project adapter is known. Default is `Tracking-reforged`.
4. Show the returned status, run id, invoked roles, and blocking questions or next action.
5. Call `forge_status` when the user asks about an existing run id.

## Expected Output

Report:

- `Run ID`
- `Status`
- `Roles Invoked`
- `Current/Terminal Role`
- `Blocking Questions` or `Next Action`

## Gotchas

- Do not run `npm` manually when the plugin tools are available.
- The current MCP tool uses the deterministic Forge provider unless a real model provider is connected later.
- If the run stops at `needs_clarification`, ask the user for those answers before continuing.
- Do not load all downstream skills into the chat context; the runtime exists to keep active role prompts isolated.
