import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { createAdmin } from '../src/server/auth/adminAccounts.js';
import { pdfFixture, pngFixture } from './helpers/documents.js';

const cacheRoot = resolve('.cache/tests');
mkdirSync(cacheRoot, { recursive: true });
const program = { level: '[예시] 기초', audience: '[예시] 참여 대상', delivery: '[예시] 대면 안내', completionRequirements: '[예시] 이수 안내' };
const resource = { audience: '[예시] 적용 대상', requiredDocuments: '서류 1\n서류 2', instructions: '[예시] 작성 안내', deadlineText: '[예시] 별도 공지', submissionMethod: '[예시] 제출 방법', destination: '[예시] 제출처', contact: '[예시] 문의처 입력 대기', applicableYear: 2026 };
const contact = { name: '[예시] 부서', phone: '', email: '', address: '[예시] 위치 입력 대기', note: '실제 연락처가 아닙니다.' };

function content(kind: string, overrides: Record<string, unknown> = {}) {
  return { kind, title: `[예시] ${kind} 시험`, bodyHtml: '<p>격리 환경에서만 사용하는 시험 본문</p>', publication: 'draft',
    ...(['curriculum', 'activity'].includes(kind) ? { program } : {}), ...(kind === 'resource' ? { resource } : {}), ...overrides };
}

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(cacheRoot, 'p06-admin-'));
  const config = loadConfig({}, directory), db = openDatabase(config.dbPath, { create: true });
  await migrateDatabase(db, resolve('migrations'), config.backupDirectory);
  const username = `p06-${randomBytes(6).toString('hex')}`, password = randomBytes(32).toString('base64url');
  await createAdmin(db, username, password);
  const server = createApp(config, false, db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; config.appOrigins.push(base);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); db.close();
    const boundary = relative(cacheRoot, directory);
    assert.ok(boundary && !boundary.startsWith('..') && resolve(cacheRoot, boundary) === directory);
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (path: string, init?: RequestInit) => fetch(base + path, init);
  const cookies = new Map<string, string>();
  const remember = (response: Response) => { for (const header of response.headers.getSetCookie()) { const pair = header.split(';')[0], index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)); } };
  const cookie = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  const csrfResponse = await request('/api/auth/csrf'); remember(csrfResponse);
  const signIn = await request('/api/auth/login', { method: 'POST', headers: { Cookie: cookie(), Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': (await csrfResponse.json()).data.csrfToken }, body: JSON.stringify({ username, password }) });
  assert.equal(signIn.status, 200); remember(signIn);
  const headers = { Cookie: cookie(), Origin: base, 'X-CSRF-Token': (await signIn.json()).data.csrfToken as string };
  const admin = (path: string, method = 'GET', body?: unknown) => request(path, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  async function create(kind: string, overrides: Record<string, unknown> = {}) {
    const response = await admin('/api/admin/contents', 'POST', content(kind, overrides));
    assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).data;
  }
  async function upload(name: string, bytes: Buffer) {
    const body = new FormData(); body.set('file', new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }), name);
    const response = await request('/api/admin/files', { method: 'POST', headers, body });
    assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).data;
  }
  return { db, request, admin, create, upload, headers, base };
}

