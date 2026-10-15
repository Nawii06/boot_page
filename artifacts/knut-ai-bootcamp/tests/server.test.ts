import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { routeDefinitions } from '../src/shared/pageRoutes.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';

const cacheRoot = resolve('.cache/tests');
mkdirSync(cacheRoot, { recursive: true });
const fixture = mkdtempSync(join(cacheRoot, 'server-'));
const config = loadConfig({}, fixture);
mkdirSync(config.clientDirectory, { recursive: true });
writeFileSync(join(config.clientDirectory, 'index.html'), '<!doctype html><html lang="ko"><div id="root"></div></html>');
writeFileSync(join(fixture, '.env'), 'SHOULD_NEVER_BE_PUBLIC=private-test-marker');
const database = openDatabase(config.dbPath, { create: true });
await migrateDatabase(database, resolve('migrations'), config.backupDirectory);
const repository = new ContentRepository(database);
const hidden = await repository.create({ kind: 'notice', slug: 'hidden-api-example', title: '[예시] 비공개 안내', bodyHtml: '<p>예시 비공개 본문</p>', publication: 'private' });
const visible = await repository.create({ kind: 'notice', slug: 'public-api-example', title: '[예시] 공개 안내', bodyHtml: '<p>예시 공개 본문</p>', publication: 'public', relatedIds: [hidden.id] });
await repository.create({ kind: 'page', slug: 'overview', title: '[예시] 사업소개', bodyHtml: '<p>예시 입력 대기</p>', publication: 'public' });
const program = await repository.create({ kind: 'curriculum', slug: 'api-example-program', title: '[예시] 과정 안내', bodyHtml: '<p>예시 입력 대기</p>', publication: 'public', program: { level: '', audience: '', delivery: '', completionRequirements: '' }, relatedIds: [visible.id, hidden.id] });
await repository.setHomeItems([{ section: 'notice', contentId: visible.id }, { section: 'notice', contentId: hidden.id }]);
const server = createApp(config, true, database).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  database.close();
  const boundary = relative(cacheRoot, fixture);
  if (!boundary || boundary.startsWith('..') || resolve(cacheRoot, boundary) !== fixture) throw new Error('Unsafe test cleanup path');
  rmSync(fixture, { recursive: true, force: true });
});

test('defaults are loopback; network binding requires explicit opt-in and valid ports', () => {
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
  assert.equal(config.devPort, 5173);
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /ALLOW_NETWORK/);
  assert.equal(loadConfig({ HOST: '0.0.0.0', ALLOW_NETWORK: 'true' }).host, '0.0.0.0');
  for (const value of ['0', '-1', '65536', '3000bad']) assert.throws(() => loadConfig({ PORT: value }));
  assert.throws(() => loadConfig({ PORT: '5173' }), /different/);
  assert.equal(config.dbPath, join(fixture, 'var', 'db', 'bootcamp.sqlite'));
  assert.equal(loadConfig({ DB_PATH: './custom/local.sqlite' }, fixture).dbPath, join(fixture, 'custom', 'local.sqlite'));
  for (const DB_PATH of [':memory:', './dist/client/private.sqlite', './src/client/private.sqlite', './node_modules/private.sqlite', './private.json']) {
    assert.throws(() => loadConfig({ DB_PATH }, fixture));
  }
  assert.equal(config.sessionTtlSeconds, 28800);
  assert.equal(config.cookieSecure, false);
  assert.ok(config.appOrigins.includes('http://127.0.0.1:5173'));
  for (const env of [
    { SESSION_TTL_SECONDS: '299' }, { SESSION_TTL_SECONDS: '86401' }, { COOKIE_SECURE: 'yes' },
    { APP_ORIGIN: 'http://example.test' }, { APP_ORIGIN: 'http://127.0.0.1:3000/' },
    { APP_ORIGIN: 'https://example.test' }, { COOKIE_SECURE: 'true' },
    { APP_ORIGIN: 'http://127.0.0.1:3000', COOKIE_SECURE: 'true' },
  ]) assert.throws(() => loadConfig(env, fixture));
  const secure = loadConfig({ APP_ORIGIN: 'https://example.test', COOKIE_SECURE: 'true' }, fixture);
  assert.deepEqual(secure.appOrigins, ['https://example.test']);
});

