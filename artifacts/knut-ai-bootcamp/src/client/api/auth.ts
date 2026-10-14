export type AdminSession = {
  admin: { id: string; username: string };
  csrfToken: string;
  expiresAt: string;
};

export class AuthRequestError extends Error {
  constructor(readonly status: number, readonly retryAfter: number | null = null) {
    super('인증 요청을 처리하지 못했습니다.');
  }
}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...options.headers },
    });
    if (!response.ok) {
      const retry = Number(response.headers.get('Retry-After'));
      throw new AuthRequestError(response.status, Number.isFinite(retry) && retry > 0 ? retry : null);
    }
    return response;
  } finally {
    window.clearTimeout(timeout);
  }
}

function sessionData(value: unknown): AdminSession {
  const session = (value as { data?: AdminSession } | null)?.data;
  if (!session || typeof session.admin?.id !== 'string' || typeof session.admin.username !== 'string'
    || typeof session.csrfToken !== 'string' || !session.csrfToken
    || typeof session.expiresAt !== 'string' || !Number.isFinite(Date.parse(session.expiresAt))) {
    throw new Error('올바른 인증 응답이 아닙니다.');
  }
  return session;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    return sessionData(await (await request('/api/auth/session')).json());
  } catch (error) {
    if (error instanceof AuthRequestError && error.status === 401) return null;
    throw error;
  }
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  const preflight = await (await request('/api/auth/csrf')).json() as { data?: { csrfToken?: unknown } };
  const csrfToken = preflight.data?.csrfToken;
  if (typeof csrfToken !== 'string' || !csrfToken) throw new Error('로그인 요청을 준비하지 못했습니다.');
  return sessionData(await (await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ username, password }),
  })).json());
}

export async function logoutAdmin(csrfToken: string): Promise<void> {
  await request('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
}
