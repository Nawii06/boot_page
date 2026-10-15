import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { createAdmin } from '../src/server/auth/adminAccounts.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';
import { docxFixture, pdfFixture, pngFixture } from './helpers/documents.js';

const cacheRoot = resolve('.cache/tests');
mkdirSync(cacheRoot, { recursive: true });

class Cookies {
  private values = new Map<string, string>();
  update(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';')[0], index = pair.indexOf('=');
      this.values.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join('; '); }
}

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(cacheRoot, 'notices-http-'));
  const config = loadConfig({}, directory);
  const db = openDatabase(config.dbPath, { create: true });
  await migrateDatabase(db, resolve('migrations'), config.backupDirectory);
  const username = `notice-${randomBytes(6).toString('hex')}`, password = randomBytes(32).toString('base64url');
  await createAdmin(db, username, password);
  const server = createApp(config, false, db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.appOrigins.push(base);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    db.close();
    const boundary = relative(cacheRoot, directory);
    assert.ok(boundary && !boundary.startsWith('..') && resolve(cacheRoot, boundary) === directory);
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (path: string, init?: RequestInit) => fetch(base + path, init);
  const signedIn = await login(base, username, password);
  const headers = { Cookie: signedIn.jar.header(), Origin: base, 'X-CSRF-Token': signedIn.csrf };
  const admin = (path: string, method = 'GET', body?: unknown) => request(path, {
    method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const upload = (filename: string, bytes = pdfFixture(), mediaType = 'application/octet-stream') => {
    const body = new FormData();
    body.set('file', new Blob([new Uint8Array(bytes)], { type: mediaType }), filename);
    return request('/api/admin/files', { method: 'POST', headers, body });
  };
  async function create(input: Record<string, unknown> = {}) {
    const response = await admin('/api/admin/contents', 'POST', notice(input));
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).data;
  }
  return { directory, config, db, repository: new ContentRepository(db), request, admin, upload, create, headers, base };
}

function notice(overrides: Record<string, unknown> = {}) {
  return { kind: 'notice', title: '[예시] 격리 공지 시험', bodyHtml: '<p>테스트 전용 본문입니다.</p>', category: '시험', publication: 'draft', pinned: false, ...overrides };
}

async function login(base: string, username: string, password: string) {
  const jar = new Cookies();
  const pre = await fetch(base + '/api/auth/csrf');
  assert.equal(pre.status, 200); jar.update(pre);
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { Cookie: jar.header(), Origin: base, 'X-CSRF-Token': (await pre.json()).data.csrfToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200); jar.update(response);
  return { jar, csrf: (await response.json()).data.csrfToken as string };
}

test('real notice create/update/delete require authentication and CSRF, preserve omitted metadata and reject stale revisions', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/admin/contents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notice()) })).status, 401);
  assert.equal((await f.request('/api/admin/contents', { method: 'POST', headers: { Cookie: f.headers.Cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(notice()) })).status, 403);
  const contact = { name: '테스트 담당', phone: '', email: '', address: '', note: '실제 문의처 아님' };
  const created = await f.create({ contact, publishedAt: '2026-10-14T00:00:00.000Z' });
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.ok(created.slug);
  assert.equal(created.revision, 1);
  assert.equal((await f.request(`/api/public/contents/${created.id}`)).status, 404);
  const changed = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { title: '[예시] 실제 수정', publication: 'public', revision: created.revision });
  assert.equal(changed.status, 200, await changed.clone().text());
  const record = (await changed.json()).data;
  assert.equal(record.id, created.id); assert.equal(record.slug, created.slug); assert.equal(record.revision, 2);
  assert.deepEqual(record.contact, contact); assert.equal(record.bodyHtml, created.bodyHtml);
  assert.equal((await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { title: '[예시] 이전 편집', revision: 1 })).status, 409);
  const visible = await f.request(`/api/public/contents/${created.id}`);
  assert.equal(visible.status, 200); assert.equal((await visible.json()).data.title, record.title);
  const invalid = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { title: '', revision: 2 });
  assert.equal(invalid.status, 400);
  assert.equal((await f.repository.getById(created.id))?.revision, 2);
  const impact = await f.admin(`/api/admin/contents/${created.id}/delete-impact`);
  assert.equal(impact.status, 200); assert.equal((await impact.json()).data.revision, 2);
  assert.equal((await f.admin(`/api/admin/contents/${created.id}`, 'DELETE', { revision: 1 })).status, 409);
  assert.equal((await f.admin(`/api/admin/contents/${created.id}`, 'DELETE', { revision: 2 })).status, 204);
  assert.equal((await f.request(`/api/public/contents/${created.id}`)).status, 404);
  assert.equal(await f.repository.getById(created.id), null);
});

