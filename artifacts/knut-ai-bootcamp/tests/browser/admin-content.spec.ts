import { randomBytes } from 'node:crypto';
import { test, expect } from './auth.fixture';
import { pdfFixture, pngFixture } from '../helpers/documents';
import type { Page } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}
async function save(page: Page, path: string, method: string, create = false) {
  const ready = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method);
  await page.getByRole('button', { name: create ? '저장' : '수정 저장', exact: true }).click();
  const response = await ready;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(page.getByText('콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  return (await response.json()).data;
}
async function selectContent(page: Page, group: string, title: string) {
  const area = page.getByRole('group', { name: group, exact: true });
  await area.getByLabel(`${group} 검색어`, { exact: true }).fill(title);
  await area.getByRole('button', { name: `${group} 검색`, exact: true }).click();
  await area.getByRole('button', { name: `${title} 선택`, exact: true }).click();
}

test('program, activity, resource and FAQ editors save/reopen typed fields, related IDs, files and visibility with cancel and deletion confirmation', async ({ page, login, authServer }, testInfo) => {
  test.setTimeout(120_000);
  await login('/admin/programs');
  const session = (await (await page.request.get('/api/auth/session')).json()).data;
  const headers = { Origin: authServer.base, 'X-CSRF-Token': session.csrfToken };
  const token = randomBytes(4).toString('hex'), relatedTitle = `[예시] 관련 공지 ${token}`;
  const notice = await page.request.post('/api/admin/contents', { headers, data: { kind: 'notice', title: relatedTitle, bodyHtml: '<p>관련 안내</p>', publication: 'public' } });
  expect(notice.status()).toBe(201); const related = (await notice.json()).data;
  for (const [kind, listPath, titleLabel] of [['curriculum', '/admin/programs', '제목'], ['activity', '/admin/programs', '제목'], ['resource', '/admin/resources', '제목'], ['faq', '/admin/faq', '질문']] as const) {
    const title = `[예시] ${kind} ${token}`;
    await page.goto(`${listPath}/new`);
    await page.getByLabel(titleLabel, { exact: true }).fill(title);
    if (kind === 'curriculum' || kind === 'activity') {
      await page.getByLabel('종류', { exact: true }).selectOption(kind);
      await page.getByLabel('수준 또는 유형', { exact: true }).fill('기초 안내 예시');
      await page.getByLabel('교육 대상', { exact: true }).fill('대상 입력 예시');
      await page.getByLabel('운영 방식', { exact: true }).fill('방식 입력 예시');
      await page.getByLabel('이수요건', { exact: true }).fill('요건 입력 예시');
    }
    if (kind === 'resource') {
      for (const label of ['적용 대상', '제출서류 목록', '작성 안내', '제출 기한 안내', '제출 방법', '제출처', '서식 문의처']) await page.getByLabel(label, { exact: true }).fill(`[예시] ${label}`);
      await page.getByLabel('적용 연도', { exact: true }).fill('2026');
      const uploadReady = page.waitForResponse(response => response.url().endsWith('/api/admin/files') && response.request().method() === 'POST');
      await page.getByLabel('첨부파일 선택', { exact: true }).setInputFiles({ name: `서식 원본 ${token}.pdf`, mimeType: 'application/octet-stream', buffer: pdfFixture() });
      expect((await uploadReady).status()).toBe(201);
    }
    await page.getByLabel('본문 HTML', { exact: true }).fill('<p>실제 저장 시험 <strong>안내</strong></p><script>window.__unsafe = true</script>');
    await page.getByLabel('분류', { exact: true }).fill('검증 예시');
    await page.getByLabel('표시 순서', { exact: true }).fill('9');
    await selectContent(page, '관련 콘텐츠', relatedTitle);
    await page.getByRole('button', { name: '외부 링크 추가', exact: true }).click();
    await page.getByLabel('링크 이름 1', { exact: true }).fill('외부 안내 예시');
    await page.getByLabel('외부 링크 주소 1', { exact: true }).fill('https://example.com/info');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    const preview = page.getByRole('region', { name: '콘텐츠 미리보기', exact: true });
    await expect(preview.locator('strong')).toHaveText('안내'); await expect(preview.locator('script')).toHaveCount(0);
    const created = await save(page, '/api/admin/contents', 'POST', true);
    expect(created.kind).toBe(kind); expect(created.relatedContents[0].id).toBe(related.id); expect(created.publication).toBe('draft');
    await expect(page).toHaveURL(new RegExp(`${listPath}/${created.id}/edit$`));
    await page.reload(); await expect(page.getByLabel(titleLabel, { exact: true })).toHaveValue(title);
    await expect(page.getByLabel('표시 순서', { exact: true })).toHaveValue('9');
    await expect(page.getByLabel('외부 링크 주소 1', { exact: true })).toHaveValue('https://example.com/info');
    await expect(page.getByRole('group', { name: '관련 콘텐츠', exact: true }).getByRole('button', { name: `${relatedTitle} 선택 해제`, exact: true })).toBeVisible();
    if (kind === 'resource') {
      await expect(page.getByLabel('적용 연도', { exact: true })).toHaveValue('2026');
      await expect(page.getByRole('link', { name: `서식 원본 ${token}.pdf`, exact: true })).toBeVisible();
      const response = await page.request.get(`/api/files/${created.files[0].id}?contentId=${created.id}`); expect(response.status()).toBe(200); expect(await response.body()).toEqual(pdfFixture());
    }
    if (kind === 'curriculum' || kind === 'activity') await expect(page.getByLabel('이수요건', { exact: true })).toHaveValue('요건 입력 예시');
    await page.getByLabel(titleLabel, { exact: true }).fill('취소할 수정');
    page.once('dialog', dialog => { void dialog.accept(); });
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.getByLabel(titleLabel, { exact: true })).toHaveValue(title);
    await page.getByLabel('공개 여부', { exact: true }).selectOption('public');
    const updated = await save(page, `/api/admin/contents/${created.id}`, 'PATCH');
    expect(updated.revision).toBe(2); expect(updated.publication).toBe('public');
    if (kind === 'resource') {
      const chooserReady = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: `서식 원본 ${token}.pdf 교체`, exact: true }).click();
      const chooser = await chooserReady;
      const replaced = page.waitForResponse(response => response.url().endsWith('/api/admin/files') && response.request().method() === 'POST');
      await chooser.setFiles({ name: `서식 교체 ${token}.pdf`, mimeType: 'application/pdf', buffer: pdfFixture('P06 resource replacement') });
      expect((await replaced).status()).toBe(201); await save(page, `/api/admin/contents/${created.id}`, 'PATCH');
      await page.reload(); await expect(page.getByRole('link', { name: `서식 교체 ${token}.pdf`, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: `서식 원본 ${token}.pdf`, exact: true })).toHaveCount(0);
    }
    await fit(page);
    if (kind === 'resource') { await page.locator('h1').click(); await page.screenshot({ path: testInfo.outputPath('P06-resource-editor.png'), fullPage: true }); }
    await page.goto(listPath);
    if (kind === 'activity') await page.getByLabel('종류', { exact: true }).selectOption('activity');
    await page.getByLabel('검색어', { exact: true }).fill(title); await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `${title} 삭제`, exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toContainText(title);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `${title} 삭제`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제 확인', exact: true }).click();
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
    expect((await page.request.get(`/api/admin/contents/${created.id}`)).status()).toBe(404);
  }
});

