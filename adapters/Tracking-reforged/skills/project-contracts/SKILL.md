---
name: project-contracts
description: Tracking-reforged contracts. Use for endpoints, auth/permissions, DTO/schema changes, frontend types/API clients, adapter credentials, sensor sync, and compatibility. Do not use for local commands.
---

# Project Contracts

## Purpose

Keep backend contracts, frontend contracts, database models, auth rules, and external tracking adapters aligned.

Use this skill whenever a change touches API shape, auth, DTO validation, schemas, frontend API wrappers, adapter credentials, or sensor synchronization semantics.

## Applies To

Use with `business-analyst`, `solution-architect`, `ui-ux-designer`, `backend-engineer`, `frontend-engineer`, `qa-engineer`, `bug-investigator`, and `code-reviewer`.

## Auth Contracts

JWT auth:

- `POST /auth/login`: public login, returns access and refresh tokens.
- `POST /auth/refresh`: requires Bearer JWT and a refresh token body; rotates refresh token.
- `POST /auth/logout`: requires Bearer JWT; clears stored refresh token.
- JWT payload contains `sub`, `login`, and `isAdmin`.

Company/API-key auth:

- `Company.apiKey` is a UUIDv4.
- Sensor endpoints require `X-Api-Key`.
- `ApiKeyGuard` attaches the authenticated company to the request.
- `POST /companies/me/regenerate-apikey` rotates the current company's API key.

Permissions:

- Company CRUD is admin-only except `/companies/me` and API-key regeneration.
- Tracking-system definition changes are admin-only.
- Company connection endpoints use own-company-or-admin authorization.
- Sensor API responses are scoped to the API-key company.
- Health checks are public.

## HTTP API Surface

Route groups:

- `/auth/*`: login, refresh, logout.
- `/companies/*`: company CRUD, profile, API-key regeneration.
- `/tracking-systems/*`: tracking-system registry and company connections.
- `/sensors/*`: API-key sensor list and detail.
- `/health`: public liveness/readiness check.

For endpoint-level route, auth, and controller source details, read `references/http-api.md` only when the task touches API compatibility, frontend API wrappers, QA route coverage, or route-level review.

Controller source of truth:

- `src/company/auth.controller.ts`
- `src/company/company.controller.ts`
- `src/tracking-system/tracking-system.controller.ts`
- `src/sensor/sensor.controller.ts`
- `src/health-check/health-check.controller.ts`

## Data Contracts

`Company`:

- `name`: required display name.
- `login`: unique, lowercase, used for login.
- `password`: bcrypt hash, never returned.
- `apiKey`: UUIDv4, unique, used as `X-Api-Key`.
- `isAdmin`: admin flag.
- `refreshToken`: bcrypt hash or null.
- `createdAt`, `updatedAt`: timestamps.

`TrackingSystem`:

- `name`: required display name.
- `adapterType`: unique enum of registered adapter types.
- `rateLimit`: requests per minute, default 60.
- `description`: nullable string.
- `isActive`: availability flag.

`CompanyTrackingSystem`:

- `companyId`: ref to `Company`.
- `trackingSystemId`: ref to `TrackingSystem`.
- `creds`: adapter-specific JSON credentials.
- `sensorListPollingInterval`: minutes, default 15.
- `sensorDataPollingInterval`: minutes, default 60.
- `lastSensorListSyncAt`: nullable date.
- `isActive`: scheduler eligibility.
- `retryCount`, `nextRetryAt`: exponential backoff state.
- Unique index: `{ companyId, trackingSystemId }`.

`Sensor`:

- `companyId`: owning company.
- `trackingSystemId`: owning `CompanyTrackingSystem` connection.
- `externalId`: adapter's external sensor id.
- `status`: backend enum currently `active` or `completed`.
- `metadata`: raw adapter metadata.
- `lastSyncAt`: last successful data sync.
- `completedDataSyncAt`: final post-completion sync marker.
- `points`: embedded `SensorPoint[]`.
- Unique index: `{ trackingSystemId, externalId }`.

`SensorPoint`:

- `lat`, `lng`: numbers.
- `date`: UTC date.
- `metadata`: raw point metadata.

`GeocodingCache`:

- `name`: normalized station/location key.
- `lat`, `lng`: cached coordinates.

## Adapter Contracts

Supported adapter types:

- `mock`
- `zillion`
- `cargo-run`
- `findcontainer`
- `cargotime`
- `movizor-phone`
- `movizor-app`

Frontend credential fields:

- `mock`: none.
- `zillion`: `clientKey`, `clientSecret`.
- `cargo-run`: `email`, `password`.
- `findcontainer`: `apiKey`.
- `cargotime`: `apiKey`.
- `movizor-phone`: `project`, `key`.
- `movizor-app`: `project`, `key`.

Adapter descriptor fields:

- `adapterType`
- `name`
- `rateLimit`
- `description`

Adapter methods:

- `getAllSensors(credentials)` returns complete `SensorDescriptor[]`.
- `getSensorDataById(credentials, externalSensorId)` returns `SensorDataResult`.
- Adapter implementations must handle external pagination internally.
- Adapter parsing must normalize external data into `SensorDescriptor`, `SensorData`, and `SensorDataResult`.

`SensorDataResult`:

- `points`: zero or more new points.
- `status`: optional `active` or `completed`.
- `deviceMetadata`: optional parent sensor metadata refresh.

## Frontend Contract Files

When backend contracts change, inspect and update:

- `src/types/index.ts`
- `src/api/auth.ts`
- `src/api/companies.ts`
- `src/api/trackingSystems.ts`
- `src/api/sensors.ts`
- `src/api/client.ts`
- `src/connectionCredFields.ts`
- `public/locales/en/translation.json`
- `public/locales/ru/translation.json`
- `public/locales/zh/translation.json`

## Contract Change Workflow

1. Update backend schema/service/controller/DTO/Swagger together.
2. Keep auth guards explicit and aligned with company/admin/API-key ownership.
3. Update frontend type definitions and API wrappers.
4. Update pages/forms/tables that consume changed fields.
5. Update all three translation files for user-facing text.
6. Re-check adapter credential fields and adapter-type unions.
7. Use `project-quality` for verification and regression review.

## Gotchas

- `CompanyTrackingSystem.creds` is plain JSON in the current version. Do not claim encryption exists.
- Backend `SensorStatus` currently does not include `deleted` or `error`; frontend types may be ahead of backend.
- A local prompt file mentions deleted Movizor sensors, but current backend source marks absent sensors as `completed`.
- `GET /health` communicates failure through response body `status`, not HTTP status.
- Swagger exists only outside production.
- For guard behavior, inspect controller source; local module notes can be stale.
