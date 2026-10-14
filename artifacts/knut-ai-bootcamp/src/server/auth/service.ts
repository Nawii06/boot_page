import type Database from 'better-sqlite3';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { normalizeUsername, type AdminIdentity } from './adminAccounts.js';
import { hashPassword, passwordWithinLimits, verifyPassword } from './passwords.js';

const loginWindowMs = 15 * 60 * 1000;
const preAuthTtlMs = 15 * 60 * 1000;
const maxPreAuthSessions = 10_000;
let activeVerifications = 0;
let dummyHash: Promise<string> | undefined;

export class AuthError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string, public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthSession {
  tokenHash: string;
  csrfToken: string;
  expiresAt: string;
  admin: AdminIdentity;
}

export interface LoginResult {
  token: string;
  csrfToken: string;
  expiresAt: string;
  admin: AdminIdentity;
}

interface PreAuthRow { csrf_secret: string; expires_at: string }
interface AdminRow { id: string; username: string; password_hash: string; enabled: number }
interface RateRow { attempts: number; reset_at: string }

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const isToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export function tokenMatches(value: unknown, expected: unknown): boolean {
  return isToken(value) && isToken(expected) && timingSafeEqual(Buffer.from(value, 'ascii'), Buffer.from(expected, 'ascii'));
}

function failedLogin(): AuthError {
  return new AuthError('AUTH_FAILED', 401, '아이디 또는 비밀번호를 확인해 주세요.');
}

export class AuthService {
  private readonly now: () => number;
  private readonly sessionTtlMs: number;

  constructor(private readonly db: Database.Database, options: { sessionTtlSeconds: number; now?: () => number }) {
    if (!Number.isInteger(options.sessionTtlSeconds) || options.sessionTtlSeconds < 1 || options.sessionTtlSeconds > 86_400) throw new Error('Session lifetime must be between 1 and 86400 seconds.');
    this.now = options.now ?? Date.now;
    this.sessionTtlMs = options.sessionTtlSeconds * 1000;
  }

  private prune(now: number): void {
    const cutoff = new Date(now).toISOString();
    this.db.prepare('DELETE FROM pre_auth_sessions WHERE expires_at <= ?').run(cutoff);
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(cutoff);
    this.db.prepare('DELETE FROM auth_rate_limits WHERE reset_at <= ?').run(cutoff);
  }

  private rateKey(scope: string, value: string): string {
    return digest(`${scope}\0${value}`);
  }

  private ipKey(ip: string): string {
    return typeof ip === 'string' && ip.length <= 128 ? ip : 'unknown';
  }

  /** Synchronous transaction reserves the attempt before any costly password operation. */
  private reserveAttempts(keys: { key: string; limit: number }[], now: number): void {
    const retryAfter = this.db.transaction(() => {
      this.prune(now);
      let retry = 0;
      for (const { key, limit } of keys) {
        const row = this.db.prepare('SELECT attempts, reset_at FROM auth_rate_limits WHERE key_hash = ?').get(key) as RateRow | undefined;
        if (row && row.attempts >= limit) {
          retry = Math.max(retry, Math.max(1, Math.ceil((Date.parse(row.reset_at) - now) / 1000)));
        } else if (row) {
          this.db.prepare('UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE key_hash = ?').run(key);
        } else {
          this.db.prepare('INSERT INTO auth_rate_limits(key_hash, attempts, reset_at) VALUES (?, 1, ?)').run(key, new Date(now + loginWindowMs).toISOString());
        }
        // Stop once the IP bucket is full, so attacker-supplied account names cannot grow the table indefinitely.
        if (retry) break;
      }
      return retry;
    }).immediate();
    if (retryAfter) throw new AuthError('LOGIN_RATE_LIMITED', 429, '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.', retryAfter);
  }

