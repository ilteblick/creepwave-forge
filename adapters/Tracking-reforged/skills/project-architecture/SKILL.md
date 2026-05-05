---
name: project-architecture
description: Tracking-reforged architecture guidance. Use for NestJS module design, React page/API client changes, adapter wiring, scheduler, i18n, UI, and cross-stack boundaries. Do not use for env commands.
---

# Project Architecture

## Purpose

Preserve the architectural boundaries and coding conventions of the Tracking-reforged backend and frontend.

Use this skill when planning or changing code structure, feature placement, module boundaries, adapter behavior, UI composition, or cross-stack integration.

## Applies To

Use with `solution-architect`, `backend-engineer`, `frontend-engineer`, `bug-investigator`, and `code-reviewer`.

## Backend Architecture

Backend stack:

- TypeScript strict mode, Node.js 24 LTS.
- NestJS 11 with modules, DI, decorators, guards, controllers, services, DTOs.
- MongoDB through Mongoose.
- Axios for external tracking system HTTP clients.
- EventEmitter for decoupled sensor bootstrap after connection creation.
- ScheduleModule for polling jobs.
- OpenAI SDK through `llm/GeocodingService` for station-name geocoding.

Application wiring:

- `AppModule` globally registers `ConfigModule`, `CacheModule`, Mongoose, scheduler, event emitter, and domain modules.
- `main.ts` applies Helmet, compression, CORS, global `ValidationPipe`, and Swagger in non-production.
- Env validation lives in `src/config/env.validation.ts`; new env vars must be added there.

Backend conventions:

- Files: kebab-case.
- Classes: PascalCase.
- Variables and functions: camelCase.
- True constants: UPPER_SNAKE_CASE.
- Indentation: 2 spaces.
- Max line length: 100 characters.
- Semicolons: yes.
- Quotes: single.
- Never use `any`.
- Never use `console.log`; use `Logger` from `@nestjs/common`.
- Use DTOs for all input and output.
- Use `class-validator` for input validation.
- Use `HttpException` or Nest-specific HTTP exceptions for API errors.
- Add JSDoc for public service/controller methods.
- Add Swagger decorators for new endpoints.
- Use `dayjs` in UTC for date handling.

## Backend Module Boundaries

- `company/` owns companies, auth, JWT payloads, admin/own-company guards, API key generation, and the admin seed.
- `tracking-system/` owns tracking-system definitions, company connections, adapter registration, adapter descriptors, and `connection.created` emission.
- `sensor/` owns API-key sensor access, sensor persistence, scheduler polling, rate limiting, and `connection.created` handling.
- `health-check/` must stay isolated from domain modules and unauthenticated.
- `llm/` owns geocoding cache and OpenAI access; callers should use its service rather than duplicating OpenAI calls.

## AGENTS.md Loading Policy

Before architecture or implementation work, load local project notes progressively:

- Root `AGENTS.md`.
- Backend or frontend workspace `AGENTS.md`, depending on the affected side.
- Only the closest module-level backend `AGENTS.md` for touched files, such as `src/sensor/AGENTS.md` or `src/tracking-system/AGENTS.md`.

Do not bulk-load all module notes. Module `AGENTS.md` files should refine the current work area, not fill the context with unrelated modules.

Cross-module rules:

- Export guards/services from the owning module instead of importing implementation files across boundaries.
- Keep sensor bootstrap decoupled through events; do not make connection creation block on sensor sync.
- Keep adapter-specific parsing inside adapter classes.
- Keep scheduler retry/rate-limit behavior in `sensor/` and tracking-system connection state methods.

## Adapter Architecture

Every external monitoring integration extends `TrackingSystemAdapter` and implements:

- `readonly descriptor: AdapterDescriptor`
- `getAllSensors(credentials): Promise<SensorDescriptor[]>`
- `getSensorDataById(credentials, externalSensorId): Promise<SensorDataResult>`

To add an adapter:

1. Create `src/tracking-system/adapters/<name>-tracking-system.adapter.ts`.
2. Export `<NAME>_ADAPTER_TYPE`.
3. Add the type to `ADAPTER_TYPES` and `AdapterType`.
4. Register the adapter in `AdapterRegistryService`.
5. Update frontend `AdapterType`, credential fields, and translations when the adapter is user-visible.

## Frontend Architecture

Frontend stack:

- Vite 8, React 19, TypeScript strict mode, React Router 7.
- Ant Design 6 and Ant Design X packages.
- Axios API layer.
- React Context for auth.
- i18next with `en`, `zh`, and `ru`.

Frontend conventions:

- Use Ant Design components by default.
- Do not rebuild buttons, tables, alerts, cards, inputs, or modals with custom HTML when Ant Design can cover it.
- Keep custom CSS for layout, page framing, map sizing, and small formatting helpers.
- Keep DTO/API response types in `src/types/index.ts`.
- Use `import type` for type-only imports.
- Never use `any`.
- Never commit `console.log`.
- Keep page-local form/modal logic colocated unless behavior is clearly shared.
- Keep destructive actions behind confirmation modals.
- Keep loading and error states explicit on data pages.
- Preserve the dark theme and existing landing/panel direction.
- Add translation keys for `en`, `zh`, and `ru` in the same change as new user-facing text.

## Cross-Stack Changes

For a backend API or data contract change, update in one coherent pass:

- Backend schema/service/controller/DTO/Swagger.
- Frontend `src/types/index.ts`.
- Frontend API wrapper in `src/api/`.
- Affected pages/components.
- Translation files for changed labels/errors.
- Credential fields in `connectionCredFields.ts` if adapter credentials change.

## Gotchas

- Backend `dist/` is generated; do not edit it.
- `CompanyTrackingSystem.creds` is currently stored as plain JSON. Do not treat it as encrypted.
- `Company.apiKey` is stored in plain text and used through `X-Api-Key`.
- Backend `SensorStatus` currently exposes `active` and `completed`; verify before relying on frontend-only `deleted` or `error` values.
- The `connection.created` event is fire-and-forget. Do not assume API success means initial sensor sync has completed.
- `HealthCheckModule` must remain public and isolated from domain modules.
