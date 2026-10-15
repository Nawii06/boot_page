import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import express, { type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { AppObjectStorage, type AppStorageClient, type AppStorageFile } from '../src/server/files/objectStorage.js';
import { FileService, FileServiceError } from '../src/server/files/service.js';
import { adminFilesRouter, fileDownloadRouter } from '../src/server/http/files.js';
import type { AuthService } from '../src/server/auth/service.js';
import { loadConfig } from '../src/server/config.js';
import { pdfFixture } from './helpers/documents.js';

const adminId = randomUUID();
const storageObjects = new Map<string, Buffer>();
let database: Awaited<ReturnType<typeof import('../src/server/db/dataDatabase.js')['openManagedDatabase']>>;

function requireIsolatedDatabase(): void {
  const configured = process.env.DATABASE_URL;
  const url = configured ? new URL(configured) : undefined;
  assert.equal(process.env.MANAGED_TEST_DATABASE, 'knut-isolated-postgres',
    'Run this test through the isolated test:managed command.');
  assert.ok(url, 'The test runner must provide its temporary PostgreSQL connection.');
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1', 'The test must never connect to a shared database.');
  assert.equal(url.pathname, '/postgres');
  assert.equal(url.password, '', 'The temporary database must not use application credentials.');
  assert.equal(url.port, process.env.MANAGED_TEST_PORT);
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  return (server.address() as AddressInfo).port;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
}

async function readBody(request: import('node:http').IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function createPostgresTestTables() {
  const statements = [
    `CREATE TABLE integration_probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL)`,
    `CREATE TABLE admins (id TEXT PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL,
      enabled SMALLINT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE auth_rate_limits (key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at TEXT NOT NULL)`,
    `CREATE TABLE file_upload_intents (id TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id),
      storage_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, declared_size INTEGER NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
    `CREATE TABLE files (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
      media_type TEXT NOT NULL, extension TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL)`,
    `CREATE TABLE contents (id TEXT PRIMARY KEY, publication TEXT NOT NULL)`,
    `CREATE TABLE content_files (content_id TEXT NOT NULL REFERENCES contents(id),
      file_id TEXT NOT NULL REFERENCES files(id), role TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      alt_text TEXT NOT NULL DEFAULT '', PRIMARY KEY(content_id,file_id,role))`,
  ];
  for (const statement of statements) await database.prepare(statement).run();
  await database.prepare(`INSERT INTO admins (id,username,password_hash,enabled,created_at,updated_at)
    VALUES (?,?,?,1,?,?)`).run(adminId, 'integration-test', 'test-only-hash', new Date().toISOString(), new Date().toISOString());
}

test('isolated PostgreSQL transactions and signed upload/finalize/download flow', async t => {
  requireIsolatedDatabase();
  const { openManagedDatabase } = await import('../src/server/db/dataDatabase.js');
  database = await openManagedDatabase();
  t.after(async () => database.close());
  await createPostgresTestTables();

  assert.equal(database.dialect, 'postgres');
  const bound = await database.prepare(`SELECT '?' AS quoted, ? AS value`).get('managed-postgres') as
    { quoted: string; value: string } | undefined;
  assert.deepEqual(bound, { quoted: '?', value: 'managed-postgres' });

  await database.transaction(async () => {
    await database.prepare('INSERT INTO integration_probe (id,label) VALUES (?,?)').run(1, 'before-savepoint');
    await assert.rejects(database.transaction(async () => {
      await database.prepare('INSERT INTO integration_probe (id,label) VALUES (?,?)').run(2, 'rolled-back-savepoint');
      throw new Error('intentional savepoint rollback');
    }).immediate(), /intentional savepoint rollback/);
    await database.prepare('INSERT INTO integration_probe (id,label) VALUES (?,?)').run(3, 'after-savepoint');
  }).immediate();
  const committed = await database.prepare('SELECT id,label FROM integration_probe ORDER BY id').all();
  assert.deepEqual(committed, [
    { id: 1, label: 'before-savepoint' },
    { id: 3, label: 'after-savepoint' },
  ]);
  await assert.rejects(database.transaction(async () => {
    await database.prepare('INSERT INTO integration_probe (id,label) VALUES (?,?)').run(4, 'outer-rollback');
    throw new Error('intentional outer rollback');
  }).immediate(), /intentional outer rollback/);
  await assert.rejects(database.transaction(async () => {
    await database.prepare('INSERT INTO integration_probe (id,label) VALUES (?,?)').run(5, 'read-only');
  }).deferred());
  assert.deepEqual(await database.prepare('SELECT id FROM integration_probe ORDER BY id').all(), [{ id: 1 }, { id: 3 }]);

  let signingRequest: { bucket_name?: string; object_name?: string; method?: string; expires_at?: string } | undefined;
  const storageServer = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (request.method === 'POST' && requestUrl.pathname === '/object-storage/signed-object-url') {
        const requestPayload = JSON.parse((await readBody(request)).toString('utf8')) as NonNullable<typeof signingRequest>;
        signingRequest = requestPayload;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          signed_url: `http://${request.headers.host}/signed/${requestPayload.bucket_name}/${requestPayload.object_name}`,
        }));
        return;
      }
      if (request.method === 'PUT' && requestUrl.pathname.startsWith('/signed/')) {
        const objectKey = decodeURIComponent(requestUrl.pathname.slice('/signed/'.length));
        storageObjects.set(objectKey, await readBody(request));
        response.writeHead(200);
        response.end();
        return;
      }
      response.writeHead(404);
      response.end();
    } catch {
      response.writeHead(400);
      response.end();
    }
  });
  let appServer: Server | undefined;
  t.after(async () => {
    if (appServer) await close(appServer);
    await close(storageServer);
    storageObjects.clear();
  });
  const storagePort = await listen(storageServer);
  const fakeStorageClient: AppStorageClient = {
    bucket: bucketName => ({
      file: objectName => {
        const key = `${bucketName}/${objectName}`;
        const getBytes = () => {
          const bytes = storageObjects.get(key);
          if (!bytes) throw new Error('Test object is missing.');
          return Buffer.from(bytes);
        };
        const file: AppStorageFile = {
          exists: async () => [storageObjects.has(key)],
          download: async () => [getBytes()],
          getMetadata: async () => [{ size: String(getBytes().length) }],
          createReadStream: () => Readable.from([getBytes()]),
          delete: async () => { storageObjects.delete(key); },
        };
        return file;
      },
    }),
  };
  const storage = new AppObjectStorage({
    privateObjectDirectory: () => '/isolated-storage-test-bucket/private',
    sidecarEndpoint: `http://127.0.0.1:${storagePort}`,
    storageClient: fakeStorageClient,
  });
  const config = loadConfig({ DB_PATH: './var/test.sqlite', UPLOAD_DIR: './var/test-uploads' });
  const files = new FileService(database, config, storage);

  const app = express();
  app.use('/api/admin/files', (_request, response, next) => {
    response.locals.adminSession = { admin: { id: adminId } };
    next();
  }, adminFilesRouter(files));
  const auth = { getSession: async () => null } as unknown as AuthService;
  app.use('/api/files', fileDownloadRouter(files, auth));
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof FileServiceError) {
      response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
      return;
    }
    response.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
  };
  app.use(errors);
  appServer = createServer(app);
  const appPort = await listen(appServer);
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const bytes = pdfFixture('isolated managed upload');

  try {
    const uploadResponse = await fetch(`${baseUrl}/api/admin/files/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalName: '격리 시험 자료.pdf', size: bytes.length }),
    });
    assert.equal(uploadResponse.status, 201, 'The signed upload intent route should create an intent.');
    const uploadBody = await uploadResponse.json() as { data: { uploadUrl: string; uploadIntentId: string } };
    assert.equal(typeof uploadBody.data.uploadUrl, 'string');
    assert.equal(signingRequest?.bucket_name, 'isolated-storage-test-bucket');
    assert.match(signingRequest?.object_name ?? '', /^private\/uploads\/[0-9a-f-]{36}$/);
    assert.equal(signingRequest?.method, 'PUT');
    assert.ok(Date.parse(signingRequest?.expires_at ?? '') > Date.now());

    const signedPut = await fetch(uploadBody.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: new Uint8Array(bytes),
    });
    assert.equal(signedPut.status, 200, 'The signed URL should accept the object bytes.');

    const finalizeResponse = await fetch(`${baseUrl}/api/admin/files/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadIntentId: uploadBody.data.uploadIntentId }),
    });
    assert.equal(finalizeResponse.status, 201, 'Finalize should register the uploaded object.');
    const finalized = await finalizeResponse.json() as { data: Record<string, unknown> };
    assert.deepEqual(Object.keys(finalized.data).sort(),
      ['createdAt', 'extension', 'id', 'mediaType', 'originalName', 'size'].sort(),
      'Finalize must return safe file metadata, not signed URLs or storage credentials.');
    const fileId = String(finalized.data.id);
    assert.equal((await database.prepare('SELECT count(*) AS n FROM file_upload_intents').get() as { n: number }).n, 0);
    assert.equal((await database.prepare('SELECT count(*) AS n FROM files').get() as { n: number }).n, 1);

    const contentId = randomUUID();
    await database.prepare('INSERT INTO contents (id,publication) VALUES (?,?)').run(contentId, 'public');
    await database.prepare(`INSERT INTO content_files (content_id,file_id,role,sort_order,alt_text)
      VALUES (?,?,?,0,'')`).run(contentId, fileId, 'attachment');
    const downloadResponse = await fetch(`${baseUrl}/api/files/${fileId}?contentId=${contentId}`);
    assert.equal(downloadResponse.status, 200, 'The public linked download route should serve the finalized object.');
    assert.deepEqual(Buffer.from(await downloadResponse.arrayBuffer()), bytes);
    assert.equal(downloadResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
  } finally {
    if (appServer) await close(appServer);
    await close(storageServer);
    storageObjects.clear();
  }
});
