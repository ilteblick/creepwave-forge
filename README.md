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

The validator checks base skill structure, agent config presence, role links, expected artifacts, required role flows, and JSON handoff examples against the shared contract.

## Presentation

See `docs/skill-system-presentation.md` for a presentation-style overview with skill relationship diagrams, invocation flows, and prompt-to-chain examples.

## Goal

Build a portable foundation for AI-assisted software work: start with universal web-app roles, then attach an adapter so Codex can operate with the right project context instead of treating every codebase as generic.
