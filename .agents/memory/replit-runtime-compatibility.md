---
name: Replit runtime compatibility
description: Preserve the imported site's upstream runtime contract while using the current Replit-managed Node runtime.
---

The upstream project pins Node.js 24.21.0 for its local Windows workflow. The current Replit-managed pnpm workflow reports Node.js 24.12.0, while the interactive shell resolves Node.js 24.13.0. Keep the original source runtime pin and strict policy; scope any engine-strict override to the Replit artifact commands, and verify the site's typecheck and build in the active runtime after dependency or runtime changes.

**Why:** This project is a continuation of an existing repository, so changing its upstream runtime contract just to accommodate the current Replit runtime would silently invalidate the original local setup.

**How to apply:** When Replit's managed Node runtime changes, confirm the version reported by both the workflow and interactive shell. If the workflow reaches the pinned 24.21.0 version, re-test before removing the Replit-specific engine override.