test('Korean PDF and generated DOCX uploads round-trip original bytes; temporary/draft/private links never become anonymous downloads', async t => {
  const f = await fixture(t);
  const fixtures = [
    { name: '한글 공지 원본.pdf', bytes: pdfFixture(), mime: 'application/x-unknown-pdf', extension: 'pdf' },
    { name: '한글 제출 안내.docx', bytes: docxFixture(), mime: 'application/octet-stream', extension: 'docx' },
  ];
  const files = [];
  for (const sample of fixtures) {
    const upload = await f.upload(sample.name, sample.bytes, sample.mime);
    assert.equal(upload.status, 201, await upload.clone().text());
    const file = (await upload.json()).data;
    assert.equal(file.originalName, sample.name); assert.equal(file.extension, sample.extension); assert.equal(file.size, sample.bytes.length);
    assert.equal('storageKey' in file, false); assert.equal('sha256' in file, false);
    assert.equal((await f.request(`/api/files/${file.id}`)).status, 404);
    const privateDownload = await f.admin(`/api/files/${file.id}`);
    assert.equal(privateDownload.status, 200); assert.deepEqual(Buffer.from(await privateDownload.arrayBuffer()), sample.bytes);
    files.push(file);
  }
  const created = await f.create({ fileLinks: files.map(file => ({ fileId: file.id, role: 'attachment' })) });
  const urls = files.map(file => `/api/files/${file.id}?contentId=${created.id}`);
  for (const url of urls) assert.equal((await f.request(url)).status, 404);
  const published = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 1, publication: 'public' });
  assert.equal(published.status, 200);
  for (let index = 0; index < urls.length; index++) {
    const response = await f.request(urls[index]);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixtures[index].bytes);
    assert.match(response.headers.get('content-disposition') ?? '', /attachment;/i);
    assert.match(response.headers.get('content-disposition') ?? '', new RegExp(encodeURIComponent(fixtures[index].name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const range = await f.request(urls[index], { headers: { Range: 'bytes=0-3' } });
    assert.equal(range.status, 200); assert.deepEqual(Buffer.from(await range.arrayBuffer()), fixtures[index].bytes);
    const revalidated = await f.request(urls[index], { headers: { 'If-None-Match': '*', 'If-Modified-Since': new Date(Date.now() + 86_400_000).toUTCString() } });
    assert.equal(revalidated.status, 200); assert.deepEqual(Buffer.from(await revalidated.arrayBuffer()), fixtures[index].bytes);
  }
  assert.equal((await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 2, publication: 'private' })).status, 200);
  for (const url of urls) {
    const cached = await f.request(url, { headers: { 'If-None-Match': '*', 'If-Modified-Since': new Date(Date.now() + 86_400_000).toUTCString() } });
    assert.equal(cached.status, 404); assert.match(cached.headers.get('cache-control') ?? '', /no-store/);
    assert.equal((await f.admin(url)).status, 200);
  }
});

