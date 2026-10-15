---
name: Ephemeral PostgreSQL tests
description: Constraints for safe, disposable PostgreSQL integration tests in Replit.
---

Run managed-database integration checks only against a newly initialized local PostgreSQL cluster, never the inherited app database URL. Keep its data directory and Unix socket inside one temporary directory and remove the directory after stopping the server. Replit's PostgreSQL binaries may otherwise try to create sockets under `/run/postgresql`, which is not guaranteed to exist.

**Why:** A disposable local server verifies real PostgreSQL transaction behavior without altering shared development or production data; the default socket directory caused startup failure in this workspace.

**How to apply:** Override `DATABASE_URL` only in the test child process with a loopback connection to the scratch cluster, set PostgreSQL's socket directory to the scratch path, and assert the target host/port before opening the app database wrapper.
