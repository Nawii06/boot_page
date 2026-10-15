import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { test, expect } from './auth.fixture';
import { pdfFixture, pngFixture } from '../helpers/documents';

// Authentication inputs and cookie values must never be retained in traces/video.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('administrator registers/uploads/previews/edits and deletes a notice while public visitors download the original and lose private access', async ({ page, browser, authServer, login }, testInfo) => {
  const token = randomBytes(4).toString('hex');
  const title = `[예시] 브라우저 공지 ${token}`;
  const originalName = `한글 원본 ${token}.pdf`, replacementName = `한글 교체 ${token}.pdf`;
  const anonymous = await browser.newContext({ baseURL: authServer.base, viewport: testInfo.project.use.viewport, acceptDownloads: true });
  const visitor = await anonymous.newPage();
  try {
    await login('/admin/notices');
    await page.getByRole('link', { name: '공지 등록', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('공지사항 등록');
    await page.getByLabel('제목', { exact: true }).fill(title);
    await page.getByLabel('분류', { exact: true }).fill('브라우저 시험');
    await page.getByLabel('게시일', { exact: true }).fill('2026-10-14T09:00');
    await page.getByLabel('본문 HTML', { exact: true }).fill('<p>공개 흐름 <strong>테스트</strong>입니다.</p><ul><li>준비물</li></ul><table><tbody><tr><td>표 확인</td></tr></tbody></table><a href="javascript:alert(1)">검증 링크</a><script>window.__unsafe = true</script>');
    await page.getByLabel('담당 부서·담당자', { exact: true }).fill('테스트용 담당 표기');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    const preview = page.getByRole('region', { name: '본문 미리보기', exact: true });
    await expect(preview).toBeVisible();
    await expect(preview.locator('strong')).toHaveText('테스트');
    await expect(preview.locator('td')).toHaveText('표 확인');
    await expect(preview.locator('script')).toHaveCount(0);
    await expect(preview.locator('a[href^="javascript:"]')).toHaveCount(0);
    const imageUploaded = page.waitForResponse(response => response.url().endsWith('/api/admin/files') && response.request().method() === 'POST');
    await page.getByLabel('본문 이미지 선택', { exact: true }).setInputFiles({ name: '테스트 본문.png', mimeType: 'image/png', buffer: pngFixture });
    const imageResponse = await imageUploaded; expect(imageResponse.status()).toBe(201);
    const imageId = (await imageResponse.json()).data.id as string;
    const imageDescription = page.getByLabel('이미지 설명', { exact: true });
    await imageDescription.fill('테스트 민트색 이미지');
    // A completed asynchronous upload must not take focus back from the field
    // the administrator is now editing on a later browser paint.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(imageDescription).toBeFocused();
    await expect(imageDescription).toHaveValue('테스트 민트색 이미지');
    expect(await page.getByLabel('본문 HTML', { exact: true }).inputValue()).not.toContain('테스트 민트색 이미지');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(preview.getByRole('img', { name: '테스트 민트색 이미지', exact: true })).toBeVisible();
    expect((await anonymous.request.get(`/api/files/${imageId}?inline=1`)).status()).toBe(404);
    const uploaded = page.waitForResponse(response => response.url().endsWith('/api/admin/files') && response.request().method() === 'POST');
    await page.getByLabel('첨부파일 선택', { exact: true }).setInputFiles({ name: originalName, mimeType: 'application/octet-stream', buffer: pdfFixture() });
    const uploadResponse = await uploaded;
    expect(uploadResponse.status()).toBe(201);
    const fileId = (await uploadResponse.json()).data.id as string;
    await expect(page.getByRole('link', { name: originalName, exact: true })).toBeVisible();
    expect((await anonymous.request.get(`/api/files/${fileId}`)).status()).toBe(404);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/notices\/[0-9a-f-]+\/edit$/);
    await expect(page.getByText('공지를 저장했습니다.', { exact: true })).toBeVisible();
    const editUrl = page.url(), contentId = new URL(editUrl).pathname.split('/')[3];
    expect((await anonymous.request.get(`/api/public/contents/${contentId}`)).status()).toBe(404);
    expect((await anonymous.request.get(`/api/files/${fileId}?contentId=${contentId}`)).status()).toBe(404);
    await page.getByLabel('공개 여부', { exact: true }).selectOption('public');
    await page.getByLabel('상단 고정', { exact: true }).check();
    await page.getByRole('button', { name: '수정 저장', exact: true }).click();
    await expect(page.getByText('공지를 저장했습니다.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('제목', { exact: true })).toHaveValue(title);
    await expect(page.getByLabel('공개 여부', { exact: true })).toHaveValue('public');
    await visitor.goto('/notices');
    await visitor.getByLabel('검색어', { exact: true }).fill(token);
    await visitor.getByLabel('분류', { exact: true }).selectOption('브라우저 시험');
    await visitor.getByRole('button', { name: '검색', exact: true }).click();
    await visitor.getByRole('link', { name: title, exact: true }).click();
    await expect(visitor).toHaveURL(new RegExp(`/notices/${contentId}$`));
    await expect(visitor.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    await expect(visitor.getByText('테스트용 담당 표기', { exact: true })).toBeVisible();
    const bodyImage = visitor.getByRole('img', { name: '테스트 민트색 이미지', exact: true });
    await expect(bodyImage).toBeVisible();
    await expect(bodyImage).toHaveAttribute('src', `/api/files/${imageId}?contentId=${contentId}&inline=1`);
    const downloadReady = visitor.waitForEvent('download');
    await visitor.getByRole('link', { name: originalName, exact: true }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toBe(originalName);
    expect(readFileSync((await download.path())!)).toEqual(pdfFixture());
    const overflow = await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await visitor.locator('h1').click();
    await visitor.screenshot({ path: testInfo.outputPath('P05-public-notice-detail.png'), fullPage: true });
    const chooserReady = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: `${originalName} 교체`, exact: true }).click();
    const chooser = await chooserReady;
    const replaced = page.waitForResponse(response => response.url().endsWith('/api/admin/files') && response.request().method() === 'POST');
    await chooser.setFiles({ name: replacementName, mimeType: 'application/pdf', buffer: pdfFixture('Browser replacement') });
    const replacement = await replaced; expect(replacement.status()).toBe(201);
    const replacementId = (await replacement.json()).data.id as string;
    await expect(page.getByRole('link', { name: replacementName, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '수정 저장', exact: true }).click();
    await expect(page.getByText('공지를 저장했습니다.', { exact: true })).toBeVisible();
    expect((await anonymous.request.get(`/api/files/${fileId}?contentId=${contentId}`)).status()).toBe(404);
    await visitor.reload();
    await expect(visitor.getByRole('link', { name: replacementName, exact: true })).toBeVisible();
    await expect(visitor.getByRole('link', { name: originalName, exact: true })).toHaveCount(0);
    await page.getByLabel('공개 여부', { exact: true }).selectOption('private');
    await page.getByRole('button', { name: '수정 저장', exact: true }).click();
    await expect(page.getByText('공지를 저장했습니다.', { exact: true })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText('공지를 찾을 수 없습니다. 공개 중인 공지인지 확인해 주세요.', { exact: true })).toBeVisible();
    const blocked = await anonymous.request.get(`/api/files/${replacementId}?contentId=${contentId}`, { headers: { 'If-None-Match': '*' } });
    expect(blocked.status()).toBe(404); expect(blocked.headers()['cache-control']).toContain('no-store');
    expect((await anonymous.request.get(`/api/files/${imageId}?contentId=${contentId}&inline=1`)).status()).toBe(404);
    await page.getByRole('link', { name: '목록으로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: `${title} 삭제`, exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
    await expect(page.getByText('공지를 삭제했습니다.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
    expect((await anonymous.request.get(`/api/public/contents/${contentId}`)).status()).toBe(404);
  } finally { await anonymous.close(); }
});

test('public search/category/page navigation survives reload and administrator filters exclude unrelated notices', async ({ page, login, authServer }) => {
  await login('/admin/notices');
  const session = (await (await page.request.get('/api/auth/session')).json()).data;
  const headers = { Origin: authServer.base, 'X-CSRF-Token': session.csrfToken };
  const group = `페이지-${randomBytes(4).toString('hex')}`, category = `분류-${randomBytes(4).toString('hex')}`;
  const records: { id: string; revision: number; title: string }[] = [];
  try {
    for (let index = 0; index < 12; index++) {
      const response = await page.request.post('/api/admin/contents', { headers, data: {
        kind: 'notice', title: `[예시] ${group} ${index}`, category, bodyHtml: '<p>격리된 목록 시험 자료</p>', publication: index === 11 ? 'private' : 'public', pinned: index === 0,
      } });
      expect(response.status()).toBe(201); records.push((await response.json()).data);
    }
    await page.goto('/notices');
    await page.getByLabel('검색어', { exact: true }).fill(group);
    await page.getByLabel('분류', { exact: true }).selectOption(category);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(10);
    await expect(page.locator('tbody tr').first()).toContainText(records[0].title);
    await expect(page.getByRole('link', { name: records[11].title, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
    await expect(page).toHaveURL(/page=2/); await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.reload(); await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '다음 페이지', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '이전 페이지', exact: true }).click(); await expect(page.locator('tbody tr')).toHaveCount(10);
    await page.goto('/admin/notices');
    await page.getByLabel('검색어', { exact: true }).fill(group);
    await page.getByLabel('게시 여부', { exact: true }).selectOption('private');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('link', { name: records[11].title, exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByLabel('게시 여부', { exact: true })).toHaveValue('private');
  } finally {
    for (const record of records) await page.request.delete(`/api/admin/contents/${record.id}`, { headers, data: { revision: record.revision } });
  }
});

test('one image can keep independent attachment and body roles during description changes, unlinking and replacement', async ({ page, login, authServer }) => {
  await login('/admin/notices');
  const session = (await (await page.request.get('/api/auth/session')).json()).data;
  const headers = { Origin: authServer.base, 'X-CSRF-Token': session.csrfToken };
  const token = randomBytes(4).toString('hex');
  const originalName = `겸용 이미지 ${token}.png`, replacementName = `첨부 교체 ${token}.pdf`;
  const uploaded = await page.request.post('/api/admin/files', { headers, multipart: {
    file: { name: originalName, mimeType: 'image/png', buffer: pngFixture },
  } });
  expect(uploaded.status()).toBe(201); const originalId = (await uploaded.json()).data.id as string;
  const created = await page.request.post('/api/admin/contents', { headers, data: {
    kind: 'notice', title: `[예시] 파일 역할 분리 ${token}`, publication: 'public',
    bodyHtml: `<p>겸용 파일 역할 시험</p><img data-file-id="${originalId}" alt="본문 원래 설명">`,
    fileLinks: [
      { fileId: originalId, role: 'attachment', altText: '첨부 역할 원래 설명' },
      { fileId: originalId, role: 'body', altText: '본문 원래 설명' },
    ],
  } });
  expect(created.status()).toBe(201); const contentId = (await created.json()).data.id as string;
  type SavedFile = { id: string; role: string; altText: string };
  const read = async () => (await (await page.request.get(`/api/admin/contents/${contentId}`)).json()).data as {
    revision: number; bodyHtml: string; files: SavedFile[];
  };
  const save = async () => {
    const response = page.waitForResponse(item => item.url().endsWith(`/api/admin/contents/${contentId}`) && item.request().method() === 'PATCH');
    await page.getByRole('button', { name: '수정 저장', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByText('공지를 저장했습니다.', { exact: true })).toBeVisible();
    return read();
  };
  const rows = page.locator('.notice-edit-files > li');
  const attachment = rows.filter({ has: page.locator('small').filter({ hasText: /^첨부파일 ·/ }) });
  const body = rows.filter({ has: page.locator('small').filter({ hasText: /^본문 이미지 ·/ }) });
  try {
    await page.goto(`/admin/notices/${contentId}/edit`);
    await expect(rows).toHaveCount(2); await expect(attachment).toHaveCount(1); await expect(body).toHaveCount(1);
    await body.getByLabel('이미지 설명', { exact: true }).fill('본문 역할만 바꾼 설명');
    let record = await save();
    expect(record.files.find(file => file.role === 'attachment')).toMatchObject({ id: originalId, altText: '첨부 역할 원래 설명' });
    expect(record.files.find(file => file.role === 'body')).toMatchObject({ id: originalId, altText: '본문 역할만 바꾼 설명' });
    expect(record.bodyHtml).toContain('alt="본문 역할만 바꾼 설명"');

    await attachment.getByRole('button', { name: `${originalName} 연결 해제`, exact: true }).click();
    await expect(rows).toHaveCount(1); await expect(body).toHaveCount(1);
    await expect(page.getByLabel('본문 HTML', { exact: true })).toHaveValue(new RegExp(originalId));
    record = await save();
    expect(record.files).toHaveLength(1);
    expect(record.files[0]).toMatchObject({ id: originalId, role: 'body', altText: '본문 역할만 바꾼 설명' });
    expect((await page.request.get(`/api/files/${originalId}?contentId=${contentId}&inline=1`)).status()).toBe(200);

    // Restore the second role through the supported API, then exercise its own replacement control.
    const restored = await page.request.patch(`/api/admin/contents/${contentId}`, { headers, data: {
      revision: record.revision, fileLinks: [
        { fileId: originalId, role: 'attachment', altText: '첨부 역할 원래 설명' },
        { fileId: originalId, role: 'body', altText: '본문 역할만 바꾼 설명' },
      ],
    } });
    expect(restored.status()).toBe(200); await page.reload(); await expect(rows).toHaveCount(2);
    const chooserReady = page.waitForEvent('filechooser');
    await attachment.getByRole('button', { name: `${originalName} 교체`, exact: true }).click();
    const chooser = await chooserReady;
    const replacementReady = page.waitForResponse(item => item.url().endsWith('/api/admin/files') && item.request().method() === 'POST');
    await chooser.setFiles({ name: replacementName, mimeType: 'application/pdf', buffer: pdfFixture('Independent attachment role') });
    const replacement = await replacementReady; expect(replacement.status()).toBe(201);
    const replacementId = (await replacement.json()).data.id as string;
    await expect(attachment.getByRole('link', { name: replacementName, exact: true })).toBeVisible();
    await expect(body.getByRole('link', { name: originalName, exact: true })).toBeVisible();
    await expect(body.getByLabel('이미지 설명', { exact: true })).toHaveValue('본문 역할만 바꾼 설명');
    record = await save();
    expect(record.files).toHaveLength(2);
    expect(record.files.find(file => file.role === 'attachment')).toMatchObject({ id: replacementId });
    expect(record.files.find(file => file.role === 'body')).toMatchObject({ id: originalId, altText: '본문 역할만 바꾼 설명' });
    expect(record.bodyHtml).toContain(`data-file-id="${originalId}"`); expect(record.bodyHtml).not.toContain(replacementId);
    const original = await page.request.get(`/api/files/${originalId}?contentId=${contentId}&inline=1`);
    expect(original.status()).toBe(200); expect(await original.body()).toEqual(pngFixture);
    const replaced = await page.request.get(`/api/files/${replacementId}?contentId=${contentId}`);
    expect(replaced.status()).toBe(200); expect(await replaced.body()).toEqual(pdfFixture('Independent attachment role'));
    await page.reload(); await expect(rows).toHaveCount(2);

    // A body-image replacement must not rewrite unrelated mentions of the same UUID.
    // Keep the original PNG attached, so its literal download link remains usable.
    const originalHref = `/api/files/${originalId}?contentId=${contentId}`;
    const description = `본문 설명 속 기존 식별자 ${originalId}`;
    const withLiteralReferences = await page.request.patch(`/api/admin/contents/${contentId}`, { headers, data: {
      revision: record.revision,
      bodyHtml: `<p>기존 파일 식별자: ${originalId}</p><a href="${originalHref}">기존 원본 링크</a><img data-file-id="${originalId}" alt="${description}">`,
      fileLinks: [
        { fileId: originalId, role: 'attachment', altText: '첨부 역할 원래 설명' },
        { fileId: replacementId, role: 'attachment', altText: '별도 PDF 첨부' },
        { fileId: originalId, role: 'body', altText: description },
      ],
    } });
    expect(withLiteralReferences.status()).toBe(200); await page.reload(); await expect(rows).toHaveCount(3);
    const bodyChooserReady = page.waitForEvent('filechooser');
    await body.getByRole('button', { name: `${originalName} 교체`, exact: true }).click();
    const bodyChooser = await bodyChooserReady;
    const bodyReplacementReady = page.waitForResponse(item => item.url().endsWith('/api/admin/files') && item.request().method() === 'POST');
    const bodyReplacementName = `본문만 교체 ${token}.png`;
    await bodyChooser.setFiles({ name: bodyReplacementName, mimeType: 'image/png', buffer: pngFixture });
    const bodyReplacement = await bodyReplacementReady; expect(bodyReplacement.status()).toBe(201);
    const bodyReplacementId = (await bodyReplacement.json()).data.id as string;
    await expect(body.getByRole('link', { name: bodyReplacementName, exact: true })).toBeVisible();
    const pendingHtml = await page.getByLabel('본문 HTML', { exact: true }).inputValue();
    expect(pendingHtml).toContain(`기존 파일 식별자: ${originalId}`);
    expect(pendingHtml).toContain(`href="${originalHref}"`);
    expect(pendingHtml).toContain(`alt="${description}"`);
    expect(pendingHtml).toContain(`data-file-id="${bodyReplacementId}"`);
    record = await save();
    expect(record.files).toHaveLength(3);
    expect(record.files.filter(file => file.role === 'attachment').map(file => file.id).sort()).toEqual([originalId, replacementId].sort());
    expect(record.files.find(file => file.role === 'body')).toMatchObject({ id: bodyReplacementId, altText: description });
    expect(record.bodyHtml).toContain(`기존 파일 식별자: ${originalId}`);
    expect(record.bodyHtml).toContain(`href="${originalHref}"`);
    expect(record.bodyHtml).toContain(`alt="${description}"`);
    expect(record.bodyHtml).toContain(`data-file-id="${bodyReplacementId}"`);
    const originalStillAttached = await page.request.get(originalHref);
    expect(originalStillAttached.status()).toBe(200); expect(await originalStillAttached.body()).toEqual(pngFixture);
    const pdfStillAttached = await page.request.get(`/api/files/${replacementId}?contentId=${contentId}`);
    expect(pdfStillAttached.status()).toBe(200); expect(await pdfStillAttached.body()).toEqual(pdfFixture('Independent attachment role'));
    const newBody = await page.request.get(`/api/files/${bodyReplacementId}?contentId=${contentId}&inline=1`);
    expect(newBody.status()).toBe(200); expect(await newBody.body()).toEqual(pngFixture);
    await page.reload(); await expect(rows).toHaveCount(3);
    await page.getByLabel('본문 HTML', { exact: true }).fill(`<p>이전 식별자 안내: ${bodyReplacementId}</p><img alt="꺾쇠 > 설명" data-file-id = ${bodyReplacementId}>`);
    await body.getByRole('button', { name: `${bodyReplacementName} 연결 해제`, exact: true }).click();
    await expect(body).toHaveCount(0);
    await expect(page.getByLabel('본문 HTML', { exact: true })).toHaveValue(`<p>이전 식별자 안내: ${bodyReplacementId}</p>`);
    record = await save();
    expect(record.files.filter(file => file.role === 'body')).toEqual([]);
    expect(record.files.filter(file => file.role === 'attachment')).toHaveLength(2);
    expect(record.bodyHtml).not.toContain('<img');
  } finally {
    const current = await read();
    await page.request.delete(`/api/admin/contents/${contentId}`, { headers, data: { revision: current.revision } });
  }
});
