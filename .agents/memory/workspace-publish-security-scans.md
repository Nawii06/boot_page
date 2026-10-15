---
name: Workspace publish security scans
description: Replit's publish security gate can be affected by dependencies outside the selected app artifact.
---

Treat Replit's publish dependency scan as workspace-wide: a separate starter or support artifact can block publishing the website. When a transitive dependency is flagged, update its direct parent to a safe maintained release rather than disabling the scanner or blindly overriding packages. Verify the lockfile no longer contains the vulnerable version and rebuild the affected workspace packages.

**Why:** Publishing the KNUT website was blocked by a critical dependency pulled in by the separate workspace API starter, even though the website's own Express dependency already resolved to the patched chain.

**How to apply:** For future publish blocks, inspect the full monorepo dependency tree, identify which package brings the advisory, and verify the fixed resolution before asking the user to retry Publish.
