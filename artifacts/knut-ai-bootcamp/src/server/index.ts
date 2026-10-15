import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApp } from './app.js';
import { loadConfig, urlHost } from './config.js';
import { openDatabase } from './db/connection.js';
import { assertMigrationsCurrent } from './db/migrations.js';
import { openManagedDatabase, wrapSqliteDatabase, type DataDatabase } from './db/dataDatabase.js';

if (existsSync('.env')) loadEnvFile('.env');
let database: DataDatabase | undefined;
async function start() {
  try {
    const config = loadConfig();
    const development = process.argv.includes('--dev');
    const apiOnly = process.argv.includes('--api-only');
    if (!development && !existsSync(`${config.clientDirectory}/index.html`)) {
      throw new Error('Client build missing. Run npm.cmd run build first.');
    }
    if (process.env.DATABASE_URL) {
      // Replit Database schema is applied in development before Publish; never run DDL on app startup.
      database = await openManagedDatabase();
    } else {
      if (!existsSync(config.dbPath)) throw new Error('Local DB is not initialized. Run npm.cmd run db:migrate first.');
      const sqlite = openDatabase(config.dbPath);
      assertMigrationsCurrent(sqlite, config.migrationsDirectory);
      database = wrapSqliteDatabase(sqlite);
    }
    const app = createApp(config, !development && !apiOnly, database);
    const server = app.listen(config.port, config.host);
    server.once('listening', () => {
      console.log(`${development ? 'API' : 'Local'}: http://${urlHost(config.host)}:${config.port}`);
      console.log(`Database: ${database?.dialect === 'postgres' ? 'Replit PostgreSQL' : 'local SQLite'}.`);
    });
    server.on('error', error => {
      console.error(`Server could not start (${(error as NodeJS.ErrnoException).code || 'ERROR'}). Check HOST/PORT and running processes.`);
      void database?.close();
      process.exitCode = 1;
    });
    function stop() {
      server.close(() => { void database?.close().finally(() => { process.exitCode = 0; }); });
      server.closeAllConnections();
    }
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    if (database) await database.close().catch(() => undefined);
    console.error(error instanceof Error ? error.message : 'Invalid server configuration.');
    process.exitCode = 1;
  }
}

void start();
