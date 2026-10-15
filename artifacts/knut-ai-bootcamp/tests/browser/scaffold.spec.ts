import { test, expect } from './auth.fixture';
import { routeDefinitions } from '../../src/shared/pageRoutes';

// No traces, video or automatic failure screenshots may retain login inputs.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('all screen types render, reload and fit the viewport without external requests', async ({ page, login }, testInfo) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) external.push(request.url()); });
  for (const route of routeDefinitions.filter(route => route.area !== 'admin' || route.kind === 'login')) {
    const path = route.path.replace(/:[^/]+/g, '_preview');
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    if (route.kind !== 'home') await expect(page.locator('h1')).toHaveText(route.title);
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
    const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(width.content, route.id + ' ' + path + ' horizontal overflow').toBeLessThanOrEqual(width.viewport + 1);
    if (['/', '/notices', '/admin/login'].includes(path)) await page.screenshot({ path: testInfo.outputPath(route.id + '.png'), fullPage: true });
  }
  await login();
  for (const route of routeDefinitions.filter(route => route.area === 'admin' && route.kind !== 'login')) {
    const path = route.path.replace(/:[^/]+/g, '_preview');
    await page.goto(path);
    await expect(page.locator('h1')).toHaveText(route.title);
    await page.reload();
    await expect(page.locator('h1')).toHaveText(route.title);
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(width.content, route.id + ' ' + path + ' horizontal overflow').toBeLessThanOrEqual(width.viewport + 1);
    if (['/admin', '/admin/notices/new'].includes(path)) await page.screenshot({ path: testInfo.outputPath(route.id + '.png'), fullPage: true });
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('public menus, browser back, authenticated admin navigation and preparation controls work honestly', async ({ page, login }, testInfo) => {
  await page.goto('/');
  const mobile = testInfo.project.name !== 'desktop';
  if (mobile) await page.getByRole('button', { name: '전체 메뉴 열기' }).click();
  await page.getByRole('button', { name: '사업단 소개', exact: true }).click();
  await page.getByRole('link', { name: '조직 및 담당업무', exact: true }).click();
  await expect(page).toHaveURL(/\/about\/organization$/);
  await expect(page.locator('h1')).toHaveText('조직 및 담당업무');
  await page.goBack();
  await expect(page.locator('h1')).toContainText('내 전공에');
  await page.getByRole('link', { name: '관리자 화면', exact: true }).click();
  await expect(page.getByLabel('관리자 아이디')).toBeEnabled();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
  await login();
  await expect(page.getByText('로컬 API가 응답했습니다.', { exact: false })).toBeVisible();
  if (mobile) await page.getByRole('button', { name: '관리 메뉴 열기' }).click();
  await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: '공지사항', exact: true }).click();
  await page.getByRole('link', { name: '공지 등록' }).click();
  await expect(page).toHaveURL(/\/admin\/notices\/new$/);
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: '목록으로 돌아가기' }).click();
  await page.goto('/admin/programs/new');
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled();
  await page.goto('/not-a-page');
  await expect(page.getByText('요청하신 페이지가 없습니다')).toBeVisible();
  await page.getByRole('link', { name: '홈으로 이동', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('authenticated API loading and error states expose a working retry action', async ({ page, login }, testInfo) => {
  await page.route('**/api/health', async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"TEST_UNAVAILABLE"}}' });
  });
  await login();
  await expect(page.getByText('로컬 API 응답을 확인하고 있습니다.')).toBeVisible();
  await expect(page.getByText('로컬 API에 연결할 수 없습니다')).toBeVisible();
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByText('로컬 API가 응답했습니다.', { exact: false })).toBeVisible();
  await expect(page.getByText('로컬 DB 연결 확인', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('P05-admin-auth-ready.png'), fullPage: true });
});

test('keyboard can open public navigation and reach an actual page', async ({ page }, testInfo) => {
  await page.goto('/');
  if (testInfo.project.name !== 'desktop') {
    await page.getByRole('button', { name: '전체 메뉴 열기' }).focus();
    await page.keyboard.press('Enter');
  }
  const button = page.getByRole('button', { name: '공지·자료실', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '공지사항', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/notices$/);
});

test('server protection ignores browser flags, login returns to the requested page, and logout invalidates the previous cookie', async ({ page, context, authServer, login }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('isAdmin', 'true'); localStorage.setItem('authenticated', 'true'); document.cookie = 'isAdmin=true; Path=/'; });
  await page.goto('/admin/notices');
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
  await expect(page.getByLabel('관리자 아이디')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toHaveCount(0);
  const denied = await page.request.post(authServer.base + '/api/admin/contents', { data: { title: 'test' } });
  expect(denied.status()).toBe(401);
  await login('/admin/notices');
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === 'knut_admin_session')!;
  expect(sessionCookie.httpOnly).toBe(true);
  expect(sessionCookie.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie.includes('knut_admin_session='))).toBe(false);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('공지사항 관리');
  await page.goto('/ADMIN');
  await expect(page.locator('h1')).toHaveText('관리자 메인');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await context.addCookies([sessionCookie]);
  expect((await page.request.get(authServer.base + '/api/auth/session')).status()).toBe(401);
  await page.goto('/admin');
  await expect(page.getByLabel('관리자 아이디')).toBeVisible();
});

test('an expired server session returns the administrator to login on direct navigation', async ({ page, authServer, login }) => {
  await login();
  authServer.expireSessions();
  await page.goto('/admin/home');
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
  await expect(page.getByLabel('관리자 아이디')).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
});

