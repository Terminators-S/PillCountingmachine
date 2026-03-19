# PillCount Project Work Log

Last updated: March 5, 2026 (Asia/Bangkok)
Project root: `h:\ONEDRIVE LINK\Pill Count UI`

## 1) What Was Built

### Monorepo structure (new stack)
- `apps/web`: Next.js 14 (App Router) + TypeScript + Tailwind + TanStack Query/Table
- `apps/api`: NestJS + TypeScript + Prisma
- `packages/shared`: shared types + zod schemas
- `packages/ui`: shared UI primitives

### Database + Prisma
- Full Prisma schema for:
  - users/roles/refresh tokens/api keys
  - machines + machine events (idempotency key)
  - pill types + lots
  - inventory balances + append-only inventory transactions
  - counting jobs + progress + evidence + recount relation
  - cycle count sessions/items
  - audit logs
- Seed script added with:
  - admin user
  - RBAC roles
  - machine API key
  - 1 machine
  - 3 pill types + 3 lots
  - receive inventory transactions
  - sample machine events

### Backend modules implemented
- Auth (register/login/refresh/me)
- RBAC + guards
- Machines (register/heartbeat/list/details)
- Machine events ingestion/list (idempotent)
- Pill types CRUD
- Lots CRUD + quarantine support
- Inventory operations:
  - receive, transfer, adjust (approval), reserve, release, dispense (FEFO), cycle count
- Jobs/Sessions:
  - create, start, progress, complete, recount, evidence
- Reports + CSV exports
- API keys management
- Audit logging middleware + audit viewer endpoint
- SSE live events endpoint
- Added root API status endpoint:
  - `GET /api`
  - `GET /api/health`

### Frontend implemented
- Enterprise app shell:
  - sidebar nav
  - topbar
  - breadcrumbs
  - global search placeholder
  - notification placeholder
  - theme toggle (light/dark)
  - live connection indicator
- Pages:
  - `/login`
  - `/overview`
  - `/machines`
  - `/inventory`
  - `/lots-expiry`
  - `/jobs`
  - `/reports`
  - `/users-roles`
  - `/settings`
  - `/audit-log`
- Data tables with sorting/filtering/pagination and row actions
- SSE hook wired to backend live stream

### Infra/docs implemented
- `docker-compose.yml` for postgres + api + web
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `.dockerignore`
- Updated `README.md` for new monorepo setup
- `docs/sample-event-payloads.json`

## 2) Key Fixes Applied During Bring-up

1. Web port conflict fix
- Original web dev was fixed on 3000 and collided with existing services.
- Updated web defaults to use port `3100`.

2. API start script path fix
- Corrected Nest output path from `dist/main.js` to `dist/src/main.js`.

3. Auth and env startup hardening
- Added safe fallback secrets in auth service/strategy for local dev.
- Added API-local `.env` with `DATABASE_URL` and JWT settings.

4. Prisma startup issue
- Added DB URL fallback in Prisma service to avoid missing env crash.

5. SSE delivery bug fix
- Adjusted SSE controller payload format so frontend receives events reliably via `onmessage`.

6. Login form bug fix
- `Input` component changed to `forwardRef` so React Hook Form works correctly.

7. API root route UX fix
- Added `GET /api` and `GET /api/health` so root API URL no longer returns `Cannot GET /api`.

## 3) Current Runtime Notes

- Old legacy app process may still exist in this workspace (`apps/api/src/server.js`) and can run on `3001`.
- New stack URLs to use:
  - UI: `http://localhost:3100`
  - API: `http://localhost:4000/api`

If UI shows degraded connection, verify:
1. API process is running on port 4000
2. UI is opened from `3100` (not old app on `3001`)
3. Clear old tokens in browser localStorage if needed

## 4) Current Env Assumptions

Root `.env` includes new stack keys:
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `API_PORT=4000`
- `NEXT_PUBLIC_API_URL=http://localhost:4000/api`

API local env also exists:
- `apps/api/.env`

## 5) Quick Run Commands

```bash
# from project root
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

If port conflicts:
- Keep API on 4000
- Keep Web on 3100

## 6) Good Next Prompts You Can Reuse

1. "Implement Phase 2 with full automated tests (unit/integration/e2e) for auth, inventory FEFO, and jobs complete flow."
2. "Remove/retire all legacy Express/Vite files and keep only new Next/Nest monorepo paths."
3. "Add OpenAPI/Swagger docs for all Nest endpoints with request/response examples."
4. "Add robust machine event ingestion queue (retry, DLQ, out-of-order correction)."
5. "Add production-grade logging/metrics (pino + Prometheus) and health readiness probes."
6. "Enhance Settings page with webhook CRUD and delivery retry logs."
7. "Build a proper Notifications center UI and backend notification rules engine."
8. "Add tenancy support (multi-tenant schema and tenant scoping guards)."

## 7) Important Files for Future Context

- API schema: `apps/api/prisma/schema.prisma`
- API seed: `apps/api/prisma/seed.ts`
- API root module: `apps/api/src/app.module.ts`
- Inventory logic: `apps/api/src/inventory/inventory.service.ts`
- Jobs logic: `apps/api/src/jobs/jobs.service.ts`
- Live SSE: `apps/api/src/live/live.controller.ts`
- Web shell: `apps/web/components/app-shell.tsx`
- Login page: `apps/web/app/(auth)/login/page.tsx`
- Data table: `apps/web/components/data-table.tsx`
- Project runbook: `README.md`