test('every P06 mutation and private read requires a server session; CSRF and logout invalidate new routes too', async t => {
  const f = await fixture(t);
  const endpoints = [
    ['POST', '/api/admin/contents', content('faq')],
    ['PATCH', `/api/admin/contents/${randomUUID()}`, { revision: 1, title: 'changed' }],
    ['DELETE', `/api/admin/contents/${randomUUID()}`, { revision: 1 }],
    ['PUT', '/api/admin/pages/overview', { ...content('page'), revision: 0 }],
    ['PUT', '/api/admin/home', { page: { ...content('page'), revision: 0 }, items: [] }],
    ['POST', '/api/admin/contents/preview', { bodyHtml: '<p>preview</p>', fileLinks: [] }],
  ] as const;
  for (const [method, path, body] of endpoints) {
    const json = JSON.stringify(body);
    assert.equal((await f.request(path, { method, headers: { 'Content-Type': 'application/json' }, body: json })).status, 401, `${method} ${path}`);
    assert.equal((await f.request(path, { method, headers: { Cookie: f.headers.Cookie, Origin: f.base, 'Content-Type': 'application/json', 'X-CSRF-Token': 'invalid' }, body: json })).status, 403, path);
  }
  for (const path of ['/api/admin/pages/overview', '/api/admin/home', '/api/admin/content-categories?kind=faq', '/api/admin/contents?kind=curriculum']) {
    assert.equal((await f.request(path)).status, 401, path); assert.equal((await f.admin(path)).status, 200, path);
  }
  const made = await f.create('faq');
  assert.equal((await f.admin('/api/auth/logout', 'POST')).status, 204);
  assert.equal((await f.admin(`/api/admin/contents/${made.id}`, 'PATCH', { revision: 1, title: 'logged out' })).status, 401);
  assert.equal((await f.admin('/api/admin/pages/guide', 'PUT', { title: 'logged out', bodyHtml: '<p>guide</p>', revision: 0 })).status, 401);
});

test('public catalog categories and program levels reflect administrator updates without exposing private classifications', async t => {
  const f = await fixture(t);
  const course = await f.create('curriculum', { publication: 'public', category: '공개 교육 분류', program: { ...program, level: '기초 예시' } });
  const activity = await f.create('activity', { publication: 'public', category: '공개 프로그램 분류', program: { ...program, level: '산학 예시' } });
  const form = await f.create('resource', { publication: 'public', category: '공개 서식 분류', relatedIds: [course.id, activity.id] });
  for (const kind of ['curriculum', 'activity', 'resource']) {
    await f.create(kind, { publication: 'private', category: '비공개 분류' });
    await f.create(kind, { publication: 'draft', category: '초안 분류' });
    await f.create(kind, { publication: 'public', category: '' });
    const response = await f.request(`/api/public/content-categories?kind=${kind}`);
    assert.equal(response.status, 200); const categories = (await response.json()).data;
    assert.deepEqual(categories, [kind === 'curriculum' ? '공개 교육 분류' : kind === 'activity' ? '공개 프로그램 분류' : '공개 서식 분류']);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  }
  for (const query of ['', '?kind=unknown', '?kind=curriculum&kind=activity', '?kind[]=curriculum', '?kind=resource&publication=private', '?kind=resource&q=word']) {
    assert.equal((await f.request('/api/public/content-categories' + query)).status, 400, query);
  }
  const updated = await f.admin(`/api/admin/contents/${course.id}`, 'PATCH', { revision: course.revision, title: '[예시] 바뀐 교육 제목', program: { level: '심화 수정 예시' } });
  assert.equal(updated.status, 200); const changed = (await updated.json()).data;
  assert.equal(changed.id, course.id); assert.equal(changed.slug, course.slug); assert.equal(changed.programLevel, '심화 수정 예시');
  const detail = (await (await f.request(`/api/public/programs/curriculum/${course.slug}`)).json()).data;
  assert.equal(detail.title, '[예시] 바뀐 교육 제목'); assert.equal(detail.program.level, '심화 수정 예시');
  const summary = (await (await f.request('/api/public/contents?kind=curriculum')).json()).data.find((item: { id: string }) => item.id === course.id);
  assert.equal(summary.programLevel, '심화 수정 예시'); assert.equal('bodyHtml' in summary, false);
  const related = (await (await f.request(`/api/public/contents/${form.id}`)).json()).data.relatedContents;
  assert.equal(related.find((item: { id: string }) => item.id === course.id).programLevel, '심화 수정 예시');
  assert.equal(related.find((item: { id: string }) => item.id === activity.id).programLevel, '산학 예시');
  const saved = await f.admin('/api/admin/home', 'PUT', { page: { revision: 0, title: '[예시] 메인', bodyHtml: '<p>메인 검증</p>', publication: 'public' }, items: [{ section: 'program', contentId: course.id }] }); assert.equal(saved.status, 200);
  const home = (await (await f.request('/api/public/home')).json()).data; assert.equal(home.sections.program[0].programLevel, '심화 수정 예시');
  const hidden = await f.admin(`/api/admin/contents/${course.id}`, 'PATCH', { revision: changed.revision, publication: 'private' }); assert.equal(hidden.status, 200);
  assert.equal((await f.request(`/api/public/programs/curriculum/${course.slug}`)).status, 404);
  assert.deepEqual((await (await f.request('/api/public/content-categories?kind=curriculum')).json()).data, []);
  assert.deepEqual((await (await f.request('/api/public/home')).json()).data.sections.program, []);
  assert.ok(!(await (await f.request(`/api/public/contents/${form.id}`)).json()).data.relatedContents.some((item: { id: string }) => item.id === course.id));
});

