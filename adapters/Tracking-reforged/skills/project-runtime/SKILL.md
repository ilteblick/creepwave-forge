---
name: project-runtime
description: Tracking-reforged runtime and local workflow. Use for setup, env files, local run, build/lint commands, ports, Swagger, seed admin, MongoDB/OpenAI requirements, and run order. Do not use for API shapes.
---

# Project Runtime

## Purpose

Run, configure, build, and verify Tracking-reforged without rediscovering local setup details.

Use this skill before executing commands, changing env-sensitive behavior, validating implementation work, or explaining how to operate the project locally.

## Applies To

Use with `backend-engineer`, `frontend-engineer`, `qa-engineer`, `bug-investigator`, and `code-reviewer`.

## Workspaces

Root:

```powershell
cd ${PROJECT_ROOT}
```

Backend:

```powershell
cd ${PROJECT_ROOT}\amtdl-cargo-tracking-reforged
```

Frontend:

```powershell
cd ${PROJECT_ROOT}\amtdl-cargo-tracking-reforged-front
```

The root `package.json` only declares TypeScript. Use backend/frontend workspace scripts for real project work.

Resolve `${PROJECT_ROOT}` from the active workspace or by locating a directory that contains root `AGENTS.md`, backend `amtdl-cargo-tracking-reforged/package.json`, and frontend `amtdl-cargo-tracking-reforged-front/package.json`. Do not assume a user-specific absolute path.

## Backend Runtime

Default backend URL: `http://localhost:3000`

Swagger URL in non-production: `http://localhost:3000/api/docs`

Setup:

```powershell
cd ${PROJECT_ROOT}\amtdl-cargo-tracking-reforged
Copy-Item .env.example .env
npm install
npm run start:dev
```

Main scripts:

- `npm run start:dev`: Nest watch mode.
- `npm run start`: Nest start.
- `npm run start:debug`: Nest debug watch mode.
- `npm run build`: compile backend.
- `npm run lint`: ESLint with `--fix`; this can rewrite files.
- `npm run format`: Prettier write for backend `src/**/*.ts` and `test/**/*.ts`.
- `npm run seed:admin`: create bootstrap admin account.
- `npm run start:prod`: run compiled `dist/main`.

Backend env:

- `PORT`: defaults to `3000`.
- `NODE_ENV`: `development`, `production`, or `test`.
- `CORS_ORIGIN`: `*` or comma-separated origins.
- `CACHE_TTL`, `CACHE_MAX_ITEMS`: global cache settings.
- `MONGODB_URI`: required.
- `JWT_SECRET`: required, at least 32 characters.
- `JWT_ACCESS_EXPIRES_IN`: default `15m`.
- `JWT_REFRESH_EXPIRES_IN`: default `7d`.
- `BCRYPT_SALT_ROUNDS`: 8-14, default `10`.
- `OPENAI_API_KEY`: required by env validation.
- `OPENAI_PROXY_URL`: optional proxy for OpenAI requests.

Admin seed:

- `npm run seed:admin` creates `login=admin`, `password=admin1`, `isAdmin=true`.
- Change the password after first login in real environments.

## Frontend Runtime

Default frontend URL: `http://localhost:5173`

Setup:

```powershell
cd ${PROJECT_ROOT}\amtdl-cargo-tracking-reforged-front
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend env:

- `VITE_API_URL=http://localhost:3000`
- Runtime config can also come from `public/env.js` through `window.__APP_CONFIG__`.

Main scripts:

- `npm run dev`: Vite dev server.
- `npm run build`: `tsc -b` plus Vite build.
- `npm run lint`: ESLint check.
- `npm run format`: Prettier check.
- `npm run format:write`: Prettier write.
- `npm run preview`: Vite preview.
- `npm run antd:lint`: Ant Design migration/deprecation lint for `src`.
- `npm run antd:doctor`: Ant Design doctor.
- `npm run antd:mcp`: Ant Design MCP server.

## Local Run Order

1. Start MongoDB reachable by backend `MONGODB_URI`.
2. Ensure backend `.env` has `MONGODB_URI`, `JWT_SECRET`, and `OPENAI_API_KEY`.
3. Start backend with `npm run start:dev`.
4. Seed admin if the database is new.
5. Ensure frontend `.env` points `VITE_API_URL` to backend.
6. Start frontend with `npm run dev`.
7. Log in through `/login` and use `/panel`.

## Verification Commands

Backend verification after code changes:

```powershell
npm run build
npm run lint
```

Do not add backend tests by default; the backend `AGENTS.md` explicitly says `NO TESTS`.

Frontend verification after code changes:

```powershell
npm run format
npm run lint
npm run build
```

After substantial Ant Design refactors, also run:

```powershell
npm run antd:lint
```

## Gotchas

- Backend `npm run lint` uses `--fix`; expect file modifications.
- Frontend `npm run format` is a check, not a writer. Use `format:write` only when intentionally formatting.
- Backend env validation requires `OPENAI_API_KEY` even if a local task does not exercise geocoding.
- Do not hardcode local absolute paths in instructions or generated handoffs; use `${PROJECT_ROOT}` or paths relative to the active workspace.
- Do not print real `.env` secret values in reports.
- If both servers run locally, frontend calls backend at `VITE_API_URL`, default `http://localhost:3000`.
- Swagger is hidden in `NODE_ENV=production`.
