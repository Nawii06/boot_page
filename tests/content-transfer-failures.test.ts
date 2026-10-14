import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, type AppConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';
import { FileService } from '../src/server/files/service.js';
import { exportContentPackage, importContentPackage } from '../src/server/transfer/index.js';
import { pdfFixture } from './helpers/documents.js';

const root = resolve('.');
const cache = resolve('.cache/tests');
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');

function workspace(t: TestContext) {
  mkdirSync(cache, { recursive: true });
  const path = mkdtempSync(join(cache, 'p09-transfer-fault-'));
  t.after(() => {
    const inside = relative(cache, path);
    assert.ok(inside && inside !== '..' && !inside.startsWith('..\\') && !inside.startsWith('../') && !isAbsolute(inside));
    assert.equal(resolve(cache, inside), path);
    rmSync(path, { recursive: true, force: true });
  });
  return path;
}

function configAt(directory: string): AppConfig {
  return { ...loadConfig({}, directory), migrationsDirectory: resolve('migrations') };
}

async function sourceAt(directory: string) {
  const config = configAt(directory);
  const db = openDatabase(config.dbPath, { create: true });
  try {
    await migrateDatabase(db, config.migrationsDirectory, config.backupDirectory);
    const files = new FileService(db, config);
    const first = await files.saveUpload('preserved-one.pdf', pdfFixture('fault-one'));
    const second = await files.saveUpload('preserved-two.pdf', pdfFixture('fault-two'));
    new ContentRepository(db).create({ kind: 'notice', slug: 'fault-source', title: '[Example] Restore fault boundary', bodyHtml: '<p>Preserved original body.</p>', publication: 'public', fileIds: [first.id, second.id] });
  } finally { db.close(); }
  const packagePath = join(directory, 'package');
  await exportContentPackage(config, packagePath);
  return { config, packagePath, manifestHash: digest(readFileSync(join(packagePath, 'manifest.json'))) };
}