test('four about pages, participation guide and home image/ID selections persist without preview publishing or duplicated bodies', async ({ page, browser, login, authServer }, testInfo) => {
  test.setTimeout(120_000);
  await login('/admin/about');
  const token = randomBytes(4).toString('hex');
  for (const [tab, slug] of [['사업소개', 'overview'], ['조직 및 담당업무', 'organization'], ['기업 협력 안내', 'cooperation'], ['위치 및 문의처', 'location']] as const) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.getByLabel('제목', { exact: true }).fill(`[예시] ${tab} ${token}`);
    await page.getByLabel('본문 HTML', { exact: true }).fill(`<p>${tab} 안내 입력 예시</p>`);
    if (slug === 'location') {
      await page.getByLabel('담당 부서·담당자', { exact: true }).fill('문의 담당 입력 대기');
      await page.getByLabel('주소', { exact: true }).fill('위치 입력 대기');
    }
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(page.getByRole('region', { name: '콘텐츠 미리보기', exact: true })).toContainText(`${tab} 안내 입력 예시`);
    await save(page, `/api/admin/pages/${slug}`, 'PUT', true);
    await page.reload(); await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByLabel('제목', { exact: true })).toHaveValue(`[예시] ${tab} ${token}`);
    await fit(page);
  }
  await page.goto('/admin/guide');
  await page.getByLabel('제목', { exact: true }).fill(`[예시] 참여 안내 ${token}`);
  await page.getByLabel('본문 HTML', { exact: true }).fill('<h2>참여 절차</h2><ol><li>안내 확인</li></ol><h2>제출 유의사항</h2><p>입력 예시</p>');
  await page.getByRole('button', { name: '외부 링크 추가', exact: true }).click();
  await page.getByLabel('링크 이름 1', { exact: true }).fill('신청 경로 예시'); await page.getByLabel('외부 링크 주소 1', { exact: true }).fill('https://example.com/apply');
  await save(page, '/api/admin/pages/guide', 'PUT', true);
  await page.reload(); await expect(page.getByLabel('외부 링크 주소 1', { exact: true })).toHaveValue('https://example.com/apply');
  const session = (await (await page.request.get('/api/auth/session')).json()).data, headers = { Origin: authServer.base, 'X-CSRF-Token': session.csrfToken };
  const noticeTitle = `[예시] 메인 노출 공지 ${token}`;
  const created = await page.request.post('/api/admin/contents', { headers, data: { kind: 'notice', title: noticeTitle, bodyHtml: '<p>원본 공지 본문</p>', publication: 'public' } });
  expect(created.status()).toBe(201); const notice = (await created.json()).data;
  await page.goto('/admin/home');
  await page.getByLabel('메인 제목', { exact: true }).fill(`[예시] 메인 소개 ${token}`);
  await page.getByLabel('본문 HTML', { exact: true }).fill('<p>메인 소개와 주요 안내 예시</p>');
  await selectContent(page, '공지 노출', noticeTitle);
  const uploaded = page.waitForResponse(response => response.url().endsWith('/api/admin/files') && response.request().method() === 'POST');
  await page.getByLabel('메인 이미지 선택', { exact: true }).setInputFiles({ name: `메인 이미지 ${token}.png`, mimeType: 'image/png', buffer: pngFixture });
  expect((await uploaded).status()).toBe(201);
  await page.getByLabel('메인 이미지 설명', { exact: true }).fill('시험 메인 이미지');
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(page.getByRole('region', { name: '콘텐츠 미리보기', exact: true })).toContainText('메인 소개와 주요 안내 예시');
  const saved = await save(page, '/api/admin/home', 'PUT', true);
  expect(saved.items).toEqual([{ section: 'notice', contentId: notice.id }]); expect(saved.page.bodyHtml).not.toContain('원본 공지 본문');
  const anonymous = await browser.newContext({ baseURL: authServer.base });
  try {
    expect((await anonymous.request.get(`/api/files/${saved.page.files[0].id}?contentId=${saved.page.id}&inline=1`)).status()).toBe(404);
    await page.reload(); await expect(page.getByLabel('메인 제목', { exact: true })).toHaveValue(`[예시] 메인 소개 ${token}`);
    await expect(page.getByLabel('메인 이미지 설명', { exact: true })).toHaveValue('시험 메인 이미지');
    await expect(page.getByRole('group', { name: '공지 노출', exact: true }).getByRole('button', { name: `${noticeTitle} 선택 해제`, exact: true })).toBeVisible();
    await page.getByLabel('공개 여부', { exact: true }).selectOption('public'); await save(page, '/api/admin/home', 'PUT');
    const home = (await (await anonymous.request.get('/api/public/home')).json()).data;
    expect(home.page.title).toBe(`[예시] 메인 소개 ${token}`); expect(home.sections.notice[0].id).toBe(notice.id);
    expect((await anonymous.request.get(`/api/files/${saved.page.files[0].id}?contentId=${saved.page.id}&inline=1`)).status()).toBe(200);
    await fit(page); await page.locator('h1').click(); await page.screenshot({ path: testInfo.outputPath('P06-home-editor.png'), fullPage: true });
  } finally { await anonymous.close(); }
});

