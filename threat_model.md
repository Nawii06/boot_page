# Threat Model

## Project Overview

KNUT AI Bootcamp pilot website — a public university-program site with an
authenticated admin CMS for announcements, programs, forms, FAQs, fixed pages,
and home-page content. Monorepo (pnpm workspaces, Node 24, TypeScript). The
production artifact is `artifacts/knut-ai-bootcamp`: a React/Vite SPA served by
an Express 5 API. Data lives in SQLite (`better-sqlite3`) locally, or Replit
PostgreSQL + Replit App (object) Storage when `DATABASE_URL` is present.
Deployed on Replit Autoscale (`knut-bta.replit.app`, public visibility).

A second artifact, `artifacts/api-server`, is a starter template exposing only a
health route; it is not the bootcamp application API and is not the production
surface. `artifacts/mockup-sandbox` is a design canvas (dev-only).

## Assets

- **Admin credentials and sessions** — admin password hashes (scrypt), session
  tokens, CSRF secrets, pre-auth CSRF tokens. Compromise grants full CMS control.
- **Private uploaded files** — attachments (HWP/HWPX/PDF/DOCX/images) stored in
  `var/uploads` or private Replit App Storage; only reachable through public
  content links or an authenticated admin.
- **Content data** — announcements/pages/programs, including draft/private
  records that must not leak before publication.
- **Application secrets** — DB connection string, object-storage sidecar
  credentials. Never exposed to the client.

## Trust Boundaries

- **Browser → API** — every request is untrusted. Mutations require an admin
  session cookie, an allowlisted `Origin`, and a matching `X-CSRF-Token`.
- **API → database** — all queries use parameterized statements.
- **API → Replit App Storage sidecar** — signed upload URLs and object
  read/write mediated by the app; object keys constrained to `uploads/<uuid>`.
- **Public ↔ authenticated** — `/api/public/*` serves only `publication='public'`
  rows; `/api/admin/*` sits behind `requireAdmin` + `requireMutationCsrf`.
- **Internal CLI vs HTTP** — content export/import (`src/server/transfer`) and
  `admin:create` run only via scripts/CLI; they are not mounted on any route.

## Scan Anchors

- Production entry points: `artifacts/knut-ai-bootcamp/src/server/app.ts`
  (route wiring, security headers, private-path blocklist, SPA fallback),
  `src/server/index.ts` (startup, DB selection, upload cleanup).
- Auth: `src/server/auth/service.ts`, `auth/passwords.ts`, `http/auth.ts`
  (guards `requireAdmin`, `requireMutationCsrf`, cookie parsing).
- Files: `src/server/files/service.ts` (path/symlink hardening in `pathForKey`,
  `resolveDownload` + `canReadFile` authorization), `files/formats.ts`,
  `files/hwpValidation.ts`, `files/objectStorage.ts`, `http/files.ts`.
- Content/authorization: `src/server/repositories/contentRepository.ts`
  (`canReadFile`, `read`/`listPublic` scoped to `publication='public'`),
  `content/noticeHtml.ts` (sanitize-html on read and write).
- Client HTML sinks: `dangerouslySetInnerHTML` in client pages renders only
  server-sanitized `bodyHtml`.
- Dev-only / non-production: `artifacts/api-server` (health stub, wildcard CORS,
  not the site API), `artifacts/mockup-sandbox` (design canvas).

## Threat Categories

### Spoofing / Improper Authentication
Admin login uses scrypt with fixed bounded parameters, timing-safe comparison,
a dummy-hash path for unknown/disabled accounts, per-IP and per-username rate
limiting, and a re-check after the async hash so in-flight logins are
invalidated by password reset/disable. Sessions are random 256-bit tokens stored
hashed; cookies are `httpOnly`, `sameSite=lax`, `secure` in production. No known
spoofing gap.

### Tampering / CSRF
State-changing requests require an allowlisted `Origin` (never derived from
Host/Referer/forwarded headers) plus a session-bound `X-CSRF-Token`. Login has a
dedicated pre-auth CSRF token. Input bodies are strictly key-allowlisted and
size-limited. No known tampering gap.

### Information Disclosure
Public read paths filter strictly on `publication='public'`; file downloads call
`canReadFile`, which requires an actual public content link (or an admin
session) — raw IDs/paths/URLs confer no access. Error responses are generic.
Security headers (`nosniff`, `DENY` framing, `no-store`, CSP sandbox on
downloads) are set. No known disclosure gap.

### Elevation of Privilege / Injection
All SQL is parameterized. Uploaded HTML is sanitized with an allowlist on both
write and read; only server-constructed image URLs survive. File uploads undergo
deep structural validation and zip-bomb/pixel limits, with HWP parsing isolated
in a resource-limited worker. Path handling (`pathForKey`, transfer `noLinks`)
resolves real paths and rejects symlinks and traversal. No known EoP gap.

### Denial of Service
Login, CSRF issuance, and uploads are rate limited; upload concurrency is
capped; request bodies, image pixels, and zip expansion are bounded; external
calls use timeouts. Residual risk is limited by Replit Autoscale.