test('curriculum, activity, resource and FAQ create/update/reopen preserve typed details and reject invalid changes atomically', async t => {
  const f = await fixture(t);
  for (const kind of ['curriculum', 'activity', 'resource', 'faq']) {
    const created = await f.create(kind, { category: `분류-${kind}`, sortOrder: 7, links: [{ label: '공식 안내 예시', url: 'https://example.com/info' }] });
    assert.equal(created.kind, kind); assert.equal(created.revision, 1); assert.equal(created.publication, 'draft');
    const changed = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 1, title: `[예시] 수정 ${kind}`, publication: 'private', sortOrder: 3 });
    assert.equal(changed.status, 200, await changed.clone().text());
    const reopened = (await (await f.admin(`/api/admin/contents/${created.id}`)).json()).data;
    assert.equal(reopened.revision, 2); assert.equal(reopened.title, `[예시] 수정 ${kind}`); assert.equal(reopened.sortOrder, 3);
    assert.equal(reopened.category, `분류-${kind}`); assert.equal(reopened.links[0].url, 'https://example.com/info');
    if (['curriculum', 'activity'].includes(kind)) assert.deepEqual(reopened.program, program);
    if (kind === 'resource') assert.deepEqual(reopened.resource, resource);
    assert.equal((await f.request(`/api/public/contents/${created.id}`)).status, 404);
    for (const invalid of [ { title: '' }, { links: [{ label: 'unsafe', url: 'javascript:alert(1)' }] }, { links: [{ label: 'secret', url: 'https://user:password@example.com' }] }, { progressStatus: 'running' } ]) {
      assert.equal((await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 2, ...invalid })).status, 400, `${kind} ${Object.keys(invalid)[0]}`);
    }
    assert.equal((await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 1, title: 'stale' })).status, 409);
    assert.equal((await (await f.admin(`/api/admin/contents/${created.id}`)).json()).data.revision, 2);
    if (['curriculum', 'activity'].includes(kind)) {
      const partial = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 2, program: { audience: '수정 대상' } });
      assert.equal(partial.status, 200); assert.deepEqual((await partial.json()).data.program, { ...program, audience: '수정 대상' });
    }
    if (kind === 'resource') {
      const partial = await f.admin(`/api/admin/contents/${created.id}`, 'PATCH', { revision: 2, resource: { applicableYear: 2027 } });
      assert.equal(partial.status, 200); assert.deepEqual((await partial.json()).data.resource, { ...resource, applicableYear: 2027 });
    }
  }
  for (const input of [content('curriculum', { program: undefined }), content('activity', { program: { audience: 'incomplete' } }), content('resource', { resource: { ...resource, applicableYear: 1800 } }), content('faq', { program })]) {
    assert.equal((await f.admin('/api/admin/contents', 'POST', input)).status, 400);
  }
  const all = (await (await f.admin('/api/admin/contents')).json()).data;
  assert.deepEqual(new Set(all.map((item: { kind: string }) => item.kind)), new Set(['curriculum', 'activity', 'resource', 'faq']));
  const filtered = await f.admin('/api/admin/contents?kind=curriculum&publication=private&q=' + encodeURIComponent('수정'));
  assert.equal((await filtered.json()).pagination.total, 1);
});