test('save failures keep pending edits, first-save double click creates one record, and stale updates show a recoverable failure', async ({ page, login, authServer }) => {
  await login('/admin/faq/new');
  const title = `[예시] 중복 저장 방지 ${randomBytes(4).toString('hex')}`;
  await page.getByLabel('질문', { exact: true }).fill(title); await page.getByLabel('본문 HTML', { exact: true }).fill('<p>저장 시험 답변</p>');
  await page.route('**/api/admin/contents', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_UNAVAILABLE', message: '시험 저장 실패' } }) }); else await route.continue();
  });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('질문', { exact: true })).toHaveValue(title);
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled();
  await page.unroute('**/api/admin/contents');
  let posts = 0;
  await page.route('**/api/admin/contents', async route => {
    if (route.request().method() === 'POST') { posts++; await new Promise(resolve => setTimeout(resolve, 250)); }
    await route.continue();
  });
  const ready = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/contents' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '저장', exact: true }).dblclick();
  const created = await ready; expect(created.status()).toBe(201); const record = (await created.json()).data;
  await expect(page).toHaveURL(new RegExp(`/admin/faq/${record.id}/edit$`)); expect(posts).toBe(1);
  await page.reload(); await expect(page.getByLabel('질문', { exact: true })).toHaveValue(title);
  const session = (await (await page.request.get('/api/auth/session')).json()).data;
  const changed = await page.request.patch(`/api/admin/contents/${record.id}`, { headers: { Origin: authServer.base, 'X-CSRF-Token': session.csrfToken }, data: { revision: 1, title: title + ' 다른 창' } }); expect(changed.status()).toBe(200);
  await page.getByLabel('질문', { exact: true }).fill(title + ' 현재 창');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('질문', { exact: true })).toHaveValue(title + ' 현재 창');
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.reload(); await expect(page.getByLabel('질문', { exact: true })).toHaveValue(title + ' 다른 창');
});
