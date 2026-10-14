import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const mode = process.argv[2];
if (!['web', 'api-dev', 'api'].includes(mode)) {
  throw new Error('Use one of: web, api-dev, api.');
}

process.env.HOST ||= '0.0.0.0';
process.env.ALLOW_NETWORK ||= 'true';

const replitDomain =
  process.env.REPLIT_DEV_DOMAIN?.trim() ||
  process.env.REPLIT_DOMAINS?.split(',').map((domain) => domain.trim()).find(Boolean);

if (!process.env.APP_ORIGIN && replitDomain) {
  const url = replitDomain.includes('://')
    ? new URL(replitDomain)
    : new URL(`https://${replitDomain}`);
  process.env.APP_ORIGIN = url.origin;
}

if (process.env.APP_ORIGIN?.startsWith('https://')) {
  process.env.COOKIE_SECURE ||= 'true';
}

let args;
if (mode === 'web') {
  args = [resolve('node_modules/vite/bin/vite.js'), '--config', 'vite.config.ts'];
} else if (mode === 'api-dev') {
  args = [
    '--import',
    'tsx',
    'src/server/index.ts',
    '--dev',
    '--api-only',
  ];
} else {
  args = ['dist/runtime/server/index.js', '--api-only'];
}

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
