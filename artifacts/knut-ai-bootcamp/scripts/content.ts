import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { loadConfig } from '../src/server/config.js';
import { exportContentPackage, importContentPackage } from '../src/server/transfer/index.js';

const usage = 'Use npm.cmd run content:export -- --output DIRECTORY, or npm.cmd run content:import -- --input DIRECTORY --db NEW.sqlite --uploads NEW_DIRECTORY. Existing data is never overwritten.';

try {
  const [command, ...args] = process.argv.slice(2);
  const expected = command === 'export' ? ['--output'] : command === 'import' ? ['--input', '--db', '--uploads'] : [];
  if (!expected.length || args.length !== expected.length * 2) throw new Error(usage);
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!expected.includes(key) || options.has(key) || !value?.trim() || value.startsWith('--')) throw new Error(usage);
    options.set(key, value);
  }
  if (existsSync('.env')) loadEnvFile('.env');
  const env = command === 'import'
    ? { ...process.env, DB_PATH: options.get('--db'), UPLOAD_DIR: options.get('--uploads') }
    : process.env;
  const config = loadConfig(env);
  const packagePath = resolve(config.projectRoot, options.get(command === 'export' ? '--output' : '--input')!);
  console.log(command === 'export'
    ? 'Export content and registered originals under one SQLite write lock. Administrator accounts, sessions and configuration are excluded.'
    : 'Validate the complete content package, then restore to the explicitly selected empty database and upload directory. Set up a new administrator separately.');
  const result = command === 'export'
    ? await exportContentPackage(config, packagePath)
    : await importContentPackage(config, packagePath);
  // Summaries contain counts and filesystem destinations, never content or authentication values.
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Content transfer failed. No successful restore was reported.');
  process.exitCode = 1;
}