test('replacing or deleting one notice leaves another reference to shared file intact and exposes delete impact', async t => {
  const f = await fixture(t);
  const oldUpload = await f.upload('공유 파일.pdf'), freshUpload = await f.upload('교체 파일.pdf', pdfFixture('Replacement'));
  assert.equal(oldUpload.status, 201); assert.equal(freshUpload.status, 201);
  const old = (await oldUpload.json()).data, fresh = (await freshUpload.json()).data;
  const first = await f.create({ publication: 'public', fileLinks: [{ fileId: old.id, role: 'attachment' }] });
  const second = await f.create({ publication: 'public', title: '[예시] 공유 참조', fileLinks: [{ fileId: old.id, role: 'attachment' }], relatedIds: [first.id] });
  await f.repository.setHomeItems([{ section: 'notice', contentId: first.id }]);
  const impact = await f.admin(`/api/admin/contents/${first.id}/delete-impact`);
  assert.equal(impact.status, 200);
  const impactData = (await impact.json()).data;
  assert.equal(impactData.files[0].otherReferences, 1);
  assert.ok(impactData.incomingLinks >= 1); assert.ok(impactData.homeLinks >= 1);
  assert.equal((await f.admin(`/api/admin/files/${old.id}`, 'DELETE')).status, 409);
  const changed = await f.admin(`/api/admin/contents/${first.id}`, 'PATCH', { revision: 1, fileLinks: [{ fileId: fresh.id, role: 'attachment' }] });
  assert.equal(changed.status, 200);
  assert.equal((await f.request(`/api/files/${old.id}?contentId=${first.id}`)).status, 404);
  const stillShared = await f.request(`/api/files/${old.id}?contentId=${second.id}`);
  assert.equal(stillShared.status, 200); assert.deepEqual(Buffer.from(await stillShared.arrayBuffer()), pdfFixture());
  assert.equal((await f.admin(`/api/admin/contents/${first.id}`, 'DELETE', { revision: 2 })).status, 204);
  assert.equal((await f.request(`/api/files/${old.id}?contentId=${second.id}`)).status, 200);
  const secondRead = await f.request(`/api/public/contents/${second.id}`);
  assert.deepEqual((await secondRead.json()).data.relatedContents, []);
  assert.equal((await f.admin(`/api/admin/files/${fresh.id}`, 'DELETE')).status, 204);
  assert.equal((await f.admin(`/api/files/${fresh.id}`)).status, 404);
});

