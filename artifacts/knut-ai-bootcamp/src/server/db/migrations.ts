import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export interface Migration {
  version: string;
  filename: string;
  sql: string;
  checksum: string;
}

interface AppliedMigration {
  version: string;
  filename: string;
  checksum: string;
}

const ledgerSql = `CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY NOT NULL,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK(length(checksum) = 64),
  applied_at TEXT NOT NULL
) STRICT;`;

/** Published migration files are immutable; add the next numbered file instead of editing one. */
export function readMigrations(directory: string): Migration[] {
  const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error('No SQL migrations were found.');
  return files.map((filename, index) => {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(filename);
    if (!match || Number(match[1]) !== index + 1) {
      throw new Error(`Migrations must be consecutively numbered from 001: ${filename}`);
    }
    const sql = readFileSync(join(directory, filename), 'utf8');
    if (!sql.trim()) throw new Error(`Migration is empty: ${filename}`);
    // Normalize line endings so Windows checkout settings cannot change a migration's identity.
    const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
    return { version: match[1], filename, sql, checksum };
  });
}

function migrationState(db: Database.Database, migrations: Migration[]) {
  const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  const hasLedger = objects.some(item => item.name === 'schema_migrations');
  if (!hasLedger && objects.length > 0) {
    throw new Error('Existing database has no migration ledger. Refusing to change it; preserve and inspect it first.');
  }
  const applied = hasLedger
    ? db.prepare('SELECT version, filename, checksum FROM schema_migrations ORDER BY version').all() as AppliedMigration[]
    : [];
  for (const [index, entry] of applied.entries()) {
    const expected = migrations[index];
    if (!expected || expected.version !== entry.version) {
      throw new Error(`Unknown, missing, or out-of-order applied migration: ${entry.version}`);
    }
    if (entry.filename !== expected.filename || entry.checksum !== expected.checksum) {
      throw new Error(`Applied migration was changed: ${entry.version}. Restore the original file and add a new migration.`);
    }
  }
  if (hasLedger && applied.length === 0 && objects.length > 1) {
    throw new Error('Existing schema has an empty migration ledger. Refusing to overwrite an unknown database.');
  }
  return { hasLedger, hasObjects: objects.length > 0, pending: migrations.slice(applied.length) };
}

export function assertMigrationsCurrent(db: Database.Database, directory: string): void {
  const state = migrationState(db, readMigrations(directory));
  if (!state.hasLedger || state.pending.length > 0) {
    throw new Error('Database migrations are pending. Stop the server and run npm.cmd run db:migrate.');
  }
}

export async function migrateDatabase(
  db: Database.Database,
  directory: string,
  backupDirectory: string,
): Promise<{ applied: string[]; backupPath: string | null }> {
  if (db.inTransaction) throw new Error('Run migrations outside an existing transaction.');
  const migrations = readMigrations(directory);
  const before = migrationState(db, migrations);
  if (before.pending.length === 0) return { applied: [], backupPath: null };

  console.info(`Pending database migrations: ${before.pending.map(item => item.version).join(', ')}`);
  let backupPath: string | null = null;
  if (before.hasObjects) {
    const targetDirectory = resolve(backupDirectory);
    mkdirSync(targetDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = join(targetDirectory, `${basename(db.name)}.before-${before.pending[0].version}-${timestamp}-${randomUUID()}.sqlite`);
    // SQLite's online backup API includes committed WAL data in a consistent standalone snapshot.
    await db.backup(backupPath);
    console.info(`Database backup created before applying changes: ${backupPath}`);
  }

  const applied: string[] = [];
  db.transaction(() => {
    const current = migrationState(db, migrations);
    if (current.pending.map(item => item.version).join(',') !== before.pending.map(item => item.version).join(',')) {
      throw new Error('Migration state changed while preparing the backup. Retry after stopping other database writers.');
    }
    if (!current.hasLedger) db.exec(ledgerSql);
    const record = db.prepare('INSERT INTO schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)');
    for (const migration of current.pending) {
      db.exec(migration.sql);
      record.run(migration.version, migration.filename, migration.checksum, new Date().toISOString());
      applied.push(migration.version);
    }
    const foreignKeyErrors = db.pragma('foreign_key_check') as unknown[];
    if (foreignKeyErrors.length > 0) throw new Error('Migration would violate database foreign keys.');
  }).immediate();

  return { applied, backupPath };
}
