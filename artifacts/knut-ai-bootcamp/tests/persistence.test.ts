import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';
import type { ContentInput } from '../src/shared/content.js';

const projectRoot = resolve('.');
const cacheRoot = resolve('.cache/tests');

function fixture(t: TestContext) {
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, 'persistence-'));
  t.after(() => {
    const boundary = relative(cacheRoot, directory);
    assert.ok(boundary && !boundary.startsWith('..') && !isAbsolute(boundary));
    assert.equal(resolve(cacheRoot, boundary), directory);
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, dbPath: join(directory, 'fixture.sqlite') };
}

async function unusedPort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done()));
  return port;
}

async function launch(dbPath: string) {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', '--dev'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: '', DB_PATH: dbPath, HOST: '127.0.0.1', PORT: String(port), DEV_PORT: String(port === 5173 ? 5174 : 5173), ALLOW_NETWORK: 'false' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', data => { output = `${output}${String(data)}`.slice(-4000); });
  child.stderr?.on('data', data => { output = `${output}${String(data)}`.slice(-4000); });
  const completion = once(child, 'exit');
  const base = `http://127.0.0.1:${port}`;
  return { child, completion, base, output: () => output };
}

async function stop(child: ChildProcess, completion: Promise<unknown>) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await completion;
}

async function waitUntilReady(run: Awaited<ReturnType<typeof launch>>) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (run.child.exitCode !== null || run.child.signalCode !== null) {
      assert.fail(`Server exited before becoming ready: ${run.output()}`);
    }
    try {
      const response = await fetch(`${run.base}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        const body = await response.json();
        assert.equal(body.data.stage, 'P-08');
        assert.equal(body.data.capabilities.database, true);
        return;
      }
    } catch { /* The process may still be binding its listener. */ }
    await delay(75);
  }
  assert.fail(`Server did not become ready: ${run.output()}`);
}

test('disk records survive actual server shutdown/restart after both insert and update', { timeout: 45_000 }, async t => {
  const { directory, dbPath } = fixture(t);
  let db = openDatabase(dbPath, { create: true });
  const input: ContentInput = {
    kind: 'notice', slug: 'restart-verification', title: '[예시] 재시작 보존 시험',
    bodyHtml: '<p>테스트 전용 저장 내용입니다.</p>', publication: 'public',
  };
  let saved;
  try {
    await migrateDatabase(db, resolve('migrations'), join(directory, 'backups'));
    saved = await new ContentRepository(db).create(input);
  } finally { db.close(); }
  let changed = saved;

  const first = await launch(dbPath);
  try {
    await waitUntilReady(first);
    const response = await fetch(`${first.base}/api/public/contents/${saved.id}`);
    assert.equal(response.status, 200);
    const record = (await response.json()).data;
    assert.equal(record.title, input.title);
    assert.equal(record.revision, 1);
    // A separate database connection writes while the API is alive. The next
    // HTTP read proves the API observes the committed disk/WAL transaction.
    db = openDatabase(dbPath);
    try {
      changed = await new ContentRepository(db).update(saved.id, {
        ...input, title: '[예시] 서버 실행 중 수정한 제목', bodyHtml: '<p>수정 내용도 재시작 후 유지됩니다.</p>',
      }, saved.revision);
    } finally { db.close(); }
    const updatedResponse = await fetch(`${first.base}/api/public/contents/${saved.id}`);
    assert.equal(updatedResponse.status, 200);
    assert.equal((await updatedResponse.json()).data.revision, 2);
  } finally {
    await stop(first.child, first.completion);
  }
  const second = await launch(dbPath);
  try {
    await waitUntilReady(second);
    assert.notEqual(second.child.pid, first.child.pid);
    const response = await fetch(`${second.base}/api/public/contents/${saved.id}`);
    assert.equal(response.status, 200);
    const record = (await response.json()).data;
    assert.equal(record.title, changed.title);
    assert.equal(record.bodyHtml, changed.bodyHtml);
    assert.equal(record.id, saved.id);
    assert.equal(record.slug, saved.slug);
    assert.equal(record.revision, 2);
    const listResponse = await fetch(`${second.base}/api/public/contents?kind=notice`);
    const list = await listResponse.json();
    assert.equal(list.pagination.total, 1, 'Starting the server must not re-inject seed records.');
  } finally {
    await stop(second.child, second.completion);
  }

  db = openDatabase(dbPath);
  try {
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }).count, 1);
    assert.equal((await new ContentRepository(db).getById(saved.id))?.revision, 2);
  } finally { db.close(); }
});

test('server startup refuses missing and unmigrated databases without creating schema or seeds', { timeout: 30_000 }, async t => {
  const { dbPath } = fixture(t);
  const missing = await launch(dbPath);
  try {
    const result = await Promise.race([missing.completion, delay(10_000, undefined, { ref: false }).then(() => { throw new Error('Missing DB startup did not fail promptly.'); })]);
    assert.notEqual((result as unknown[])[0], 0);
    assert.equal(existsSync(dbPath), false);
    assert.match(missing.output(), /migrat|database|db:migrate/i);
  } finally { await stop(missing.child, missing.completion); }

  const empty = openDatabase(dbPath, { create: true });
  empty.close();
  const unmigrated = await launch(dbPath);
  try {
    const result = await Promise.race([unmigrated.completion, delay(10_000, undefined, { ref: false }).then(() => { throw new Error('Unmigrated DB startup did not fail promptly.'); })]);
    assert.notEqual((result as unknown[])[0], 0);
    assert.match(unmigrated.output(), /migrat|database|db:migrate/i);
  } finally { await stop(unmigrated.child, unmigrated.completion); }
  const reopened = openDatabase(dbPath);
  try {
    assert.equal(reopened.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length, 0);
  } finally { reopened.close(); }
});
