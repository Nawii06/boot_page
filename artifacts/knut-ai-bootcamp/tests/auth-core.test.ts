import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { ReadStream, WriteStream } from 'node:tty';
import { spawnSync } from 'node:child_process';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { createAdmin, normalizeUsername, resetAdmin } from '../src/server/auth/adminAccounts.js';
import { AuthError, AuthService, tokenMatches } from '../src/server/auth/service.js';
import { hashPassword, passwordWithinLimits, verifyPassword } from '../src/server/auth/passwords.js';
import { readHiddenPassword } from '../scripts/hiddenInput.js';

const cacheRoot = resolve('.cache/tests');
const secret = () => randomBytes(24).toString('base64url');
const authError = (code: string, statusCode: number) => (error: unknown) => error instanceof AuthError && error.code === code && error.statusCode === statusCode;

async function fixture(t: TestContext) {
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, 'auth-core-'));
  const path = join(directory, 'fixture.sqlite');
  let db = openDatabase(path, { create: true });
  await migrateDatabase(db, resolve('migrations'), join(directory, 'backups'));
  let now = Date.now();
  const service = () => new AuthService(db, { sessionTtlSeconds: 28_800, now: () => now });
  t.after(() => {
    if (db.open) db.close();
    const boundary = relative(cacheRoot, directory);
    assert.ok(boundary && !boundary.startsWith('..') && !isAbsolute(boundary));
    assert.equal(resolve(cacheRoot, boundary), directory);
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    get db() { return db; },
    service,
    advance(milliseconds: number) { now += milliseconds; },
    reopen() { db.close(); db = openDatabase(path); return service(); },
  };
}

async function login(service: AuthService, username: string, password: string, oldToken?: string) {
  const pre = service.issueLoginCsrf('127.0.0.1');
  return service.login(username, password, '127.0.0.1', pre.token, pre.csrfToken, oldToken);
}

test('scrypt passwords have independent salts, bounded parameters, Unicode support and significant whitespace', async () => {
  const password = ` ${secret()} 한글🙂 `;
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^scrypt\$32768\$8\$3\$/);
  assert.ok(first !== second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword(secret(), first), false);
  assert.equal(await verifyPassword(password, first.replace('$32768$', '$1073741824$')), false);
  assert.equal(passwordWithinLimits('x'.repeat(14)), false);
  assert.equal(passwordWithinLimits('🙂'.repeat(128)), true);
  assert.equal(passwordWithinLimits('🙂'.repeat(129)), false);
  assert.equal(passwordWithinLimits('x'.repeat(100_000)), false);
  await assert.rejects(hashPassword('x'.repeat(129)));
  assert.equal(normalizeUsername('LOCAL.Admin'), 'local.admin');
  assert.equal(normalizeUsername(' admin '), null);
});

test('create never overwrites existing accounts; explicit reset revokes all sessions and persists', async t => {
  const f = await fixture(t);
  const password = secret();
  const replacement = secret();
  const account = await createAdmin(f.db, 'Test.Admin', password);
  const service = f.service();
  const first = await login(service, 'TEST.ADMIN', password);
  const second = await login(service, 'test.admin', password);
  assert.equal(first.admin.id, account.id);
  assert.ok(service.getSession(first.token));
  await assert.rejects(createAdmin(f.db, 'test.admin', replacement));
  assert.ok(service.getSession(first.token));
  const reset = await resetAdmin(f.db, 'test.admin', replacement);
  assert.equal(reset.id, account.id);
  assert.equal(service.getSession(first.token), null);
  assert.equal(service.getSession(second.token), null);
  const reopened = f.reopen();
  assert.equal(reopened.getSession(first.token), null);
  await assert.rejects(login(reopened, 'test.admin', password), authError('AUTH_FAILED', 401));
  const next = await login(reopened, 'test.admin', replacement);
  assert.equal(next.admin.id, account.id);
  await assert.rejects(resetAdmin(f.db, 'missing.admin', replacement));
});

