import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { assertMigrationsCurrent, migrateDatabase } from '../src/server/db/migrations.js';
import { seedExamples } from '../src/server/db/seed.js';

if (existsSync('.env')) loadEnvFile('.env');
let database: Database.Database | undefined;
try {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !['migrate', 'seed', 'status'].includes(command)) {
    throw new Error('Use npm.cmd run db:migrate, db:seed or db:status. No reset/delete command is provided.');
  }
  const config = loadConfig();
  if (command !== 'migrate' && !existsSync(config.dbPath)) {
    throw new Error('Local DB is not initialized. Run npm.cmd run db:migrate first.');
  }
  database = openDatabase(config.dbPath, { create: command === 'migrate' });
  if (command === 'migrate') {
    console.log('Apply pending schema changes only; existing content will not be reset. Stop application writers before migration.');
    const result = await migrateDatabase(database, config.migrationsDirectory, config.backupDirectory);
    console.log(result.applied.length ? `Applied migrations: ${result.applied.join(', ')}` : 'Database schema is already current. No changes.');
  } else {
    assertMigrationsCurrent(database, config.migrationsDirectory);
    if (command === 'seed') {
      console.log('Insert clearly labeled example content once. Existing content is never overwritten; identity conflicts abort the seed.');
      const { count } = database.prepare('SELECT count(*) AS count FROM contents').get() as { count: number };
      const seedKey: unknown = JSON.parse(readFileSync(config.seedPath, 'utf8')).key;
      if (typeof seedKey !== 'string') throw new Error('Seed manifest key is invalid.');
      const { seeded } = database.prepare('SELECT count(*) AS seeded FROM seed_runs WHERE key=?').get(seedKey) as { seeded: number };
      if (count > 0 && seeded === 0) {
        mkdirSync(config.backupDirectory, { recursive: true });
        const snapshot = join(config.backupDirectory, `${basename(config.dbPath)}.before-seed-${randomUUID()}.sqlite`);
        await database.backup(snapshot);
        console.log(`Database backup created before inserting examples: ${snapshot}`);
      }
      console.log(JSON.stringify(seedExamples(database, config.seedPath)));
    } else {
      const migrations = database.prepare('SELECT version, filename, applied_at AS appliedAt FROM schema_migrations ORDER BY version').all();
      const contents = database.prepare('SELECT kind, publication, count(*) AS count FROM contents GROUP BY kind, publication ORDER BY kind, publication').all();
      console.log(JSON.stringify({ schema: 'current', migrations, contents }, null, 2));
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database command failed.');
  process.exitCode = 1;
} finally {
  if (database?.open) database.close();
}
