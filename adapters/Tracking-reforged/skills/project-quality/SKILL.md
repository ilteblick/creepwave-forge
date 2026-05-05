---
name: project-quality
description: Tracking-reforged quality guidance. Use for verification, QA plans, review, bug investigation, release checks, deployment notes, and gotcha/risk assessment. Do not use for domain discovery.
---

# Project Quality

## Purpose

Verify Tracking-reforged changes with project-appropriate checks and catch recurring risks before handoff.

Use this skill for QA plans, validation summaries, bug investigations, code reviews, release notes, and final implementation verification.

## Applies To

Use with `backend-engineer`, `frontend-engineer`, `qa-engineer`, `bug-investigator`, `code-reviewer`, and `handoff-writer`.

## Verification Policy

Backend:

- Prefer `npm run build` after backend code changes.
- Use `npm run lint` when lint-safe; it runs ESLint with `--fix` and may rewrite files.
- Do not add backend tests by default. Backend `AGENTS.md` explicitly says `NO TESTS`.
- If a user explicitly asks for tests, call out that this conflicts with backend project notes before adding them.

Frontend:

- After frontend code changes, run `npm run format`, `npm run lint`, and `npm run build`.
- After substantial Ant Design refactors, run `npm run antd:lint`.
- Use `npm run antd:doctor` when diagnosing Ant Design upgrade or API issues.

Cross-stack:

- For API/schema/auth changes, validate both backend build and frontend build when feasible.
- If verification cannot run because env services are missing, report the exact missing dependency.

## Backend Review Checklist

Check for:

- No `any`.
- No `console.log`; use Nest `Logger`.
- DTOs for all input/output and `class-validator` on inputs.
- Swagger decorators on new or changed endpoints.
- JSDoc on public service/controller methods.
- HTTP errors through Nest exceptions.
- New env vars added to Joi validation.
- Dates handled in UTC with `dayjs`.
- Auth guard scope matches the route's company/admin/API-key contract.
- Company-scoped data cannot leak across tenants.
- Adapter failures do not block unrelated connections/sensors.
- Rate limit and retry/backoff behavior remains intact.
- No edits to generated `dist/`.

## Frontend Review Checklist

Check for:

- Ant Design components used for standard controls.
- No parallel custom visual system for buttons, tables, modals, cards, alerts, inputs, or forms.
- User-facing text added to `en`, `ru`, and `zh`.
- `src/types/index.ts` matches backend DTO/API response shape.
- API wrappers in `src/api/` match backend paths and auth style.
- `import type` used for type-only imports.
- No `any`.
- No `console.log`.
- Loading, error, empty, and destructive-confirmation states are explicit.
- Dark theme and existing panel/landing direction are preserved.

## Bug Investigation Checklist

Start by classifying the defect:

- Auth/session: inspect token storage, 401 refresh handling, `/auth/refresh`, `/auth/logout`, and redirect to `/login`.
- Permissions: inspect `JwtAuthGuard`, `AdminGuard`, `OwnCompanyOrAdminGuard`, or `ApiKeyGuard`.
- Sensor API: check `X-Api-Key`, company scoping, pagination query, `lastPoint`, and sensor detail points.
- Scheduler/sync: check `connection.created`, rate limiter, polling intervals, retry state, and adapter errors.
- Adapter data: check credential fields, external id construction, status mapping, pagination, and date parsing.
- Frontend UI: check Ant Design component state, route guard, `AuthContext`, translations, and API wrapper shape.
- Env/runtime: check MongoDB, `JWT_SECRET`, `OPENAI_API_KEY`, CORS, and `VITE_API_URL`.

## Release And Ops Checks

Before release-oriented handoff, mention:

- Backend port defaults to `3000`; frontend dev server defaults to `5173`.
- Swagger is non-production only at `/api/docs`.
- `/health` is public and always HTTP 200; body `status` can be `ok` or `error`.
- Admin seed creates `admin/admin1`; password must be changed in real environments.
- `CORS_ORIGIN=*` disables credentials; specific origins enable credentials.
- OpenAI geocoding uses memory cache plus MongoDB `geocoding_cache`.
- `OPENAI_PROXY_URL` is supported through `undici` `ProxyAgent`.

## Gotchas

- Backend lint can modify files because it runs with `--fix`.
- Backend project notes say not to write tests; do not silently add them.
- Frontend format command is a check. Use `format:write` only intentionally.
- Frontend supports `en`, `zh`, and `ru`; missing one translation is a regression.
- `connection.created` is fire-and-forget; connection creation success does not prove sensor bootstrap success.
- The scheduler runs every minute and uses an in-memory token bucket, so rate limiting is process-local.
- Current backend sensor statuses are `active` and `completed`; verify source before accepting `deleted` or `error` from docs/types.
- Health checks must stay free of business/domain dependencies.
- Do not expose `.env` secrets in review findings, QA notes, or handoffs.

## Expected Output

When producing validation or review output, include:

- Commands run and pass/fail result.
- Commands skipped and why.
- Backend/frontend scope covered.
- Residual risk, especially missing external services or untested adapter calls.
- Concrete files or modules touched when summarizing implementation.