test('notice preview/save sanitize HTML and only permit persisted managed image IDs in bodies', async t => {
  const f = await fixture(t);
  const imageUpload = await f.upload('본문 이미지.png', pngFixture, 'image/png');
  assert.equal(imageUpload.status, 201, await imageUpload.clone().text());
  const image = (await imageUpload.json()).data;
  const source = `<p onclick="alert(1)">문단<strong>강조</strong></p><ul><li>목록</li></ul><table><tbody><tr><td>표</td></tr></tbody></table><a href="https://example.com/info" target="_blank">정상 링크</a><a href="javascript:alert(1)">위험 링크</a><script>alert(1)</script><iframe src="https://example.com"></iframe><img src="https://example.com/tracker.png" onerror="alert(1)"><img data-file-id="${image.id}" alt="테스트 그림" onerror="alert(1)">`;
  const previewBody = { bodyHtml: source, fileLinks: [{ fileId: image.id, role: 'body', altText: '테스트 그림' }] };
  assert.equal((await f.request('/api/admin/notices/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previewBody) })).status, 401);
  const preview = await f.admin('/api/admin/notices/preview', 'POST', previewBody);
  assert.equal(preview.status, 200, await preview.clone().text());
  const html = (await preview.json()).data.bodyHtml;
  assert.match(html, /<p>문단<strong>강조<\/strong><\/p>/);
  assert.match(html, /<li>목록<\/li>/); assert.match(html, /<td>표<\/td>/);
  assert.match(html, /https:\/\/example.com\/info/);
  assert.doesNotMatch(html, /onclick|onerror|javascript:|<script|<iframe|tracker\.png/i);
  assert.match(html, new RegExp(`/api/files/${image.id}`));
  assert.equal((await f.request(`/api/files/${image.id}`)).status, 404);
  const created = await f.create({ bodyHtml: source, fileLinks: previewBody.fileLinks, publication: 'public' });
  assert.equal(created.files.some((file: { id: string; role: string }) => file.id === image.id && file.role === 'body'), true);
  const read = await f.request(`/api/public/contents/${created.id}`);
  const publicBody = (await read.json()).data.bodyHtml;
  assert.doesNotMatch(publicBody, /onclick|onerror|javascript:|<script|<iframe|tracker\.png/i);
  const imageRead = await f.request(`/api/files/${image.id}?contentId=${created.id}&inline=1`);
  assert.equal(imageRead.status, 200); assert.match(imageRead.headers.get('content-disposition') ?? '', /inline/i);
  const failed = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: created.revision, bodyHtml: `<img data-file-id="${randomUUID()}" alt="unknown">` });
  assert.equal(failed.status, 404, 'Unknown managed image IDs are missing resources, never accepted HTML references');
  assert.equal((await f.repository.getById(created.id))?.revision, created.revision);
  const htmlImageOnly = await f.create({ bodyHtml: `<p>HTML에서 추가한 이미지</p><img data-file-id="${image.id}" alt="도식 &amp; 설명">`, fileLinks: [], publication: 'public' });
  assert.equal(htmlImageOnly.files.find((file: { id: string; role: string }) => file.id === image.id && file.role === 'body')?.altText, '도식 & 설명');
  assert.match(htmlImageOnly.bodyHtml, /alt="도식 &amp; 설명"/);
  const htmlImageRead = await f.request(`/api/public/contents/${htmlImageOnly.id}`);
  assert.equal(htmlImageRead.status, 200);
  assert.match((await htmlImageRead.json()).data.bodyHtml, /alt="도식 &amp; 설명"/);
});

test('public/admin searches, category filters, paging and pin order use committed notice records only', async t => {
  const f = await fixture(t);
  const first = await f.create({ title: '[예시] 검색A', category: '행사', publication: 'public', publishedAt: '2025-01-01T00:00:00.000Z', pinned: true });
  const second = await f.create({ title: '[예시] 검색B', category: '교육', publication: 'public', publishedAt: '2026-10-14T00:00:00.000Z' });
  await f.create({ title: '[예시] 검색C 비공개', category: '비공개 분류', publication: 'private' });
  const page1 = await (await f.request('/api/public/contents?kind=notice&pageSize=1&page=1')).json();
  assert.deepEqual(page1.pagination, { page: 1, pageSize: 1, total: 2 }); assert.equal(page1.data[0].id, first.id);
  const page2 = await (await f.request('/api/public/contents?kind=notice&pageSize=1&page=2')).json(); assert.equal(page2.data[0].id, second.id);
  const filtered = await (await f.request('/api/public/contents?kind=notice&q=' + encodeURIComponent('검색') + '&category=' + encodeURIComponent('교육'))).json();
  assert.deepEqual(filtered.data.map((item: { id: string }) => item.id), [second.id]);
  const adminList = await (await f.admin('/api/admin/contents?kind=notice&publication=private&q=' + encodeURIComponent('검색C'))).json();
  assert.equal(adminList.pagination.total, 1);
  const categories = await f.request('/api/public/notice-categories');
  assert.equal(categories.status, 200); const categoryBody = JSON.stringify(await categories.json());
  assert.match(categoryBody, /행사/); assert.match(categoryBody, /교육/); assert.doesNotMatch(categoryBody, /비공개 분류/);
  const resources = await f.admin('/api/admin/contents?kind=resource');
  assert.equal(resources.status, 200); assert.deepEqual((await resources.json()).data, []);
  for (const query of ['kind=invalid', 'publication=invalid', 'page=0', 'q=' + 'a'.repeat(201), 'page=1&page=2']) {
    assert.equal((await f.admin('/api/admin/contents?' + query)).status, 400, query);
  }
  const injection = await (await f.admin('/api/admin/contents?q=' + encodeURIComponent("' OR 1=1 --"))).json();
  assert.deepEqual(injection.data, []);
});

test('invalid uploads and failed persistence leave existing content/file links intact without orphan bytes', async t => {
  const f = await fixture(t);
  const initial = await f.upload('기존 원본.pdf');
  assert.equal(initial.status, 201); const file = (await initial.json()).data;
  const created = await f.create({ fileLinks: [{ fileId: file.id, role: 'attachment' }] });
  for (const [name, bytes] of [['가짜.pdf', Buffer.from('not a pdf')], ['가짜.docx', Buffer.from('not a ZIP package')], ['가짜.hwp', Buffer.from('renamed text is not HWP')], ['가짜.hwpx', Buffer.from('renamed text is not HWPX')], ['실행.exe', pdfFixture()]] as const) {
    const response = await f.upload(name, bytes);
    assert.ok([400, 415, 422].includes(response.status), `${name} should fail format validation`);
  }
  const beforeFiles = existsSync(f.config.uploadDirectory) ? readdirSync(f.config.uploadDirectory, { recursive: true }).map(String).sort() : [];
  f.db.exec("CREATE TRIGGER reject_test_file BEFORE INSERT ON files BEGIN SELECT RAISE(ABORT, 'isolated simulated persistence failure'); END");
  const rejected = await f.upload('저장 실패 시험.pdf', pdfFixture('Simulated failure'));
  assert.ok([409, 500].includes(rejected.status), 'A failed database transaction must fail the upload');
  assert.doesNotMatch(await rejected.text(), /isolated simulated|SQLITE|storageKey|stack|[A-Z]:\\/);
  f.db.exec('DROP TRIGGER reject_test_file');
  const afterFiles = existsSync(f.config.uploadDirectory) ? readdirSync(f.config.uploadDirectory, { recursive: true }).map(String).sort() : [];
  // Empty date/key directories are harmless; no failed upload may leave file bytes.
  assert.deepEqual(afterFiles.filter(name => /\.[a-z\d]+$/i.test(name)), beforeFiles.filter(name => /\.[a-z\d]+$/i.test(name)));
  assert.equal((f.db.prepare('SELECT COUNT(*) AS total FROM files').get() as { total: number }).total, 1);
  const failedSave = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 1, fileLinks: [{ fileId: randomUUID(), role: 'attachment' }] });
  assert.equal(failedSave.status, 404);
  const saved = (await f.repository.getById(created.id))!;
  assert.equal(saved.revision, 1); assert.deepEqual(saved.files.map(item => item.id), [file.id]);
  assert.equal((await f.admin(`/api/files/${file.id}`)).status, 200);
});

