import { randomBytes } from 'node:crypto';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { test, expect } from './auth.fixture';
import { pdfFixture } from '../helpers/documents';

// These flows log in with isolated, random credentials. Do not retain auth inputs.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const fixedPages = [
  { tab: '사업소개', slug: 'overview', path: '/about/overview', heading: '사업소개', body: '<h2>목적</h2><p>목적 입력 예시</p><h2>교육 분야</h2><p>분야 입력 예시</p><h2>추진내용</h2><p>추진내용 입력 예시</p>' },
  { tab: '조직 및 담당업무', slug: 'organization', path: '/about/organization', heading: '조직 및 담당업무', body: '<h2>조직도</h2><p>조직 입력 예시</p><h2>담당업무</h2><table><tbody><tr><th>담당</th><th>업무</th></tr><tr><td>예시 담당</td><td>예시 업무</td></tr></tbody></table>' },
  { tab: '기업 협력 안내', slug: 'cooperation', path: '/about/cooperation', heading: '기업 협력 안내', body: '<h2>협력 분야</h2><p>분야 입력 예시</p><h2>참여 방식</h2><p>방식 입력 예시</p><h2>문의 절차</h2><p>절차 입력 예시</p>' },
  { tab: '위치 및 문의처', slug: 'location', path: '/about/location', heading: '오시는 길', body: '<h2>방문 안내</h2><p>위치 안내 입력 예시이며 실제 방문 주소가 아닙니다.</p>' },
  { tab: '', slug: 'guide', path: '/programs/guide', heading: '참여 및 신청 안내', body: '<h2>공통 참여 절차</h2><ol><li>공개 안내 확인 예시</li><li>기존 신청 경로 확인 예시</li></ol><h2>제출 유의사항</h2><p>서류 안내 입력 예시</p>' },
] as const;

async function save(page: Page, path: string, method: string, create = false) {
  const ready = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method);
  await page.getByRole('button', { name: create ? '저장' : '수정 저장', exact: true }).click();
  const response = await ready;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(page.getByText('콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  return (await response.json()).data;
}

async function api(request: APIRequestContext, origin: string) {
  const response = await request.get('/api/auth/session');
  expect(response.status()).toBe(200);
  return { Origin: origin, 'X-CSRF-Token': (await response.json()).data.csrfToken as string };
}

async function create(request: APIRequestContext, headers: Record<string, string>, kind: string, title: string, more: Record<string, unknown> = {}) {
  const response = await request.post('/api/admin/contents', { headers, data: { kind, title, bodyHtml: '<p>격리된 검증 예시입니다.</p>', publication: 'public', ...more } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data;
}

async function anonymous(browser: Browser, page: Page, baseURL: string) {
  const context = await browser.newContext({ baseURL, viewport: page.viewportSize() });
  const external: string[] = [];
  const errors: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      external.push(url.href); await route.abort();
    } else await route.continue();
  });
  const visitor = await context.newPage();
  visitor.on('pageerror', error => errors.push(error.message));
  return { context, visitor, external, errors };
}

async function fit(page: Page) {
  // Read both rectangles in one browser turn: a navigation effect can close the
  // mobile menu between two separate boundingBox() calls and mix two layouts.
  const bounds = await page.evaluate(() => {
    const header = document.querySelector('.public-header')!.getBoundingClientRect();
    const main = document.querySelector('#main-content')!.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, gap: main.top - header.bottom };
  });
  expect(bounds.overflow).toBeLessThanOrEqual(1);
  expect(bounds.gap).toBeGreaterThanOrEqual(0);
}

async function selectRelated(page: Page, title: string) {
  const area = page.getByRole('group', { name: '관련 콘텐츠', exact: true });
  await area.getByLabel('관련 콘텐츠 검색어', { exact: true }).fill(title);
  await area.getByRole('button', { name: '관련 콘텐츠 검색', exact: true }).click();
  await area.getByRole('button', { name: `${title} 선택`, exact: true }).click();
}

async function openEditor(page: Page, entry: typeof fixedPages[number]) {
  await page.goto(entry.slug === 'guide' ? '/admin/guide' : '/admin/about');
  if (entry.tab) await page.getByRole('button', { name: entry.tab, exact: true }).click();
  await expect(page.getByLabel('본문 HTML', { exact: true })).toBeEnabled();
}

