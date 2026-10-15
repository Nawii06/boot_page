# KNUT AI Bootcamp pilot website

Pilot public website and local content-management system for the National Korea
Transportation University AI Bootcamp team. The source application is imported
from `Nawii06/boot_page`; use its existing routes, security rules, and content
model rather than replacing them with a new implementation.

## Run & Operate

- The website preview is served at `/` by the `artifacts/knut-ai-bootcamp: web`
  workflow; its Express API is at `/api` via `artifacts/knut-ai-bootcamp: api`.
- `pnpm install` — install the workspace packages.
- `pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run db:migrate`
  — apply pending local SQLite migrations; the app does not migrate on startup.
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
- The imported app stores SQLite, uploads, and backups under its own `var/`
  directory. These local files are not included in Git.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Website: React, TypeScript, Vite, React Router
- App API: Express 5 + SQLite (`better-sqlite3`)
- The separate workspace API template and Drizzle/PostgreSQL library remain available,
  but the bootcamp app does not use them for its content database.
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/knut-ai-bootcamp/` — imported public site, admin UI, Express API,
  SQLite migrations, seed records, and acceptance documentation.
- `artifacts/knut-ai-bootcamp/README.md` — original project operating guide.
- `artifacts/knut-ai-bootcamp/docs/REPLIT_SETUP.md` — Replit-specific setup and
  current limitations.
- `lib/api-spec/openapi.yaml` and `artifacts/api-server/` — separate workspace
  starter API; not the bootcamp site's application API.

## Architecture decisions

- Preserve the imported app's SQLite data model; do not migrate it to the
  workspace PostgreSQL database without the user's explicit request.
- Keep the original local Node/npm pin for the Windows workflow. Replit's
  managed Node version differs, so the app workflows explicitly bypass only
  pnpm's strict engine check; typecheck and build were verified in Replit.
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

- Create or migrate the local SQLite database explicitly before starting the
  API workflow. The workflow intentionally does not create or reset the DB.
- No administrator credentials or official campus contact details are in the
  imported source. Create a local admin through the secure interactive CLI.
- Actual Hancom-authored HWP/HWPX compatibility remains unverified.
- The current file-backed database and uploads have not been made production
  persistent. Do not publish this app as an operational site until storage and
  content ownership are reviewed.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
