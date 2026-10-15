import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { matchPath } from 'react-router-dom';
import { routeDefinitions } from '../shared/pageRoutes.js';
import type { AppConfig } from './config.js';
import type BetterSqlite from 'better-sqlite3';
import { asDataDatabase, type DataDatabase } from './db/dataDatabase.js';
import { AppObjectStorage } from './files/objectStorage.js';
import { ContentRepository, ContentRepositoryError } from './repositories/contentRepository.js';
import { publicContentsRouter } from './http/publicContents.js';
import { AuthService, AuthError } from './auth/service.js';
import { authRouter, createAuthGuards, readCookie, sendAuthError, SESSION_COOKIE } from './http/auth.js';
import { FileService, FileServiceError } from './files/service.js';
import { adminFilesRouter, fileDownloadRouter } from './http/files.js';
import { contentAdminRouter } from './http/notices.js';

export function createApp(
  config: AppConfig,
  serveClient: boolean,
  database: DataDatabase | BetterSqlite.Database,
  fileService?: FileService,
) {
  const app = express();
  const dataDatabase = asDataDatabase(database);
  const repository = new ContentRepository(dataDatabase);
  const auth = new AuthService(dataDatabase, { sessionTtlSeconds: config.sessionTtlSeconds });
  const guards = createAuthGuards(auth, config);
  const files = fileService ??
    new FileService(dataDatabase, config, dataDatabase.dialect === 'postgres' ? new AppObjectStorage() : undefined);
  app.disable('x-powered-by');
  app.disable('etag');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await dataDatabase.prepare('SELECT 1').get();
    res.json({ data: { status: 'ok', stage: 'P-08', capabilities: { database: true, authentication: true, uploads: true } } });
  });
  app.use('/api/auth', authRouter(auth, config));
  // All future API writes inherit this guard, including routes outside /api/admin.
  // Login has its own pre-authentication CSRF check above.
  app.use('/api', guards.requireMutationCsrf);
  app.use('/api/admin', guards.requireAdmin);
  app.use('/api/admin/files', adminFilesRouter(files));
  app.use('/api/admin', contentAdminRouter(repository, files, config));
  app.use('/api/public', publicContentsRouter(repository));
  app.use('/api/files', fileDownloadRouter(files, auth));
  app.use('/api', (_req, res) => {
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: '요청한 기능은 후속 단계에서 제공됩니다.' } });
  });
  // Private paths never fall through to the client router or static server.
  app.use((req, res, next) => {
    const segments = req.path.toLowerCase().split('/');
    if (segments.some(part => part.startsWith('.')) || ['var', 'uploads', 'backups', 'src', 'docs', 'node_modules', 'migrations', 'seed'].includes(segments[1] || '')) {
      res.status(404).type('text').send('Not found');
      return;
    }
    next();
  });
  if (serveClient) {
    app.use(async (req, res, next) => {
      if ((req.method === 'GET' || req.method === 'HEAD') && /^\/admin(?:\/|$)/i.test(req.path) && req.path !== '/admin/login') {
        if (!await auth.getSession(readCookie(req, SESSION_COOKIE))) {
          res.redirect(302, `/admin/login?next=${encodeURIComponent(req.path)}`);
          return;
        }
      }
      next();
    });
    app.use(express.static(config.clientDirectory, { index: false, dotfiles: 'deny', etag: false, maxAge: 0 }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/assets/') || /\.[a-z\d]{1,8}$/i.test(req.path)) return next();
      const indexPath = join(config.clientDirectory, 'index.html');
      if (!existsSync(indexPath)) {
        res.status(503).type('text').send('Client build missing. Run npm.cmd run build.');
        return;
      }
      const known = routeDefinitions.some(route => matchPath({ path: route.path, end: true }, req.path));
      res.status(known ? 200 : 404).sendFile('index.html', { root: config.clientDirectory });
    });
  }
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' } });
  });
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) { res.destroy(); return; }
    if (error instanceof AuthError) { sendAuthError(error, res); return; }
    if (error instanceof FileServiceError) {
      res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large' || error?.type === 'encoding.unsupported') {
      res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'INVALID_INPUT', message: '요청 형식을 확인해 주세요.' } });
      return;
    }
    if (error instanceof ContentRepositoryError) {
      res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' } });
  };
  app.use(errorHandler);
  return app;
}
