import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { loadConfig, urlHost } from './src/server/config.js';

export default defineConfig(() => {
  if (existsSync('.env')) loadEnvFile('.env');
  const config = loadConfig();
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
      port: config.devPort,
      strictPort: true,
      cors: false,
      watch: { ignored: ['**/.cache/**', '**/var/**', '**/uploads/**', '**/backups/**'] },
      proxy: { '/api': { target: `http://${urlHost(apiHost)}:${config.port}` } },
      fs: {
        strict: true,
        allow: [resolve('src/client'), resolve('src/shared'), resolve('node_modules'), resolve('index.html')],
        deny: ['.env', '.env.*', '**/.git/**', '**/var/**', '**/docs/**', '**/src/server/**', '**/uploads/**', '**/backups/**', '**/*.sqlite*', '**/*.db*', '**/*.pem', '**/*.key'],
      },
    },
  } satisfies UserConfig;
});
