import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import type { ContentRecord } from '../../src/shared/content';
import { test, expect } from './auth.fixture';
import { pdfFixture, pngFixture } from '../helpers/documents';

// Credentials belong only to the per-test fixture; no login traces/screenshots.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const program = { level: '[예시] 기초', audience: '[예시] 교육 대상', delivery: '[예시] 운영 방식', completionRequirements: '[예시] 이수요건' };
const resource = { audience: '[예시] 적용 대상', requiredDocuments: '[예시] 제출서류 목록', instructions: '[예시] 작성 안내', deadlineText: '[예시] 제출 기한', submissionMethod: '[예시] 제출 방법', destination: '[예시] 제출처', contact: '[예시] 서식 문의처', applicableYear: 2026 };
const catalogs = [
  { kind: 'curriculum', path: '/programs/curriculum', heading: '교육과정 목록·현황' },
  { kind: 'activity', path: '/programs/activities', heading: '비교과·산학 프로그램 목록·현황' },
  { kind: 'resource', path: '/resources', heading: '신청·제출 서식' },
] as const;
const detailPath = (record: ContentRecord) => record.kind === 'resource' ? `/resources/${record.id}` : `/programs/${record.kind === 'curriculum' ? 'curriculum' : 'activities'}/${record.slug}`;

async function api(request: APIRequestContext, origin: string) {
  const session = await request.get('/api/auth/session'); expect(session.status()).toBe(200);
  const headers = { Origin: origin, 'X-CSRF-Token': (await session.json()).data.csrfToken as string };
  return {
    async create(kind: string, title: string, extra: Record<string, unknown> = {}): Promise<ContentRecord> {
      const response = await request.post('/api/admin/contents', { headers, data: { kind, title, bodyHtml: '<p>격리된 공개 화면 검증 예시입니다.</p>', publication: 'public', ...(['curriculum', 'activity'].includes(kind) ? { program } : {}), ...(kind === 'resource' ? { resource } : {}), ...extra } });
      expect(response.status(), await response.text()).toBe(201); return (await response.json()).data;
    },
    async patch(record: ContentRecord, extra: Record<string, unknown>): Promise<ContentRecord> {
      const response = await request.patch(`/api/admin/contents/${record.id}`, { headers, data: { revision: record.revision, ...extra } });
      expect(response.status(), await response.text()).toBe(200); return (await response.json()).data;
    },
    async remove(record: ContentRecord) {
      const response = await request.delete(`/api/admin/contents/${record.id}`, { headers, data: { revision: record.revision } }); expect(response.status()).toBe(204);
    },
    async upload(name: string, buffer: Buffer) {
      const response = await request.post('/api/admin/files', { headers, multipart: { file: { name, mimeType: 'application/octet-stream', buffer } } });
      expect(response.status(), await response.text()).toBe(201); return (await response.json()).data;
    },
    async home(page: Record<string, unknown>, items: { section: string; contentId: string }[]) {
      const response = await request.put('/api/admin/home', { headers, data: { page, items } }); expect(response.status(), await response.text()).toBe(200); return (await response.json()).data;
    },
  };
}

async function anonymous(browser: Browser, page: Page, baseURL: string) {
  const context = await browser.newContext({ baseURL, viewport: page.viewportSize(), acceptDownloads: true });
  const external: string[] = [], errors: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.href); await route.abort(); }
    else await route.continue();
  });
  const visitor = await context.newPage(); visitor.on('pageerror', error => errors.push(error.message));
  return { context, visitor, external, errors };
}