test('health is real and declares unimplemented capabilities honestly', async () => {
  const result = await fetch(`${base}/api/health`);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.stage, 'P-08');
  assert.deepEqual(body.data.capabilities, { database: true, authentication: true, uploads: true });
});

test('unimplemented API and mutations never return a fake success or HTML', async () => {
  for (const [method, path] of [['POST', '/api/public/contents'], ['GET', '/api/admin/contents'], ['POST', '/api/admin/contents'], ['PATCH', '/api/admin/contents/sample'], ['DELETE', '/api/admin/contents/sample'], ['POST', '/api/admin/files']]) {
    const result = await fetch(`${base}${path}`, { method });
    assert.equal(result.status, 401, `${method} ${path}`);
    assert.match(result.headers.get('content-type') || '', /application\/json/);
    assert.equal((await result.json()).error.code, 'AUTH_REQUIRED');
    assert.equal(result.headers.get('set-cookie'), null);
  }
});

test('public API reads persisted data while filtering private sources, relationships and home selections', async () => {
  const list = await (await fetch(`${base}/api/public/contents?kind=notice`)).json();
  assert.deepEqual(list.data.map((item: { id: string }) => item.id), [visible.id]);
  assert.deepEqual(list.pagination, { page: 1, pageSize: 20, total: 1 });
  const detail = await (await fetch(`${base}/api/public/contents/${visible.id}`)).json();
  assert.equal(detail.data.bodyHtml, '<p>예시 공개 본문</p>');
  assert.deepEqual(detail.data.relatedContents, []);
  for (const id of [hidden.id, '00000000-0000-4000-8000-000000000001', 'invalid']) {
    assert.equal((await fetch(`${base}/api/public/contents/${id}`)).status, 404);
  }
  const programResponse = await (await fetch(`${base}/api/public/programs/curriculum/${program.slug}`)).json();
  assert.deepEqual(programResponse.data.relatedContents.map((item: { id: string }) => item.id), [visible.id]);
  assert.equal((await fetch(`${base}/api/public/pages/overview`)).status, 200);
  assert.equal((await fetch(`${base}/api/public/pages/location`)).status, 404);
  const home = await (await fetch(`${base}/api/public/home`)).json();
  assert.deepEqual(home.data.sections.notice.map((item: { id: string }) => item.id), [visible.id]);
  assert.doesNotMatch(JSON.stringify(home), new RegExp(hidden.id));
});

test('public API rejects invalid queries and treats SQL metacharacters as values', async () => {
  for (const query of ['kind=invalid', 'page=0', 'pageSize=101', 'page=2&page=3', 'publication=private', 'q=' + 'x'.repeat(201)]) {
    assert.equal((await fetch(`${base}/api/public/contents?${query}`)).status, 400, query);
  }
  const result = await fetch(`${base}/api/public/contents?q=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).data, []);
  assert.equal((await repository.getById(hidden.id))?.publication, 'private');
});

test('public/login routes support direct access and admin routes redirect without a session', async () => {
  assert.equal(new Set(routeDefinitions.map(route => route.id)).size, 28);
  for (const route of routeDefinitions) {
    const path = route.path.replace(/:[^/]+/g, 'preview');
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await fetch(`${base}${path}`, { redirect: 'manual' });
      if (route.area === 'admin' && route.kind !== 'login') {
        assert.equal(result.status, 302, `${route.id} ${path}`);
        assert.equal(result.headers.get('location'), `/admin/login?next=${encodeURIComponent(path)}`);
      } else {
        assert.equal(result.status, 200, `${route.id} ${path}`);
        assert.match(await result.text(), /id="root"/);
      }
    }
  }
});

test('private paths and missing assets never expose files or return the SPA shell', async () => {
  for (const path of ['/.env', '/var/db/bootcamp.sqlite', '/uploads/test.pdf', '/backups/export.json', '/src/server/config.ts', '/docs/PROJECT_CONTEXT.md', '/migrations/001_initial.sql', '/seed/example-contents.json', '/assets/missing.js', '/package.json']) {
    const result = await fetch(`${base}${path}`);
    assert.equal(result.status, 404, path);
    const text = await result.text();
    assert.doesNotMatch(text, /private-test-marker|id="root"/);
  }
  const result = await fetch(`${base}/unknown-page`);
  assert.equal(result.status, 404);
  assert.match(await result.text(), /id="root"/);
});
