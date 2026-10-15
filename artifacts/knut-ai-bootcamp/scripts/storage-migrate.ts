import Database from 'better-sqlite3';
import { loadConfig } from '../src/server/config.js';
import { openManagedDatabase } from '../src/server/db/dataDatabase.js';

const tables = [
  'contents',
  'program_details',
  'resource_details',
  'contact_details',
  'content_relations',
  'files',
  'content_files',
  'home_items',
  'content_links',
  'admins',
  'seed_runs',
] as const;

const ephemeralTables = ['sessions', 'pre_auth_sessions', 'auth_rate_limits', 'file_upload_intents'] as const;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; no database changes were made.');
  const config = loadConfig();
  const source = new Database(config.dbPath, { readonly: true, fileMustExist: true });
  const destination = await openManagedDatabase();
  try {
    const sourceRows = Object.fromEntries(tables.map((table) => [table, source.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]])) as Record<(typeof tables)[number], Record<string, unknown>[]>;
    const fileCount = sourceRows.files.length;
    if (fileCount > 0) {
      throw new Error('Local file records exist. The file bytes must be copied to App Storage before importing metadata; no database changes were made.');
    }
    if (sourceRows.content_files.length > 0) {
      throw new Error('Local content references files, but no file-byte migration is available for this source; no database changes were made.');
    }

    const targetCounts: Record<string, number> = {};
    for (const table of tables) {
      const row = await destination.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
      targetCounts[table] = row.count;
    }
    if (Object.values(targetCounts).some((count) => count !== 0)) {
      throw new Error('Managed storage already contains app data. Import stopped without overwriting it.');
    }

    const discardedSessions = (source.prepare('SELECT count(*) AS count FROM sessions').get() as { count: number }).count;
    await destination.transaction(async () => {
      for (const table of tables) {
        for (const row of sourceRows[table]) {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(',');
          await destination.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`)
            .run(...columns.map((column) => row[column]));
        }
      }
      for (const table of ephemeralTables) {
        await destination.prepare(`DELETE FROM ${table}`).run();
      }
      for (const table of tables) {
        const row = await destination.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
        if (row.count !== sourceRows[table].length) {
          throw new Error(`Import verification failed for ${table}; the transaction was rolled back.`);
        }
      }
    }).immediate();

    const counts = Object.fromEntries(tables.map((table) => [table, sourceRows[table].length]));
    console.log(JSON.stringify({
      imported: counts,
      sessionsInvalidated: discardedSessions,
      originalSqlitePreserved: true,
      uploadedFiles: 0,
    }, null, 2));
  } finally {
    source.close();
    await destination.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Managed storage import failed.');
  process.exitCode = 1;
});