async function fit(page: Page) {
  const bounds = await page.evaluate(() => {
    const header = document.querySelector('.public-header')!.getBoundingClientRect(), main = document.querySelector('#main-content')!.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, gap: main.top - header.bottom };
  });
  expect(bounds.overflow).toBeLessThanOrEqual(1); expect(bounds.gap).toBeGreaterThanOrEqual(0);
}
async function choose(page: Page, group: string, title: string) {
  const area = page.getByRole('group', { name: group, exact: true });
  await area.getByLabel(`${group} 검색어`, { exact: true }).fill(title);
  await area.getByRole('button', { name: `${group} 검색`, exact: true }).click();
  await area.getByRole('button', { name: `${title} 선택`, exact: true }).click();
}
async function save(page: Page, path: string, method: string, first = false): Promise<any> {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method);
  await page.getByRole('button', { name: first ? '저장' : '수정 저장', exact: true }).click();
  const response = await pending; expect(response.ok(), await response.text()).toBe(true);
  await expect(page.getByText(path.includes('/notices') ? '공지를 저장했습니다.' : '콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  return (await response.json()).data;
}

test('administrator selections connect home, stable program address, notice, resource and original Korean download', async ({ page, browser, login, authServer }, testInfo) => {
  test.setTimeout(150_000);
  await login('/admin/programs');
  const f = await api(page.request, authServer.base), token = randomBytes(4).toString('hex');
  let course = await f.create('curriculum', `[예시] 연결 교육 ${token}`);
  const activity = await f.create('activity', `[예시] 연결 프로그램 ${token}`, { program: { ...program, level: '[예시] 산학 협력형' } });
  const form = await f.create('resource', `[예시] 연결 서식 ${token}`);
  const notice = await f.create('notice', `[예시] 연결 공지 ${token}`);
  const hidden = await f.create('resource', `[예시] 숨긴 서식 ${token}`, { publication: 'private' });
  const originalSlug = course.slug, originalId = course.id;
  await page.goto(`/admin/programs/${course.id}/edit`);
  await page.getByLabel('제목', { exact: true }).fill(`${course.title} 수정`);
  await page.getByLabel('교육 대상', { exact: true }).fill('[예시] 관리자에서 수정한 교육 대상');
  await choose(page, '관련 콘텐츠', notice.title); await choose(page, '관련 콘텐츠', hidden.title);
  course = await save(page, `/api/admin/contents/${course.id}`, 'PATCH');
  expect(course.slug).toBe(originalSlug); expect(course.id).toBe(originalId);
  await page.goto(`/admin/notices/${notice.id}/edit`);
  await choose(page, '관련 콘텐츠', course.title); await choose(page, '관련 콘텐츠', form.title); await choose(page, '관련 콘텐츠', hidden.title);
  // Notice editor uses the shared contents endpoint but its own success message.
  const noticeSave = page.waitForResponse(r => new URL(r.url()).pathname === `/api/admin/contents/${notice.id}` && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click(); expect((await noticeSave).status()).toBe(200);
  await expect(page.getByText('공지를 저장했습니다.', { exact: true })).toBeVisible();
  await page.goto(`/admin/resources/${form.id}/edit`);
  await page.getByLabel('작성 안내', { exact: true }).fill('[예시] 관리자에서 수정한 작성 방법');
  await choose(page, '관련 콘텐츠', course.title); await choose(page, '관련 콘텐츠', notice.title);
  const originalName = `제출 원본 ${token}.pdf`, bytes = pdfFixture('P08 public flow original');
  const uploading = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/files' && r.request().method() === 'POST');
  await page.getByLabel('첨부파일 선택', { exact: true }).setInputFiles({ name: originalName, mimeType: 'application/octet-stream', buffer: bytes }); expect((await uploading).status()).toBe(201);
  await save(page, `/api/admin/contents/${form.id}`, 'PATCH');
  await page.goto('/admin/home');
  const homeTitle = `[예시] 메인 소개 ${token}`;
  await page.getByLabel('메인 제목', { exact: true }).fill(homeTitle);
  await page.getByLabel('본문 HTML', { exact: true }).fill('<p>관리자가 저장한 핵심 소개 예시입니다.</p>');
  await page.getByLabel('공개 여부', { exact: true }).selectOption('public');
  await choose(page, '공지 노출', notice.title); await choose(page, '교육·프로그램 노출', course.title); await choose(page, '교육·프로그램 노출', activity.title); await choose(page, '서식 노출', form.title);
  await save(page, '/api/admin/home', 'PUT', true);
  const { context, visitor, external, errors } = await anonymous(browser, page, authServer.base);
  try {
    await visitor.goto('/');
    await expect(visitor.locator('h1')).toContainText('내 전공에'); await expect(visitor.locator('h1')).toContainText('AI를 더하다');
    await expect(visitor.getByRole('heading', { name: homeTitle, exact: true })).toBeVisible();
    await expect(visitor.getByText('관리자가 저장한 핵심 소개 예시입니다.', { exact: true })).toBeVisible();
    await expect(visitor.locator('.home-content-list a').filter({ hasText: course.title })).toBeVisible();
    await fit(visitor); await visitor.screenshot({ path: testInfo.outputPath('P08-home.png'), fullPage: true });
    await visitor.locator('.home-content-list a').filter({ hasText: course.title }).click();
    await expect(visitor).toHaveURL(new URL(detailPath(course), authServer.base).href);
    await expect(visitor.getByText('[예시] 관리자에서 수정한 교육 대상', { exact: true })).toBeVisible();
    for (const value of [program.level, program.delivery, program.completionRequirements]) await expect(visitor.locator('#main-content')).toContainText(value);
    await expect(visitor.getByText(hidden.title, { exact: true })).toHaveCount(0);
    await visitor.reload(); await expect(visitor.getByRole('heading', { level: 2, name: course.title, exact: true })).toBeVisible();
    await fit(visitor); await visitor.screenshot({ path: testInfo.outputPath('P08-curriculum-detail.png'), fullPage: true });
    await visitor.getByRole('link', { name: notice.title, exact: true }).click();
    await expect(visitor).toHaveURL(new URL(`/notices/${notice.id}`, authServer.base).href);
    await visitor.reload(); await expect(visitor.getByRole('link', { name: form.title, exact: true })).toBeVisible();
    await expect(visitor.getByRole('link', { name: course.title, exact: true })).toHaveAttribute('href', detailPath(course));
    await expect(visitor.getByText(hidden.title, { exact: true })).toHaveCount(0);
    await visitor.getByRole('link', { name: form.title, exact: true }).click();
    await expect(visitor).toHaveURL(new URL(detailPath(form), authServer.base).href);
    await visitor.reload(); await expect(visitor.getByText('[예시] 관리자에서 수정한 작성 방법', { exact: true })).toBeVisible();
    for (const value of [resource.audience, resource.requiredDocuments, resource.deadlineText, resource.submissionMethod, resource.destination, resource.contact, '2026']) await expect(visitor.locator('#main-content')).toContainText(value);
    const pending = visitor.waitForEvent('download'); await visitor.getByRole('link', { name: originalName, exact: true }).click();
    const download = await pending; expect(download.suggestedFilename()).toBe(originalName); expect(readFileSync((await download.path())!)).toEqual(bytes);
    await fit(visitor); await visitor.screenshot({ path: testInfo.outputPath('P08-resource-detail.png'), fullPage: true });
    await visitor.goto(detailPath(activity)); await visitor.reload(); await expect(visitor.locator('#main-content')).toContainText('[예시] 산학 협력형');
    await expect(visitor.getByText('등록된 첨부파일이 없습니다.', { exact: true })).toBeVisible(); await fit(visitor);
    for (const catalog of catalogs) {
      await visitor.goto(catalog.path); await expect(visitor.locator('h1')).toHaveText(catalog.heading); await visitor.reload(); await fit(visitor);
    }
    await visitor.goto('/');
    if (testInfo.project.name !== 'desktop') await visitor.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click();
    await visitor.getByRole('button', { name: '교육·참여 프로그램', exact: true }).click();
    await visitor.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '비교과·산학 프로그램', exact: true }).click();
    await expect(visitor.locator('h1')).toHaveText('비교과·산학 프로그램 목록·현황');
    await expect(visitor.getByRole('link', { name: activity.title, exact: true })).toBeVisible();
    if (testInfo.project.name !== 'desktop') await expect(visitor.getByRole('button', { name: '전체 메뉴 열기', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await fit(visitor); expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('three public catalogs preserve search, category, pagination, level or type, and empty results through reload', async ({ page, browser, login, authServer }, testInfo) => {
  test.setTimeout(120_000); await login(); const f = await api(page.request, authServer.base), token = randomBytes(4).toString('hex');
  const records = new Map<string, ContentRecord[]>();
  for (const catalog of catalogs) {
    const entries = [];
    for (let i = 0; i < 12; i++) entries.push(await f.create(catalog.kind, `[예시] ${catalog.kind} ${token} ${String(i).padStart(2, '0')}`, { category: i === 11 ? '분류 둘' : '분류 하나', sortOrder: i, ...(['curriculum', 'activity'].includes(catalog.kind) ? { program: { ...program, level: i === 11 ? '[예시] 심화 유형' : '[예시] 기초 유형' } } : {}) }));
    await f.create(catalog.kind, `[예시] 비공개 분류 ${token}`, { publication: 'private', category: '숨긴 분류' }); records.set(catalog.kind, entries);
  }
  const { context, visitor, errors } = await anonymous(browser, page, authServer.base);
  try {
    for (const catalog of catalogs) {
      const entries = records.get(catalog.kind)!;
      await visitor.goto(catalog.path);
      await expect(visitor.getByRole('link', { name: entries[0].title, exact: true })).toBeVisible();
      await expect(visitor.getByRole('link', { name: entries[10].title, exact: true })).toHaveCount(0);
      await expect(visitor.getByLabel('분류', { exact: true }).locator('option')).not.toContainText(['숨긴 분류']);
      if (catalog.kind !== 'resource') await expect(visitor.getByRole('heading', { name: '[예시] 기초 유형', exact: true })).toBeVisible();
      await visitor.getByRole('button', { name: '다음 페이지', exact: true }).click();
      await expect(visitor).toHaveURL(/page=2/); await visitor.reload();
      await expect(visitor.getByRole('link', { name: entries[11].title, exact: true })).toBeVisible();
      if (catalog.kind !== 'resource') await expect(visitor.getByRole('heading', { name: '[예시] 심화 유형', exact: true })).toBeVisible();
      await visitor.getByLabel('검색어', { exact: true }).fill(token); await visitor.getByLabel('분류', { exact: true }).selectOption('분류 둘'); await visitor.getByRole('button', { name: '검색', exact: true }).click();
      await expect(visitor.getByRole('link', { name: entries[11].title, exact: true })).toBeVisible(); await expect(visitor.getByRole('link', { name: entries[0].title, exact: true })).toHaveCount(0);
      await visitor.reload(); await expect(visitor.getByLabel('분류', { exact: true })).toHaveValue('분류 둘'); await expect(visitor.getByLabel('검색어', { exact: true })).toHaveValue(token);
      await fit(visitor); await visitor.screenshot({ path: testInfo.outputPath(`P08-${catalog.kind}-list.png`), fullPage: true });
      await visitor.getByLabel('검색어', { exact: true }).fill('일치하는 자료가 없는 검색어'); await visitor.getByRole('button', { name: '검색', exact: true }).click();
      await expect(visitor.locator('#main-content')).toContainText('검색 결과가 없습니다');
      await visitor.getByRole('button', { name: '검색 초기화', exact: true }).click(); await expect(visitor.getByRole('link', { name: entries[0].title, exact: true })).toBeVisible();
      await visitor.goto(`${catalog.path}?page=99999`); await expect(visitor.getByRole('link', { name: entries[11].title, exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('private, draft, deleted and wrong-kind details hide titles, relations, main selections and file URLs', async ({ page, browser, login, authServer }) => {
  await login(); const f = await api(page.request, authServer.base), token = randomBytes(4).toString('hex');
  const file = await f.upload(`숨김 서식 ${token}.pdf`, pdfFixture());
  let form = await f.create('resource', `[예시] 공개 후 숨길 서식 ${token}`, { fileLinks: [{ fileId: file.id, role: 'attachment' }] });
  let course = await f.create('curriculum', `[예시] 공개 후 숨길 과정 ${token}`, { relatedIds: [form.id] });
  const activity = await f.create('activity', `[예시] 초안 프로그램 ${token}`, { publication: 'draft' });
  const notice = await f.create('notice', `[예시] 유지 공지 ${token}`, { relatedIds: [course.id, form.id] });
  await f.home({ revision: 0, title: `[예시] 선택 설정 ${token}`, bodyHtml: '<p>선택한 공개 자료만 표시합니다.</p>', publication: 'public' }, [{ section: 'program', contentId: course.id }, { section: 'resource', contentId: form.id }, { section: 'notice', contentId: notice.id }]);
  const { context, visitor } = await anonymous(browser, page, authServer.base);
  try {
    await visitor.goto('/'); await expect(visitor.locator('.home-content-list a').filter({ hasText: course.title })).toBeVisible(); await expect(visitor.locator('.home-content-list a').filter({ hasText: form.title })).toBeVisible();
    form = await f.patch(form, { publication: 'private' });
    await visitor.reload(); await expect(visitor.getByText(form.title, { exact: true })).toHaveCount(0);
    await visitor.goto(detailPath(course)); await expect(visitor.getByRole('heading', { level: 2, name: course.title, exact: true })).toBeVisible(); await expect(visitor.getByText(form.title, { exact: true })).toHaveCount(0);
    course = await f.patch(course, { publication: 'private' });
    for (const record of [course, form, activity]) {
      await visitor.goto(detailPath(record)); await visitor.reload();
      await expect(visitor.getByText(record.title, { exact: true })).toHaveCount(0); await expect(visitor.locator('#main-content')).toContainText('찾을 수 없습니다'); await fit(visitor);
    }
    const blocked = await context.request.get(`/api/files/${file.id}?contentId=${form.id}`, { headers: { 'If-None-Match': '*' } }); expect(blocked.status()).toBe(404); expect(blocked.headers()['cache-control']).toContain('no-store');
    await visitor.goto(`/notices/${notice.id}`); await expect(visitor.getByText(course.title, { exact: true })).toHaveCount(0); await expect(visitor.getByText(form.title, { exact: true })).toHaveCount(0);
    await f.remove(course); await f.remove(form);
    for (const path of [detailPath(course), detailPath(form), `/resources/${notice.id}`, `/programs/curriculum/${activity.slug}`, '/resources/not-an-id', '/programs/activities/not-a-slug', '/programs/curriculum/%22%3Ebad']) {
      await visitor.goto(path); await expect(visitor.locator('#main-content')).toContainText('찾을 수 없습니다'); await expect(visitor.getByText(notice.title, { exact: true })).toHaveCount(0);
    }
    await visitor.goto('/'); await expect(visitor.getByText(course.title, { exact: true })).toHaveCount(0); await expect(visitor.getByText(form.title, { exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test('home saved image and text, explicit selections, private configuration and empty database are represented honestly', async ({ page, browser, login, authServer }, testInfo) => {
  await login(); const f = await api(page.request, authServer.base), token = randomBytes(4).toString('hex');
  const { context, visitor, external, errors } = await anonymous(browser, page, authServer.base);
  try {
    await visitor.goto('/'); await expect(visitor.locator('h1')).toContainText('AI를 더하다'); await expect(visitor.locator('#main-content')).toContainText('입력 대기');
    for (const catalog of catalogs) { await visitor.goto(catalog.path); await expect(visitor.locator('#main-content')).toContainText('입력 대기'); await fit(visitor); }
    const selected = await f.create('curriculum', `[예시] 선택 교육 ${token}`), unselected = await f.create('curriculum', `[예시] 미선택 교육 ${token}`);
    const notice = await f.create('notice', `[예시] 최근 공지 ${token}`), file = await f.upload(`메인 예시 ${token}.png`, pngFixture);
    const title = `[예시] 저장된 메인 ${token}`, text = `[예시] 이미지 없이도 읽는 핵심 소개 ${token}`;
    let home = await f.home({ revision: 0, title, bodyHtml: `<p>${text}</p>`, publication: 'public', fileLinks: [{ fileId: file.id, role: 'home', altText: '[예시] 메인 대체 텍스트' }] }, [{ section: 'program', contentId: selected.id }]);
    await visitor.goto('/'); await expect(visitor.getByRole('heading', { name: title, exact: true })).toBeVisible(); await expect(visitor.getByText(text, { exact: true })).toBeVisible();
    await expect(visitor.getByRole('img', { name: '[예시] 메인 대체 텍스트', exact: true })).toBeVisible();
    await expect(visitor.locator('.home-content-list a').filter({ hasText: selected.title })).toBeVisible(); await expect(visitor.getByText(unselected.title, { exact: true })).toHaveCount(0);
    await expect(visitor.locator('.home-content-list a').filter({ hasText: notice.title })).toBeVisible();
    await visitor.route('**/api/files/**', route => route.abort()); await visitor.reload(); await expect(visitor.getByText(text, { exact: true })).toBeVisible(); await expect(visitor.locator('.home-content-list a').filter({ hasText: selected.title })).toBeVisible();
    await fit(visitor); await visitor.screenshot({ path: testInfo.outputPath('P08-home-image-unavailable.png'), fullPage: true }); await visitor.unroute('**/api/files/**');
    home = await f.home({ revision: home.page.revision, publication: 'private' }, home.items);
    await visitor.reload(); await expect(visitor.getByText(title, { exact: true })).toHaveCount(0); await expect(visitor.getByText(text, { exact: true })).toHaveCount(0); await expect(visitor.getByText(selected.title, { exact: true })).toHaveCount(0);
    await expect(visitor.locator('.home-content-list a').filter({ hasText: notice.title })).toBeVisible(); expect((await context.request.get(`/api/files/${file.id}?contentId=${home.page.id}&inline=1`)).status()).toBe(404);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('home, catalog and detail failures offer retry without confusing network failure with missing content', async ({ page, browser, login, authServer }) => {
  await login(); const f = await api(page.request, authServer.base), token = randomBytes(4).toString('hex');
  const course = await f.create('curriculum', `[예시] 재시도 교육 ${token}`);
  const { context, visitor, errors } = await anonymous(browser, page, authServer.base);
  const failures = [
    { path: '/', api: '**/api/public/home', marker: '내 전공에' },
    { path: '/programs/curriculum', api: '**/api/public/contents?**', marker: course.title },
    { path: detailPath(course), api: '**/api/public/programs/curriculum/*', marker: course.title },
  ];
  try {
    for (const item of failures) {
      await visitor.route(item.api, async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE' } }) }); });
      await visitor.goto(item.path); await expect(visitor.locator('#main-content [role="status"]')).toBeVisible();
      await expect(visitor.locator('#main-content [role="alert"]')).toBeVisible(); await expect(visitor.locator('#main-content')).not.toContainText('찾을 수 없습니다');
      await visitor.unroute(item.api); await visitor.locator('#main-content').getByRole('button', { name: /다시 불러오기/ }).click();
      await expect(visitor.locator('#main-content [role="alert"]')).toHaveCount(0); await expect(visitor.locator('#main-content')).toContainText(item.marker); await fit(visitor);
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