test('all fixed pages support first-save revision zero, stale-conflict protection, persisted contact/links and deliberate versioned deletion', async t => {
  const f = await fixture(t);
  for (const slug of ['overview', 'organization', 'cooperation', 'location', 'guide']) {
    const read = await f.admin(`/api/admin/pages/${slug}`); assert.equal(read.status, 200); assert.equal((await read.json()).data, null);
    const initial = { title: `[예시] ${slug}`, bodyHtml: '<p>고정 안내</p>', publication: 'draft', contact, revision: 0, links: [{ label: '신청 경로 예시', url: 'https://example.com/apply' }] };
    const created = await f.admin(`/api/admin/pages/${slug}`, 'PUT', initial); assert.ok([200, 201].includes(created.status), await created.clone().text());
    const saved = (await created.json()).data; assert.equal(saved.slug, slug); assert.equal(saved.kind, 'page'); assert.equal(saved.revision, 1);
    assert.equal((await f.admin(`/api/admin/pages/${slug}`, 'PUT', { ...initial, title: 'overwritten' })).status, 409);
    const changed = await f.admin(`/api/admin/pages/${slug}`, 'PUT', { title: `[예시] 수정 ${slug}`, publication: 'public', revision: 1 });
    assert.equal(changed.status, 200, await changed.clone().text());
    const reopened = (await (await f.admin(`/api/admin/pages/${slug}`)).json()).data;
    assert.equal(reopened.id, saved.id); assert.equal(reopened.revision, 2); assert.deepEqual(reopened.contact, contact); assert.equal(reopened.links[0].url, 'https://example.com/apply');
    const visible = await f.request(`/api/public/pages/${slug}`); assert.equal(visible.status, 200); assert.equal((await visible.json()).data.title, `[예시] 수정 ${slug}`);
    assert.equal((await f.admin(`/api/admin/contents/${saved.id}/delete-impact`)).status, 200);
    assert.equal((await f.admin(`/api/admin/contents/${saved.id}`, 'DELETE', { revision: 1 })).status, 409);
    assert.equal((await f.admin(`/api/admin/contents/${saved.id}`, 'DELETE', { revision: 2 })).status, 204);
    assert.equal((await (await f.admin(`/api/admin/pages/${slug}`)).json()).data, null);
  }
  for (const slug of ['home', 'unknown']) assert.equal((await f.admin(`/api/admin/pages/${slug}`)).status, 404);
  assert.equal((await f.admin('/api/admin/contents', 'POST', content('page'))).status, 400);
});

