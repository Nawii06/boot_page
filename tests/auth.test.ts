import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { createAdmin, resetAdmin } from '../src/server/auth/adminAccounts.js';
import { AuthService } from '../src/server/auth/service.js';
import { createAuthGuards } from '../src/server/http/auth.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';

const cacheRoot = resolve('.cache/tests');
mkdirSync(cacheRoot, { recursive: true });
const sessionName = 'knut_admin_session';

class Cookies {
  private values = new Map<string, string>();
  update(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';')[0];
      const index = pair.indexOf('=');
      this.values.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join('; '); }
  value(name: string) { return this.values.get(name); }
}

async function fixture(t: TestContext, options: { secure?: boolean } = {}) {
  const directory = mkdtempSync(join(cacheRoot, 'auth-http-'));
  const config = loadConfig({}, directory);
  config.cookieSecure = options.secure ?? false;
  let db = openDatabase(config.dbPath, { create: true });
  await migrateDatabase(db, resolve('migrations'), config.backupDirectory);
  const username = `test-${randomBytes(6).toString('hex')}`;
  const password = randomBytes(32).toString('base64url');
  const admin = await createAdmin(db, username, password);
  let repository = new ContentRepository(db);
  const visible = repository.create({ kind: 'notice', slug: 'public-test', title: '[예시] 공개 테스트', bodyHtml: '<p>공개 테스트</p>', publication: 'public' });
  const hidden = repository.create({ kind: 'notice', slug: 'private-test', title: '[예시] 비공개 테스트', bodyHtml: '<p>비공개 테스트</p>', publication: 'private' });
  let server: Server;
  let base = '';
  function start() {
    const app = express();
    const guards = createAuthGuards(new AuthService(db, { sessionTtlSeconds: config.sessionTtlSeconds }), config);
    // Test-only mutation exercises the production guards against a real DB write.
    // It is never registered by the application or available outside this fixture.
    app.patch('/__test/content', guards.requireAdmin, guards.requireMutationCsrf, (_req, res) => {
      const current = repository.getById(visible.id)!;
      const updated = repository.update(visible.id, {
        kind: current.kind, slug: current.slug, title: '[예시] 권한 검증 후 실제 수정',
        bodyHtml: current.bodyHtml, publication: current.publication,
      }, current.revision);
      res.json({ data: { id: updated.id, revision: updated.revision } });
    });
    app.use(createApp(config, false, db));
    server = app.listen(0, '127.0.0.1');
    return once(server, 'listening').then(() => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      config.appOrigins.push(base);
    });
  }
  async function stop() {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  }
  await start();
  t.after(async () => {
    await stop(); db.close();
    const boundary = relative(cacheRoot, directory);
    if (!boundary || boundary.startsWith('..') || resolve(cacheRoot, boundary) !== directory) throw new Error('Unsafe auth fixture cleanup path');
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init);
  async function preauth(jar = new Cookies()) {
    const response = await request('/api/auth/csrf', { headers: { Cookie: jar.header() } });
    assert.equal(response.status, 200);
    jar.update(response);
    return { jar, csrf: (await response.json()).data.csrfToken as string };
  }
  async function login(jar = new Cookies(), secret = password, account = username) {
    const pre = await preauth(jar);
    const response = await request('/api/auth/login', {
      method: 'POST', headers: { Origin: base, Cookie: jar.header(), 'X-CSRF-Token': pre.csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: account, password: secret }),
    });
    jar.update(response);
    const body = await response.json();
    return { jar, response, body, csrf: body.data?.csrfToken as string | undefined };
  }
  return {
    config, admin, username, password, visible, hidden, request, preauth, login,
    get base() { return base; }, get db() { return db; }, get repository() { return repository; },
    async restart() { await stop(); db.close(); db = openDatabase(config.dbPath); repository = new ContentRepository(db); await start(); },
  };
}

test('anonymous public reads work; every administrative or unknown mutation requires server authentication', async t => {
  const f = await fixture(t);
  assert.equal((await f.request(`/api/public/contents/${f.visible.id}`)).status, 200);
  assert.equal((await f.request(`/api/public/contents/${f.hidden.id}`)).status, 404);
  for (const [method, path] of [
    ['GET', '/api/admin/contents'], ['POST', '/api/admin/contents'], ['PUT', '/api/admin/contents/example'],
    ['PATCH', '/api/admin/contents/example'], ['DELETE', '/api/admin/contents/example'],
    ['POST', '/api/admin/files'], ['DELETE', '/api/admin/files/example'], ['POST', '/api/public/contents'],
    ['POST', '/api/files'], ['PATCH', '/api/unregistered'],
  ]) {
    const response = await f.request(path, { method, headers: { 'X-Admin': 'true', Cookie: 'isAdmin=true; authenticated=true' } });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  }
  assert.equal((await f.request('/api/auth/session', { headers: { Cookie: `${sessionName}=${randomBytes(32).toString('base64url')}` } })).status, 401);
  assert.equal((await f.request('/__test/content', { method: 'PATCH' })).status, 401);
  assert.equal(f.repository.getById(f.visible.id)?.revision, 1);
});

