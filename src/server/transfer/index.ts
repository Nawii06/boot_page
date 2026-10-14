import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, copyFileSync, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync,
  rmSync, writeFileSync, writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import type { AppConfig } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { assertMigrationsCurrent, migrateDatabase, readMigrations } from '../db/migrations.js';
import { validateFileBytes, type FileExtension } from '../files/formats.js';
import {
  ContentTransferError, conflict, invalid, MAX_MANIFEST_BYTES, storageKey, tableColumns, tableNames,
  validatePackage, type ContentPackage, type Row, type TableName, type Tables,
} from './format.js';

export { ContentTransferError } from './format.js';
export type { ContentPackage, TableName, Tables } from './format.js';

export interface TransferSummary {
  packagePath: string;
  counts: Record<TableName, number>;
  fileCount: number;
  totalFileBytes: number;
  targetDbPath?: string;
  uploadDirectory?: string;
}

function within(parent: string, child: string): boolean {
  const part = relative(parent, child);
  return !part || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}
function stat(path: string) {
  try { return lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

/** Includes ancestors and dangling links. Windows junctions also report isSymbolicLink(). */
function noLinks(path: string): void {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const segment of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, segment);
    const entry = stat(current);
    if (!entry) continue;
    if (entry.isSymbolicLink()) invalid('Symbolic links and junctions are not allowed in transfer paths.');
    if (current !== absolute && !entry.isDirectory()) invalid('A transfer path parent is not a directory.');
  }
}

function regular(path: string): void {
  noLinks(path);
  if (!stat(path)?.isFile()) invalid('A required package or attachment file is missing or not a regular file.');
}

function safeKeyPath(root: string, key: unknown): string {
  storageKey(key);
  const destination = resolve(root, ...key.split('/'));
  if (!within(root, destination) || destination === resolve(root)) invalid('File path leaves its storage directory.');
  noLinks(destination);
  return destination;
}

function privatePath(config: AppConfig, path: string): void {
  noLinks(path);
  const root = resolve(config.projectRoot);
  if (resolve(path) === root || ['src', 'public', 'dist', 'node_modules', 'docs', 'scripts', 'migrations', 'seed', '.git']
    .some(folder => within(resolve(root, folder), resolve(path)))) invalid('Transfer output must be outside source and publicly served directories.');
}

function nonOverlapping(config: AppConfig, packagePath: string): void {
  const db = resolve(config.dbPath);
  const uploads = resolve(config.uploadDirectory);
  if (within(uploads, db) || within(db, uploads) || within(uploads, packagePath) || within(packagePath, uploads) || within(packagePath, db) || within(db, packagePath)) {
    invalid('Database, upload directory and content package paths must not overlap.');
  }
}

function sidecarsAbsent(dbPath: string): void {
  for (const suffix of ['-wal', '-shm', '-journal']) if (stat(`${dbPath}${suffix}`)) conflict('An existing database sidecar conflicts with the new destination. Choose a clean destination.');
}

function emptyUploadDirectory(path: string): boolean {
  noLinks(path);
  const entry = stat(path);
  if (entry && (!entry.isDirectory() || readdirSync(path).length !== 0)) conflict('The destination upload directory is not empty. Existing files are never overwritten.');
  return !!entry;
}

