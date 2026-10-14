import { readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { ContentRecord } from '../../src/shared/content';
import { test, expect } from './auth.fixture';
import { pdfFixture } from '../helpers/documents';

// These scenarios contain a temporary login. Only explicit, post-login captures
// of generated example content are retained; credentials never enter artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

async function save(page: Page, id?: string): Promise<ContentRecord> {
  const path = id ? `/api/admin/contents/${id}` : '/api/admin/contents';
  const method = id ? 'PATCH' : 'POST';
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method);
  await page.getByRole('button', { name: id ? '수정 저장' : '저장', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(id ? 200 : 201);
  await expect(page.getByText('콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  return (await response.json()).data;
}

async function fit(page: Page) {
  const result = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth }));
  expect(result.overflow).toBeLessThanOrEqual(1);
  return result;
}

test('curriculum and resource UI lifecycle keeps public changes, private files and deletion consistent with usable mobile tables and forms', async ({ page, browser, login, authServer }, testInfo) => {
  test.setTimeout(120_000);
  await login('/admin/programs/new');
  const anonymous = await browser.newContext({ baseURL: authServer.base, viewport: page.viewportSize(), acceptDownloads: true });
  const visitor = await anonymous.newPage();
  const browserErrors: string[] = [];
  const measurements: Record<string, unknown>[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  visitor.on('pageerror', error => browserErrors.push(error.message));
  try {
    for (const kind of ['curriculum', 'resource'] as const) {
      const listPath = kind === 'curriculum' ? '/admin/programs' : '/admin/resources';
      const publicList = kind === 'curriculum' ? '/programs/curriculum' : '/resources';
      const title = `[예시] P10 ${kind} 등록부터 삭제까지`;
      await page.goto(`${listPath}/new`);
      const titleInput = page.getByLabel('제목', { exact: true });
      await expect(titleInput).toBeVisible();
      // Native validation stops an empty required title before a write request.
      let postCount = 0;
      const countPost = (request: import('@playwright/test').Request) => {
        if (new URL(request.url()).pathname === '/api/admin/contents' && request.method() === 'POST') postCount++;
      };
      page.on('request', countPost);
      await page.getByRole('button', { name: '저장', exact: true }).click();
      expect(await titleInput.evaluate(input => (input as HTMLInputElement).validity.valueMissing)).toBe(true);
      await expect(titleInput).toBeFocused();
      expect(postCount).toBe(0);
      page.off('request', countPost);

      await titleInput.fill(title);
      await page.getByLabel('분류', { exact: true }).fill('P10 검수 예시');
      await page.getByLabel('본문 HTML', { exact: true }).fill('<h2>등록 안내 예시</h2><p>별도 시험 환경에서만 사용하는 공개 본문입니다.</p><table><tbody><tr><th>안내 항목</th><td>한글 표 내용 예시</td></tr></tbody></table>');
      const typedLabel = kind === 'curriculum' ? '교육 대상' : '작성 안내';
      await page.getByLabel(typedLabel, { exact: true }).fill('[예시] 최초 안내');
      if (kind === 'curriculum') await page.getByLabel('수준 또는 유형', { exact: true }).fill('[예시] 기초');
      const originalName = '한글 서식 원본 파일명이 길어도 다운로드와 교체 버튼을 사용할 수 있는지 확인.pdf';
      const bytes = pdfFixture('P10 isolated original download');
      if (kind === 'resource') {
        const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/files' && response.request().method() === 'POST');
        await page.getByLabel('첨부파일 선택', { exact: true }).setInputFiles({ name: originalName, mimeType: 'application/octet-stream', buffer: bytes });
        expect((await pending).status()).toBe(201);
      }
      let record = await save(page);
      expect(record.publication).toBe('draft');
      const publicPath = kind === 'curriculum' ? `${publicList}/${record.slug}` : `${publicList}/${record.id}`;
      expect((await anonymous.request.get(`/api/public/contents/${record.id}`)).status()).toBe(404);
      await page.getByLabel('공개 여부', { exact: true }).selectOption('public');
      record = await save(page, record.id);
      await page.reload();
      await expect(titleInput).toHaveValue(title);
      measurements.push({ screen: `${kind}-editor`, ...await fit(page) });
      if (kind === 'resource') {
        await page.screenshot({ path: testInfo.outputPath('P10-resource-editor.png'), fullPage: true, mask: [page.locator('.admin-username')] });
        for (const [heading, name] of [['기본 정보', 'P10-resource-basic-fields.png'], ['첨부파일', 'P10-resource-file-controls.png']] as const) {
          await page.locator('section.content-panel').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).screenshot({ path: testInfo.outputPath(name) });
        }
      }

      await visitor.goto(publicPath);
      await expect(visitor.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      await expect(visitor.getByText('[예시] 최초 안내', { exact: true })).toBeVisible();
      await visitor.reload();
      await expect(visitor.getByText('한글 표 내용 예시', { exact: true })).toBeVisible();
      if (kind === 'resource') {
        const pending = visitor.waitForEvent('download');
        await visitor.getByRole('link', { name: originalName, exact: true }).click();
        const download = await pending;
        expect(download.suggestedFilename()).toBe(originalName);
        expect(readFileSync((await download.path())!)).toEqual(bytes);
        measurements.push({ screen: 'resource-public-long-filename', ...await fit(visitor) });
        await visitor.locator('h1').click();
        await visitor.screenshot({ path: testInfo.outputPath('P10-long-filename-resource.png'), fullPage: true });
      }

      await titleInput.fill(title + ' 수정');
      await page.getByLabel(typedLabel, { exact: true }).fill('[예시] 관리자에서 수정한 안내');
      record = await save(page, record.id);
      await visitor.reload();
      await expect(visitor.getByRole('heading', { level: 2, name: title + ' 수정', exact: true })).toBeVisible();
      await expect(visitor.getByText('[예시] 관리자에서 수정한 안내', { exact: true })).toBeVisible();
      await expect(visitor).toHaveURL(new URL(publicPath, authServer.base).href);

      await page.getByLabel('공개 여부', { exact: true }).selectOption('private');
      record = await save(page, record.id);
      await visitor.reload();
      await expect(visitor.getByText(title + ' 수정', { exact: true })).toHaveCount(0);
      expect((await anonymous.request.get(`/api/public/contents/${record.id}`)).status()).toBe(404);
      for (const file of record.files) expect((await anonymous.request.get(`/api/files/${file.id}?contentId=${record.id}`)).status()).toBe(404);

      await page.goto(listPath);
      await expect(page.getByRole('link', { name: title + ' 수정', exact: true })).toBeVisible();
      await expect(page.locator('tbody')).toContainText('비공개');
      measurements.push({ screen: `${kind}-admin-list`, ...await fit(page) });
      if (kind === 'resource') {
        await page.screenshot({ path: testInfo.outputPath('P10-resource-admin-table.png'), fullPage: true, mask: [page.locator('.admin-username')] });
        // Horizontally scrolling the table must expose its real edit/delete
        // controls without causing the document itself to overflow.
        const region = page.getByRole('region', { name: '서식 관리 목록 표', exact: true });
        await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        const deleteButton = page.getByRole('button', { name: title + ' 수정 삭제', exact: true });
        await deleteButton.scrollIntoViewIfNeeded();
        await expect(deleteButton).toBeInViewport();
        measurements.push({ screen: 'resource-admin-table-actions', ...await fit(page), table: await region.evaluate(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollLeft: node.scrollLeft })) });
        await page.screenshot({ path: testInfo.outputPath('P10-resource-admin-table-actions.png'), fullPage: true, mask: [page.locator('.admin-username')] });
        if (testInfo.project.name !== 'desktop') {
          await page.getByRole('button', { name: '관리 메뉴 열기', exact: true }).click();
          await expect(page.getByRole('navigation', { name: '관리자 메뉴', exact: true })).toBeVisible();
          await fit(page);
          const geometry = await page.evaluate(() => ({ menuBottom: document.querySelector('.admin-sidebar')!.getBoundingClientRect().bottom, headerTop: document.querySelector('.admin-header')!.getBoundingClientRect().top }));
          expect(geometry.headerTop).toBeGreaterThanOrEqual(geometry.menuBottom - 1);
          measurements.push({ screen: 'admin-mobile-menu-open', ...geometry, ...await fit(page) });
          await page.screenshot({ path: testInfo.outputPath('P10-admin-menu-open.png'), fullPage: true, mask: [page.locator('.admin-username')] });
          await page.getByRole('button', { name: '관리 메뉴 닫기', exact: true }).click();
        }
      }
      await page.getByRole('button', { name: title + ' 수정 삭제', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText(title + ' 수정');
      await page.getByRole('dialog').getByRole('button', { name: '삭제 확인', exact: true }).click();
      await expect(page.getByText('콘텐츠를 삭제했습니다.', { exact: true })).toBeVisible();
      expect((await page.request.get(`/api/admin/contents/${record.id}`)).status()).toBe(404);
      await visitor.goto(publicList);
      await expect(visitor.getByRole('link', { name: title + ' 수정', exact: true })).toHaveCount(0);
      await fit(visitor);
    }
    expect(browserErrors).toEqual([]);
    writeFileSync(testInfo.outputPath('P10-layout-metrics.json'), JSON.stringify({ project: testInfo.project.name, browserVersion: browser.version(), measurements, browserErrors }, null, 2));
  } finally { await anonymous.close(); }
});
