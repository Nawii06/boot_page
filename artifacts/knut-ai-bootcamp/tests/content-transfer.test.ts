import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type Database from 'better-sqlite3';
import { loadConfig, type AppConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';
import { FileService } from '../src/server/files/service.js';
import { createAdmin, resetAdmin } from '../src/server/auth/adminAccounts.js';
import { AuthService } from '../src/server/auth/service.js';
import { createApp } from '../src/server/app.js';
import { cleanNoticeHtml } from '../src/server/content/noticeHtml.js';
import { exportContentPackage, importContentPackage } from '../src/server/transfer/index.js';
import type { ContentInput } from '../src/shared/content.js';
import { pdfFixture, pngFixture } from './helpers/documents.js';

const projectRoot = resolve('.');
const cacheRoot = resolve('.cache/tests');
const tableNames = ['contents', 'program_details', 'resource_details', 'contact_details', 'files', 'content_relations', 'content_files', 'home_items', 'content_links'] as const;
const omittedTables = ['admins', 'sessions', 'pre_auth_sessions', 'auth_rate_limits', 'seed_runs'] as const;
type Row = Record<string, any>;
type Manifest = { format: string; formatVersion: number; schemaVersion: string; exportedAt: string; migrations: Row[]; tables: Record<typeof tableNames[number], Row[]> };
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function workspace(t: TestContext) {
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, 'p09-transfer-'));
  t.after(() => {
    const within = relative(cacheRoot, directory);
    assert.ok(within && !isAbsolute(within) && within !== '..' && !within.startsWith(`..\\`) && !within.startsWith('../'));
    assert.equal(resolve(cacheRoot, within), directory);
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function configAt(directory: string) {
  const config = loadConfig({}, directory);
  config.migrationsDirectory = resolve('migrations');
  return config;
}

function rows(db: Database.Database) {
  return Object.fromEntries(tableNames.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()
    .map(row => JSON.parse(JSON.stringify(row))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
}

function readManifest(path: string): Manifest { return JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')); }
function writeManifest(path: string, manifest: Manifest) { writeFileSync(join(path, 'manifest.json'), JSON.stringify(manifest, null, 2)); }

async function populate(directory: string) {
  const config = configAt(directory), db = openDatabase(config.dbPath, { create: true });
  try {
    await migrateDatabase(db, config.migrationsDirectory, config.backupDirectory);
    const repo = new ContentRepository(db), files = new FileService(db, config);
    const pdf = pdfFixture('Content transfer original');
    const shared = await files.saveUpload('공통 제출 서식 원본.pdf', pdf);
    const image = await files.saveUpload('메인과 본문 이미지.png', pngFixture);
    const privateFile = await files.saveUpload('비공개 안내 원본.pdf', pdfFixture('Private original'));
    const unlinked = await files.saveUpload('미연결 임시 원본.pdf', pdfFixture('Unlinked original'));
    const common = { bodyHtml: '<p>예시 본문: 문단과 <strong>강조</strong></p><ul><li>유지할 목록</li></ul>', publication: 'public' as const, category: '예시 분류', publishedAt: '2026-10-01T00:00:00.000Z' };
    const resource = repo.create({ ...common, kind: 'resource', slug: 'stable-form', title: '[예시] 서식 안내', fileIds: [shared.id], resource: {
      audience: '예시 적용 대상', requiredDocuments: '서류 하나\n서류 둘', instructions: '예시 작성 방법', deadlineText: '확정 후 안내', submissionMethod: '예시 제출 방식', destination: '입력 대기', contact: '입력 대기', applicableYear: 2026,
    } });
    const noticeInput: ContentInput = { ...common, kind: 'notice', slug: 'stable-notice', title: '[예시] 공지', pinned: true, sortOrder: 3,
      bodyHtml: `${common.bodyHtml}<p><img data-file-id="${image.id}" src="/api/files/${image.id}?contentId=NOTICE_ID&amp;inline=1" alt="예시 이미지" /></p>`,
      relatedIds: [resource.id], fileLinks: [{ fileId: shared.id, role: 'attachment' }, { fileId: image.id, role: 'body', altText: '예시 이미지' }],
      contact: { name: '예시 담당', phone: '', email: '', address: '', note: '실제 연락처 아님' }, links: [{ label: '예시 외부 안내', url: 'https://example.com/guide?year=2026' }],
    };
    noticeInput.id = randomUUID(); noticeInput.bodyHtml = noticeInput.bodyHtml.replace('NOTICE_ID', noticeInput.id);
    noticeInput.bodyHtml = cleanNoticeHtml(noticeInput.bodyHtml, id => id === image.id, noticeInput.id, new Map([[image.id, '예시 이미지']])).html;
    assert.ok(noticeInput.bodyHtml.includes(`data-file-id="${image.id}"`), 'The fixture must retain a real sanitized body image.');
    const notice = repo.create(noticeInput);
    const program = { level: '예시 기초', audience: '예시 대상', delivery: '예시 운영 방식', completionRequirements: '예시 이수 요건' };
    const course = repo.create({ ...common, kind: 'curriculum', slug: 'stable-course', title: '[예시] 교육과정', program, relatedIds: [notice.id, resource.id] });
    const activity = repo.create({ ...common, kind: 'activity', slug: 'stable-activity', title: '[예시] 산학 프로그램', program: { ...program, level: '예시 기업 협력' }, relatedIds: [course.id] });
    const faq = repo.create({ ...common, kind: 'faq', slug: 'stable-faq', title: '[예시] 자주 묻는 질문', sortOrder: 7, relatedIds: [resource.id], links: [{ label: '예시 참고', url: 'https://example.com/faq' }] });
    const privateNotice = repo.create({ ...common, kind: 'notice', slug: 'private-notice', title: '[예시] 비공개 공지', publication: 'private', fileIds: [privateFile.id] });
    const draft = repo.create({ ...common, kind: 'faq', slug: 'draft-faq', title: '[예시] 초안 FAQ', publication: 'draft' });
    const pages = ['overview', 'organization', 'cooperation', 'location', 'guide', 'home'].map(slug => repo.create({ ...common, kind: 'page', slug,
      title: `[예시] ${slug} 안내`, relatedIds: [notice.id, resource.id, privateNotice.id, draft.id],
      contact: { name: '입력 대기', phone: '', email: '', address: '주소 입력 대기', note: '공식 정보 아님' },
      ...(slug === 'home' ? { fileLinks: [{ fileId: image.id, role: 'home' as const, altText: '예시 메인 이미지' }] } : {}),
    }));
    repo.setHomeItems([{ section: 'featured', contentId: faq.id }, { section: 'notice', contentId: notice.id }, { section: 'program', contentId: course.id }, { section: 'program', contentId: activity.id }, { section: 'resource', contentId: resource.id }]);
    // Non-default revisions/timestamps must be preserved, not recreated with now().
    repo.update(notice.id, { ...noticeInput, title: '[예시] 수정된 공지' }, notice.revision);
    db.prepare('UPDATE contents SET created_at=?,updated_at=?').run('2026-09-01T01:02:03.004Z', '2026-10-02T03:04:05.006Z');
    const username = `source-${randomBytes(5).toString('hex')}`, password = randomBytes(32).toString('base64url');
    await createAdmin(db, username, password);
    const auth = new AuthService(db, { sessionTtlSeconds: 600 });
    const pre = auth.issueLoginCsrf('127.0.0.1');
    const session = await auth.login(username, password, '127.0.0.1', pre.token, pre.csrfToken);
    auth.issueLoginCsrf('127.0.0.2');
    db.prepare('INSERT INTO seed_runs(key,checksum,applied_at) VALUES(?,?,?)').run('private-seed-marker', 'a'.repeat(64), new Date().toISOString());
    const envCanary = `NEVER_EXPORT_${randomBytes(24).toString('hex')}`;
    writeFileSync(join(directory, '.env'), `SECRET_KEY=${envCanary}\n`);
    const passwordHash = (db.prepare('SELECT password_hash FROM admins').get() as Row).password_hash as string;
    const preSecret = (db.prepare('SELECT csrf_secret FROM pre_auth_sessions').get() as Row).csrf_secret as string;
    const secretValues = [username, password, passwordHash, session.token, session.csrfToken, preSecret, envCanary, config.dbPath, config.uploadDirectory];
    return { config, snapshot: rows(db), secretValues, pdf, shared, image, privateFile, unlinked, resource, notice: repo.getById(notice.id)!, course, pages };
  } finally { db.close(); }
}

function assertNoRestoredContent(config: AppConfig) {
  if (existsSync(config.dbPath)) {
    const db = openDatabase(config.dbPath);
    try {
      const present = new Set((db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all() as Row[]).map(row => row.name));
      for (const table of tableNames) if (present.has(table)) assert.equal((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as Row).n, 0, table);
    } finally { db.close(); }
  }
  if (existsSync(config.uploadDirectory)) assert.deepEqual(readdirSync(config.uploadDirectory), []);
}

async function runningApp(config: AppConfig, db: Database.Database) {
  const server = createApp(config, false, db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; config.appOrigins.push(base);
  return { base, request: (path: string, init?: RequestInit) => fetch(base + path, init), close: async () => {
    server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  } };
}

async function signIn(app: Awaited<ReturnType<typeof runningApp>>, username: string, password: string) {
  const pre = await app.request('/api/auth/csrf');
  const cookie = pre.headers.getSetCookie().map(header => header.split(';')[0]).join('; ');
  const response = await app.request('/api/auth/login', { method: 'POST', headers: { Cookie: cookie, Origin: app.base, 'X-CSRF-Token': (await pre.json()).data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(response.status, 200, 'New environment administrator must authenticate independently.');
  return { Cookie: response.headers.getSetCookie().map(header => header.split(';')[0]).join('; '), Origin: app.base, 'X-CSRF-Token': (await response.json()).data.csrfToken as string, 'Content-Type': 'application/json' };
}

test('logical content package round-trips every content table and original file while excluding authentication and environment secrets', async t => {
  const directory = workspace(t), original = await populate(join(directory, 'source'));
  const packagePath = join(directory, 'package');
  const liveDb = openDatabase(original.config.dbPath), liveApp = await runningApp(original.config, liveDb);
  let exported;
  try {
    liveDb.prepare('UPDATE contents SET body_html=body_html || ? WHERE id=?').run('<p>Committed WAL record.</p>', original.notice.id);
    original.snapshot = rows(liveDb);
    assert.ok(statSync(`${original.config.dbPath}-wal`).size > 0);
    assert.equal((await liveApp.request('/api/health')).status, 200);
    exported = await exportContentPackage(original.config, packagePath);
  } finally { await liveApp.close(); liveDb.close(); }
  const manifest = readManifest(packagePath), raw = readFileSync(join(packagePath, 'manifest.json'), 'utf8');
  assert.equal(manifest.format, 'bootcamp-content'); assert.equal(manifest.formatVersion, 1); assert.equal(manifest.schemaVersion, '002');
  assert.deepEqual(Object.keys(manifest.tables).sort(), [...tableNames].sort());
  assert.equal(manifest.tables.contents.length, 13); assert.equal(manifest.tables.files.length, 4); assert.equal(exported.fileCount, 4);
  assert.deepEqual(readdirSync(packagePath).sort(), ['files', 'manifest.json']);
  for (const value of original.secretValues) assert.equal(raw.includes(value), false, 'A private runtime value leaked into the logical package.');
  for (const table of omittedTables) assert.equal(Object.hasOwn(manifest.tables, table), false);
  for (const file of manifest.tables.files) {
    assert.equal(isAbsolute(file.storage_key), false);
    const bytes = readFileSync(join(packagePath, 'files', file.storage_key));
    assert.equal(bytes.length, file.size); assert.equal(digest(bytes), file.sha256);
  }
  const target = configAt(join(directory, 'different-absolute-root'));
  await importContentPackage(target, packagePath);
  let db = openDatabase(target.dbPath);
  try {
    assert.deepEqual(rows(db), original.snapshot);
    for (const table of omittedTables) assert.equal((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as Row).n, 0, table);
    assert.deepEqual(db.pragma('foreign_key_check'), []); assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  } finally { db.close(); }
  for (const file of manifest.tables.files) assert.deepEqual(readFileSync(join(target.uploadDirectory, file.storage_key)), readFileSync(join(packagePath, 'files', file.storage_key)));
  // Reopening separately proves the importer committed real persistent storage.
  db = openDatabase(target.dbPath);
  const app = await runningApp(target, db);
  try {
    const course = await app.request(`/api/public/programs/curriculum/${original.course.slug}`);
    assert.equal(course.status, 200); assert.equal((await course.json()).data.id, original.course.id);
    for (const page of original.pages) {
      const response = await app.request(`/api/public/pages/${page.slug}`);
      assert.equal(response.status, 200); const data = (await response.json()).data;
      assert.equal(data.id, page.id); assert.equal(data.bodyHtml, page.bodyHtml);
      assert.equal(data.relatedContents.length, 2, 'Draft and private related pages stay excluded after restoration.');
    }
    const restoredHome = (await (await app.request('/api/public/home')).json()).data;
    assert.equal(restoredHome.page.files[0].role, 'home'); assert.equal(restoredHome.sections.program.length, 2);
    const bodyImage = await app.request(`/api/files/${original.image.id}?contentId=${original.notice.id}&inline=1`);
    assert.equal(bodyImage.status, 200); assert.deepEqual(Buffer.from(await bodyImage.arrayBuffer()), pngFixture);
    const publicDownload = await app.request(`/api/files/${original.shared.id}?contentId=${original.resource.id}`);
    assert.equal(publicDownload.status, 200); assert.deepEqual(Buffer.from(await publicDownload.arrayBuffer()), original.pdf);
    assert.match(publicDownload.headers.get('content-disposition') || '', new RegExp(encodeURIComponent(original.shared.originalName)));
    assert.match(publicDownload.headers.get('cache-control') || '', /no-store/);
    assert.equal((await app.request(`/api/files/${original.privateFile.id}`)).status, 404);
    assert.equal((await app.request(`/api/files/${original.unlinked.id}`)).status, 404);
    const before = await app.request(`/api/admin/contents/${original.notice.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'unauthorized', revision: 2 }) });
    assert.equal(before.status, 401);
    const username = `restored-${randomBytes(5).toString('hex')}`, firstPassword = randomBytes(32).toString('base64url');
    await createAdmin(db, username, firstPassword);
    const previous = await signIn(app, username, firstPassword);
    const secondPassword = randomBytes(32).toString('base64url');
    await resetAdmin(db, username, secondPassword);
    assert.equal((await app.request(`/api/admin/contents/${original.notice.id}`, { headers: previous })).status, 401);
    const headers = await signIn(app, username, secondPassword);
    assert.equal((await app.request(`/api/admin/contents/${original.notice.id}`, { method: 'PATCH', headers: { ...headers, 'X-CSRF-Token': 'invalid' }, body: JSON.stringify({ revision: 2, title: 'bad CSRF' }) })).status, 403);
    const edited = await app.request(`/api/admin/contents/${original.notice.id}`, { method: 'PATCH', headers, body: JSON.stringify({ revision: 2, title: '[예시] 복원 후 관리자 수정', bodyHtml: '<p>새 환경에서 실제 저장한 본문</p>' }) });
    assert.equal(edited.status, 200, await edited.clone().text());
    const notice = (await edited.json()).data; assert.equal(notice.slug, original.notice.slug); assert.equal(notice.revision, 3);
    assert.equal((await (await app.request(`/api/public/contents/${notice.id}`)).json()).data.title, notice.title);
    assert.equal((await app.request(`/api/files/${original.privateFile.id}`, { headers })).status, 200);
    const hide = await app.request(`/api/admin/contents/${original.resource.id}`, { method: 'PATCH', headers, body: JSON.stringify({ revision: 1, publication: 'private' }) });
    assert.equal(hide.status, 200);
    assert.equal((await app.request(`/api/files/${original.shared.id}?contentId=${original.resource.id}`)).status, 404);
    assert.equal((await app.request(`/api/files/${original.shared.id}?contentId=${original.notice.id}`)).status, 200, 'The surviving public reference to a shared file remains readable.');
    const visibleCourse = (await (await app.request(`/api/public/programs/curriculum/${original.course.slug}`)).json()).data;
    assert.equal(visibleCourse.relatedContents.some((item: Row) => item.id === original.resource.id), false);
  } finally { await app.close(); db.close(); }
  db = openDatabase(target.dbPath);
  const restarted = await runningApp(target, db);
  try {
    assert.equal(new ContentRepository(db).getById(original.notice.id)?.title, '[예시] 복원 후 관리자 수정');
    const response = await restarted.request(`/api/public/contents/${original.notice.id}`);
    assert.equal(response.status, 200); assert.equal((await response.json()).data.revision, 3);
    const download = await restarted.request(`/api/files/${original.shared.id}?contentId=${original.notice.id}`);
    assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), original.pdf);
  } finally { await restarted.close(); db.close(); }
  const sourceDb = openDatabase(original.config.dbPath);
  try { assert.deepEqual(rows(sourceDb), original.snapshot, 'Export and restore must not mutate the original environment.'); } finally { sourceDb.close(); }
  writeFileSync(resolve('.cache/p09-transfer-roundtrip.json'), JSON.stringify({ contentCount: 13, fileCount: 4, comparedTables: [...tableNames], sourceLiveWal: true,
    authTablesEmptyBeforeNewAdmin: true, newAdminCreateAndReset: true, csrfAndAnonymousWritesBlocked: true, originalKoreanPdfBytesEqual: true,
    privateAndUnlinkedDownloadsBlocked: true, sharedFileSurvivesPrivateTransition: true, restoredServerRestartVerified: true, sourceTablesUnchanged: true }, null, 2));
});

test('invalid manifests, IDs, relationships, detail types and relative storage keys fail before exposing a partial restoration', async t => {
  const directory = workspace(t), source = await populate(join(directory, 'source')), valid = join(directory, 'valid');
  await exportContentPackage(source.config, valid);
  const cases: [string, (manifest: Manifest) => void][] = [
    ['format version', m => { m.formatVersion = 999; }],
    ['schema version', m => { m.schemaVersion = '999'; }],
    ['migration checksum', m => { m.migrations[0].checksum = '0'.repeat(64); }],
    ['duplicate content ID', m => { m.tables.contents.push({ ...m.tables.contents[0] }); }],
    ['duplicate file ID', m => { m.tables.files.push({ ...m.tables.files[0] }); }],
    ['duplicate relation', m => { m.tables.content_relations.push({ ...m.tables.content_relations[0] }); }],
    ['duplicate file link', m => { m.tables.content_files.push({ ...m.tables.content_files[0] }); }],
    ['duplicate home selection', m => { m.tables.home_items.push({ ...m.tables.home_items[0] }); }],
    ['invalid UUID', m => { m.tables.contents[0].id = 'not-an-id'; }],
    ['unknown private table', m => { Object.assign(m.tables, { admins: [] }); }],
    ['unexpected content field', m => { m.tables.contents[0].password_hash = 'not-content'; }],
    ['foreign key', m => { m.tables.content_relations[0].target_id = randomUUID(); }],
    ['missing program details', m => { m.tables.program_details.pop(); }],
    ['wrong detail kind', m => { m.tables.resource_details[0].content_id = source.notice.id; }],
    ['wrong primitive type', m => { m.tables.resource_details[0].applicable_year = '2026'; }],
    ['wrong publication', m => { m.tables.contents[0].publication = 'recruiting'; }],
    ['bad external protocol', m => { m.tables.content_links[0].url = 'javascript:alert(1)'; }],
    ['unsafe HTML', m => { m.tables.contents[0].body_html += '<script>alert(1)</script>'; }],
    ['case-insensitive key collision', m => { m.tables.files.push({ ...m.tables.files[0], id: randomUUID(), storage_key: m.tables.files[0].storage_key.toUpperCase() }); }],
    ...['../escape.pdf', 'nested/../escape.pdf', 'C:/escape.pdf', '\\escape.pdf', '/escape.pdf', 'nested\\escape.pdf', 'CON.pdf', 'nested/NUL.pdf', 'trailing./file.pdf', 'file.pdf:stream'].map(key => [`unsafe key ${key}`, (m: Manifest) => { m.tables.files[0].storage_key = key; }] as [string, (manifest: Manifest) => void]),
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const packagePath = join(directory, `bad-${randomUUID()}`), target = configAt(join(directory, `restore-${randomUUID()}`));
    cpSync(valid, packagePath, { recursive: true }); const manifest = readManifest(packagePath); mutate(manifest); writeManifest(packagePath, manifest);
    await assert.rejects(() => importContentPackage(target, packagePath));
    assertNoRestoredContent(target);
  });
});

test('missing, tampered, wrong-format and symlinked files are rejected without changing the empty destination', async t => {
  const directory = workspace(t), source = await populate(join(directory, 'source')), valid = join(directory, 'valid');
  await exportContentPackage(source.config, valid);
  const cases: [string, (packagePath: string, manifest: Manifest) => void][] = [
    ['missing original', (path, m) => { unlinkSync(join(path, 'files', m.tables.files[0].storage_key)); }],
    ['changed original bytes', (path, m) => { const filePath = join(path, 'files', m.tables.files[0].storage_key), bytes = readFileSync(filePath); bytes[0] ^= 1; writeFileSync(filePath, bytes); }],
    ['incorrect byte count', (_path, m) => { m.tables.files[0].size += 1; }],
    ['forged hash with wrong file format', (path, m) => { const file = m.tables.files.find(row => row.extension === 'pdf')!, bytes = Buffer.from('This is not a PDF.'); writeFileSync(join(path, 'files', file.storage_key), bytes); file.size = bytes.length; file.sha256 = digest(bytes); }],
    ['symlinked file directory', (path) => { const actual = join(directory, `outside-${randomUUID()}`); renameSync(join(path, 'files'), actual); symlinkSync(actual, join(path, 'files'), process.platform === 'win32' ? 'junction' : 'dir'); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const packagePath = join(directory, `bad-${randomUUID()}`), target = configAt(join(directory, `restore-${randomUUID()}`));
    cpSync(valid, packagePath, { recursive: true }); const manifest = readManifest(packagePath); mutate(packagePath, manifest); writeManifest(packagePath, manifest);
    await assert.rejects(() => importContentPackage(target, packagePath)); assertNoRestoredContent(target);
  });
});

test('existing content, administrator accounts, upload files and output packages are conflicts and are never overwritten', async t => {
  const directory = workspace(t), source = await populate(join(directory, 'source')), packagePath = join(directory, 'package');
  await exportContentPackage(source.config, packagePath);
  const manifestBefore = readFileSync(join(packagePath, 'manifest.json'));
  await assert.rejects(() => exportContentPackage(source.config, packagePath));
  assert.deepEqual(readFileSync(join(packagePath, 'manifest.json')), manifestBefore);
  const existing = await populate(join(directory, 'existing'));
  await assert.rejects(() => importContentPackage(existing.config, packagePath));
  let db = openDatabase(existing.config.dbPath);
  try { assert.deepEqual(rows(db), existing.snapshot); } finally { db.close(); }
  const filesOnly = configAt(join(directory, 'files-only'));
  mkdirSync(filesOnly.uploadDirectory, { recursive: true });
  const sentinel = join(filesOnly.uploadDirectory, 'existing-file.txt'); writeFileSync(sentinel, 'must survive');
  await assert.rejects(() => importContentPackage(filesOnly, packagePath));
  assert.equal(readFileSync(sentinel, 'utf8'), 'must survive');
  const accountOnly = configAt(join(directory, 'account-only'));
  db = openDatabase(accountOnly.dbPath, { create: true });
  try {
    await migrateDatabase(db, accountOnly.migrationsDirectory, accountOnly.backupDirectory);
    await createAdmin(db, 'preserve-existing-admin', randomBytes(32).toString('base64url'));
  } finally { db.close(); }
  const before = readFileSync(accountOnly.dbPath);
  await assert.rejects(() => importContentPackage(accountOnly, packagePath));
  assert.deepEqual(readFileSync(accountOnly.dbPath), before);
  db = openDatabase(accountOnly.dbPath);
  try { assert.equal((db.prepare('SELECT count(*) AS n FROM admins').get() as Row).n, 1); assert.equal((db.prepare('SELECT count(*) AS n FROM contents').get() as Row).n, 0); } finally { db.close(); }
  const empty = configAt(join(directory, 'empty-migrated'));
  db = openDatabase(empty.dbPath, { create: true });
  try { await migrateDatabase(db, empty.migrationsDirectory, empty.backupDirectory); } finally { db.close(); }
  mkdirSync(empty.uploadDirectory, { recursive: true });
  await importContentPackage(empty, packagePath);
  db = openDatabase(empty.dbPath); try { assert.deepEqual(rows(db), source.snapshot); } finally { db.close(); }
  await assert.rejects(() => importContentPackage(empty, packagePath));
  db = openDatabase(empty.dbPath); try { assert.deepEqual(rows(db), source.snapshot); } finally { db.close(); }
});

test('export rejects missing or corrupt source originals without publishing a completed package', async t => {
  const directory = workspace(t), source = await populate(join(directory, 'source'));
  const db = openDatabase(source.config.dbPath); let file: Row;
  try { file = db.prepare('SELECT * FROM files WHERE id=?').get(source.shared.id) as Row; } finally { db.close(); }
  const filePath = join(source.config.uploadDirectory, file.storage_key), original = readFileSync(filePath);
  unlinkSync(filePath);
  const missingOutput = join(directory, 'missing-package');
  await assert.rejects(() => exportContentPackage(source.config, missingOutput));
  assert.equal(existsSync(join(missingOutput, 'manifest.json')), false);
  writeFileSync(filePath, Buffer.alloc(original.length));
  const corruptOutput = join(directory, 'corrupt-package');
  await assert.rejects(() => exportContentPackage(source.config, corruptOutput));
  assert.equal(existsSync(join(corruptOutput, 'manifest.json')), false);
  writeFileSync(filePath, original);
  await exportContentPackage(source.config, join(directory, 'valid-package'));
});

test('a migrated empty source produces a valid empty package without manufacturing seed data or administrator accounts', async t => {
  const directory = workspace(t), source = configAt(join(directory, 'source'));
  const db = openDatabase(source.dbPath, { create: true });
  try { await migrateDatabase(db, source.migrationsDirectory, source.backupDirectory); } finally { db.close(); }
  const packagePath = join(directory, 'empty-package');
  await exportContentPackage(source, packagePath);
  const manifest = readManifest(packagePath);
  for (const table of tableNames) assert.deepEqual(manifest.tables[table], []);
  const target = configAt(join(directory, 'empty-restored'));
  await importContentPackage(target, packagePath);
  const restored = openDatabase(target.dbPath);
  try {
    for (const table of [...tableNames, ...omittedTables]) assert.equal((restored.prepare(`SELECT count(*) AS n FROM ${table}`).get() as Row).n, 0, table);
  } finally { restored.close(); }
  assert.deepEqual(readdirSync(target.uploadDirectory), []);
});

test('export waits for a separate SQLite writer and snapshots matching committed metadata and original bytes', { timeout: 20_000 }, async t => {
  const directory = workspace(t), source = await populate(join(directory, 'source'));
  const bytes = pdfFixture('Committed by a separate writer'), nextTitle = '[예시] 동시 변경 후 제목';
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import Database from 'better-sqlite3';
    import { writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { createHash } from 'node:crypto';
    const db = new Database(process.env.P09_TEST_DB);
    db.pragma('busy_timeout=5000'); db.exec('BEGIN IMMEDIATE');
    const bytes = Buffer.from(process.env.P09_TEST_BYTES, 'base64');
    const file = db.prepare('SELECT * FROM files WHERE id=?').get(process.env.P09_TEST_FILE_ID);
    writeFileSync(join(process.env.P09_TEST_UPLOADS, file.storage_key), bytes);
    db.prepare('UPDATE files SET size=?,sha256=? WHERE id=?').run(bytes.length, createHash('sha256').update(bytes).digest('hex'), file.id);
    db.prepare('UPDATE contents SET title=? WHERE id=?').run(process.env.P09_TEST_TITLE, process.env.P09_TEST_CONTENT_ID);
    process.send('writer-holds-lock');
    setTimeout(() => { db.exec('COMMIT'); db.close(); process.disconnect(); }, 600);
  `], { cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env,
    P09_TEST_DB: source.config.dbPath, P09_TEST_UPLOADS: source.config.uploadDirectory, P09_TEST_BYTES: bytes.toString('base64'),
    P09_TEST_FILE_ID: source.shared.id, P09_TEST_CONTENT_ID: source.notice.id, P09_TEST_TITLE: nextTitle,
  } });
  let stderr = ''; child.stderr!.on('data', chunk => { stderr += String(chunk); });
  const completion = once(child, 'exit');
  try {
    const [message] = await once(child, 'message'); assert.equal(message, 'writer-holds-lock');
    const packagePath = join(directory, 'concurrent-package');
    await exportContentPackage(source.config, packagePath);
    assert.equal((await completion)[0], 0, stderr);
    const manifest = readManifest(packagePath), file = manifest.tables.files.find(row => row.id === source.shared.id)!;
    assert.equal(manifest.tables.contents.find(row => row.id === source.notice.id)!.title, nextTitle);
    assert.equal(file.sha256, digest(bytes)); assert.equal(file.size, bytes.length);
    assert.deepEqual(readFileSync(join(packagePath, 'files', file.storage_key)), bytes);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); await completion; }
});

async function command(args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/content.ts', ...args], { cwd: projectRoot, windowsHide: true,
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', value => { output += String(value); }); child.stderr.on('data', value => { output += String(value); });
  const [code] = await once(child, 'exit'); return { code, output };
}

test('documented CLI exports and imports only explicit destinations and rejects unsafe argument combinations', { timeout: 30_000 }, async t => {
  const directory = workspace(t), source = await populate(join(directory, 'source')), packagePath = join(directory, 'cli-package');
  const env = { DB_PATH: source.config.dbPath, UPLOAD_DIR: source.config.uploadDirectory };
  const exported = await command(['export', '--output', packagePath], env);
  assert.equal(exported.code, 0, exported.output);
  for (const secret of source.secretValues.slice(0, 7)) assert.equal(exported.output.includes(secret), false);
  const target = configAt(join(directory, 'cli-restore'));
  const imported = await command(['import', '--input', packagePath, '--db', target.dbPath, '--uploads', target.uploadDirectory], env);
  assert.equal(imported.code, 0, imported.output);
  const db = openDatabase(target.dbPath);
  try { assert.deepEqual(rows(db), source.snapshot); } finally { db.close(); }
  for (const args of [
    ['import', '--input', packagePath],
    ['import', '--input', packagePath, '--db', join(directory, 'missing-uploads.sqlite')],
    ['export', '--output', join(directory, 'unknown-option'), '--force'],
    ['export', '--output', join(directory, 'duplicate-option'), '--output', join(directory, 'other-output')],
  ]) {
    const result = await command(args, env); assert.notEqual(result.code, 0, JSON.stringify(args));
  }
  const sourceDb = openDatabase(source.config.dbPath);
  try { assert.deepEqual(rows(sourceDb), source.snapshot); } finally { sourceDb.close(); }
  assert.equal(existsSync(join(directory, 'missing-uploads.sqlite')), false);
  assert.equal(existsSync(join(directory, 'unknown-option')), false);
  assert.equal(existsSync(join(directory, 'duplicate-option')), false);
});