function packageTree(path: string, pkg: ContentPackage): void {
  noLinks(path);
  if (!stat(path)?.isDirectory()) invalid('Content package must be a directory.');
  noLinks(join(path, 'files'));
  if (!stat(join(path, 'files'))?.isDirectory()) invalid('Package attachment directory is missing.');
  const expectedFiles = new Set(['manifest.json', ...pkg.tables.files.map(file => `files/${file.storage_key}`)]);
  const expectedDirectories = new Set(['files']);
  for (const file of expectedFiles) {
    const parts = file.split('/');
    for (let index = 1; index < parts.length; index++) expectedDirectories.add(parts.slice(0, index).join('/'));
  }
  let entries = 0;
  const walk = (directory: string, key = '') => {
    for (const name of readdirSync(directory)) {
      if (++entries > 200_000) invalid('Package contains too many filesystem entries.');
      const childKey = key ? `${key}/${name}` : name;
      const child = join(directory, name);
      const item = lstatSync(child);
      if (item.isSymbolicLink()) invalid('Package symlinks and junctions are not allowed.');
      if (item.isDirectory() && expectedDirectories.has(childKey)) walk(child, childKey);
      else if (!item.isFile() || !expectedFiles.delete(childKey)) invalid('Package contains unexpected files, directories or duplicate paths.');
    }
  };
  walk(path);
  if (expectedFiles.size) invalid('Package is missing a declared file.');
}

/** Hash and copy one open descriptor, so the validated bytes are exactly the staged bytes. */
function copyChecked(source: string, destination: string, row: Row): void {
  regular(source);
  const from = openSync(source, 'r');
  let to: number | undefined;
  try {
    const info = fstatSync(from);
    if (!info.isFile() || info.size !== row.size) invalid('Attachment size differs from its metadata.');
    mkdirSync(dirname(destination), { recursive: true });
    noLinks(dirname(destination));
    to = openSync(destination, 'wx', 0o600);
    const hash = createHash('sha256');
    const block = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    let length: number;
    while ((length = readSync(from, block, 0, block.length, null)) > 0) {
      total += length;
      if (total > (row.size as number)) invalid('Attachment changed while being copied.');
      hash.update(block.subarray(0, length));
      let written = 0;
      while (written < length) written += writeSync(to, block, written, length - written);
    }
    if (total !== row.size || hash.digest('hex') !== row.sha256) invalid('Attachment SHA-256 or size differs from its metadata.');
    fsyncSync(to);
  } finally { closeSync(from); if (to !== undefined) closeSync(to); }
}

function writeManifest(path: string, pkg: ContentPackage) {
  const bytes = Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  if (bytes.length > MAX_MANIFEST_BYTES) invalid('Content manifest exceeds 64 MiB.');
  const file = openSync(path, 'wx', 0o600);
  try { writeFileSync(file, bytes); fsyncSync(file); } finally { closeSync(file); }
}

function summary(path: string, pkg: ContentPackage): TransferSummary {
  return {
    packagePath: path,
    counts: Object.fromEntries(tableNames.map(name => [name, pkg.tables[name].length])) as Record<TableName, number>,
    fileCount: pkg.tables.files.length,
    totalFileBytes: pkg.tables.files.reduce((total, row) => total + (row.size as number), 0),
  };
}

function boundedFiles(pkg: ContentPackage, config: AppConfig) {
  const total = pkg.tables.files.reduce((sum, file) => {
    if ((file.size as number) > config.maxUploadBytes) invalid('An attachment exceeds MAX_UPLOAD_MB for this environment.');
    return sum + (file.size as number);
  }, 0);
  if (!Number.isSafeInteger(total) || total > config.maxStorageBytes) invalid('Package attachments exceed MAX_STORAGE_MB for this environment.');
}

function insertRows(db: Database.Database, pkg: ContentPackage): void {
  // Both identifiers and column names are fixed application constants; all package values are bindings.
  for (const table of tableNames) {
    const columns = tableColumns[table];
    const insert = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    for (const row of pkg.tables[table]) insert.run(...columns.map(column => row[column]));
  }
  if ((db.pragma('foreign_key_check') as unknown[]).length || db.pragma('integrity_check', { simple: true }) !== 'ok') invalid('Restored content failed database integrity checks.');
}

function schemaIdentity(db: Database.Database): string {
  return JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
}

function assertEmptyDatabase(db: Database.Database, expectedSchema: string, migrationsDirectory: string): void {
  assertMigrationsCurrent(db, migrationsDirectory);
  if (schemaIdentity(db) !== expectedSchema) conflict('Destination schema differs from the current application schema.');
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  for (const table of tables) {
    if (table.name !== 'schema_migrations' && db.prepare(`SELECT 1 FROM "${table.name.replaceAll('"', '""')}" LIMIT 1`).get()) {
      conflict('The destination database contains content, accounts or runtime data. Import only into a new or completely empty migrated database.');
    }
  }
}

