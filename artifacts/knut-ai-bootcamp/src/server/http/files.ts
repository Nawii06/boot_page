import busboy from 'busboy';
import { Router, json, type Request } from 'express';
import { createReadStream } from 'node:fs';
import type { AuthService } from '../auth/service.js';
import { FileService, FileServiceError } from '../files/service.js';
import { imageExtensions } from '../files/formats.js';
import { readCookie, SESSION_COOKIE } from './auth.js';

function receiveFile(req: Request, maxBytes: number): Promise<{ filename: string; bytes: Buffer }> {
  if (!req.is('multipart/form-data')) throw new FileServiceError('INVALID_UPLOAD', 400, '파일 업로드 요청 형식을 확인해 주세요.');
  const length = Number(req.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes + 64 * 1024) throw new FileServiceError('FILE_TOO_LARGE', 413, '파일 크기 제한을 초과했습니다.');
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers, defParamCharset: 'utf8', preservePath: true,
        limits: { fileSize: maxBytes + 1, files: 1, fields: 0, parts: 2, headerPairs: 32, fieldNameSize: 100 },
      });
    } catch {
      reject(new FileServiceError('INVALID_UPLOAD', 400, '파일 업로드 요청 형식을 확인해 주세요.'));
      return;
    }
    let filename = '';
    let found = false;
    let failed: FileServiceError | undefined;
    let bytes = 0;
    let wireBytes = 0;
    const chunks: Buffer[] = [];
    const fail = (error: FileServiceError) => { failed ??= error; chunks.length = 0; };
    const tooMany = () => fail(new FileServiceError('INVALID_UPLOAD', 400, '한 번에 파일 하나만 업로드해 주세요.'));
    const onData = (chunk: Buffer) => {
      wireBytes += chunk.length;
      if (wireBytes > maxBytes + 64 * 1024) {
        fail(new FileServiceError('FILE_TOO_LARGE', 413, '파일 크기 제한을 초과했습니다.'));
        parser.destroy();
      }
    };
    const onAbort = () => { fail(new FileServiceError('UPLOAD_ABORTED', 400, '파일 업로드가 중단되었습니다.')); parser.destroy(); };
    req.on('data', onData);
    req.once('aborted', onAbort);
    const timeout = setTimeout(() => {
      fail(new FileServiceError('UPLOAD_TIMEOUT', 408, '업로드 시간이 초과되었습니다. 다시 시도해 주세요.'));
      parser.destroy();
    }, 60_000);
    timeout.unref();
    parser.on('file', (field, stream, info) => {
      if (found || field !== 'file' || !info.filename) tooMany();
      found = true;
      filename = info.filename ?? '';
      stream.on('limit', () => fail(new FileServiceError('FILE_TOO_LARGE', 413, '파일 크기 제한을 초과했습니다.')));
      stream.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) fail(new FileServiceError('FILE_TOO_LARGE', 413, '파일 크기 제한을 초과했습니다.'));
        if (!failed) chunks.push(chunk);
      });
      stream.on('error', () => fail(new FileServiceError('INVALID_UPLOAD', 400, '파일 업로드를 완료하지 못했습니다.')));
    });
    parser.on('filesLimit', tooMany);
    parser.on('fieldsLimit', tooMany);
    parser.on('partsLimit', tooMany);
    parser.on('error', () => fail(new FileServiceError('INVALID_UPLOAD', 400, '파일 업로드 요청 형식을 확인해 주세요.')));
    parser.once('close', () => {
      clearTimeout(timeout);
      req.off('data', onData);
      req.off('aborted', onAbort);
      req.unpipe(parser);
      if (failed) { req.resume(); reject(failed); }
      else if (!found || bytes === 0) reject(new FileServiceError('INVALID_UPLOAD', 400, '업로드할 파일을 선택해 주세요.'));
      else resolve({ filename, bytes: Buffer.concat(chunks, bytes) });
    });
    req.pipe(parser);
  });
}

/** Mount only after both administrator authentication and mutation-CSRF guards. */
export function adminFilesRouter(service: FileService) {
  const router = Router();
  router.use(json({ limit: '8kb', strict: true }));
  router.get('/', async (_req, res) => res.json({ data: await service.listUnlinked() }));
  router.post('/', async (req, res) => {
    if (service.supportsSignedUploads) throw new FileServiceError('INVALID_UPLOAD', 404, '요청한 업로드 경로를 찾을 수 없습니다.');
    const adminId = res.locals.adminSession?.admin.id;
    const release = await service.acquireUploadSlot(adminId ?? 'authenticated-admin');
    try {
      const file = await receiveFile(req, service.config.maxUploadBytes);
      const metadata = await service.saveUpload(file.filename, file.bytes);
      res.status(201).json({ data: metadata });
    } finally { release(); }
  });
  router.post('/upload-url', async (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => !['originalName', 'size'].includes(key))) {
      throw new FileServiceError('INVALID_UPLOAD', 400, '파일 정보를 확인해 주세요.');
    }
    if (!service.supportsSignedUploads) {
      res.json({ data: { transport: 'multipart' } });
      return;
    }
    const adminId = res.locals.adminSession?.admin.id;
    const release = await service.acquireUploadSlot(adminId ?? 'authenticated-admin');
    try {
      const upload = await service.requestUploadUrl(adminId, req.body.originalName, req.body.size);
      res.status(201).json({ data: { transport: 'signed', ...upload } });
    } finally { release(); }
  });
  router.post('/complete', async (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => key !== 'uploadIntentId') ||
      typeof req.body.uploadIntentId !== 'string') {
      throw new FileServiceError('INVALID_UPLOAD', 400, '업로드 요청을 확인해 주세요.');
    }
    const adminId = res.locals.adminSession?.admin.id;
    const release = await service.acquireUploadSlot(adminId ?? 'authenticated-admin');
    try {
      const metadata = await service.completeUpload(adminId, req.body.uploadIntentId);
      res.status(201).json({ data: metadata });
    } finally { release(); }
  });
  router.delete('/:id', async (req, res) => { await service.deleteUnlinked(req.params.id); res.status(204).end(); });
  return router;
}

export function fileDownloadRouter(service: FileService, auth: AuthService) {
  const router = Router();
  router.get('/:id', async (req, res, next) => {
    if (Object.keys(req.query).some(key => !['contentId', 'inline'].includes(key)) ||
        (req.query.contentId !== undefined && typeof req.query.contentId !== 'string') ||
        (req.query.inline !== undefined && req.query.inline !== '1')) {
      throw new FileServiceError('NOT_FOUND', 404, '첨부파일을 찾을 수 없습니다.');
    }
    const administrator = Boolean(await auth.getSession(readCookie(req, SESSION_COOKIE)));
    const file = await service.resolveDownload(req.params.id, req.query.contentId as string | undefined, administrator);
    const inline = req.query.inline === '1' && imageExtensions.has(file.metadata.extension);
    const encoded = encodeURIComponent(file.metadata.originalName).replace(/[!'()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="download.${file.metadata.extension}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Content-Type', file.metadata.mediaType);
    res.setHeader('Content-Length', String(file.metadata.size));
    const stream = file.stream ?? (file.path ? createReadStream(file.path) : undefined);
    if (!stream) throw new FileServiceError('NOT_FOUND', 404, '첨부파일을 찾을 수 없습니다.');
    stream.once('error', (error: Error) => {
      if (res.headersSent) { res.destroy(error as Error); return; }
      next(new FileServiceError('NOT_FOUND', 404, '첨부파일을 찾을 수 없습니다.'));
    });
    stream.pipe(res);
  });
  return router;
}
