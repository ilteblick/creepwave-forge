---
name: project-context
description: Tracking-reforged project context. Use for domain discovery, repository layout, route map, user roles, and module ownership before BA/design/QA/review/handoff. Do not use for runtime commands or API contract edits.
---

# Project Context

## Purpose

Ground work in the concrete Tracking-reforged cargo tracking project before applying generic web-app roles.

Use this skill to understand what the product does, who uses it, where code lives, and which project-local files should be read next.

## Applies To

Use with `context-router`, `business-analyst`, `solution-architect`, `ui-ux-designer`, `frontend-engineer`, `qa-engineer`, `bug-investigator`, `code-reviewer`, and `handoff-writer`.

## Source Of Truth

- Resolve `${PROJECT_ROOT}` from the active workspace or by finding a directory that contains:
  - `AGENTS.md`
  - `amtdl-cargo-tracking-reforged/package.json`
  - `amtdl-cargo-tracking-reforged-front/package.json`
- Backend: `${PROJECT_ROOT}/amtdl-cargo-tracking-reforged`
- Frontend: `${PROJECT_ROOT}/amtdl-cargo-tracking-reforged-front`
- Read root `AGENTS.md` first, then the workspace-specific `AGENTS.md`.
- For backend module work, read the relevant module `src/**/AGENTS.md` before editing.
- Treat `src/` as source. Treat backend `dist/` as generated output.

## AGENTS.md Loading Policy

Use `AGENTS.md` files as progressive project memory, not as a bulk-loaded documentation set.

Load only:

- Root `AGENTS.md`.
- The relevant workspace `AGENTS.md` for backend or frontend work.
- The closest module-level `AGENTS.md` for the files being read or changed.

Do not read every module `AGENTS.md` unless the task explicitly spans those modules. If local notes conflict with source code, trust source code and mention the conflict.

## Domain

Tracking-reforged is a cargo tracking platform and monitoring-system aggregator. It connects companies to external tracking systems, synchronizes sensors and location points, and exposes a unified API/UI for operations.

Core entities:

- `Company`: customer, logistics operator, or administrator account.
- `TrackingSystem`: registered external monitoring system adapter.
- `CompanyTrackingSystem`: per-company connection to a tracking system with credentials and polling intervals.
- `Sensor`: cargo/device tracked through an external system.
- `SensorPoint`: embedded historical location/measurement point for a sensor.

## User And Access Model

- Public users can view the landing page and log in.
- Authenticated companies use JWT access/refresh tokens for panel operations.
- Admin companies manage companies and tracking systems.
- Company users manage their own connections, profile, API key, sensors, and sensor details.
- Machine-to-machine sensor reads use `X-Api-Key`, not JWT.
- Backend health checks are public infrastructure endpoints.

## Product Surfaces

Frontend routes:

- `/`: public landing page.
- `/login`: public login page.
- `/panel`: authenticated smart redirect/home.
- `/panel/connections`: company connection management.
- `/panel/sensors`: sensor list.
- `/panel/sensors/:id`: sensor detail.
- `/panel/profile`: company profile and API key.
- `/panel/admin/companies`: admin company management.
- `/panel/admin/tracking-systems`: admin tracking-system management.

Legacy routes such as `/connections`, `/sensors`, `/profile`, and `/admin/...` redirect into `/panel/...`.

## Repository Map

Backend `src/`:

- `company/`: auth, JWT guards, admin guard, company CRUD, API key regeneration, admin seed.
- `tracking-system/`: tracking-system registry, company connections, adapter contract, adapter registry, connection events.
- `sensor/`: API-key-protected sensor API, sensor sync scheduler, rate limiter, connection-created event handler.
- `health-check/`: public `/health` liveness/readiness endpoint.
- `llm/`: OpenAI-backed geocoding with memory and MongoDB cache.
- `config/`: Joi env validation.

Frontend `src/`:

- `api/`: Axios API wrappers and token/API-key clients.
- `components/`: panel layout, route guards, map, language switcher, startup splash.
- `context/AuthContext.tsx`: auth/session state.
- `pages/`: public, panel, sensor, profile, and admin pages.
- `types/index.ts`: DTO/API response types mirrored from backend contracts.
- `connectionCredFields.ts`: credential fields per adapter type.
- `i18n.ts` and `public/locales/{en,ru,zh}/translation.json`: translations.

## How To Use

1. Identify the user-facing area or backend module affected by the request.
2. Load the closest `AGENTS.md` and source files for that area.
3. If the task crosses frontend/backend, also use `project-contracts`.
4. If code will be changed, use `project-architecture` and `project-runtime`.
5. If validating, reviewing, or preparing release notes, use `project-quality`.

## Gotchas

- Do not infer current behavior from `dist/`; inspect backend `src/`.
- Do not hardcode a local absolute project path; different users may clone the project elsewhere.
- The project contains both root and workspace `AGENTS.md`; module-level backend notes may refine root rules.
- Some local docs can lag behind source code. When route guards or enum values conflict, treat source code as authoritative and mention the discrepancy.
- The root project package has almost no scripts; backend and frontend commands live inside their own workspace folders.
- Local `.env` files may contain secrets. Do not quote secret values in handoffs or review output.
