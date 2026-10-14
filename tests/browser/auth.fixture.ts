import { test as base, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';
import { openDatabase } from '../../src/server/db/connection.js';
import { migrateDatabase } from '../../src/server/db/migrations.js';
import { createAdmin } from '../../src/server/auth/adminAccounts.js';

type BrowserServer = { base: string; username: string; password: string; expireSessions: () => void };

export const test = base.extend<{ login: (next?: string) => Promise<void>; authServer: BrowserServer }>({
  // Each scenario owns its own DB/account so successful logins in unrelated
  // scenarios cannot accumulate against the real, unchanged attempt limiter.
  authServer: async ({}, use) => {
    const clientDirectory = resolve('dist/client');
    if (!existsSync(join(clientDirectory, 'index.html'))) throw new Error('Build first: npm.cmd run build. Browser tests use an isolated database and the built frontend.');
    const cacheRoot = resolve('.cache/browser-fixtures');
    mkdirSync(cacheRoot, { recursive: true });
    const directory = mkdtempSync(join(cacheRoot, 'authenticated-'));
    const config = loadConfig({}, directory);
    config.clientDirectory = clientDirectory;
    const database = openDatabase(config.dbPath, { create: true });
    await migrateDatabase(database, resolve('migrations'), config.backupDirectory);
    const username = `browser-${randomBytes(6).toString('hex')}`;
    const password = randomBytes(32).toString('base64url');
    await createAdmin(database, username, password);
    const server = createApp(config, true, database).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.appOrigins.push(origin);
    try {
      await use({
        base: origin, username, password,
        expireSessions: () => { database.prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString()); },
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      database.close();
      const boundary = relative(cacheRoot, directory);
      if (!boundary || boundary.startsWith('..') || resolve(cacheRoot, boundary) !== directory) throw new Error('Unsafe browser fixture cleanup path');
      rmSync(directory, { recursive: true, force: true });
    }
  },
  baseURL: async ({ authServer }, use) => { await use(authServer.base); },
  login: async ({ page, authServer }, use) => {
    await use(async (next = '/admin') => {
      await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
      await page.getByLabel('관리자 아이디', { exact: true }).fill(authServer.username);
      await page.getByLabel('비밀번호', { exact: true }).fill(authServer.password);
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await expect(page).toHaveURL(new URL(next, authServer.base).href);
      await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    });
  },
});

export { expect };
