import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type Database from 'better-sqlite3';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { assertMigrationsCurrent, migrateDatabase } from '../src/server/db/migrations.js';
import { seedExamples } from '../src/server/db/seed.js';
import { openManagedDatabase, type DataDatabase } from '../src/server/db/dataDatabase.js';

if (existsSync('.env')) loadEnvFile('.env');
let sqlite: Database.Database | undefined;
let managed: DataDatabase | undefined;
try {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !['migrate', 'seed', 'status'].includes(command)) {
    throw new Error('Use npm.cmd run db:migrate, db:seed or db:status. No reset/delete command is provided.');
  }
  const config = loadConfig();
  if (process.env.DATABASE_URL) {
    if (command === 'migrate') {
      if (process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT) {
        throw new Error('Do not push schema changes to production. Apply them through the Publish flow.');
      }
      console.log('Push the shared Drizzle schema to the development database. Production schema changes are applied through Publish.');
      const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
      const result = spawnSync(executable, ['--config.engine-strict=false', '--filter', '@workspace/db', 'run', 'push'], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error('Development database schema push failed.');
    } else {
      if (command === 'seed' && (process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT)) {
        throw new Error('Example content seeding is disabled in production.');
      }
      managed = await openManagedDatabase();
      if (command === 'seed') {
        console.log('Insert clearly labeled example content once. Existing content is never overwritten; identity conflicts abort the seed.');
        console.log(JSON.stringify(await seedExamples(managed, config.seedPath)));
      } else {
        const contents = await managed.prepare('SELECT kind, publication, count(*) AS count FROM contents GROUP BY kind, publication ORDER BY kind, publication').all();
        console.log(JSON.stringify({ schema: 'managed', contents }, null, 2));
      }
    }
  } else {
    if (command !== 'migrate' && !existsSync(config.dbPath)) {
      throw new Error('Local DB is not initialized. Run npm.cmd run db:migrate first.');
    }
    sqlite = openDatabase(config.dbPath, { create: command === 'migrate' });
    if (command === 'migrate') {
      console.log('Apply pending schema changes only; existing content will not be reset. Stop application writers before migration.');
      const result = await migrateDatabase(sqlite, config.migrationsDirectory, config.backupDirectory);
      console.log(result.applied.length ? `Applied migrations: ${result.applied.join(', ')}` : 'Database schema is already current. No changes.');
    } else {
      assertMigrationsCurrent(sqlite, config.migrationsDirectory);
      if (command === 'seed') {
        console.log('Insert clearly labeled example content once. Existing content is never overwritten; identity conflicts abort the seed.');
        const { count } = sqlite.prepare('SELECT count(*) AS count FROM contents').get() as { count: number };
        const seedKey: unknown = JSON.parse(readFileSync(config.seedPath, 'utf8')).key;
        if (typeof seedKey !== 'string') throw new Error('Seed manifest key is invalid.');
        const { seeded } = sqlite.prepare('SELECT count(*) AS seeded FROM seed_runs WHERE key=?').get(seedKey) as { seeded: number };
        if (count > 0 && seeded === 0) {
          mkdirSync(config.backupDirectory, { recursive: true });
          const snapshot = join(config.backupDirectory, `${basename(config.dbPath)}.before-seed-${randomUUID()}.sqlite`);
          await sqlite.backup(snapshot);
          console.log(`Database backup created before inserting examples: ${snapshot}`);
        }
        console.log(JSON.stringify(await seedExamples(sqlite, config.seedPath)));
      } else {
        const migrations = sqlite.prepare('SELECT version, filename, applied_at AS appliedAt FROM schema_migrations ORDER BY version').all();
        const contents = sqlite.prepare('SELECT kind, publication, count(*) AS count FROM contents GROUP BY kind, publication ORDER BY kind, publication').all();
        console.log(JSON.stringify({ schema: 'current', migrations, contents }, null, 2));
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database command failed.');
  process.exitCode = 1;
} finally {
  if (managed) await managed.close().catch(() => undefined);
  if (sqlite?.open) sqlite.close();
}
