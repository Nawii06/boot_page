import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

function postgresBinary(name: string): string {
  try {
    const directory = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
    const binary = join(directory, name);
    if (existsSync(binary)) return binary;
  } catch {
    // Fall through to PATH for systems that do not include pg_config.
  }
  return name;
}

function run(command: string, args: string[], options: { cwd?: string } = {}): void {
  const result = spawnSync(command, args, { ...options, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve an isolated PostgreSQL port.');
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return address.port;
}

const scratchDirectory = mkdtempSync(join(tmpdir(), 'knut-ai-managed-pg-'));
const databaseDirectory = join(scratchDirectory, 'data');
const logPath = join(scratchDirectory, 'postgres.log');
const initdb = postgresBinary('initdb');
const pgCtl = postgresBinary('pg_ctl');
const port = await availablePort();
let started = false;
let exitCode = 1;

try {
  run(initdb, ['--no-sync', '-D', databaseDirectory, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust']);
  run(pgCtl, ['-D', databaseDirectory, '-l', logPath, '-o', `-h 127.0.0.1 -p ${port} -k ${scratchDirectory} -F`, 'start']);
  started = true;

  const appDirectory = resolve('.');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/managed-integration.ts'], {
    cwd: appDirectory,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://postgres@127.0.0.1:${port}/postgres`,
      MANAGED_TEST_DATABASE: 'knut-isolated-postgres',
      MANAGED_TEST_PORT: String(port),
      PRIVATE_OBJECT_DIR: '/isolated-storage-test-bucket/private',
    },
  });
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} finally {
  if (started) {
    const stop = spawnSync(pgCtl, ['-D', databaseDirectory, '-m', 'immediate', 'stop'], { stdio: 'inherit' });
    if (stop.error) console.error('Could not stop the temporary PostgreSQL server cleanly.');
  }
  const resolvedScratch = resolve(scratchDirectory);
  if (resolvedScratch.startsWith(resolve(tmpdir()) + '/') && resolvedScratch.includes('knut-ai-managed-pg-')) {
    rmSync(resolvedScratch, { recursive: true, force: true });
  }
}

process.exitCode = exitCode;