test('login validates preauthentication CSRF and credentials; session cookies are opaque and HttpOnly', async t => {
  const f = await fixture(t);
  const pre = await f.preauth();
  const credentials = JSON.stringify({ username: f.username, password: f.password });
  for (const headers of [
    { Origin: f.base, Cookie: pre.jar.header() },
    { Cookie: pre.jar.header(), 'X-CSRF-Token': pre.csrf },
    { Origin: 'https://untrusted.example', Cookie: pre.jar.header(), 'X-CSRF-Token': pre.csrf },
  ] as Record<string, string>[]) {
    const response = await f.request('/api/auth/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: credentials });
    assert.equal(response.status, 403);
  }
  const wrong = await f.login(new Cookies(), randomBytes(32).toString('base64url'));
  const unknown = await f.login(new Cookies(), randomBytes(32).toString('base64url'), 'nonexistent-admin');
  assert.equal(wrong.response.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  const signedIn = await f.login();
  assert.equal(signedIn.response.status, 200);
  const cookie = signedIn.response.headers.getSetCookie().find(value => value.startsWith(`${sessionName}=`))!;
  assert.ok(cookie);
  assert.match(cookie, /;\s*HttpOnly/i);
  assert.match(cookie, /;\s*SameSite=Lax/i);
  assert.match(cookie, /;\s*Path=\//i);
  assert.doesNotMatch(cookie, /;\s*Secure/i);
  assert.match(signedIn.jar.value(sessionName)!, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(signedIn.body.data.admin, f.admin);
  assert.deepEqual(Object.keys(signedIn.body.data).sort(), ['admin', 'csrfToken', 'expiresAt']);
  assert.ok(Date.parse(signedIn.body.data.expiresAt) > Date.now());
  const bodyText = JSON.stringify(signedIn.body);
  assert.equal(bodyText.includes(f.password), false);
  assert.equal(bodyText.includes(signedIn.jar.value(sessionName)!), false);
  const session = await f.request('/api/auth/session', { headers: { Cookie: signedIn.jar.header() } });
  assert.equal(session.status, 200);
  assert.deepEqual((await session.json()).data, signedIn.body.data);
  assert.match(session.headers.get('cache-control') ?? '', /no-store/);
});

test('production middleware permits real DB mutation only with session, trusted Origin and matching CSRF; logout revokes it', async t => {
  const f = await fixture(t);
  const signedIn = await f.login();
  assert.equal(signedIn.response.status, 200);
  const cookie = signedIn.jar.header();
  for (const headers of [
    { Cookie: cookie }, { Cookie: cookie, Origin: f.base },
    { Cookie: cookie, Origin: f.base, 'X-CSRF-Token': randomBytes(32).toString('base64url') },
    { Cookie: cookie, Origin: 'https://untrusted.example', 'X-CSRF-Token': signedIn.csrf! },
  ] as Record<string, string>[]) {
    assert.equal((await f.request('/__test/content', { method: 'PATCH', headers })).status, 403);
  }
  const headers = { Cookie: cookie, Origin: f.base, 'X-CSRF-Token': signedIn.csrf! };
  assert.equal((await f.request('/__test/content', { method: 'PATCH', headers })).status, 200);
  assert.equal(f.repository.getById(f.visible.id)?.revision, 2);
  assert.equal((await f.request('/api/files', { method: 'POST', headers })).status, 501, 'Unknown file writes remain unavailable after authorization');
  for (const path of ['/api/admin/contents', '/api/admin/files']) {
    assert.ok([400, 415].includes((await f.request(path, { method: 'POST', headers })).status), `${path} rejects an empty request after authorization`);
  }
  const deniedLogout = await f.request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: f.base } });
  assert.equal(deniedLogout.status, 403);
  assert.equal((await f.request('/api/auth/session', { headers: { Cookie: cookie } })).status, 200);
  const logout = await f.request('/api/auth/logout', { method: 'POST', headers });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.getSetCookie().join(';'), /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  assert.equal((await f.request('/__test/content', { method: 'PATCH', headers })).status, 401);
  assert.equal((await f.request('/api/auth/session', { headers: { Cookie: cookie } })).status, 401);
  assert.equal(f.repository.getById(f.visible.id)?.revision, 2);
});

test('sessions survive an actual app/DB reopen; expiry and account disable are enforced on the next request', async t => {
  const f = await fixture(t);
  const signedIn = await f.login();
  const headers = { Cookie: signedIn.jar.header() };
  await f.restart();
  assert.equal((await f.request('/api/auth/session', { headers })).status, 200);
  f.db.prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await f.request('/api/auth/session', { headers })).status, 401);
  const next = await f.login();
  assert.equal(next.response.status, 200);
  f.db.prepare('UPDATE admins SET enabled = 0 WHERE id = ?').run(f.admin.id);
  assert.equal((await f.request(`/api/admin/contents/${f.hidden.id}`, { headers: { Cookie: next.jar.header() } })).status, 401);
});

