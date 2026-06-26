# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (all apps in parallel)
pnpm dev

# Individual apps
pnpm dev:backend    # Fastify on :3000 (tsx watch)
pnpm dev:frontend   # Vite on :5173, proxies /api /hub /oauth to :3000

# Build
pnpm build          # Build all packages
pnpm build:backend  # tsup → apps/backend/dist/
pnpm build:frontend # vite → apps/frontend/dist/

# Database
pnpm db:generate    # Drizzle-kit generate migrations
pnpm db:migrate     # Run migrations (tsx src/db/migrate.ts)

# Production
node apps/backend/dist/index.js  # Serves API + static frontend from public/

# Docker
docker-compose up -d --build
```

No test framework is configured.

## Architecture

pnpm monorepo with three packages:

- `apps/backend` — Fastify 5 + Drizzle ORM + SQLite (better-sqlite3)
- `apps/frontend` — React 19 + React Router 7 + Vite + Tailwind CSS
- `packages/shared` — TypeScript types and constants shared by both apps

### Data flow

**Admin web UI:** React pages → `api/client.ts` (fetch + JWT) → Fastify routes (`/api/v1/*`) → Drizzle ORM → SQLite

**WeChat bot:** WeChat message → OpenILink Hub → `/hub/webhook` → signature verify → `ai/parser.ts` (DeepSeek tool-calling) → save transaction → reply via `hub/bot-api.ts`

**Monthly summary:** node-cron job → aggregate month's data → DeepSeek generates analysis → broadcast to all WeChat members

### Backend structure

- `src/routes/` — One file per resource (auth, dashboard, transactions, assets, categories, accounts, members, settings, messages). All routes except auth endpoints use `authGuard` (JWT).
- `src/ai/` — DeepSeek integration: `deepseek.ts` (client), `parser.ts` (message→transaction via tool-calling), `prompts.ts` (system prompts with dynamic category injection), `monthly-summary.ts`
- `src/hub/` — WeChat bot: `webhook.ts` (event handler), `bot-api.ts` (send messages), `oauth.ts`, `manifest.ts`, `signature.ts`
- `src/db/` — `schema.ts` (Drizzle table definitions), `connection.ts` (SQLite setup with WAL + foreign keys), `seed.ts`, `migrate.ts`
- `src/config.ts` — Centralized env var reading with defaults
- `src/jobs/monthly-summary.ts` — Cron scheduler

Database tables are also created via raw SQL in `index.ts:initDatabase()` as a fallback, in addition to Drizzle migrations.

### Frontend structure

- `src/pages/` — One page component per route (Dashboard, Transactions, Assets, Categories, Accounts, Members, Messages, Settings, Login)
- `src/api/client.ts` — Typed fetch wrapper; auto-redirects to `/login` on 401
- `src/stores/auth.ts` — Zustand store for JWT token + username in localStorage
- `src/components/layout/` — AppLayout (auth guard + Outlet), Sidebar (nav), Header
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)

Routing is in `src/main.tsx` using `createBrowserRouter`.

### Configuration

Runtime config comes from two sources:
1. **Environment variables** (`.env`) — server port, DB path, JWT secret, admin credentials, DeepSeek defaults, Hub URL
2. **Settings table** (SQLite) — AI config, prompts, monthly summary schedule. Managed via `/api/v1/settings` and the Settings page. Settings override env vars for AI config.

### Key conventions

- All API routes prefixed `/api/v1/`
- Database columns use snake_case; Drizzle maps to camelCase in TypeScript
- ES modules throughout (`"type": "module"`, `.js` extensions in backend imports)
- Frontend uses `@/` path alias (mapped to `src/` via Vite + tsconfig)
- Shared types imported as `@caiwu/shared`
- IDs generated with `nanoid`
- UI pattern: table list + modal form for CRUD pages, Tailwind utility classes, Lucide icons
