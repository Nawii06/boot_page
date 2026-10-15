# Replit setup

The source is imported from the public `main` branch of
[`Nawii06/boot_page`](https://github.com/Nawii06/boot_page), at commit
`90d7de6b9704113035fb8bb24444e29fa5003103`. This is a source snapshot; changes
made in this Replit project have not been pushed back to GitHub.

## Development

Install packages from the workspace root with `pnpm install`. The website and
its API run as separate managed services: the website is at `/`, and the
application API is under `/api`. The Replit proxy sends API requests directly
to the app service; local development outside Replit continues to use Vite's
local API proxy.

The repository pins Node.js 24.21.0 for its original Windows workflow. The
Replit-managed workflow uses Node.js 24.12.0, so its pnpm commands explicitly
disable strict engine rejection. This does not change the original local
runtime instructions; run the application's typecheck and build after changes.

Prepare a new local database once:

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

- SQLite data, uploads, and backups are stored under `artifacts/knut-ai-bootcamp/var/`
  and are excluded from Git. This setup has not been made durable for production.
- The source repository contains no administrator account, official campus
  contact details, or actual content database.
- Real Hancom-authored HWP/HWPX files have not been tested. Existing synthetic
  structure checks are not evidence of compatibility with original documents.
- `lucide-react` is held at 1.56.0 in this imported workspace because 1.57.0
  was newer than the workspace's minimum-release-age window at import time.
  The workspace's minimum-release-age policy remains enabled.
- Before publishing for real use, choose and verify durable database and file
  storage, configure real content, and test the original HWP/HWPX files.