  issueLoginCsrf(ip: string, existingPreToken?: string): { token: string; csrfToken: string; expiresAt: string } {
    const now = this.now();
    this.prune(now);
    const existing = isToken(existingPreToken)
      ? this.db.prepare('SELECT csrf_secret, expires_at FROM pre_auth_sessions WHERE token_hash = ? AND expires_at > ?').get(digest(existingPreToken), new Date(now).toISOString()) as PreAuthRow | undefined
      : undefined;
    if (existing && existingPreToken) return { token: existingPreToken, csrfToken: existing.csrf_secret, expiresAt: existing.expires_at };
    this.reserveAttempts([{ key: this.rateKey('preauth:ip', this.ipKey(ip)), limit: 60 }], now);
    const { count } = this.db.prepare('SELECT count(*) AS count FROM pre_auth_sessions').get() as { count: number };
    if (count >= maxPreAuthSessions) throw new AuthError('LOGIN_RATE_LIMITED', 429, '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 60);
    const token = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(now + preAuthTtlMs).toISOString();
    this.db.prepare('INSERT INTO pre_auth_sessions(token_hash, csrf_secret, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(digest(token), csrfToken, expiresAt, new Date(now).toISOString());
    return { token, csrfToken, expiresAt };
  }

  validateLoginCsrf(preToken: unknown, csrfToken: unknown): boolean {
    if (!isToken(preToken) || !isToken(csrfToken)) return false;
    const row = this.db.prepare('SELECT csrf_secret, expires_at FROM pre_auth_sessions WHERE token_hash = ? AND expires_at > ?')
      .get(digest(preToken), new Date(this.now()).toISOString()) as PreAuthRow | undefined;
    return Boolean(row && tokenMatches(csrfToken, row.csrf_secret));
  }

  async login(usernameInput: unknown, password: unknown, ip: string, preToken: string, csrfToken: string, oldSessionToken?: string): Promise<LoginResult> {
    if (!this.validateLoginCsrf(preToken, csrfToken)) throw new AuthError('CSRF_INVALID', 403, '로그인 화면을 새로고침한 후 다시 시도해 주세요.');
    if (activeVerifications >= 2) throw new AuthError('AUTH_BUSY', 503, '인증 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.', 1);
    const username = normalizeUsername(usernameInput);
    this.reserveAttempts([
      { key: this.rateKey('login:ip', this.ipKey(ip)), limit: 30 },
      { key: this.rateKey('login:username', username ?? '[invalid]'), limit: 8 },
    ], this.now());
    if (!passwordWithinLimits(password)) throw failedLogin();
    activeVerifications += 1;
    try {
      // Unknown and disabled accounts perform the same configured scrypt operation as known accounts.
      dummyHash ??= hashPassword(randomToken());
      const fallback = await dummyHash;
      const account = username ? this.db.prepare('SELECT id, username, password_hash, enabled FROM admins WHERE username = ?').get(username) as AdminRow | undefined : undefined;
      const verified = await verifyPassword(password, account?.enabled ? account.password_hash : fallback);
      if (!verified || !account?.enabled) throw failedLogin();
      return this.db.transaction(() => {
        // Recheck after awaiting scrypt: password reset/disable must also invalidate in-flight logins.
        const current = this.db.prepare('SELECT id, username, password_hash, enabled FROM admins WHERE id = ?').get(account.id) as AdminRow | undefined;
        if (!current?.enabled || current.password_hash !== account.password_hash) throw failedLogin();
        if (!this.validateLoginCsrf(preToken, csrfToken)) throw new AuthError('CSRF_INVALID', 403, '로그인 화면을 새로고침한 후 다시 시도해 주세요.');
        const now = this.now();
        const token = randomToken();
        const nextCsrfToken = randomToken();
        const expiresAt = new Date(now + this.sessionTtlMs).toISOString();
        this.prune(now);
        if (isToken(oldSessionToken)) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(oldSessionToken));
        this.db.prepare('INSERT INTO sessions(token_hash, admin_id, csrf_secret, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(digest(token), current.id, nextCsrfToken, expiresAt, new Date(now).toISOString());
        this.db.prepare('DELETE FROM pre_auth_sessions WHERE token_hash = ?').run(digest(preToken));
        return { token, csrfToken: nextCsrfToken, expiresAt, admin: { id: current.id, username: current.username } };
      }).immediate();
    } finally {
      activeVerifications -= 1;
    }
  }

  getSession(token?: string): AuthSession | null {
    if (!isToken(token)) return null;
    const tokenHash = digest(token);
    const row = this.db.prepare(`SELECT sessions.csrf_secret, sessions.expires_at, admins.id, admins.username
      FROM sessions JOIN admins ON admins.id = sessions.admin_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND admins.enabled = 1`)
      .get(tokenHash, new Date(this.now()).toISOString()) as { csrf_secret: string; expires_at: string; id: string; username: string } | undefined;
    if (!row) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    return { tokenHash, csrfToken: row.csrf_secret, expiresAt: row.expires_at, admin: { id: row.id, username: row.username } };
  }

  logout(token?: string): void {
    if (isToken(token)) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  }
}
