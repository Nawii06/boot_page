import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';

export interface AppConfig {
  host: string;
  port: number;
  devPort: number;
  allowNetwork: boolean;
  projectRoot: string;
  clientDirectory: string;
  dbPath: string;
  uploadDirectory: string;
  backupDirectory: string;
  migrationsDirectory: string;
  seedPath: string;
  appOrigins: string[];
  sessionTtlSeconds: number;
  cookieSecure: boolean;
  maxUploadBytes: number;
  maxStorageBytes: number;
  maxZipExpandedBytes: number;
  maxImagePixels: number;
  maxFilesPerContent: number;
}

function physicalPath(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : resolve(physicalPath(parent), relative(parent, path));
}

function contains(parent: string, path: string): boolean {
  const child = relative(parent, path);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function dataPath(value: string | undefined, fallback: string, label: string, root: string): string {
  const input = value?.trim() || fallback;
  if (input.includes('\0') || input === ':memory:' || /^file:/i.test(input)) {
    throw new Error(`${label} must be a private local filesystem path.`);
  }
  const path = resolve(root, input);
  const physical = physicalPath(path);
  if (physical === physicalPath(root) || ['src', 'public', 'dist', 'node_modules', 'docs', 'scripts', 'migrations', 'seed', '.git']
    .some(directory => contains(physicalPath(resolve(root, directory)), physical))) {
    throw new Error(`${label} must be outside source, build and publicly served directories.`);
  }
  return path;
}

function port(value: string | undefined, fallback: number, label: string) {
  if (!value?.trim()) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${label} must be an integer from 1 to 65535.`);
  }
  return Number(value);
}

function boundedSetting(value: string | undefined, fallback: number, min: number, max: number, label: string) {
  const input = value?.trim();
  if (!input) return fallback;
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input)) || Number(input) < min || Number(input) > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return Number(input);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, projectRoot = process.cwd()): AppConfig {
  const host = env.HOST?.trim() || '127.0.0.1';
  const flag = env.ALLOW_NETWORK?.trim() || 'false';
  if (!['true', 'false'].includes(flag)) throw new Error('ALLOW_NETWORK must be true or false.');
  const allowNetwork = flag === 'true';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !allowNetwork) {
    throw new Error('Non-loopback HOST requires explicit ALLOW_NETWORK=true.');
  }
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error('HOST must be a hostname or IP address.');
  const apiPort = port(env.PORT, 3000, 'PORT');
  const devPort = port(env.DEV_PORT, 5173, 'DEV_PORT');
  if (apiPort === devPort) throw new Error('PORT and DEV_PORT must be different.');
  const root = resolve(projectRoot);
  const dbPath = dataPath(env.DB_PATH, './var/db/bootcamp.sqlite', 'DB_PATH', root);
  if (!/\.(sqlite3?|db)$/i.test(dbPath)) throw new Error('DB_PATH must use a .sqlite, .sqlite3 or .db filename.');
  const secureFlag = env.COOKIE_SECURE?.trim() || 'false';
  if (!['true', 'false'].includes(secureFlag)) throw new Error('COOKIE_SECURE must be true or false.');
  const cookieSecure = secureFlag === 'true';
  const ttl = env.SESSION_TTL_SECONDS?.trim() || '28800';
  if (!/^\d+$/.test(ttl) || Number(ttl) < 300 || Number(ttl) > 86400) {
    throw new Error('SESSION_TTL_SECONDS must be an integer from 300 to 86400.');
  }
  const configuredOrigin = env.APP_ORIGIN?.trim();
  let appOrigins: string[];
  if (configuredOrigin) {
    let parsed: URL;
    try { parsed = new URL(configuredOrigin); } catch { throw new Error('APP_ORIGIN must be an exact HTTP(S) origin.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== configuredOrigin || parsed.username || parsed.password) {
      throw new Error('APP_ORIGIN must be an exact HTTP(S) origin without a path or trailing slash.');
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((!loopback && parsed.protocol !== 'https:') || (parsed.protocol === 'https:') !== cookieSecure) {
      throw new Error('Non-loopback APP_ORIGIN requires HTTPS. HTTPS requires COOKIE_SECURE=true; local HTTP requires false.');
    }
    appOrigins = [parsed.origin];
  } else {
    if (cookieSecure) throw new Error('COOKIE_SECURE=true requires an explicit HTTPS APP_ORIGIN.');
    appOrigins = ['127.0.0.1', 'localhost', '[::1]'].flatMap(name => [apiPort, devPort].map(value => `http://${name}:${value}`));
  }
  return {
    host, port: apiPort, devPort, allowNetwork, projectRoot: root,
    appOrigins, cookieSecure, sessionTtlSeconds: Number(ttl),
    maxUploadBytes: boundedSetting(env.MAX_UPLOAD_MB, 20, 1, 100, 'MAX_UPLOAD_MB') * 1024 * 1024,
    maxStorageBytes: boundedSetting(env.MAX_STORAGE_MB, 512, 1, 102400, 'MAX_STORAGE_MB') * 1024 * 1024,
    maxZipExpandedBytes: boundedSetting(env.MAX_ZIP_EXPANDED_MB, 100, 1, 500, 'MAX_ZIP_EXPANDED_MB') * 1024 * 1024,
    maxImagePixels: boundedSetting(env.MAX_IMAGE_PIXELS, 20000000, 1, 40000000, 'MAX_IMAGE_PIXELS'),
    maxFilesPerContent: boundedSetting(env.MAX_FILES_PER_CONTENT, 20, 1, 100, 'MAX_FILES_PER_CONTENT'),
    clientDirectory: resolve(root, 'dist/client'), dbPath,
    uploadDirectory: dataPath(env.UPLOAD_DIR, './var/uploads', 'UPLOAD_DIR', root),
    backupDirectory: dataPath(env.BACKUP_DIR, './var/backups', 'BACKUP_DIR', root),
    migrationsDirectory: resolve(root, 'migrations'),
    seedPath: resolve(root, 'seed/example-contents.json'),
  };
}

export function urlHost(host: string) { return host.includes(':') ? `[${host}]` : host; }
