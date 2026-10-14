import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

const project = process.cwd();
function fixture() {
  const base = resolve(project, '.cache/tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'source-package-'));
  const roots = ['.env.example', '.gitignore', '.node-version', '.npmrc', 'README.md', 'index.html',
    'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', 'tsconfig.server.json', 'vite.config.ts',
    '로컬 제작 순서 및 VS Code Codex 실행 프롬프트.md', '로컬 제작 순서 및 VS Code Codex 실행 프롬프트.txt'];
  for (const name of roots) copyFileSync(join(project, name), join(root, name));
  for (const name of ['src', 'scripts', 'tests', 'docs', 'migrations', 'seed']) mkdirSync(join(root, name));
  copyFileSync(join(project, 'scripts/package-source.mjs'), join(root, 'scripts/package-source.mjs'));
  writeFileSync(join(root, 'src/example.ts'), 'export const example = true;\n');
  writeFileSync(join(root, 'migrations/001.sql'), 'CREATE TABLE example (id TEXT PRIMARY KEY);\n');
  writeFileSync(join(root, 'seed/example.json'), '[]\n');
  const run = (output: string) => spawnSync(process.execPath, ['scripts/package-source.mjs', '--output', output], { cwd: root, encoding: 'utf8' });
  const cleanup = () => {
    const child = relative(base, root);
    assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
    rmSync(root, { recursive: true });
  };
  return { root, run, cleanup };
}

test('source package excludes runtime/authentication data and records verifiable source hashes', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, '.env'), 'PRIVATE_SENTINEL=fixture-only\n');
    for (const folder of ['var/db', 'var/uploads', 'var/backups', 'node_modules', 'dist', '.cache/private']) {
      mkdirSync(join(f.root, folder), { recursive: true });
      writeFileSync(join(f.root, folder, 'private-sentinel.txt'), 'not source');
    }
    const result = f.run('.cache/release');
    assert.equal(result.status, 0, result.stderr);
    const dest = join(f.root, '.cache/release');
    const manifest = JSON.parse(readFileSync(join(dest, 'source-manifest.json'), 'utf8'));
    assert.equal(manifest.format, 'knut-ai-source');
    assert.ok(manifest.files.some((item: { path: string }) => item.path === 'migrations/001.sql'));
    for (const entry of manifest.files) {
      const bytes = readFileSync(join(dest, entry.path));
      assert.equal(bytes.length, entry.size);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    }
    for (const name of ['.env', 'var', 'node_modules', 'dist', '.cache']) assert.equal(existsSync(join(dest, name)), false);
    assert.equal(JSON.stringify(manifest).includes('PRIVATE_SENTINEL'), false);
  } finally { f.cleanup(); }
});

test('source packaging refuses an existing destination without altering it', () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, 'existing'));
    writeFileSync(join(f.root, 'existing/keep.txt'), 'preserve');
    assert.equal(f.run('existing').status, 1);
    assert.deepEqual(readdirSync(join(f.root, 'existing')), ['keep.txt']);
    assert.equal(readFileSync(join(f.root, 'existing/keep.txt'), 'utf8'), 'preserve');
    assert.equal(f.run('src/new-output').status, 1);
    assert.equal(existsSync(join(f.root, 'src/new-output')), false);
  } finally { f.cleanup(); }
});

test('source packaging rejects private files within source trees before writing output', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'docs/accidental.sqlite'), 'fixture-only');
    assert.equal(f.run('release').status, 1);
    assert.equal(existsSync(join(f.root, 'release')), false);
  } finally { f.cleanup(); }
});

test('source packaging rejects populated environment examples without printing their values', () => {
  const f = fixture();
  try {
    const sentinel = 'test-only-secret-that-must-not-be-printed';
    writeFileSync(join(f.root, '.env.example'), `EXAMPLE=${sentinel}\n`);
    const result = f.run('release');
    assert.equal(result.status, 1);
    assert.equal(existsSync(join(f.root, 'release')), false);
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
  } finally { f.cleanup(); }
});
