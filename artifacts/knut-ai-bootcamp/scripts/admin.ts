import type Database from 'better-sqlite3';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { assertMigrationsCurrent } from '../src/server/db/migrations.js';
import { createAdmin, normalizeUsername, resetAdmin } from '../src/server/auth/adminAccounts.js';
import { passwordWithinLimits } from '../src/server/auth/passwords.js';
import { readHiddenPassword } from './hiddenInput.js';

let database: Database.Database | undefined;
try {
  const [command, flag, rawUsername, ...other] = process.argv.slice(2);
  if (!['create', 'reset'].includes(command) || flag !== '--username' || !rawUsername || other.length) {
    throw new Error('Use pnpm run admin:create --username USERNAME or pnpm run admin:reset --username USERNAME in Replit; on Windows, use npm.cmd run admin:create -- --username USERNAME or npm.cmd run admin:reset -- --username USERNAME. Never pass passwords as arguments or environment variables.');
  }
  const username = normalizeUsername(rawUsername);
  if (!username) throw new Error('Username must contain 3 to 100 ASCII letters, digits, dots, underscores or hyphens, beginning with a letter or digit.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run administrator setup in an interactive terminal. Piped input and redirected output are not accepted.');
  if (existsSync('.env')) loadEnvFile('.env');
  const config = loadConfig();
  database = openDatabase(config.dbPath);
  assertMigrationsCurrent(database, config.migrationsDirectory);
  const existing = database.prepare('SELECT id, enabled FROM admins WHERE username = ?').get(username) as { id: string; enabled: number } | undefined;
  if (command === 'create' && existing) throw new Error('The administrator already exists. Use admin:reset explicitly to change its password.');
  if (command === 'reset' && !existing) throw new Error('The administrator does not exist. Use admin:create first.');
  if (command === 'reset' && !existing?.enabled) throw new Error('The administrator is disabled. Password reset does not re-enable accounts.');
  console.log(command === 'create'
    ? 'Create a designated local administrator. Existing accounts and content will not be overwritten.'
    : 'Reset this administrator password and invalidate all of its sessions. Existing content will not change.');
  console.log('Stop other database writers first. Enter 15 to 128 characters. Input is hidden; Ctrl+C cancels, Backspace removes one character, Ctrl+U clears the input.');
  let password = await readHiddenPassword('New password: ');
  if (!passwordWithinLimits(password)) throw new Error('Password must contain 15 to 128 characters (up to 512 UTF-8 bytes). No password was saved.');
  let confirmation = await readHiddenPassword('Confirm password: ');
  const first = Buffer.from(password, 'utf8');
  const second = Buffer.from(confirmation, 'utf8');
  const matches = first.length === second.length && timingSafeEqual(first, second);
  first.fill(0);
  second.fill(0);
  confirmation = '';
  if (!matches) { password = ''; throw new Error('Passwords did not match. No password was saved.'); }
  mkdirSync(config.backupDirectory, { recursive: true });
  const snapshot = join(config.backupDirectory, `${basename(config.dbPath)}.before-admin-${command}-${randomUUID()}.sqlite`);
  await database.backup(snapshot);
  console.log(`Database backup created before account changes: ${snapshot}`);
  try {
    const account = command === 'create' ? await createAdmin(database, username, password) : await resetAdmin(database, username, password);
    console.log(`Administrator ${command === 'create' ? 'created' : 'password reset; existing sessions invalidated'}: ${account.username}`);
  } finally { password = ''; }
} catch (error) {
  // SQLite/OS errors may contain local configuration paths, but no query parameters or password inputs are logged.
  console.error(error instanceof Error ? error.message : 'Administrator setup failed.');
  process.exitCode = 1;
} finally {
  if (database?.open) database.close();
}