test('pre-login CSRF is opaque, reuses an existing cookie, expires, and is consumed upon login', async t => {
  const f = await fixture(t);
  const password = secret();
  await createAdmin(f.db, 'csrf.admin', password);
  const service = f.service();
  const pre = service.issueLoginCsrf('127.0.0.1');
  const again = service.issueLoginCsrf('127.0.0.1', pre.token);
  assert.ok(pre.token === again.token && pre.csrfToken === again.csrfToken);
  assert.equal(tokenMatches(pre.csrfToken, pre.csrfToken), true);
  assert.equal(tokenMatches(pre.csrfToken, randomBytes(32).toString('base64url')), false);
  assert.equal(service.validateLoginCsrf(pre.token, pre.csrfToken), true);
  assert.equal(service.validateLoginCsrf(pre.token, randomBytes(32).toString('base64url')), false);
  await assert.rejects(service.login('csrf.admin', password, '127.0.0.1', pre.token, ''), authError('CSRF_INVALID', 403));
  const result = await service.login('csrf.admin', password, '127.0.0.1', pre.token, pre.csrfToken);
  assert.equal(service.validateLoginCsrf(pre.token, pre.csrfToken), false);
  assert.ok(result.token !== pre.token && result.csrfToken !== pre.csrfToken);
  const stored = f.db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
  assert.equal(stored.token_hash, createHash('sha256').update(result.token).digest('hex'));
  assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM sessions').all()).includes(result.token));
  const expiring = service.issueLoginCsrf('127.0.0.1');
  f.advance(15 * 60 * 1000);
  assert.equal(service.validateLoginCsrf(expiring.token, expiring.csrfToken), false);
});

test('sessions survive reopen, expire absolutely, rotate at login, and are invalidated by logout', async t => {
  const f = await fixture(t);
  const password = secret();
  await createAdmin(f.db, 'session.admin', password);
  let service = f.service();
  const first = await login(service, 'session.admin', password);
  service = f.reopen();
  assert.equal(service.getSession(first.token)?.admin.username, 'session.admin');
  assert.equal(service.getSession('true'), null);
  assert.equal(service.getSession(JSON.stringify({ isAdmin: true })), null);
  assert.equal(service.getSession(randomBytes(32).toString('base64url')), null);
  const second = await login(service, 'session.admin', password, first.token);
  assert.ok(first.token !== second.token);
  assert.equal(service.getSession(first.token), null);
  assert.ok(service.getSession(second.token));
  service.logout(second.token);
  assert.equal(f.reopen().getSession(second.token), null);
  service = f.service();
  const third = await login(service, 'session.admin', password);
  f.advance(28_800_000 - 1);
  assert.ok(service.getSession(third.token));
  f.advance(1);
  assert.equal(service.getSession(third.token), null);
});

test('disabled administrators cannot log in or use an existing session, and reset does not re-enable them', async t => {
  const f = await fixture(t);
  const password = secret();
  const account = await createAdmin(f.db, 'disabled.admin', password);
  const service = f.service();
  const session = await login(service, 'disabled.admin', password);
  f.db.prepare('UPDATE admins SET enabled=0 WHERE id=?').run(account.id);
  assert.equal(service.getSession(session.token), null);
  await assert.rejects(login(service, 'disabled.admin', password), authError('AUTH_FAILED', 401));
  await assert.rejects(resetAdmin(f.db, 'disabled.admin', secret()));
  assert.equal((f.db.prepare('SELECT enabled FROM admins WHERE id=?').get(account.id) as { enabled: number }).enabled, 0);
});

test('account and IP attempt limits survive restart, hide account existence, and reset after 15 minutes', async t => {
  const f = await fixture(t);
  const password = secret();
  await createAdmin(f.db, 'rate.admin', password);
  let service = f.service();
  const pre = service.issueLoginCsrf('127.0.0.1');
  for (let index = 0; index < 8; index++) {
    await assert.rejects(service.login('RATE.ADMIN', 'short', '127.0.0.1', pre.token, pre.csrfToken), authError('AUTH_FAILED', 401));
  }
  service = f.reopen();
  await assert.rejects(service.login('rate.admin', password, '127.0.0.1', pre.token, pre.csrfToken), (error: unknown) => error instanceof AuthError && error.code === 'LOGIN_RATE_LIMITED' && error.statusCode === 429 && Boolean(error.retryAfterSeconds));
  f.advance(15 * 60 * 1000 + 1);
  const next = await login(service, 'rate.admin', password);
  assert.ok(service.getSession(next.token));
  const shared = service.issueLoginCsrf('127.0.0.2');
  for (let index = 0; index < 30; index++) {
    await assert.rejects(service.login(`unknown-${index}`, 'short', '127.0.0.2', shared.token, shared.csrfToken), authError('AUTH_FAILED', 401));
  }
  await assert.rejects(service.login('another-unknown', 'short', '127.0.0.2', shared.token, shared.csrfToken), authError('LOGIN_RATE_LIMITED', 429));
  const serialized = JSON.stringify(f.db.prepare('SELECT * FROM auth_rate_limits').all());
  assert.ok(!serialized.includes('127.0.0.2') && !serialized.includes('rate.admin'));
});

