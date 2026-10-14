import { Router, json, type Request, type RequestHandler, type Response } from 'express';
import type { AppConfig } from '../config.js';
import { AuthService, AuthError, tokenMatches } from '../auth/service.js';

export const SESSION_COOKIE = 'knut_admin_session';
const PREAUTH_COOKIE = 'knut_login_csrf';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

// Reject duplicate/invalid cookies instead of choosing an attacker-controlled value.
export function readCookie(req: Request, name: string): string | undefined {
  const matches = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(name.length + 1);
  return /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : undefined;
}

function reject(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

export function createAuthGuards(auth: AuthService, config: AppConfig) {
  const requireAdmin: RequestHandler = (req, res, next) => {
    const session = auth.getSession(readCookie(req, SESSION_COOKIE));
    if (!session) return reject(res, 401, 'AUTH_REQUIRED', '관리자 로그인이 필요합니다.');
    res.locals.adminSession = session;
    next();
  };
  const requireMutationCsrf: RequestHandler = (req, res, next) => {
    if (safeMethods.has(req.method)) return next();
    // Never derive trusted origins from Host, Referer or forwarded headers.
    const origin = req.get('origin');
    const csrf = req.get('X-CSRF-Token');
    const session = auth.getSession(readCookie(req, SESSION_COOKIE));
    if (!session) return reject(res, 401, 'AUTH_REQUIRED', '관리자 로그인이 필요합니다.');
    if (!origin || !config.appOrigins.includes(origin) || !csrf || !tokenMatches(csrf, session.csrfToken)) {
      return reject(res, 403, 'CSRF_INVALID', '요청을 확인할 수 없습니다. 화면을 새로고침해 주세요.');
    }
    res.locals.adminSession = session;
    next();
  };
  return { requireAdmin, requireMutationCsrf };
}

export function authRouter(auth: AuthService, config: AppConfig) {
  const router = Router();
  const guards = createAuthGuards(auth, config);
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure, path: '/' };
  const sessionData = (session: { admin: { id: string; username: string }; csrfToken: string; expiresAt: string }) => ({
    admin: session.admin, csrfToken: session.csrfToken, expiresAt: session.expiresAt,
  });
  const loginOrigin: RequestHandler = (req, res, next) => {
    if (!req.get('origin') || !config.appOrigins.includes(req.get('origin')!)) {
      return reject(res, 403, 'CSRF_INVALID', '요청을 확인할 수 없습니다. 화면을 새로고침해 주세요.');
    }
    next();
  };
  router.get('/csrf', (req, res) => {
    const site = req.get('Sec-Fetch-Site');
    if ((site && !['same-origin', 'none'].includes(site)) || (req.get('origin') && !config.appOrigins.includes(req.get('origin')!))) {
      return reject(res, 403, 'CSRF_INVALID', '요청을 확인할 수 없습니다.');
    }
    const issued = auth.issueLoginCsrf(req.ip || req.socket.remoteAddress || 'unknown', readCookie(req, PREAUTH_COOKIE));
    res.cookie(PREAUTH_COOKIE, issued.token, { ...cookieOptions, expires: new Date(issued.expiresAt) });
    res.json({ data: { csrfToken: issued.csrfToken } });
  });
  router.post('/login', loginOrigin, json({ limit: '8kb', strict: true }), async (req, res) => {
    if (!req.is('application/json') || !req.body || Array.isArray(req.body) ||
        Object.keys(req.body).some(key => !['username', 'password'].includes(key)) ||
        typeof req.body.username !== 'string' || typeof req.body.password !== 'string') {
      return reject(res, 400, 'INVALID_INPUT', '아이디와 비밀번호를 확인해 주세요.');
    }
    const result = await auth.login(req.body.username, req.body.password,
      req.ip || req.socket.remoteAddress || 'unknown', readCookie(req, PREAUTH_COOKIE) ?? '',
      req.get('X-CSRF-Token') ?? '', readCookie(req, SESSION_COOKIE));
    res.cookie(SESSION_COOKIE, result.token, { ...cookieOptions, expires: new Date(result.expiresAt) });
    res.clearCookie(PREAUTH_COOKIE, cookieOptions);
    res.json({ data: sessionData(result) });
  });
  router.get('/session', guards.requireAdmin, (_req, res) => {
    res.json({ data: sessionData(res.locals.adminSession) });
  });
  router.post('/logout', guards.requireAdmin, guards.requireMutationCsrf, (req, res) => {
    auth.logout(readCookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.clearCookie(PREAUTH_COOKIE, cookieOptions);
    res.status(204).end();
  });
  return router;
}

export function sendAuthError(error: AuthError, res: Response) {
  if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
  const message = error.statusCode === 429 ? '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.'
    : error.statusCode === 401 ? '아이디 또는 비밀번호를 확인해 주세요.'
    : error.statusCode === 403 ? '요청을 확인할 수 없습니다. 화면을 새로고침해 주세요.'
    : '지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  reject(res, error.statusCode, error.code, message);
}