async function child(scriptPath: string) {
  const process = spawn(globalThis.process.execPath, ['--import', 'tsx', scriptPath], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  process.stdout.on('data', data => { output += data; });
  process.stderr.on('data', data => { output += data; });
  const code = await new Promise<number | null>((resolveCode, reject) => {
    process.once('error', reject); process.once('exit', resolveCode);
  });
  return { code, output };
}

async function faultImport(directory: string, config: AppConfig, packagePath: string, mode: 'link-error' | 'link-exit' | 'copy-error' | 'copy-exit' | 'sql-error' | 'sql-exit') {
  const script = join(directory, `fault-${mode}.mts`);
  // Hooks are isolated in a child process and target one exact fixture destination.
  // No fault injection API or bypass is added to production code.
  writeFileSync(script, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import Database from 'better-sqlite3';
const config = ${JSON.stringify(config)};
const mode = ${JSON.stringify(mode)};
const originalLink = fs.linkSync;
const originalCopy = fs.copyFileSync;
const originalPrepare = Database.prototype.prepare;
Database.prototype.prepare = function(sql) {
  const statement = originalPrepare.call(this, sql);
  if (this.name === config.dbPath && String(sql).startsWith('INSERT INTO contents ')) {
    const originalRun = statement.run;
    statement.run = function(...args) {
      const result = originalRun.apply(this, args);
      if (mode === 'sql-exit') process.exit(75);
      if (mode === 'sql-error') throw Object.assign(new Error('Injected error after inserting a destination content row.'), {code:'EIO'});
      return result;
    };
  }
  return statement;
};
fs.linkSync = function(source, destination) {
  if (String(destination) === config.dbPath) {
    if (mode === 'link-exit') process.exit(73);
    if (mode === 'link-error') throw Object.assign(new Error('Injected database publication failure.'), {code:'EIO'});
  }
  return originalLink(source, destination);
};
fs.copyFileSync = function(source, destination, flags) {
  const result = originalCopy(source, destination, flags);
  if (String(destination).startsWith(config.uploadDirectory)) {
    if (mode === 'copy-exit') process.exit(74);
    if (mode === 'copy-error') throw Object.assign(new Error('Injected destination copy failure.'), {code:'EIO'});
  }
  return result;
};
syncBuiltinESMExports();
const { importContentPackage } = await import(${JSON.stringify(pathToFileURL(resolve('src/server/transfer/index.ts')).href)});
try { await importContentPackage(config, ${JSON.stringify(packagePath)}); process.exitCode = 90; }
catch (error) { console.log('EXPECTED_RESTORE_REJECTION', error.code || 'ERROR'); process.exitCode = 2; }
`, 'utf8');
  return child(script);
}

function assertEmptyDb(config: AppConfig) {
  const db = openDatabase(config.dbPath);
  try {
    assert.equal((db.prepare('SELECT count(*) AS count FROM contents').get() as { count: number }).count, 0);
    assert.equal((db.prepare('SELECT count(*) AS count FROM files').get() as { count: number }).count, 0);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
}

for (const mode of ['link-error', 'link-exit'] as const) {
  test(`restore ${mode} after private files are published leaves no live database and refuses unsafe retry`, async t => {
    const directory = workspace(t), source = await sourceAt(join(directory, 'source'));
    const config = configAt(join(directory, 'destination'));
    const result = await faultImport(directory, config, source.packagePath, mode);
    assert.equal(result.code, mode === 'link-exit' ? 73 : 2, result.output);
    assert.equal(existsSync(config.dbPath), false);
    assert.equal(readdirSync(config.uploadDirectory).length, 2);
    assert.throws(() => openDatabase(config.dbPath));
    await assert.rejects(importContentPackage(config, source.packagePath), /not empty|never overwritten/i);
    assert.equal(digest(readFileSync(join(source.packagePath, 'manifest.json'))), source.manifestHash);
    if (mode === 'link-error') {
      assert.equal(readdirSync(dirname(config.dbPath)).some(name => name.startsWith('.content-transfer-')), false);
      assert.equal(readdirSync(dirname(config.uploadDirectory)).some(name => name.startsWith('.content-transfer-')), false);
    }
  });
}

for (const mode of ['copy-error', 'copy-exit'] as const) {
  test(`restore ${mode} during an existing empty destination keeps the database empty and private orphan files inaccessible`, async t => {
    const directory = workspace(t), source = await sourceAt(join(directory, 'source'));
    const config = configAt(join(directory, 'destination'));
    const db = openDatabase(config.dbPath, { create: true });
    await migrateDatabase(db, config.migrationsDirectory, config.backupDirectory); db.close();
    mkdirSync(config.uploadDirectory, { recursive: true });
    const result = await faultImport(directory, config, source.packagePath, mode);
    assert.equal(result.code, mode === 'copy-exit' ? 74 : 2, result.output);
    assertEmptyDb(config);
    assert.equal(readdirSync(config.uploadDirectory).length, 1);
    await assert.rejects(importContentPackage(config, source.packagePath), /not empty|never overwritten/i);
    assert.equal(digest(readFileSync(join(source.packagePath, 'manifest.json'))), source.manifestHash);
    if (mode === 'copy-error') {
      assert.equal(readdirSync(dirname(config.dbPath)).some(name => name.startsWith('.content-transfer-')), false);
      assert.equal(readdirSync(dirname(config.uploadDirectory)).some(name => name.startsWith('.content-transfer-')), false);
    }
  });
}

for (const mode of ['sql-error', 'sql-exit'] as const) {
  test(`restore ${mode} after a destination row is inserted rolls back the entire logical dataset`, async t => {
    const directory = workspace(t), source = await sourceAt(join(directory, 'source'));
    const config = configAt(join(directory, 'destination'));
    const db = openDatabase(config.dbPath, { create: true });
    await migrateDatabase(db, config.migrationsDirectory, config.backupDirectory); db.close();
    const result = await faultImport(directory, config, source.packagePath, mode);
    assert.equal(result.code, mode === 'sql-exit' ? 75 : 2, result.output);
    assertEmptyDb(config);
    assert.equal(readdirSync(config.uploadDirectory).length, 2);
    await assert.rejects(importContentPackage(config, source.packagePath), /not empty|never overwritten/i);
    assert.equal(digest(readFileSync(join(source.packagePath, 'manifest.json'))), source.manifestHash);
  });
}

test('transfer refuses junction ancestors for source package, destination database and export path', async t => {
  const directory = workspace(t), source = await sourceAt(join(directory, 'source'));
  const physical = join(directory, 'physical'); mkdirSync(physical);
  const junction = join(directory, 'junction'); symlinkSync(physical, junction, 'junction');
  const sourceJunction = join(directory, 'source-junction'); symlinkSync(join(directory, 'source'), sourceJunction, 'junction');
  await assert.rejects(exportContentPackage(source.config, join(junction, 'package')), /links|junction/i);
  const target = configAt(join(directory, 'destination'));
  await assert.rejects(importContentPackage(target, join(sourceJunction, 'package')), /links|junction/i);
  await assert.rejects(importContentPackage({ ...target, dbPath: join(junction, 'nested', 'content.sqlite') }, source.packagePath), /links|junction/i);
  await assert.rejects(importContentPackage({ ...target, uploadDirectory: join(junction, 'uploads') }, source.packagePath), /links|junction/i);
  assert.deepEqual(readdirSync(physical), []);
  assert.equal(existsSync(target.dbPath), false);
  assert.equal(digest(readFileSync(join(source.packagePath, 'manifest.json'))), source.manifestHash);
});
