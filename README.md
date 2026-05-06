# Creepwave Forge

Creepwave Forge is an AI factory for web application delivery. The repository is intended to collect a reusable set of base Codex skills that can support typical web-app work across analysis, design, architecture, implementation, review, QA, debugging, and handoff.

The base skills are deliberately project-neutral. They define role behavior and expected outputs that should work for most web applications without assuming a specific stack, domain, or team process.

Project-specific knowledge lives in adapters. Each adapter adds extra context for a concrete project: repository structure, domain model, local commands, coding standards, design system, testing strategy, release rules, and any team-specific constraints. When both base skills and adapter skills apply, the adapter should refine or override generic guidance with project facts.

## Repository Shape

- `skills/base/` contains reusable role skills for common web application work.
- `adapters/<project>/` contains project adapters with additional context and project-specific skills.
- `adapters/<project>/adapter.yaml` declares the adapter metadata and where adapter skills live.
- `contracts/` contains shared role-to-role artifact contracts and handoff examples.
- `tests/` contains validation fixtures and structural checks for the base skill system.

## Validation

Run the base skill contract checks with:

```sh
npm test
```

The validators check base skill structure, agent config presence, role links, expected artifacts, required role flows, JSON handoff examples, and the runtime step orchestration contract.

Run validators separately with:

```sh
npm run validate:skills
npm run validate:runtime
```

## Runtime Orchestrator

`src/runtime/` contains the first executable orchestration layer for step-by-step runs:

- `skill-registry.mjs` loads one active role skill at a time.
- `prompt-builder.mjs` builds a step prompt with only the active `SKILL.md`, project context, original prompt, and incoming handoff.
- `step-validator.mjs` validates `contracts/step-output.schema.json` and `contracts/handoff.schema.json`.
- `transition-policy.mjs` enforces allowed role-to-role transitions.
- `run-store.mjs` persists run state and step outputs under `runs/`.
- `forge-runner.mjs` executes the loop through an injected `invokeRole` callback.

The runtime does not call an LLM directly yet. It expects an `invokeRole` function, so tests can prove orchestration behavior before a real model provider is connected.

For broad feature prompts, the expected behavior is to route through `context-router`, invoke one selected role, validate its step output, and stop when a role returns `needs_clarification`.

## Presentation

See `docs/skill-system-presentation.md` for language variants of the presentation-style overview with skill relationship diagrams, invocation flows, and prompt-to-chain examples:

- Russian: `docs/skill-system-presentation.ru.md`
- English: `docs/skill-system-presentation.en.md`

## Goal

Build a portable foundation for AI-assisted software work: start with universal web-app roles, then attach an adapter so Codex can operate with the right project context instead of treating every codebase as generic.