test('multipart uploads enforce authentication, CSRF, one-file requests, names and configured byte limits before persisting', async t => {
  const f = await fixture(t);
  const multipart = (names: string[]) => {
    const body = new FormData();
    for (const name of names) body.append('file', new Blob([new Uint8Array(pdfFixture())], { type: 'application/pdf' }), name);
    return body;
  };
  assert.equal((await f.request('/api/admin/files', { method: 'POST', body: multipart(['권한 시험.pdf']) })).status, 401);
  assert.equal((await f.request('/api/admin/files', { method: 'POST', headers: { Cookie: f.headers.Cookie, Origin: f.base }, body: multipart(['권한 시험.pdf']) })).status, 403);
  assert.equal((await f.request('/api/admin/files', { method: 'POST', headers: { ...f.headers, Origin: 'https://untrusted.example' }, body: multipart(['권한 시험.pdf']) })).status, 403);
  assert.equal((await f.request('/api/admin/files', { method: 'POST', headers: f.headers, body: multipart(['첫 파일.pdf', '다른 파일.pdf']) })).status, 400);
  assert.equal((await f.upload('../경로 조작.pdf')).status, 400);
  const previousLimit = f.config.maxUploadBytes;
  f.config.maxUploadBytes = pdfFixture().length - 1;
  assert.equal((await f.upload('용량 초과.pdf')).status, 413);
  f.config.maxUploadBytes = previousLimit;
  assert.equal((f.db.prepare('SELECT COUNT(*) AS total FROM files').get() as { total: number }).total, 0);
  // A prior failed parse must release upload slots and permit the next valid upload.
  assert.equal((await f.upload('정상 업로드.pdf')).status, 201);
});