test('administrator edits all five fixed guides and anonymous pages reflect saved content, related IDs, contacts and local navigation', async ({ page, browser, login, authServer }, testInfo) => {
  test.setTimeout(150_000);
  await login('/admin/about');
  const token = randomBytes(4).toString('hex'), headers = await api(page.request, authServer.base);
  const notice = await create(page.request, headers, 'notice', `[예시] 안내와 연결한 공지 ${token}`);
  const hidden = await create(page.request, headers, 'notice', `[예시] 숨긴 관련 공지 ${token}`, { publication: 'private' });
  const resource = await create(page.request, headers, 'resource', `[예시] 참여 제출 서식 ${token}`, { resource: { audience: '예시 대상', requiredDocuments: '', instructions: '', deadlineText: '', submissionMethod: '', destination: '', contact: '', applicableYear: null } });
  const { context, visitor, external, errors } = await anonymous(browser, page, authServer.base);
  try {
    for (const entry of fixedPages) {
      const title = `[예시] ${entry.heading} ${token}`, marker = `[예시] ${entry.slug} 실제 저장 ${token}`;
      await openEditor(page, entry);
      await page.getByLabel('제목', { exact: true }).fill(title);
      await page.getByLabel('본문 HTML', { exact: true }).fill(`${entry.body}<p>${marker}</p><script>window.__p07unsafe=true</script>`);
      await page.getByLabel('공개 여부', { exact: true }).selectOption('public');
      await page.getByLabel('담당 부서·담당자', { exact: true }).fill(`[예시] ${entry.slug} 문의 ${token}`);
      if (entry.slug === 'location') {
        await page.getByLabel('주소', { exact: true }).fill(`[예시] 공식 주소 입력 대기 ${token}`);
        await page.getByLabel('이메일', { exact: true }).fill(`p07-${token}@example.com`);
      }
      if (entry.slug === 'guide') {
        await selectRelated(page, notice.title); await selectRelated(page, resource.title); await selectRelated(page, hidden.title);
        await page.getByRole('button', { name: '외부 링크 추가', exact: true }).click();
        await page.getByLabel('링크 이름 1', { exact: true }).fill('기존 신청 경로 예시');
        await page.getByLabel('외부 링크 주소 1', { exact: true }).fill('https://example.com/apply');
      }
      await save(page, `/api/admin/pages/${entry.slug}`, 'PUT', true);
      await visitor.goto(entry.path);
      await expect(visitor.locator('h1')).toHaveText(entry.heading);
      await expect(visitor.locator('#main-content')).toContainText(title);
      await expect(visitor.getByText(marker, { exact: true })).toBeVisible();
      await expect(visitor.locator('#main-content')).toContainText(`[예시] ${entry.slug} 문의 ${token}`);
      expect(await visitor.evaluate(() => '__p07unsafe' in window)).toBe(false);
      await expect(visitor.locator('#main-content script, iframe')).toHaveCount(0);
      await expect(visitor.getByRole('navigation', { name: '현재 위치' })).toContainText(entry.heading);
      await fit(visitor);
      await page.getByLabel('본문 HTML', { exact: true }).fill(`${entry.body}<p>${marker} 수정 반영</p>`);
      await save(page, `/api/admin/pages/${entry.slug}`, 'PUT');
      await visitor.reload(); await expect(visitor.getByText(`${marker} 수정 반영`, { exact: true })).toBeVisible();
      if (entry.slug === 'organization') await visitor.screenshot({ path: testInfo.outputPath('P07-public-organization.png'), fullPage: true });
      if (entry.slug === 'guide') {
        await expect(visitor.getByRole('link', { name: notice.title, exact: true })).toHaveAttribute('href', `/notices/${notice.id}`);
        await expect(visitor.locator('#main-content')).toContainText(resource.title);
        await expect(visitor.getByText(hidden.title, { exact: true })).toHaveCount(0);
        const applicationLink = visitor.getByRole('link', { name: '기존 신청 경로 예시 (외부 사이트, 새 창)', exact: true });
        await expect(applicationLink).toHaveAttribute('href', 'https://example.com/apply');
        await expect(applicationLink).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(visitor.locator('#main-content form, #main-content input, #main-content textarea')).toHaveCount(0);
        await visitor.getByRole('link', { name: notice.title, exact: true }).click();
        await expect(visitor.locator('#main-content')).toContainText(notice.title);
        await visitor.goBack(); await expect(visitor.getByText(`${marker} 수정 반영`, { exact: true })).toBeVisible();
      }
    }
    for (const entry of fixedPages) {
      await visitor.goto(entry.path);
      await expect(visitor.locator('.public-footer')).toContainText(`[예시] location 문의 ${token}`);
      await expect(visitor.locator('.public-footer')).toContainText(`p07-${token}@example.com`);
      await expect(visitor.locator('.public-footer')).toContainText(`[예시] 공식 주소 입력 대기 ${token}`);
    }
    await visitor.goto('/faq');
    await expect(visitor.locator('.public-footer')).toContainText(`p07-${token}@example.com`);
    await visitor.goto('/about/overview');
    for (const entry of fixedPages.filter(item => item.slug !== 'guide')) {
      await visitor.getByRole('navigation', { name: '사업단 소개 하위 메뉴' }).getByRole('link', { name: entry.heading, exact: true }).click();
      await expect(visitor).toHaveURL(new URL(entry.path, authServer.base).href);
      await expect(visitor.locator('#main-content')).toContainText(`[예시] ${entry.heading} ${token}`);
    }
    if (testInfo.project.name !== 'desktop') await visitor.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click();
    await visitor.getByRole('button', { name: '교육·참여 프로그램', exact: true }).click();
    await visitor.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '참여 및 신청 안내', exact: true }).click();
    await expect(visitor).toHaveURL(/\/programs\/guide$/);
    if (testInfo.project.name !== 'desktop') await expect(visitor.getByRole('button', { name: '전체 메뉴 열기', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(visitor.locator('#main-content')).toContainText(`[예시] 참여 및 신청 안내 ${token}`);
    await fit(visitor);
    await visitor.locator('h1').click();
    await visitor.screenshot({ path: testInfo.outputPath('P07-public-guide.png'), fullPage: true });
    await visitor.goto('/about/location');
    await expect(visitor.locator('#main-content')).toContainText('실제 방문 주소가 아닙니다.');
    await visitor.screenshot({ path: testInfo.outputPath('P07-public-location.png'), fullPage: true });
    expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('private, draft, deleted and unregistered guides stay empty for visitors and never expose body, attachment or footer contacts', async ({ page, browser, login, authServer }) => {
  await login('/admin/guide');
  const token = randomBytes(4).toString('hex'), headers = await api(page.request, authServer.base);
  const upload = await page.request.post('/api/admin/files', { headers, multipart: { file: { name: `공개 안내 시험 ${token}.pdf`, mimeType: 'application/octet-stream', buffer: pdfFixture() } } });
  expect(upload.status()).toBe(201); const file = (await upload.json()).data;
  await page.getByLabel('제목', { exact: true }).fill(`[예시] 공개 후 숨김 ${token}`);
  await page.getByLabel('본문 HTML', { exact: true }).fill(`<p>[예시] 숨길 본문 ${token}</p>`);
  await page.getByLabel('공개 여부', { exact: true }).selectOption('public');
  let saved = await save(page, '/api/admin/pages/guide', 'PUT', true);
  const linked = await page.request.put('/api/admin/pages/guide', { headers, data: { revision: saved.revision, fileLinks: [{ fileId: file.id, role: 'attachment' }] } });
  expect(linked.status()).toBe(200); saved = (await linked.json()).data;
  const location = await page.request.put('/api/admin/pages/location', { headers, data: { revision: 0, title: `[예시] 숨길 위치 ${token}`, bodyHtml: `<p>숨길 위치 본문 ${token}</p>`, publication: 'public', contact: { name: `숨길 부서 ${token}`, phone: '', email: `hidden-${token}@example.com`, address: `숨길 주소 ${token}`, note: '' } } });
  expect(location.status()).toBe(200); const locationRecord = (await location.json()).data;
  const { context, visitor } = await anonymous(browser, page, authServer.base);
  try {
    await visitor.goto('/programs/guide');
    await expect(visitor.getByText(`[예시] 숨길 본문 ${token}`, { exact: true })).toBeVisible();
    await expect(visitor.getByRole('link', { name: `공개 안내 시험 ${token}.pdf`, exact: true })).toBeVisible();
    await expect(visitor.locator('.public-footer')).toContainText(`hidden-${token}@example.com`);
    expect((await context.request.get(`/api/files/${file.id}?contentId=${saved.id}`)).status()).toBe(200);
    await page.reload(); await page.getByLabel('공개 여부', { exact: true }).selectOption('private');
    saved = await save(page, '/api/admin/pages/guide', 'PUT');
    const hideLocation = await page.request.put('/api/admin/pages/location', { headers, data: { revision: locationRecord.revision, publication: 'private' } });
    expect(hideLocation.status()).toBe(200);
    await visitor.locator('.public-footer').getByRole('link', { name: '오시는 길', exact: true }).click();
    await expect(visitor.locator('#main-content .empty-state')).toBeVisible();
    await expect(visitor.locator('.public-footer')).not.toContainText(token);
    const organization = await page.request.put('/api/admin/pages/organization', { headers, data: { revision: 0, title: `[예시] 초안 조직 ${token}`, bodyHtml: `<p>초안 본문 ${token}</p>`, publication: 'draft' } });
    expect(organization.status()).toBe(200);
    for (const entry of fixedPages) {
      const response = await context.request.get(`/api/public/pages/${entry.slug}`); expect(response.status()).toBe(404);
      await visitor.goto(entry.path); await visitor.reload();
      await expect(visitor.locator('h1')).toHaveText(entry.heading);
      await expect(visitor.locator('#main-content .empty-state')).toBeVisible();
      await expect(visitor.locator('body')).not.toContainText(token);
      await expect(visitor.locator('.public-footer')).toContainText('입력 대기');
      await expect(visitor.locator('#main-content a[href*="/api/files/"]')).toHaveCount(0);
      await fit(visitor);
    }
    const blocked = await context.request.get(`/api/files/${file.id}?contentId=${saved.id}`);
    expect(blocked.status()).toBe(404); expect(blocked.headers()['cache-control']).toContain('no-store');
    await page.goto('/programs/guide');
    await expect(page.locator('#main-content .empty-state')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(token);
    const deleted = await page.request.delete(`/api/admin/contents/${saved.id}`, { headers, data: { revision: saved.revision } });
    expect(deleted.status()).toBe(204);
    await visitor.goto('/programs/guide'); await expect(visitor.locator('#main-content .empty-state')).toBeVisible();
  } finally { await context.close(); }
});

test('FAQ uses persisted administrator questions and order, keyboard-accessible answers and public related links without leaking private records', async ({ page, browser, login, authServer }, testInfo) => {
  test.setTimeout(120_000);
  await login('/admin/faq');
  const token = randomBytes(4).toString('hex'), headers = await api(page.request, authServer.base);
  const notice = await create(page.request, headers, 'notice', `[예시] FAQ 관련 공지 ${token}`);
  const privateNotice = await create(page.request, headers, 'notice', `[예시] FAQ 비공개 연결 ${token}`, { publication: 'private' });
  await create(page.request, headers, 'faq', `[예시] 비공개 질문 ${token}`, { publication: 'private', sortOrder: 0 });
  await create(page.request, headers, 'faq', `[예시] 초안 질문 ${token}`, { publication: 'draft', sortOrder: 0 });
  const records = [];
  for (const order of [20, 10]) {
    await page.goto('/admin/faq/new');
    await page.getByLabel('질문', { exact: true }).fill(`[예시] 질문 ${order} ${token}`);
    await page.getByLabel('본문 HTML', { exact: true }).fill(`<h3>답변 안내</h3><p>[예시] 답변 ${order} ${token}</p><ul><li>관련 공지 확인 예시</li></ul><script>window.__faqUnsafe=true</script><a href="javascript:alert(1)">잘못된 링크 예시</a>`);
    await page.getByLabel('표시 순서', { exact: true }).fill(String(order));
    await page.getByLabel('공개 여부', { exact: true }).selectOption('public');
    await selectRelated(page, notice.title); await selectRelated(page, privateNotice.title);
    records.push(await save(page, '/api/admin/contents', 'POST', true));
  }
  const { context, visitor, external, errors } = await anonymous(browser, page, authServer.base);
  try {
    await visitor.goto('/faq'); await visitor.reload();
    await expect(visitor.locator('h1')).toHaveText('자주 묻는 질문');
    await expect(visitor.locator('#main-content summary')).toHaveCount(2);
    const summaries = visitor.locator('#main-content summary');
    await expect(summaries.nth(0)).toContainText(`[예시] 질문 10 ${token}`);
    await expect(summaries.nth(1)).toContainText(`[예시] 질문 20 ${token}`);
    await expect(visitor.getByText(`[예시] 비공개 질문 ${token}`, { exact: true })).toHaveCount(0);
    await expect(visitor.getByText(`[예시] 초안 질문 ${token}`, { exact: true })).toHaveCount(0);
    const answer = visitor.getByText(`[예시] 답변 10 ${token}`, { exact: true });
    await expect(answer).not.toBeVisible();
    await summaries.first().focus(); await visitor.keyboard.press('Enter'); await expect(answer).toBeVisible();
    await visitor.keyboard.press('Space'); await expect(answer).not.toBeVisible();
    await visitor.keyboard.press('Enter'); await expect(answer).toBeVisible();
    await expect(visitor.getByRole('link', { name: notice.title, exact: true })).toBeVisible();
    await expect(visitor.getByText(privateNotice.title, { exact: true })).toHaveCount(0);
    await expect(visitor.locator('#main-content a[href^="javascript:"], #main-content script')).toHaveCount(0);
    expect(await visitor.evaluate(() => '__faqUnsafe' in window)).toBe(false);
    await fit(visitor); await visitor.locator('h1').click();
    await visitor.screenshot({ path: testInfo.outputPath('P07-public-faq.png'), fullPage: true });
    await visitor.getByRole('link', { name: notice.title, exact: true }).click();
    await expect(visitor).toHaveURL(new RegExp(`/notices/${notice.id}$`));
    await visitor.getByRole('navigation', { name: '공지·자료실 하위 메뉴' }).getByRole('link', { name: '자주 묻는 질문', exact: true }).click();
    await expect(visitor).toHaveURL(/\/faq$/);
    const firstSummary = visitor.locator('#main-content summary').first();
    await firstSummary.click(); await expect(answer).toBeVisible();
    await firstSummary.click(); await expect(answer).not.toBeVisible();
    const firstHidden = await page.request.patch(`/api/admin/contents/${records[1].id}`, { headers, data: { revision: records[1].revision, publication: 'private' } });
    expect(firstHidden.status()).toBe(200);
    await firstSummary.click();
    await expect(firstSummary).not.toContainText(records[1].title);
    await expect(answer).toHaveCount(0);
    const secondHidden = await page.request.patch(`/api/admin/contents/${records[0].id}`, { headers, data: { revision: records[0].revision, publication: 'private' } });
    expect(secondHidden.status()).toBe(200);
    await visitor.reload(); await expect(visitor.locator('#main-content .empty-state')).toBeVisible();
    await expect(visitor.locator('#main-content summary')).toHaveCount(0);
    await expect(visitor.locator('#main-content')).not.toContainText(token);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('guide and FAQ query failures show loading and recover through a working retry without fabricated content', async ({ page, browser, login, authServer }) => {
  await login('/admin');
  const token = randomBytes(4).toString('hex'), headers = await api(page.request, authServer.base);
  const fixed = await page.request.put('/api/admin/pages/overview', { headers, data: { revision: 0, title: `[예시] 재시도 안내 ${token}`, bodyHtml: `<p>[예시] 재시도 본문 ${token}</p>`, publication: 'public' } });
  expect(fixed.status()).toBe(200);
  const faq = await create(page.request, headers, 'faq', `[예시] 재시도 질문 ${token}`, { bodyHtml: `<p>[예시] 재시도 답변 ${token}</p>` });
  const { context, visitor } = await anonymous(browser, page, authServer.base);
  try {
    for (const [path, apiPath, expected] of [
      ['/about/overview', '**/api/public/pages/overview', `[예시] 재시도 본문 ${token}`],
      ['/faq', '**/api/public/contents?**', `[예시] 재시도 질문 ${token}`],
    ] as const) {
      await visitor.route(apiPath, async route => {
        await new Promise(resolve => setTimeout(resolve, 400));
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"TEST_UNAVAILABLE"}}' });
      });
      await visitor.goto(path); await expect(visitor.locator('#main-content').getByRole('status')).toBeVisible();
      await expect(visitor.locator('#main-content').getByRole('alert')).toBeVisible();
      await expect(visitor.getByText(expected, { exact: true })).toHaveCount(0);
      await visitor.unroute(apiPath);
      await visitor.locator('#main-content').getByRole('button', { name: /다시/ }).click();
      await expect(visitor.getByText(expected, { exact: true })).toBeVisible();
    }
    await visitor.route(`**/api/public/contents/${faq.id}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"TEST_UNAVAILABLE"}}' }));
    await visitor.locator('#main-content summary').click();
    await expect(visitor.locator('#main-content').getByRole('alert')).toBeVisible();
    await visitor.unroute(`**/api/public/contents/${faq.id}`);
    await visitor.locator('#main-content').getByRole('button', { name: /다시/ }).click();
    await expect(visitor.getByText(`[예시] 재시도 답변 ${token}`, { exact: true })).toBeVisible();
    await fit(visitor);
  } finally { await context.close(); }
});

test('FAQ pagination, search and direct question URLs reach records beyond the first page and reject non-public or non-FAQ IDs', async ({ page, browser, login, authServer }) => {
  await login('/admin');
  const token = randomBytes(4).toString('hex'), headers = await api(page.request, authServer.base);
  const records = [];
  for (let index = 1; index <= 12; index++) {
    records.push(await create(page.request, headers, 'faq', `[예시] 목록 질문 ${String(index).padStart(2, '0')} ${token}`, { bodyHtml: `<p>[예시] 목록 답변 ${index} ${token}</p>`, sortOrder: index }));
  }
  const hidden = await create(page.request, headers, 'faq', `[예시] 직접 주소 비공개 ${token}`, { publication: 'private', sortOrder: 0 });
  const notice = await create(page.request, headers, 'notice', `[예시] FAQ가 아닌 공지 ${token}`);
  const { context, visitor } = await anonymous(browser, page, authServer.base);
  try {
    await visitor.goto('/faq');
    await expect(visitor.locator('#main-content summary')).toHaveCount(10);
    await expect(visitor.locator('#main-content summary').first()).toContainText(records[0].title);
    await visitor.getByRole('button', { name: '다음 페이지', exact: true }).click();
    await expect(visitor.locator('#main-content summary')).toHaveCount(2);
    await expect(visitor.locator('#main-content summary').first()).toContainText(records[10].title);
    await visitor.reload(); await expect(visitor.locator('#main-content summary')).toHaveCount(2);
    await visitor.getByRole('button', { name: '이전 페이지', exact: true }).click();
    await expect(visitor.locator('#main-content summary')).toHaveCount(10);
    await visitor.getByLabel('질문 검색어', { exact: true }).fill(records[11].title);
    await visitor.getByRole('button', { name: '검색', exact: true }).click();
    await expect(visitor.locator('#main-content summary')).toHaveCount(1);
    await expect(visitor.locator('#main-content summary')).toContainText(records[11].title);
    await visitor.locator('#main-content summary').click();
    await expect(visitor.getByText(`[예시] 목록 답변 12 ${token}`, { exact: true })).toBeVisible();
    await visitor.getByLabel('질문 검색어', { exact: true }).fill(`없는 질문 ${token}`);
    await visitor.getByRole('button', { name: '검색', exact: true }).click();
    await expect(visitor.locator('#main-content .empty-state')).toBeVisible();
    await expect(visitor.locator('#main-content summary')).toHaveCount(0);
    await visitor.goto(`/faq?item=${records[11].id}`);
    await expect(visitor.getByText(`[예시] 목록 답변 12 ${token}`, { exact: true })).toBeVisible();
    await visitor.reload(); await expect(visitor.getByText(`[예시] 목록 답변 12 ${token}`, { exact: true })).toBeVisible();
    for (const id of [hidden.id, notice.id, 'not-a-question']) {
      await visitor.goto(`/faq?item=${id}`);
      await expect(visitor.locator('#main-content .empty-state')).toBeVisible();
      await expect(visitor.locator('#main-content')).not.toContainText(token);
      await expect(visitor.locator('#main-content summary')).toHaveCount(0);
    }
    await fit(visitor);
  } finally { await context.close(); }
});