function ownStage(parent: string, prefix: string): string {
  noLinks(parent);
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, prefix));
}

/** Only remove an explicitly created stage, never an input, destination or computed user-data tree. */
function cleanStage(stage: string | undefined, parent: string): void {
  if (stage && dirname(stage) === resolve(parent) && basename(stage).startsWith('.content-transfer-') && stat(stage)?.isDirectory() && !lstatSync(stage).isSymbolicLink()) {
    rmSync(stage, { recursive: true, force: true });
  }
}

/** Blocks application writers until logical rows and every registered attachment have been copied. */
export async function exportContentPackage(config: AppConfig, outputPath: string): Promise<TransferSummary> {
  const output = resolve(outputPath);
  privatePath(config, output); nonOverlapping(config, output); regular(config.dbPath);
  if (stat(output)) conflict('Export destination already exists. Choose a new package directory.');
  const migrations = readMigrations(config.migrationsDirectory);
  let stage: string | undefined;
  let db: Database.Database | undefined;
  try {
    stage = ownStage(dirname(output), '.content-transfer-export-');
    mkdirSync(join(stage, 'files'));
    db = openDatabase(config.dbPath);
    const connection = db;
    const pkg = connection.transaction(() => {
      assertMigrationsCurrent(connection, config.migrationsDirectory);
      if ((connection.pragma('foreign_key_check') as unknown[]).length) invalid('Source database has broken foreign-key references.');
      const tables = Object.fromEntries(tableNames.map(name => {
        const columns = tableColumns[name];
        return [name, connection.prepare(`SELECT ${columns.join(',')} FROM ${name} ORDER BY ${columns.join(',')}`).all()];
      })) as Tables;
      const value = validatePackage({ format: 'bootcamp-content', formatVersion: 1, schemaVersion: migrations.at(-1)!.version,
        migrations: migrations.map(({ version, filename, checksum }) => ({ version, filename, checksum })),
        exportedAt: new Date().toISOString(), tables }, migrations);
      boundedFiles(value, config);
      for (const file of value.tables.files) copyChecked(safeKeyPath(config.uploadDirectory, file.storage_key), safeKeyPath(join(stage!, 'files'), file.storage_key), file);
      writeManifest(join(stage!, 'manifest.json'), value);
      return value;
    }).immediate();
    db.close(); db = undefined;
    noLinks(output);
    if (stat(output)) conflict('Export destination appeared during export. Existing data was preserved.');
    renameSync(stage, output);
    stage = undefined;
    return summary(output, pkg);
  } finally { db?.close(); cleanStage(stage, dirname(output)); }
}

