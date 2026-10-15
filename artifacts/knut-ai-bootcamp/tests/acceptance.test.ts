import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { createAdmin } from '../src/server/auth/adminAccounts.js';
import { pdfFixture } from './helpers/documents.js';

const cacheRoot = resolve('.cache/tests');

function content(kind: string) {
  return {
    kind, title: `[Example] ${kind} recovery`, bodyHtml: '<p>Committed original body</p>', publication: 'public',
    ...(['curriculum', 'activity'].includes(kind) ? { program: {
      level: 'Example level', audience: 'Example audience', delivery: 'Example delivery', completionRequirements: 'Example completion',
    } } : {}),
    ...(kind === 'resource' ? { resource: {
      audience: 'Example audience', requiredDocuments: 'Example documents', instructions: 'Example instructions',
      deadlineText: 'Example deadline', submissionMethod: 'Example method', destination: 'Example destination',
      contact: 'Example contact', applicableYear: 2026,
    } } : {}),
  };
}

async function fixture(t: TestContext) {
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, 'p10-acceptance-'));
  const config = loadConfig({}, directory);
  const db = openDatabase(config.dbPath, { create: true });
  await migrateDatabase(db, resolve('migrations'), config.backupDirectory);
  const username = `p10-${randomBytes(6).toString('hex')}`;
  const password = randomBytes(32).toString('base64url');
  await createAdmin(db, username, password);
  const server = createApp(config, false, db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.appOrigins.push(base);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    db.close();
    const inside = relative(cacheRoot, directory);
    assert.ok(inside && inside !== '..' && !inside.startsWith('..\\') && !inside.startsWith('../') && !isAbsolute(inside));
    assert.equal(resolve(cacheRoot, inside), directory);
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (path: string, init?: RequestInit) => fetch(base + path, init);
  const cookies = new Map<string, string>();
  const remember = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';')[0], index = pair.indexOf('=');
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };
  const cookie = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  const preauth = await request('/api/auth/csrf');
  assert.equal(preauth.status, 200); remember(preauth);
  const login = await request('/api/auth/login', {
    method: 'POST', headers: { Cookie: cookie(), Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': (await preauth.json()).data.csrfToken },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200); remember(login);
  const headers = { Cookie: cookie(), Origin: base, 'X-CSRF-Token': (await login.json()).data.csrfToken as string };
  const admin = (path: string, method = 'GET', body?: unknown) => request(path, {
    method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function create(kind: string, extras: Record<string, unknown> = {}) {
    const response = await admin('/api/admin/contents', 'POST', { ...content(kind), ...extras });
    assert.equal(response.status, 201);
    return (await response.json()).data;
  }
  async function upload(name: string, bytes: Buffer) {
    const body = new FormData();
    body.set('file', new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }), name);
    const response = await request('/api/admin/files', { method: 'POST', headers, body });
    assert.equal(response.status, 201);
    return (await response.json()).data;
  }
  return { db, request, admin, create, upload, directory };
}

// Browser error tests mock a failed HTTP response. These cases exercise an actual
// server-side failure after content/details/relations/files have begun changing.
for (const kind of ['notice', 'curriculum', 'resource']) {
  test(`${kind} HTTP save separates validation/not-found/conflict/server failures and rolls back all changes before a safe retry`, async t => {
    const f = await fixture(t);
    const originalBytes = pdfFixture('original'), replacementBytes = pdfFixture('replacement');
    const original = await f.upload('기존 원본.pdf', originalBytes);
    const replacement = await f.upload('교체 원본.pdf', replacementBytes);
    const firstTarget = await f.create('faq', { title: '[Example] Original related target' });
    const secondTarget = await f.create('faq', { title: '[Example] Replacement related target' });
    const saved = await f.create(kind, {
      fileLinks: [{ fileId: original.id, role: 'attachment' }], relatedIds: [firstTarget.id],
      links: [{ label: 'Original example link', url: 'https://example.com/original' }],
    });
    const path = `/api/admin/contents/${saved.id}`;
    const publicPath = `/api/public/contents/${saved.id}`;
    const downloadPath = (id: string) => `/api/files/${id}?contentId=${saved.id}`;
    const before = (await (await f.admin(path)).json()).data;
    const publicBefore = (await (await f.request(publicPath)).json()).data;
    const candidate = {
      revision: saved.revision, title: '[Example] Replacement title', bodyHtml: '<p>Replacement body</p>',
      relatedIds: [secondTarget.id], fileLinks: [{ fileId: replacement.id, role: 'attachment' }],
      links: [{ label: 'Replacement example link', url: 'https://example.com/replacement' }],
    };
    const errors = [
      { path, body: { ...candidate, title: '' }, status: 400, code: 'VALIDATION_ERROR' },
      { path: `/api/admin/contents/${randomUUID()}`, body: candidate, status: 404, code: 'NOT_FOUND' },
      { path, body: { ...candidate, revision: saved.revision + 1 }, status: 409, code: 'CONFLICT' },
    ];
    for (const expected of errors) {
      const response = await f.admin(expected.path, 'PATCH', expected.body);
      assert.equal(response.status, expected.status);
      assert.equal((await response.json()).error.code, expected.code);
    }

    // The function/trigger exist only in this disposable connection. Throwing a
    // non-constraint error reaches the production generic 500 handler, after the
    // repository has already written the new body, details and relationships.
    const internalMarker = 'p10-injected-internal-detail-do-not-disclose';
    f.db.function('p10_fail_save', () => { throw new Error(internalMarker); });
    f.db.exec('CREATE TEMP TRIGGER p10_fail_link BEFORE INSERT ON content_links BEGIN SELECT p10_fail_save(); END');
    const failed = await f.admin(path, 'PATCH', candidate);
    assert.equal(failed.status, 500);
    assert.match(failed.headers.get('cache-control') || '', /no-store/);
    const failure = await failed.json();
    assert.equal(failure.error.code, 'INTERNAL_ERROR');
    assert.deepEqual(Object.keys(failure), ['error']);
    assert.deepEqual(Object.keys(failure.error).sort(), ['code', 'message']);
    assert.ok(failure.error.message);
    assert.equal(JSON.stringify(failure).includes(internalMarker), false);
    assert.equal(JSON.stringify(failure).includes(f.directory), false);
    assert.doesNotMatch(JSON.stringify(failure), /SQLITE|password_hash|stack|p10_fail_save/);
    assert.deepEqual((await (await f.admin(path)).json()).data, before);
    assert.deepEqual((await (await f.request(publicPath)).json()).data, publicBefore);
    const oldDownload = await f.request(downloadPath(original.id));
    assert.equal(oldDownload.status, 200);
    assert.deepEqual(Buffer.from(await oldDownload.arrayBuffer()), originalBytes);
    assert.equal((await f.request(downloadPath(replacement.id))).status, 404);
    assert.deepEqual(f.db.pragma('foreign_key_check'), []);

    f.db.exec('DROP TRIGGER p10_fail_link');
    const retry = await f.admin(path, 'PATCH', candidate);
    assert.equal(retry.status, 200);
    const updated = (await retry.json()).data;
    assert.equal(updated.revision, saved.revision + 1);
    assert.equal(updated.slug, saved.slug);
    assert.equal(updated.bodyHtml, candidate.bodyHtml);
    assert.deepEqual(updated.relatedContents.map((row: { id: string }) => row.id), [secondTarget.id]);
    assert.deepEqual(updated.files.map((row: { id: string }) => row.id), [replacement.id]);
    assert.equal((await f.request(downloadPath(original.id))).status, 404);
    const newDownload = await f.request(downloadPath(replacement.id));
    assert.equal(newDownload.status, 200);
    assert.deepEqual(Buffer.from(await newDownload.arrayBuffer()), replacementBytes);
    assert.equal((await (await f.request(publicPath)).json()).data.title, candidate.title);
  });
}
