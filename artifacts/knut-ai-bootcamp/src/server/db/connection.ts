import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Runtime connections never silently create an empty database. Initialization is an explicit CLI action. */
export function openDatabase(dbPath: string, options: { create?: boolean } = {}): Database.Database {
  if (!dbPath.trim() || dbPath === ':memory:') throw new Error('A persistent SQLite file path is required.');
  const filename = resolve(dbPath);
  if (options.create) mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename, { fileMustExist: !options.create, timeout: 5000 });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