test('explicit local password reset revokes all sessions and old password immediately', async t => {
  const f = await fixture(t);
  const first = await f.login();
  const second = await f.login();
  const replacement = randomBytes(32).toString('base64url');
  await resetAdmin(f.db, f.username, replacement);
  for (const signedIn of [first, second]) {
    assert.equal((await f.request('/api/auth/session', { headers: { Cookie: signedIn.jar.header() } })).status, 401);
  }
  assert.equal((await f.login()).response.status, 401);
  assert.equal((await f.login(new Cookies(), replacement)).response.status, 200);
});

test('login throttling persists across server restart and cannot be bypassed with forwarded IP headers', async t => {
  const f = await fixture(t);
  const pre = await f.preauth();
  const body = JSON.stringify({ username: f.username, password: randomBytes(32).toString('base64url') });
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await f.request('/api/auth/login', {
      method: 'POST', headers: { Cookie: pre.jar.header(), Origin: f.base, 'X-CSRF-Token': pre.csrf, 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${attempt + 1}` }, body,
    });
    assert.equal(response.status, 401);
  }
  await f.restart();
  const limited = await f.request('/api/auth/login', {
    method: 'POST', headers: { Cookie: pre.jar.header(), Origin: f.base, 'X-CSRF-Token': pre.csrf, 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.80' }, body,
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  const message = await limited.text();
  assert.equal(message.includes(f.username), false);
  assert.equal(message.includes(f.password), false);
  assert.doesNotMatch(message, /scrypt|password_hash|SELECT |SQLITE|token_hash/);
});

test('private content and attachment relationships are hidden anonymously and checked for authenticated administrators', async t => {
  const f = await fixture(t);
  const file = f.repository.createFile({ storageKey: 'test-private/file.pdf', originalName: 'example.pdf', mediaType: 'application/pdf', extension: 'pdf', size: 10, sha256: 'a'.repeat(64) });
  f.repository.update(f.hidden.id, { kind: 'notice', slug: f.hidden.slug, title: f.hidden.title, bodyHtml: f.hidden.bodyHtml, publication: 'private', fileIds: [file.id] }, f.hidden.revision);
  const privateFile = `/api/files/${file.id}?contentId=${f.hidden.id}`;
  assert.equal((await f.request(`/api/admin/contents/${f.hidden.id}`)).status, 401);
  assert.equal((await f.request(privateFile)).status, 404);
  assert.equal((await f.request(`/api/files/${file.id}?contentId=${f.visible.id}`)).status, 404);
  const signedIn = await f.login();
  const headers = { Cookie: signedIn.jar.header() };
  const content = await f.request(`/api/admin/contents/${f.hidden.id}`, { headers });
  assert.equal(content.status, 200);
  const body = await content.json();
  assert.equal(body.data.publication, 'private');
  assert.deepEqual(body.data.files.map((entry: { id: string }) => entry.id), [file.id]);
  assert.equal(JSON.stringify(body).includes(file.storageKey), false);
  assert.equal(JSON.stringify(body).includes(file.sha256), false);
  assert.equal((await f.request(privateFile, { headers })).status, 404, 'Missing physical bytes must not produce a successful download');
  f.repository.update(f.visible.id, { kind: 'notice', slug: f.visible.slug, title: f.visible.title, bodyHtml: f.visible.bodyHtml, publication: 'public', fileIds: [file.id] }, f.visible.revision);
  assert.equal((await f.request(`/api/files/${file.id}?contentId=${f.visible.id}`)).status, 404);
  assert.equal((await f.request(privateFile)).status, 404);
});

test('HTTPS configuration emits Secure cookies and malformed login bodies do not expose errors or secrets', async t => {
  const f = await fixture(t, { secure: true });
  const signedIn = await f.login();
  assert.equal(signedIn.response.status, 200);
  assert.match(signedIn.response.headers.getSetCookie().find(value => value.startsWith(`${sessionName}=`))!, /;\s*Secure/i);
  const pre = await f.preauth();
  const response = await f.request('/api/auth/login', {
    method: 'POST', headers: { Origin: f.base, Cookie: pre.jar.header(), 'X-CSRF-Token': pre.csrf, 'Content-Type': 'application/json' },
    body: '{"username":',
  });
  assert.equal(response.status, 400);
  const body = await response.text();
  assert.doesNotMatch(body, /SyntaxError|JSON\.parse| at |stack|password_hash|SQLITE/);
});
