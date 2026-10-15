# KNUT AI Bootcamp pilot website

Pilot public website and local content-management system for the National Korea
Transportation University AI Bootcamp team. The source application is imported
from `Nawii06/boot_page`; use its existing routes, security rules, and content
model rather than replacing them with a new implementation.

## Run & Operate

- The website preview is served at `/` by the `artifacts/knut-ai-bootcamp: web`
  workflow; its Express API is at `/api` via `artifacts/knut-ai-bootcamp: api`.
- `pnpm install --frozen-lockfile` — install the workspace packages.
- `pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run db:migrate`
  — writes SQLite migrations without DATABASE_URL, or development PostgreSQL
    schema with DATABASE_URL. Confirm the target first. No migration on startup.
- `pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run db:seed`
  — add the explicitly labeled example records to a fresh development database.
- `pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run admin:create --username <chosen-id>`
  — create an administrator using the interactive hidden password prompt.
- `pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run typecheck`
  — typecheck the imported application.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run build`
  — typecheck and build the website and API.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The app uses SQLite/uploads under its var directory without DATABASE_URL,
  or PostgreSQL + App Storage with DATABASE_URL. Private state is excluded from Git.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Website: React, TypeScript, Vite, React Router
- App API: Express 5 + asynchronous data adapter; local SQLite or PostgreSQL
  through @workspace/db, selected by DATABASE_URL.
- Managed attachments use App Storage. The separate API starter is not the
  bootcamp application API.
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Bootcamp build: Vite frontend + TypeScript server. The separate starter uses
  its own esbuild bundle.

## Where things live

- `artifacts/knut-ai-bootcamp/` — imported public site, admin UI, Express API,
  SQLite migrations, seed records, and acceptance documentation.
- `artifacts/knut-ai-bootcamp/README.md` — original project operating guide.
- `artifacts/knut-ai-bootcamp/docs/REPLIT_SETUP.md` — Replit-specific setup and
  current limitations.
- `lib/api-spec/openapi.yaml` and `artifacts/api-server/` — separate workspace
  starter API; not the bootcamp site's application API.

## Architecture decisions

- Continue from Replit c4746e7 integrated into main, preserving managed storage
  and existing routes. Do not reset or convert operational data during a source
  checkout or merge.
- Keep the original local Node/npm pin for the Windows workflow. Replit's
  managed Node version differs, so the app workflows explicitly bypass only
  pnpm's strict engine check. Earlier Replit records report passing typecheck
  and build; these were not rerun during this main integration.
- Replit API origin and secure cookies are derived at runtime from the Replit
  domain. Do not commit `.env`, credentials, database files, uploads, or backups.

## Product

The site contains public university-program pages and an authenticated admin
area for managing announcements, programs, forms, FAQs, fixed pages, and home
page content. The current development database contains only clearly labeled
example content; it is not official university information.

## User preferences

Continue from the existing GitHub application; do not redesign or replace its
working pages unless the user requests a change.

## Gotchas

- Prepare only the intended DB explicitly. db:migrate writes to the environment
  selected by DATABASE_URL. The workflow does not create or reset data on startup.
- No administrator credentials or official campus contact details are in the
  imported source. Create a local admin through the secure interactive CLI.
- Actual Hancom-authored HWP/HWPX compatibility remains unverified.
- Managed runtime support exists, but content:export/import still reads local
  SQLite/uploads. Validate managed backup/restore and durability.
- Replit postMerge invokes a schema push. Local source integration did not run
  it or redeploy the published app.
- Follow docs/content-refresh/BASELINE.md for unresolved static findings and
  docs/content-refresh/INTEGRATION.md for the current source baseline.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