/** Restore private bytes first, then make the entire logical dataset visible in one SQLite commit. */
export async function importContentPackage(config: AppConfig, inputPath: string): Promise<TransferSummary> {
  const input = resolve(inputPath);
  const dbPath = resolve(config.dbPath);
  const uploads = resolve(config.uploadDirectory);
  privatePath(config, dbPath); privatePath(config, uploads); nonOverlapping(config, input);
  regular(join(input, 'manifest.json'));
  if (lstatSync(join(input, 'manifest.json')).size > MAX_MANIFEST_BYTES) invalid('Content manifest exceeds 64 MiB.');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(join(input, 'manifest.json')))); } catch { invalid('Manifest is not valid UTF-8 JSON.'); }
  const pkg = validatePackage(parsed, readMigrations(config.migrationsDirectory));
  boundedFiles(pkg, config); packageTree(input, pkg);
  emptyUploadDirectory(uploads);
  const targetExisted = !!stat(dbPath);
  if (targetExisted) regular(dbPath); else sidecarsAbsent(dbPath);
  let stage: string | undefined;
  let fileStage: string | undefined;
  let stagedDb: Database.Database | undefined;
  let destinationDb: Database.Database | undefined;
  let filesPublished = false;
  try {
    stage = ownStage(dirname(dbPath), '.content-transfer-database-');
    const stagedDbPath = join(stage, 'content.sqlite');
    stagedDb = openDatabase(stagedDbPath, { create: true });
    await migrateDatabase(stagedDb, config.migrationsDirectory, join(stage, 'backups'));
    const expectedSchema = schemaIdentity(stagedDb);
    try { stagedDb.transaction(() => insertRows(stagedDb!, pkg)).immediate(); }
    catch (error) { if (error instanceof ContentTransferError) throw error; invalid('Package records violate the current schema or reference constraints.'); }

    // Never build or repair an existing destination implicitly.
    if (targetExisted) {
      destinationDb = openDatabase(dbPath);
      assertEmptyDatabase(destinationDb, expectedSchema, config.migrationsDirectory);
    }

    fileStage = ownStage(dirname(uploads), '.content-transfer-files-');
    for (const file of pkg.tables.files) {
      const stagedFile = safeKeyPath(fileStage, file.storage_key);
      copyChecked(safeKeyPath(join(input, 'files'), file.storage_key), stagedFile, file);
      // Import is another upload boundary: enforce the existing content validators, not only suffix/hash checks.
      const detected = await validateFileBytes(readFileSync(stagedFile), file.extension as FileExtension, config);
      if (detected !== file.media_type) invalid('Attachment media type does not match the validated file format.');
    }
    stagedDb.pragma('wal_checkpoint(TRUNCATE)');
    stagedDb.pragma('journal_mode = DELETE');
    stagedDb.close(); stagedDb = undefined;

    const publishFiles = () => {
      const exists = emptyUploadDirectory(uploads);
      // Set before the first destination write: an interrupted/failed copy may leave private bytes.
      filesPublished = true;
      if (!exists) { renameSync(fileStage!, uploads); fileStage = undefined; }
      else {
        // An existing empty folder may belong to the operator. Preserve it and create only new files.
        for (const file of pkg.tables.files) {
          const destination = safeKeyPath(uploads, file.storage_key);
          mkdirSync(dirname(destination), { recursive: true });
          copyFileSync(safeKeyPath(fileStage!, file.storage_key), destination, constants.COPYFILE_EXCL);
          const descriptor = openSync(destination, 'r+');
          try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
        }
      }
    };

    if (destinationDb) {
      const connection = destinationDb;
      connection.transaction(() => {
        assertEmptyDatabase(connection, expectedSchema, config.migrationsDirectory);
        publishFiles();
        insertRows(connection, pkg);
      }).immediate();
      destinationDb.close(); destinationDb = undefined;
    } else {
      noLinks(dbPath);
      if (stat(dbPath)) conflict('Destination database appeared during import. Existing data was preserved.');
      sidecarsAbsent(dbPath);
      publishFiles();
      // The staged DB has no WAL and all rows are committed. A hard link is an atomic no-overwrite
      // publication on the same filesystem; unlike rename(), it cannot replace a competing file.
      linkSync(stagedDbPath, dbPath);
    }
    return { ...summary(input, pkg), targetDbPath: dbPath, uploadDirectory: uploads };
  } catch (error) {
    if (filesPublished) {
      // A crash/error between private byte publication and DB commit leaves only inaccessible files.
      // Preserve them for inspection. The next import refuses this nonempty destination; no reset occurs.
      const reason = error instanceof ContentTransferError ? error.code : 'IO_ERROR';
      throw new ContentTransferError(reason, 'Restore did not complete. Private destination files may remain; no partial content transaction was published. Inspect the destination and choose a new empty path before retrying.');
    }
    throw error;
  } finally {
    stagedDb?.close(); destinationDb?.close();
    cleanStage(stage, dirname(dbPath)); cleanStage(fileStage, dirname(uploads));
  }
}
