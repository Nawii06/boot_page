import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { asDataDatabase, type DataDatabase } from '../db/dataDatabase.js';
import { hashPassword } from './passwords.js';

export interface AdminIdentity { id: string; username: string }

/** Restrict identifiers to an unambiguous, case-insensitive local account namespace. */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const username = value.toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,99}$/.test(username) ? username : null;
}

export async function createAdmin(db: DataDatabase | Database.Database, usernameInput: string, password: string): Promise<AdminIdentity> {
  const database = asDataDatabase(db);
  const username = normalizeUsername(usernameInput);
  if (!username) throw new Error('Username must contain 3 to 100 ASCII letters, digits, dots, underscores or hyphens, beginning with a letter or digit.');
  if (await database.prepare('SELECT id FROM admins WHERE username = ?').get(username)) throw new Error('The administrator already exists. Use the explicit reset command to change its password.');
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const now = new Date().toISOString();
  await database.transaction(async () => {
    if (await database.prepare('SELECT id FROM admins WHERE username = ?').get(username)) throw new Error('The administrator already exists. No changes were made.');
    await database.prepare('INSERT INTO admins(id, username, password_hash, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
      .run(id, username, passwordHash, now, now);
  }).immediate();
  return { id, username };
}

/** Reset is explicit and revokes every session; it does not silently re-enable a disabled account. */
export async function resetAdmin(db: DataDatabase | Database.Database, usernameInput: string, password: string): Promise<AdminIdentity> {
  const database = asDataDatabase(db);
  const username = normalizeUsername(usernameInput);
  if (!username) throw new Error('Username is invalid.');
  const previous = await database.prepare('SELECT id, password_hash, enabled FROM admins WHERE username = ?').get(username) as { id: string; password_hash: string; enabled: number } | undefined;
  if (!previous) throw new Error('The administrator does not exist. Use the create command first.');
  if (!previous.enabled) throw new Error('The administrator is disabled. Password reset does not re-enable accounts.');
  const passwordHash = await hashPassword(password);
  await database.transaction(async () => {
    const current = await database.prepare('SELECT password_hash, enabled FROM admins WHERE id = ?').get(previous.id) as { password_hash: string; enabled: number } | undefined;
    if (!current || !current.enabled || current.password_hash !== previous.password_hash) throw new Error('The account changed during password entry. Retry after stopping other account writers.');
    await database.prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, new Date().toISOString(), previous.id);
    await database.prepare('DELETE FROM sessions WHERE admin_id = ?').run(previous.id);
  }).immediate();
  return { id: previous.id, username };
}