test('home page and ID-based selections save atomically, filter private targets and protect image publication and revisions', async t => {
  const f = await fixture(t);
  const notice = await f.create('notice', { publication: 'public' }), hidden = await f.create('curriculum', { publication: 'private' }), form = await f.create('resource', { publication: 'public' });
  const guideResponse = await f.admin('/api/admin/pages/guide', 'PUT', { title: '[예시] 주요 안내 대상', bodyHtml: '<p>참여 안내</p>', publication: 'public', revision: 0 });
  assert.equal(guideResponse.status, 200); const guide = (await guideResponse.json()).data;
  const image = await f.upload('메인 시험 이미지.png', pngFixture);
  const items = [{ section: 'featured', contentId: guide.id }, { section: 'notice', contentId: notice.id }, { section: 'program', contentId: hidden.id }, { section: 'resource', contentId: form.id }];
  const page = { title: '[예시] 메인 소개', bodyHtml: '<p>소개 문구 및 주요 안내</p>', publication: 'public', revision: 0, fileLinks: [{ fileId: image.id, role: 'home', altText: '메인 시험 이미지' }], links: [{ label: '바로가기 예시', url: 'https://example.com' }] };
  const create = await f.admin('/api/admin/home', 'PUT', { page, items }); assert.ok([200, 201].includes(create.status), await create.clone().text());
  const saved = (await create.json()).data; assert.equal(saved.page.revision, 1); assert.deepEqual(saved.items, items);
  assert.equal((await f.request(`/api/files/${image.id}?contentId=${saved.page.id}&inline=1`)).status, 200);
  const visible = (await (await f.request('/api/public/home')).json()).data;
  assert.deepEqual(visible.sections.notice.map((item: { id: string }) => item.id), [notice.id]); assert.deepEqual(visible.sections.program, []); assert.equal(visible.page.files[0].id, image.id);
  assert.deepEqual(visible.sections.featured.map((item: { id: string }) => item.id), [guide.id]);
  for (const invalid of [{ section: 'notice', contentId: guide.id }, { section: 'featured', contentId: saved.page.id }]) {
    assert.equal((await f.admin('/api/admin/home', 'PUT', { page: { revision: 1 }, items: [invalid] })).status, 400);
  }
  const failed = await f.admin('/api/admin/home', 'PUT', { page: { title: 'must roll back', revision: 1 }, items: [{ section: 'notice', contentId: randomUUID() }] });
  assert.ok([400, 404, 409].includes(failed.status));
  const unchanged = (await (await f.admin('/api/admin/home')).json()).data;
  assert.equal(unchanged.page.title, page.title); assert.equal(unchanged.page.revision, 1); assert.deepEqual(unchanged.items, items);
  assert.equal((await f.admin('/api/admin/home', 'PUT', { page, items: [] })).status, 409);
  assert.equal((await f.admin('/api/admin/home', 'PUT', { page: { revision: 1, publication: 'private' }, items })).status, 200);
  assert.equal((await f.request(`/api/files/${image.id}?contentId=${saved.page.id}&inline=1`)).status, 404);
  const privateHome = (await (await f.request('/api/public/home')).json()).data;
  assert.equal(privateHome.page, null); assert.ok(Object.values(privateHome.sections).every(items => Array.isArray(items) && items.length === 0));
  assert.equal((f.db.prepare("SELECT COUNT(*) AS total FROM contents WHERE kind='page' AND slug='home'").get() as { total: number }).total, 1);
  const impact = (await (await f.admin(`/api/admin/contents/${saved.page.id}/delete-impact`)).json()).data;
  assert.equal(impact.revision, 2); assert.equal(impact.homeLinks, items.length);
  assert.equal((await f.admin(`/api/admin/contents/${saved.page.id}`, 'DELETE', { revision: 2 })).status, 204);
  assert.deepEqual((await (await f.admin('/api/admin/home')).json()).data, { page: null, items: [] });
});

test('generic preview and public reads sanitize all content bodies, retain managed images and hide private related targets', async t => {
  const f = await fixture(t), image = await f.upload('안내 본문.png', pngFixture);
  const hidden = await f.create('resource', { publication: 'private' }), visible = await f.create('notice', { publication: 'public' });
  const raw = `<p onclick="alert(1)">안내<script>alert(1)</script></p><img src="https://example.com/pixel"><img data-file-id="${image.id}" onerror="alert(1)"><a href="javascript:alert(1)">링크</a>`;
  const links = [{ fileId: image.id, role: 'body', altText: '안내 이미지' }];
  const preview = await f.admin('/api/admin/contents/preview', 'POST', { bodyHtml: raw, fileLinks: links });
  assert.equal(preview.status, 200); assert.doesNotMatch((await preview.json()).data.bodyHtml, /script|onclick|onerror|javascript:|example.com/);
  assert.equal((await f.request(`/api/files/${image.id}?inline=1`)).status, 404);
  for (const kind of ['curriculum', 'activity', 'resource', 'faq']) {
    const saved = await f.create(kind, { publication: 'public', bodyHtml: raw, fileLinks: links, relatedIds: [hidden.id, visible.id] });
    const read = (await (await f.request(`/api/public/contents/${saved.id}`)).json()).data;
    assert.doesNotMatch(read.bodyHtml, /<script|onclick|onerror|javascript:|example.com/);
    assert.match(read.bodyHtml, new RegExp(`/api/files/${image.id}\\?contentId=${saved.id}&amp;inline=1`));
    assert.deepEqual(read.relatedContents.map((item: { id: string }) => item.id), [visible.id]);
    const adminRead = (await (await f.admin(`/api/admin/contents/${saved.id}`)).json()).data;
    assert.deepEqual(adminRead.relatedContents.map((item: { id: string }) => item.id), [hidden.id, visible.id]);
  }
});