test('pre-login session allocation is bounded per IP while valid cookie refreshes allocate nothing', async t => {
  const f = await fixture(t);
  const service = f.service();
  const existing = service.issueLoginCsrf('127.0.0.1');
  for (let index = 0; index < 80; index++) service.issueLoginCsrf('127.0.0.1', existing.token);
  assert.equal((f.db.prepare('SELECT count(*) AS count FROM pre_auth_sessions').get() as { count: number }).count, 1);
  for (let index = 1; index < 60; index++) service.issueLoginCsrf('127.0.0.1');
  assert.throws(() => service.issueLoginCsrf('127.0.0.1'), authError('LOGIN_RATE_LIMITED', 429));
  f.advance(15 * 60 * 1000 + 1);
  service.issueLoginCsrf('127.0.0.1');
  assert.equal((f.db.prepare('SELECT count(*) AS count FROM pre_auth_sessions').get() as { count: number }).count, 1);
});

test('password reset cannot race an in-flight login into a valid session', async t => {
  const f = await fixture(t);
  const password = secret();
  const account = await createAdmin(f.db, 'race.admin', password);
  const service = f.service();
  const replacementHash = await hashPassword(secret());
  const pending = login(service, 'race.admin', password).then(result => ({ result }), error => ({ error: error as unknown }));
  await new Promise(resolve => setImmediate(resolve));
  // Simulate another process committing a completed reset while password verification is awaiting scrypt.
  f.db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(replacementHash, account.id);
  f.db.prepare('DELETE FROM sessions WHERE admin_id=?').run(account.id);
  const outcome = await pending;
  if ('result' in outcome) assert.equal(service.getSession(outcome.result.token), null);
  else assert.ok(authError('AUTH_FAILED', 401)(outcome.error));
});

class FakeTerminal extends EventEmitter {
  isTTY = true;
  isRaw = false;
  paused = true;
  readableFlowing: boolean | null = false;
  output = '';
  setRawMode(value: boolean) { this.isRaw = value; return this; }
  isPaused() { return this.paused; }
  pause() { this.paused = true; this.readableFlowing = false; return this; }
  resume() { this.paused = false; this.readableFlowing = true; return this; }
  setEncoding() { return this; }
  write(value: string) { this.output += value; return true; }
}

test('hidden TTY input supports backspace/cancel without echo and refuses piped input', async () => {
  const input = new FakeTerminal();
  const output = new FakeTerminal();
  const password = secret();
  const pending = readHiddenPassword('Password: ', input as unknown as ReadStream, output as unknown as WriteStream);
  input.emit('data', `${password}x\u007f\r`);
  assert.ok((await pending) === password);
  assert.ok(!output.output.includes(password));
  assert.equal(input.isRaw, false);
  assert.equal(input.paused, true);
  const cancelled = readHiddenPassword('Password: ', input as unknown as ReadStream, output as unknown as WriteStream);
  input.emit('data', `${password}\u0003`);
  await assert.rejects(cancelled, /cancelled/);
  assert.ok(!output.output.includes(password));
  assert.equal(input.isRaw, false);
  input.isTTY = false;
  assert.throws(() => readHiddenPassword('Password: ', input as unknown as ReadStream, output as unknown as WriteStream), /interactive terminal/);
});

test('hidden input releases an initially idle TTY after both prompts so administrator CLI can exit', async () => {
  const input = new FakeTerminal();
  input.paused = false;
  input.readableFlowing = null; // Real initial Node TTY state, distinct from a flowing stream.
  const output = new FakeTerminal();
  const password = secret();
  for (const prompt of ['New password: ', 'Confirm password: ']) {
    const pending = readHiddenPassword(prompt, input as unknown as ReadStream, output as unknown as WriteStream);
    input.emit('data', `${password}\r`);
    assert.equal(await pending, password);
    assert.equal(input.readableFlowing, false);
    assert.equal(input.listenerCount('data'), 0);
    assert.equal(input.isRaw, false);
  }
  assert.equal(output.output.includes(password), false);
  input.resume();
  const pending = readHiddenPassword('Password: ', input as unknown as ReadStream, output as unknown as WriteStream);
  input.emit('data', '\u0003');
  await assert.rejects(pending, /cancelled/);
  assert.equal(input.readableFlowing, true); // Preserve an existing caller's flowing stream.
});

test('administrator CLI rejects non-interactive setup and unsupported password arguments before DB access', () => {
  const nonInteractive = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/admin.ts', 'create', '--username', 'cli.test'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
  assert.equal(nonInteractive.status, 1);
  assert.match(nonInteractive.stderr, /interactive terminal/);
  const invalid = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/admin.ts', 'create', '--username', 'cli.test', '--password'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Never pass passwords/);
});
