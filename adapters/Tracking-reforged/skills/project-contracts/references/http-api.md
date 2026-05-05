# HTTP API Reference

Use this reference when endpoint-level detail matters: frontend API wrapper changes, route compatibility, permission review, QA route coverage, or Swagger/controller alignment.

Treat controller source as authoritative if this file conflicts with code.

## Source Of Truth

- `src/company/auth.controller.ts`
- `src/company/company.controller.ts`
- `src/tracking-system/tracking-system.controller.ts`
- `src/sensor/sensor.controller.ts`
- `src/health-check/health-check.controller.ts`
- Swagger in non-production: `/api/docs`

## Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Login; returns JWT access and refresh tokens. |
| POST | `/auth/refresh` | Bearer JWT | Exchanges refresh token for a rotated token pair. |
| POST | `/auth/logout` | Bearer JWT | Revokes the stored refresh token. |

## Companies

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/companies` | Bearer JWT + admin | Create a company. |
| GET | `/companies` | Bearer JWT + admin | List all companies. |
| GET | `/companies/me` | Bearer JWT | Get own profile. |
| GET | `/companies/:id` | Bearer JWT + admin | Get company by id. |
| PATCH | `/companies/:id` | Bearer JWT + admin | Update company fields. |
| DELETE | `/companies/:id` | Bearer JWT + admin | Permanently delete a company. |
| POST | `/companies/me/regenerate-apikey` | Bearer JWT | Generate a new API key for own account. |

## Tracking Systems

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/tracking-systems` | Bearer JWT + admin | Create a tracking-system definition. |
| GET | `/tracking-systems` | Bearer JWT | List tracking systems. |
| GET | `/tracking-systems/:id` | Bearer JWT + admin | Get a tracking system by id. |
| PATCH | `/tracking-systems/:id` | Bearer JWT + admin | Update a tracking system. |
| DELETE | `/tracking-systems/:id` | Bearer JWT + admin | Delete a tracking system. |

## Connections

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/tracking-systems/:companyId/connections` | Bearer JWT + own company or admin | Connect a tracking system to a company. |
| GET | `/tracking-systems/:companyId/connections` | Bearer JWT + own company or admin | List all connections for a company. |
| GET | `/tracking-systems/:companyId/connections/:connectionId` | Bearer JWT + own company or admin | Get a connection by id. |
| PATCH | `/tracking-systems/:companyId/connections/:connectionId` | Bearer JWT + own company or admin | Update a connection. |
| DELETE | `/tracking-systems/:companyId/connections/:connectionId` | Bearer JWT + own company or admin | Delete a connection. |

## Sensors

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/sensors` | `X-Api-Key` | Paginated company-scoped sensor list; does not include full point history; includes `lastPoint`. |
| GET | `/sensors/:id` | `X-Api-Key` | Company-scoped sensor detail with full point history. |

## Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | Public | Always returns HTTP 200; inspect JSON `status` for `ok` or `error`. |
