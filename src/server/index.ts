import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApp } from './app.js';
import { loadConfig, urlHost } from './config.js';
import type Database from 'better-sqlite3';
import { openDatabase } from './db/connection.js';
import { assertMigrationsCurrent } from './db/migrations.js';

if (existsSync('.env')) loadEnvFile('.env');
let database: Database.Database | undefined;
try {
  const config = loadConfig();
  const development = process.argv.includes('--dev');
  if (!development && !existsSync(`${config.clientDirectory}/index.html`)) {
    throw new Error('Client build missing. Run npm.cmd run build first.');
  }
  if (!existsSync(config.dbPath)) throw new Error('Local DB is not initialized. Run npm.cmd run db:migrate first.');
  database = openDatabase(config.dbPath);
  assertMigrationsCurrent(database, config.migrationsDirectory);
  const app = createApp(config, !development, database);
  const server = app.listen(config.port, config.host);
  server.once('listening', () => {
    console.log(`${development ? 'API' : 'Local'}: http://${urlHost(config.host)}:${config.port}`);
    console.log('P-08: all public pages connected to administrator-managed local content.');
  });
  server.on('error', error => {
    console.error(`Server could not start (${(error as NodeJS.ErrnoException).code || 'ERROR'}). Check HOST/PORT and running processes.`);
    if (database?.open) database.close();
    process.exitCode = 1;
  });
  function stop() {
    server.close(() => { if (database?.open) database.close(); process.exitCode = 0; });
    server.closeAllConnections();
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  if (database?.open) database.close();
  console.error(error instanceof Error ? error.message : 'Invalid server configuration.');
  process.exitCode = 1;
}