test('FAQ ordering and resource replacement/delete impact preserve the original shared by another content type', async t => {
  const f = await fixture(t), original = await f.upload('공유 서식.pdf', pdfFixture()), replacement = await f.upload('새 서식.pdf', pdfFixture('replacement'));
  const first = await f.create('faq', { sortOrder: 30, publication: 'public' }), second = await f.create('faq', { sortOrder: 5, publication: 'public' });
  const faqList = (await (await f.admin('/api/admin/contents?kind=faq')).json()).data;
  assert.deepEqual(faqList.map((row: { id: string }) => row.id), [second.id, first.id]);
  const form = await f.create('resource', { publication: 'public', fileLinks: [{ fileId: original.id, role: 'attachment' }] });
  const course = await f.create('curriculum', { publication: 'public', relatedIds: [form.id], fileLinks: [{ fileId: original.id, role: 'attachment' }] });
  const impact = (await (await f.admin(`/api/admin/contents/${form.id}/delete-impact`)).json()).data;
  assert.equal(impact.incomingLinks, 1); assert.equal(impact.files[0].otherReferences, 1);
  const changed = await f.admin(`/api/admin/contents/${form.id}`, 'PATCH', { revision: 1, fileLinks: [{ fileId: replacement.id, role: 'attachment' }], resource: { ...resource, applicableYear: 2027 } });
  assert.equal(changed.status, 200); assert.equal((await changed.json()).data.resource.applicableYear, 2027);
  assert.equal((await f.request(`/api/files/${original.id}?contentId=${form.id}`)).status, 404);
  assert.equal((await f.request(`/api/files/${original.id}?contentId=${course.id}`)).status, 200);
  assert.equal((await f.admin(`/api/admin/contents/${form.id}`, 'DELETE', { revision: 2 })).status, 204);
  const courseRead = (await (await f.admin(`/api/admin/contents/${course.id}`)).json()).data;
  assert.deepEqual(courseRead.relatedContents, []); assert.equal(courseRead.files[0].id, original.id);
  const download = await f.request(`/api/files/${original.id}?contentId=${course.id}`);
  assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdfFixture());
});

test('legacy persisted HTML is sanitized on public program, fixed-page and home reads as well as administrator detail reads', async t => {
  const f = await fixture(t);
  const course = await f.create('curriculum', { publication: 'public' });
  const pageResponse = await f.admin('/api/admin/pages/overview', 'PUT', { title: '[예시] 기존 고정 정보', bodyHtml: '<p>기존 안내</p>', publication: 'public', revision: 0 });
  assert.equal(pageResponse.status, 200); const page = (await pageResponse.json()).data;
  const homeResponse = await f.admin('/api/admin/home', 'PUT', { page: { title: '[예시] 기존 메인', bodyHtml: '<p>기존 안내</p>', publication: 'public', revision: 0 }, items: [] });
  assert.equal(homeResponse.status, 200); const home = (await homeResponse.json()).data.page;
  function assertSafe(html: string) { assert.match(html, /<p>기존 안내<\/p>/); assert.doesNotMatch(html, /script|onclick|onerror|<img|tracker|https:/); }
  for (const id of [course.id, page.id, home.id]) {
    // Simulate an older import in this isolated database, without exercising a sanctioned write API.
    f.db.prepare('UPDATE contents SET body_html=? WHERE id=?').run('<p onclick="alert(1)">기존 안내</p><script>alert(1)</script><img src="https://example.com/tracker.png">', id);
    const admin = (await (await f.admin(`/api/admin/contents/${id}`)).json()).data;
    assertSafe(admin.bodyHtml);
  }
  const program = await f.request(`/api/public/programs/curriculum/${course.slug}`);
  assert.equal(program.status, 200); assertSafe((await program.json()).data.bodyHtml);
  const fixed = await f.request('/api/public/pages/overview'); assert.equal(fixed.status, 200); assertSafe((await fixed.json()).data.bodyHtml);
  assertSafe((await (await f.request('/api/public/home')).json()).data.page.bodyHtml);
});
