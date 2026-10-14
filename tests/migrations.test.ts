import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { openDatabase } from '../src/server/db/connection.js';
import { assertMigrationsCurrent, migrateDatabase, readMigrations } from '../src/server/db/migrations.js';

const cacheRoot = resolve('.cache/tests');
mkdirSync(cacheRoot, { recursive: true });

function fixture() {
  const root = mkdtempSync(join(cacheRoot, 'migrations-'));
  const migrations = join(root, 'migrations');
  const backups = join(root, 'backups');
  const dbPath = join(root, 'nested', 'test.sqlite');
  mkdirSync(migrations);
  writeFileSync(join(migrations, '001_initial.sql'), readFileSync(resolve('migrations/001_initial.sql')));
  return {
    root, migrations, backups, dbPath,
    cleanup() {
      const boundary = relative(cacheRoot, root);
      if (!boundary || boundary.startsWith('..') || resolve(cacheRoot, boundary) !== root) throw new Error('Unsafe fixture cleanup');
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('persistent connection requires explicit creation and enables SQLite integrity settings', async () => {
  const f = fixture();
  try {
    assert.throws(() => openDatabase(f.dbPath));
    assert.throws(() => openDatabase(':memory:', { create: true }), /persistent/);
    const db = openDatabase(f.dbPath, { create: true });
    try {
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
      assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
      assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);
      assert.throws(() => assertMigrationsCurrent(db, f.migrations), /pending/);
      const result = await migrateDatabase(db, f.migrations, f.backups);
      assert.deepEqual(result, { applied: ['001'], backupPath: null });
      assertMigrationsCurrent(db, f.migrations);
    } finally { db.close(); }
    const reopened = openDatabase(f.dbPath);
    try { assertMigrationsCurrent(reopened, f.migrations); } finally { reopened.close(); }
  } finally { f.cleanup(); }
});

test('repeat migration does not change the ledger or content and makes no redundant backup', async () => {
  const f = fixture();
  const db = openDatabase(f.dbPath, { create: true });
  try {
    await migrateDatabase(db, f.migrations, f.backups);
    const before = db.prepare('SELECT * FROM schema_migrations').all();
    assert.deepEqual(await migrateDatabase(db, f.migrations, f.backups), { applied: [], backupPath: null });
    assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(), before);
    assertMigrationsCurrent(db, f.migrations);
  } finally { db.close(); f.cleanup(); }
});

test('changed, unknown, missing, and nonconsecutive migration histories fail without changing the DB', async () => {
  const f = fixture();
  const db = openDatabase(f.dbPath, { create: true });
  try {
    await migrateDatabase(db, f.migrations, f.backups);
    const original = readFileSync(join(f.migrations, '001_initial.sql'), 'utf8');
    writeFileSync(join(f.migrations, '001_initial.sql'), `${original}\n-- changed\n`);
    await assert.rejects(migrateDatabase(db, f.migrations, f.backups), /changed/);
    assert.throws(() => assertMigrationsCurrent(db, f.migrations), /changed/);
    writeFileSync(join(f.migrations, '001_initial.sql'), original);
    db.prepare('UPDATE schema_migrations SET version = ? WHERE version = ?').run('999', '001');
    await assert.rejects(migrateDatabase(db, f.migrations, f.backups), /Unknown/);
    db.prepare('UPDATE schema_migrations SET version = ? WHERE version = ?').run('001', '999');
    writeFileSync(join(f.migrations, '003_skip.sql'), 'CREATE TABLE skipped (id INTEGER);');
    assert.throws(() => readMigrations(f.migrations), /consecutively/);
    rmSync(join(f.migrations, '003_skip.sql'));
    rmSync(join(f.migrations, '001_initial.sql'));
    assert.throws(() => assertMigrationsCurrent(db, f.migrations), /No SQL/);
    assert.equal((db.prepare('SELECT count(*) AS n FROM schema_migrations').get() as { n: number }).n, 1);
  } finally { db.close(); f.cleanup(); }
});

test('unknown preexisting DB is preserved and never adopted or initialized', async () => {
  const f = fixture();
  const db = openDatabase(f.dbPath, { create: true });
  try {
    db.exec('CREATE TABLE valuable_data (value TEXT NOT NULL) STRICT;');
    db.prepare('INSERT INTO valuable_data VALUES (?)').run('preserve-this-record');
    await assert.rejects(migrateDatabase(db, f.migrations, f.backups), /no migration ledger/);
    assert.deepEqual(db.prepare('SELECT * FROM valuable_data').all(), [{ value: 'preserve-this-record' }]);
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'contents'").get(), undefined);
  } finally { db.close(); f.cleanup(); }
});

test('pending migrations back up WAL data first and apply atomically; failed DDL is rolled back', async () => {
  const f = fixture();
  const db = openDatabase(f.dbPath, { create: true });
  try {
    await migrateDatabase(db, f.migrations, f.backups);
    db.prepare('INSERT INTO seed_runs (key, checksum, applied_at) VALUES (?, ?, ?)').run('preserve-me', 'a'.repeat(64), new Date().toISOString());
    writeFileSync(join(f.migrations, '002_second.sql'), 'CREATE TABLE migration_probe (value TEXT NOT NULL) STRICT;');
    writeFileSync(join(f.migrations, '003_failure.sql'), 'INSERT INTO table_that_does_not_exist VALUES (1);');
    assert.throws(() => assertMigrationsCurrent(db, f.migrations), /pending/);
    await assert.rejects(migrateDatabase(db, f.migrations, f.backups), /no such table/);
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'migration_probe'").get(), undefined);
    assert.equal((db.prepare('SELECT count(*) AS n FROM schema_migrations').get() as { n: number }).n, 1);
    const backupFiles = readdirSync(f.backups).filter(filename => filename.endsWith('.sqlite'));
    assert.equal(backupFiles.length, 1);
    const backup = openDatabase(join(f.backups, backupFiles[0]));
    try {
      assert.equal((backup.prepare('SELECT key FROM seed_runs').get() as { key: string }).key, 'preserve-me');
      assert.equal(backup.prepare("SELECT name FROM sqlite_schema WHERE name = 'migration_probe'").get(), undefined);
      assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    } finally { backup.close(); }
    // The failed file was never recorded: correcting it in this isolated fixture can be retried safely.
    writeFileSync(join(f.migrations, '003_failure.sql'), 'INSERT INTO migration_probe (value) VALUES (\'saved\');');
    const completed = await migrateDatabase(db, f.migrations, f.backups);
    assert.deepEqual(completed.applied, ['002', '003']);
    assert.ok(completed.backupPath);
    assert.notEqual(completed.backupPath, join(f.backups, backupFiles[0]));
    assert.deepEqual(db.prepare('SELECT * FROM migration_probe').all(), [{ value: 'saved' }]);
    assertMigrationsCurrent(db, f.migrations);
  } finally { db.close(); f.cleanup(); }
});

test('a failure in the initial migration leaves no partial schema or ledger', async () => {
  const f = fixture();
  const db = openDatabase(f.dbPath, { create: true });
  try {
    writeFileSync(join(f.migrations, '001_initial.sql'), 'CREATE TABLE partial (id INTEGER); INSERT INTO missing VALUES (1);');
    await assert.rejects(migrateDatabase(db, f.migrations, f.backups), /no such table/);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all(), []);
  } finally { db.close(); f.cleanup(); }
});