async function availablePort() {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done()));
  return port;
}

test('HTTP-created notice, all P06 content kinds, fixed pages, home selections, session and original attachment survive actual server process shutdown/restart', { timeout: 45_000 }, async t => {
  const directory = mkdtempSync(join(cacheRoot, 'notice-process-'));
  const dbPath = join(directory, 'test.sqlite'), uploads = join(directory, 'uploads'), backups = join(directory, 'backups');
  const db = openDatabase(dbPath, { create: true });
  const username = `restart-${randomBytes(5).toString('hex')}`, password = randomBytes(32).toString('base64url');
  await migrateDatabase(db, resolve('migrations'), backups); await createAdmin(db, username, password); db.close();
  t.after(() => {
    const boundary = relative(cacheRoot, directory); assert.ok(boundary && !boundary.startsWith('..') && resolve(cacheRoot, boundary) === directory);
    rmSync(directory, { recursive: true, force: true });
  });
  async function launch() {
    const port = await availablePort(), base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', '--dev'], {
      cwd: resolve('.'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: '', HOST: '127.0.0.1', PORT: String(port), DEV_PORT: '5173', DB_PATH: dbPath, UPLOAD_DIR: uploads, BACKUP_DIR: backups, APP_ORIGIN: base, COOKIE_SECURE: 'false', ALLOW_NETWORK: 'false' },
    });
    const exited = once(child, 'exit'); let output = '';
    child.stdout?.on('data', data => { output = `${output}${String(data)}`.slice(-4000); });
    child.stderr?.on('data', data => { output = `${output}${String(data)}`.slice(-4000); });
    try {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        assert.equal(child.exitCode, null, output);
        try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) })).ok) return { child, exited, base }; } catch { /* Wait only for this owned child. */ }
        await delay(75);
      }
      assert.fail('Owned test server did not become ready: ' + output);
    } catch (error) { await stop(child, exited); throw error; }
  }
  async function stop(child: ChildProcess, exited: Promise<unknown>) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
  }
  let saved: { id: string; revision: number }, file: { id: string }, session: Awaited<ReturnType<typeof login>>;
  const p06Records: { id: string; kind: string; title: string; revision: number }[] = [];
  const first = await launch();
  try {
    session = await login(first.base, username, password);
    const headers = { Cookie: session.jar.header(), Origin: first.base, 'X-CSRF-Token': session.csrf };
    const multipart = new FormData(); multipart.set('file', new Blob([new Uint8Array(pdfFixture())], { type: 'application/octet-stream' }), '재시작 보존.pdf');
    const upload = await fetch(first.base + '/api/admin/files', { method: 'POST', headers, body: multipart }); assert.equal(upload.status, 201); file = (await upload.json()).data;
    const create = await fetch(first.base + '/api/admin/contents', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(notice({ publication: 'public', fileLinks: [{ fileId: file.id, role: 'attachment' }] })) });
    assert.equal(create.status, 201); saved = (await create.json()).data;
    const update = await fetch(`${first.base}/api/admin/contents/${saved.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '[예시] 재시작 전에 수정', revision: 1 }) });
    assert.equal(update.status, 200); assert.equal((await update.json()).data.revision, 2);
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
    for (const kind of ['curriculum', 'activity', 'resource', 'faq']) {
      const body = { kind, title: `[예시] 재시작 ${kind}`, bodyHtml: '<p>재시작 후에도 보존할 안내</p>', publication: 'public',
        ...(['curriculum', 'activity'].includes(kind) ? { program: { level: '', audience: '예시 대상', delivery: '예시 방식', completionRequirements: '예시 요건' } } : {}),
        ...(kind === 'resource' ? { resource: { audience: '예시 대상', requiredDocuments: '예시 서류', instructions: '예시 작성 안내', deadlineText: '별도 안내', submissionMethod: '예시 방법', destination: '입력 대기', contact: '입력 대기', applicableYear: 2026 }, fileLinks: [{ fileId: file.id, role: 'attachment' }] } : {}),
      };
      const created = await fetch(first.base + '/api/admin/contents', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
      assert.equal(created.status, 201, await created.clone().text()); const record = (await created.json()).data;
      const changed = await fetch(`${first.base}/api/admin/contents/${record.id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ revision: 1, title: `[예시] 수정 보존 ${kind}` }) });
      assert.equal(changed.status, 200); p06Records.push((await changed.json()).data);
    }
    for (const slug of ['overview', 'organization', 'cooperation', 'location', 'guide']) {
      const pageSaved = await fetch(first.base + `/api/admin/pages/${slug}`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ title: `[예시] 재시작 ${slug}`, bodyHtml: '<p>고정 정보 유지</p>', publication: 'public', revision: 0 }) });
      assert.equal(pageSaved.status, 200, await pageSaved.clone().text());
    }
    const home = await fetch(first.base + '/api/admin/home', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ page: { title: '[예시] 재시작 메인', bodyHtml: '<p>메인 유지</p>', publication: 'public', revision: 0 }, items: [{ section: 'notice', contentId: saved.id }, { section: 'program', contentId: p06Records[0].id }] }) });
    assert.equal(home.status, 200, await home.clone().text());
  } finally { await stop(first.child, first.exited); }
  const second = await launch();
  try {
    assert.notEqual(second.child.pid, first.child.pid);
    const read = await fetch(`${second.base}/api/public/contents/${saved!.id}`);
    assert.equal(read.status, 200); const record = (await read.json()).data;
    assert.equal(record.title, '[예시] 재시작 전에 수정'); assert.equal(record.revision, 2);
    const download = await fetch(`${second.base}/api/files/${file!.id}?contentId=${saved!.id}`);
    assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdfFixture());
    const sessionRead = await fetch(second.base + '/api/auth/session', { headers: { Cookie: session!.jar.header() } });
    assert.equal(sessionRead.status, 200);
    const list = await (await fetch(second.base + '/api/public/contents?kind=notice')).json(); assert.equal(list.pagination.total, 1);
    for (const expected of p06Records) {
      const read = await fetch(`${second.base}/api/admin/contents/${expected.id}`, { headers: { Cookie: session!.jar.header() } });
      assert.equal(read.status, 200); const actual = (await read.json()).data;
      assert.equal(actual.kind, expected.kind); assert.equal(actual.title, expected.title); assert.equal(actual.revision, 2);
      if (actual.kind === 'resource') { assert.equal(actual.resource.applicableYear, 2026); assert.equal(actual.files[0].id, file!.id); }
      if (['curriculum', 'activity'].includes(actual.kind)) assert.equal(actual.program.completionRequirements, '예시 요건');
    }
    for (const slug of ['overview', 'organization', 'cooperation', 'location', 'guide']) {
      const read = await fetch(second.base + `/api/public/pages/${slug}`); assert.equal(read.status, 200); assert.equal((await read.json()).data.title, `[예시] 재시작 ${slug}`);
    }
    const home = (await (await fetch(second.base + '/api/public/home')).json()).data;
    assert.equal(home.page.title, '[예시] 재시작 메인');
    assert.deepEqual(home.sections.notice.map((item: { id: string }) => item.id), [saved!.id]);
    assert.deepEqual(home.sections.program.map((item: { id: string }) => item.id), [p06Records[0].id]);
  } finally { await stop(second.child, second.exited); }
});
