# Replit setup

The original local source was imported at `90d7de6`. The main working baseline
now incorporates Replit branch `replit-content-snapshot-20261015` at `c4746e7`,
preserving both Git histories and local documentation. See the
[workspace guide](../../../README.md) and [integration record](../../../docs/content-refresh/INTEGRATION.md).
This source integration does not redeploy the app or migrate its data.

## Development

Install packages from the workspace root with `pnpm install --frozen-lockfile`. The website and
its API run as separate managed services: the website is at `/`, and the
application API is under `/api`. The Replit proxy sends API requests directly
to the app service; local development outside Replit continues to use Vite's
local API proxy.

The app retains the original Node.js 24.21.0/npm pin. Earlier Replit records
reported a different managed Node version; verify the active runtime. Keep
engine overrides scoped to Replit. Windows installation, packaging and builds
were not rerun during integration. The old app npm lockfile and standalone
packager need follow-up; historical Windows instructions are not verified for
this workspace.

The server selects PostgreSQL + App Storage with DATABASE_URL, or SQLite + local
uploads without it. Check the intended environment without printing secrets.

The following commands WRITE data: db:migrate applies SQLite migrations without
DATABASE_URL, but pushes the development PostgreSQL schema with DATABASE_URL.
Seed and admin commands also target the selected database. Use only an explicitly
chosen environment; these are not read-only integration checks.

```sh
pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run db:migrate
pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run db:seed
```

The seed is optional and contains only `[예시]` records. No admin account is
created automatically. To create one, run the following from the Replit
workspace terminal and enter the password only into the hidden interactive
prompt:

```sh
pnpm --config.engine-strict=false --filter @workspace/knut-ai-bootcamp run admin:create --username my_admin
```

Never put an administrator password in chat, command-line arguments, or
environment variables.

## Current limits

- Local SQLite mode stores data/uploads/backups under the app var directory,
  excluded from Git. Managed mode uses PostgreSQL and App Storage instead.
- content:export/import still targets local SQLite/uploads. Managed backup/restore
  and restart/redeploy durability require independent validation. The committed
  content snapshot contains examples, not a verified production backup.
- Replit postMerge installs packages and invokes a DB schema push. Check its
  target before syncing or merging in Replit. This integration did not run it.
- The source repository contains no administrator account, official campus
  contact details, or actual content database.
- Real Hancom-authored HWP/HWPX files have not been tested. Existing synthetic
  structure checks are not evidence of compatibility with original documents.
- `lucide-react` is held at 1.56.0 in this imported workspace because 1.57.0
  was newer than the workspace's minimum-release-age window at import time.
  The workspace's minimum-release-age policy remains enabled.
- The user reported publishing the app. This integration did not inspect or
  modify that deployment. Verify its commit, storage, backups and original
  HWP/HWPX compatibility separately.
