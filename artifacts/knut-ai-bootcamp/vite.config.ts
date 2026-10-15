import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { loadConfig, urlHost } from './src/server/config.js';

export default defineConfig(() => {
  if (existsSync('.env')) loadEnvFile('.env');
  const isReplit = Boolean(
    process.env.REPL_ID ||
      process.env.REPLIT_DEV_DOMAIN ||
      process.env.REPLIT_DOMAINS ||
      process.env.API_PORT,
  );
  const webPort = Number(
    isReplit
      ? process.env.PORT || '5173'
      : process.env.DEV_PORT || '5173',
  );
  if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
    throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
  }
  const apiPort = isReplit
    ? process.env.API_PORT || '3000'
    : process.env.PORT || '3000';
  const config = loadConfig({
    ...process.env,
    PORT: apiPort,
    DEV_PORT: String(webPort),
  });
  const apiHost = ['0.0.0.0', '::'].includes(config.host) ? '127.0.0.1' : config.host;
  return {
    plugins: [react(), {
      name: 'private-paths',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          let pathname: string;
          try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
          catch { res.statusCode = 400; res.end('Invalid URL'); return; }
          if (/^\/(?:\.[^/]*|var|uploads|backups|docs|migrations|seed|src\/server)(?:\/|$)/i.test(pathname)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          next();
        });
      },
    }],
    envDir: false,
    publicDir: false,
    build: { outDir: 'dist/client', emptyOutDir: true },
    server: {
      host: config.host,
      port: webPort,
      strictPort: true,
      allowedHosts: true,
      cors: false,
      watch: { ignored: ['**/.cache/**', '**/var/**', '**/uploads/**', '**/backups/**'] },
      ...(isReplit
        ? {}
        : {
            proxy: {
              '/api': { target: `http://${urlHost(apiHost)}:${config.port}` },
            },
          }),
      fs: {
        strict: true,
        allow: [resolve('src/client'), resolve('src/shared'), resolve('node_modules'), resolve('index.html')],
        deny: ['.env', '.env.*', '**/.git/**', '**/var/**', '**/docs/**', '**/src/server/**', '**/uploads/**', '**/backups/**', '**/*.sqlite*', '**/*.db*', '**/*.pem', '**/*.key'],
      },
    },
  } satisfies UserConfig;
});
