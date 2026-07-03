# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Full-stack trip-planning platform (itineraries, budget, hotels, flights, map). Two independent npm projects plus shared design docs at the root. It's a learning project; comments, commit messages, and API error messages are written in **Spanish** — match that when editing.

- `trip-planner-api/` — Node/Express + TypeScript backend (PostgreSQL)
- `trip-planner-app/` — Expo (React Native + web) frontend
- `schema.sql` / `erd.mermaid` — PostgreSQL schema (source of truth for the data model)
- `API_DESIGN.md` — full REST contract; keep it in sync when adding/changing endpoints

## Commands

Database (once):
```bash
createdb trip_planner
psql trip_planner -f schema.sql
```

Incremental changes go through **timestamped migrations** in `migrations/` (`YYYYMMDDhhmmss_description.sql`), applied in order against an existing DB:
```bash
psql trip_planner -f migrations/<timestamp>_<description>.sql
```
Migrations are written idempotent (guarded `IF NOT EXISTS` / `pg_constraint` checks) and carry a commented `-- DOWN` rollback. `schema.sql` remains the source of truth — **keep it in sync by hand** so a fresh `psql -f schema.sql` produces the same result as replaying every migration. There is no migration runner; ordering and tracking are manual.

Backend (`trip-planner-api/`, needs `.env` from `.env.example`):
```bash
npm run dev      # tsx watch src/server.ts → http://localhost:3000
npm run build    # tsc → dist/
npm start        # node dist/server.js (run build first)
```

Frontend (`trip-planner-app/`, needs `.env` from `.env.example`):
```bash
npm start        # expo start (QR for Expo Go)
npm run web      # expo start --web
npm run android  # / npm run ios
npm run lint     # eslint (only automated check in the repo)
```

There is **no test suite** in either project. Health check: `GET /health`.

## Backend architecture

- **ESM + NodeNext.** `package.json` is `"type": "module"` and tsconfig uses `moduleResolution: NodeNext`. Relative imports **must include the `.js` extension** even though the source is `.ts` (e.g. `import authRoutes from './routes/auth.routes.js'`). This is the most common thing to get wrong.
- **Single DB pool.** Always `import { pool } from '../db/pool.js'`; never create new `Pool`/connections per request. Use `pool.connect()` + `BEGIN/COMMIT/ROLLBACK` only for multi-statement transactions (see the reorder handler in `activities.routes.ts`).
- **Routing.** `src/app.ts` mounts every router flat under `/api/v1`. Most routers are mounted at `/` and own their full paths (e.g. `daysRoutes` handles both `/trips/:tripId/days` and `/days/:dayId`).
- **Auth = two layers of middleware:**
  - `requireAuth` (`middleware/auth.ts`) validates the `Bearer` JWT and sets `req.user` (`{ userId, email }`). Routers call `router.use(requireAuth)` at the top.
  - `requireTripAccess(minRole)` (`middleware/tripAccess.ts`) checks the user is owner/collaborator of `req.params.tripId` and enforces role rank (`viewer < editor < owner`), setting `req.tripRole`.
- **Nested-resource pattern.** Routes keyed by a child id (e.g. `/activities/:activityId`, `/days/:dayId/...`) don't have `:tripId` in the URL. They first look up the owning `tripId` from the DB, assign it to `req.params.tripId`, then invoke `requireTripAccess('editor')(req, res, async () => { ... })` with the real handler as the callback. Follow this exact shape when adding such routes — and note `requireTripAccess` `return`s its `next()` so the callback's rejection propagates to the outer `try/catch`.
- **Error handling.** No throwing straight to Express — every handler is wrapped in `try/catch (err) { next(err) }`. The centralized handler in `app.ts` reads `err.status`/`err.code` and returns `{ error: { code, message } }`.
- **Amadeus proxy** (`services/amadeus.ts`). Hotel/flight search hit Amadeus server-side only, caching the OAuth2 client-credentials token in memory. API keys never reach the client.
- **Field naming.** Handlers accept **camelCase** in request bodies and map to snake_case columns explicitly (see `activities.routes.ts` `columnMap`), but responses are usually `SELECT *` so they come back **snake_case**. **Request bodies are validated with `zod`**: schemas live in `src/schemas.ts`, applied per-route via the `validateBody(schema)` middleware (`middleware/validate.ts`), which returns `400 { error: { code: 'validation_error', message, details } }` and replaces `req.body` with the parsed data. Add a schema there and wire it on any new POST/PATCH. GET-only routers (`map`, `locations`) and Amadeus search endpoints have no body validation.

## Frontend architecture

- **Expo Router (file-based).** Routes live in `app/`. Route groups: `(auth)` (login/register) and `(tabs)` (main app). `app/_layout.tsx` is an auth guard that re-checks the stored token on every navigation and redirects between `(auth)` and `(tabs)`.
- **Path alias.** `@/*` → `src/*` (tsconfig). This covers `src/` only, **not** the `app/` router directory.
- **API layer.** `src/api/client.ts` is a shared axios instance: a request interceptor attaches the stored JWT, a response interceptor clears it on 401. `baseURL` comes from `EXPO_PUBLIC_API_URL` (must already include `/api/v1`). Feature modules (`src/api/trips.ts`, `auth.ts`, `budget.ts`) wrap endpoints. State is Zustand (`src/store/`).
- **Token storage** (`src/utils/tokenStorage.ts`) is platform-split: `expo-secure-store` on native, `localStorage` on web (SecureStore has no web implementation). Always go through this wrapper.
- **Maps are native-only.** `react-native-maps` has no web build. Two mechanisms handle this and both must stay in place:
  1. Platform file split: `map.tsx` (native) vs `map.web.tsx` (web fallback).
  2. `metro.config.js` intercepts web resolution of `react-native-maps` and returns an empty module, because Expo Router bundles every route variant and Metro would otherwise try to transform it for web.

## When making changes

- Adding/changing an endpoint → update `API_DESIGN.md` and, if the data model changes, `schema.sql` + `erd.mermaid`.
- Changing the data model → write a migration in `migrations/` **and** patch `schema.sql` (+ `erd.mermaid` if structural) in the same change, so both the incremental path and the from-scratch path stay identical.
- The frontend and backend agree on `/api/v1`; `EXPO_PUBLIC_API_URL` must point at the machine's LAN IP (not `localhost`) when testing on a physical device via Expo Go.
