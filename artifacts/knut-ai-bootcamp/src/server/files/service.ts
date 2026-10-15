import type BetterSqlite from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, createReadStream, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { AppConfig } from '../config.js';
import { asDataDatabase, type DataDatabase } from '../db/dataDatabase.js';
import { ContentRepository } from '../repositories/contentRepository.js';
import { FileServiceError } from './errors.js';
import { validateFileBytes, validateOriginalName, type FileExtension } from './formats.js';
import type { AppObjectStorage } from './objectStorage.js';

export { FileServiceError } from './errors.js';
export interface SafeFileMetadata {
  id: string; originalName: string; mediaType: string; extension: FileExtension; size: number; createdAt: string;
}
interface FileRow {
  id: string; storage_key: string; original_name: string; media_type: string; extension: FileExtension;
  size: number; created_at: string;
}
export interface DownloadFile {
  metadata: SafeFileMetadata;
  stream?: Readable;
  path?: string;
}
const activeUploads = new Map<string, number>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safe = (file: FileRow): SafeFileMetadata => ({
  id: file.id, originalName: file.original_name, mediaType: file.media_type,
  extension: file.extension, size: file.size, createdAt: file.created_at,
});
const missing = () => new FileServiceError('NOT_FOUND', 404, '첨부파일을 찾을 수 없습니다.');

/** File bytes remain private; download routes check file/content permissions before streaming. */
export class FileService {
  private readonly repository: ContentRepository;
  private readonly db: DataDatabase;
  constructor(
    db: DataDatabase | BetterSqlite.Database,
    public readonly config: AppConfig,
    private readonly storage?: AppObjectStorage,
  ) {
    this.db = asDataDatabase(db);
    this.repository = new ContentRepository(this.db);
  }

  get supportsSignedUploads(): boolean {
    return this.storage !== undefined;
  }

  /** Acquire an application-level upload slot before creating an upload intent. */
  async acquireUploadSlot(actor = 'local-service'): Promise<() => void> {
    const key = this.storage ? 'replit-app-storage' : resolve(this.config.uploadDirectory);
    if ((activeUploads.get(key) ?? 0) >= 2) {
      throw new FileServiceError('UPLOAD_BUSY', 429, '파일 업로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
    }
    activeUploads.set(key, (activeUploads.get(key) ?? 0) + 1);
    const rateKey = createHash('sha256').update(`upload\0${actor}`).digest('hex');
    const now = new Date().toISOString();
    const reset = new Date(Date.now() + 60_000).toISOString();
    try {
      await this.db.transaction(async () => {
        const allowed = await this.db.prepare(`INSERT INTO auth_rate_limits(key_hash,attempts,reset_at) VALUES(?,1,?)
          ON CONFLICT(key_hash) DO UPDATE SET
            attempts=CASE WHEN auth_rate_limits.reset_at<=? THEN 1 ELSE auth_rate_limits.attempts+1 END,
            reset_at=CASE WHEN auth_rate_limits.reset_at<=? THEN ? ELSE auth_rate_limits.reset_at END
          WHERE auth_rate_limits.reset_at<=? OR auth_rate_limits.attempts<30
          RETURNING attempts`).get(rateKey, reset, now, now, reset, now);
        if (!allowed) throw new FileServiceError('UPLOAD_RATE_LIMIT', 429, '업로드 시도가 많습니다. 1분 후 다시 시도해 주세요.');
      }).immediate();
    } catch (error) {
      activeUploads.set(key, Math.max(0, (activeUploads.get(key) ?? 1) - 1));
      throw error;
    }
    let released = false;
    return () => { if (!released) { released = true; activeUploads.set(key, Math.max(0, (activeUploads.get(key) ?? 1) - 1)); } };
  }

  async saveUpload(originalName: string, bytes: Buffer): Promise<SafeFileMetadata> {
    if (this.storage) throw new FileServiceError('INVALID_UPLOAD', 400, '파일은 보안 업로드 URL을 통해 업로드해 주세요.');
    const { name, extension } = validateOriginalName(originalName);
    if (bytes.length > this.config.maxUploadBytes) throw new FileServiceError('FILE_TOO_LARGE', 413, '파일 크기 제한을 초과했습니다.');
    const mediaType = await validateFileBytes(bytes, extension, this.config);
    const fileId = randomUUID();
    const storageKey = `${fileId}.${extension}`;
    // All filesystem and SQL changes below are synchronous under one SQLite write transaction.
    // No other request can link metadata until the complete, fsynced file has been registered.
    let filePath: string | undefined;
    let created = false;
    try {
      return await this.db.transaction(async () => {
        this.ensureRoot();
        if (this.diskBytes() + bytes.length > this.config.maxStorageBytes) {
          throw new FileServiceError('STORAGE_LIMIT', 413, '첨부파일 저장소 한도를 초과했습니다. 미연결 파일을 정리해 주세요.');
        }
        filePath = this.pathForKey(storageKey);
        const descriptor = openSync(filePath, 'wx', 0o600);
        created = true;
        try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); }
        finally { closeSync(descriptor); }
        const record = await this.repository.createFile({ id: fileId, storageKey, originalName: name, mediaType,
          extension, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        return { id: record.id, originalName: record.originalName, mediaType: record.mediaType,
          extension: record.extension, size: record.size, createdAt: record.createdAt };
      }).immediate();
    } catch (error) {
      // A database/file failure never leaves a dangling public metadata link.
      if (created && filePath && existsSync(filePath)) unlinkSync(filePath);
      throw error;
    }
  }

  async requestUploadUrl(adminId: string, originalName: unknown, size: unknown): Promise<{ uploadIntentId: string; uploadUrl: string; expiresAt: string }> {
    if (!this.storage || !uuidPattern.test(adminId)) throw new FileServiceError('STORAGE_UNAVAILABLE', 503, '첨부파일 저장소를 사용할 수 없습니다.');
    if (typeof originalName !== 'string') throw new FileServiceError('INVALID_UPLOAD', 400, '파일 이름을 확인해 주세요.');
    const { name } = validateOriginalName(originalName);
    if (!Number.isSafeInteger(size) || (size as number) < 1) throw new FileServiceError('INVALID_UPLOAD', 400, '파일 크기를 확인해 주세요.');
    if ((size as number) > this.config.maxUploadBytes) throw new FileServiceError('FILE_TOO_LARGE', 413, '파일 크기 제한을 초과했습니다.');
    const now = new Date().toISOString();
    const expired = await this.db.prepare('DELETE FROM file_upload_intents WHERE expires_at<=? RETURNING storage_key')
      .all(now) as { storage_key: string }[];
    for (const item of expired) {
      try { await this.storage.remove(item.storage_key); }
      catch (error) { console.error('Could not remove an expired private upload object.', error); }
    }
    const usage = await this.db.prepare(`SELECT
      COALESCE((SELECT SUM(size) FROM files), 0) +
      COALESCE((SELECT SUM(declared_size) FROM file_upload_intents WHERE expires_at > ?), 0) AS total_bytes`)
      .get(now) as { total_bytes: number } | undefined;
    if (!usage || !Number.isSafeInteger(usage.total_bytes) ||
      usage.total_bytes + (size as number) > this.config.maxStorageBytes) {
      throw new FileServiceError('STORAGE_LIMIT', 413, '첨부파일 저장소 한도를 초과했습니다. 미연결 파일을 정리해 주세요.');
    }

    let upload: Awaited<ReturnType<AppObjectStorage['createUpload']>>;
    try { upload = await this.storage.createUpload(); }
    catch { throw new FileServiceError('STORAGE_UNAVAILABLE', 503, '첨부파일 저장소를 사용할 수 없습니다.'); }
    const uploadIntentId = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    try {
      await this.db.prepare(`INSERT INTO file_upload_intents
        (id,admin_id,storage_key,original_name,declared_size,created_at,expires_at)
        VALUES (?,?,?,?,?,?,?)`).run(uploadIntentId, adminId, upload.storageKey, name, size, createdAt, expiresAt);
    } catch {
      throw new FileServiceError('STORAGE_UNAVAILABLE', 503, '업로드 요청을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
    return { uploadIntentId, uploadUrl: upload.uploadUrl, expiresAt };
  }

  async completeUpload(adminId: string, uploadIntentId: string): Promise<SafeFileMetadata> {
    if (!this.storage || !uuidPattern.test(adminId) || !uuidPattern.test(uploadIntentId)) throw missing();
    const intent = await this.db.prepare(`SELECT storage_key,original_name,declared_size FROM file_upload_intents
      WHERE id=? AND admin_id=? AND expires_at>?`).get(uploadIntentId, adminId, new Date().toISOString()) as
      { storage_key: string; original_name: string; declared_size: number } | undefined;
    if (!intent) throw missing();

    let bytes: Buffer;
    try { bytes = await this.storage.download(intent.storage_key); }
    catch { throw new FileServiceError('INVALID_UPLOAD', 400, '파일 업로드가 완료되지 않았습니다. 다시 시도해 주세요.'); }

    const discardInvalidUpload = async () => {
      try { await this.storage!.remove(intent.storage_key); }
      catch (error) { console.error('Could not remove an invalid private upload object.', error); }
      await this.db.prepare('DELETE FROM file_upload_intents WHERE id=? AND admin_id=?')
        .run(uploadIntentId, adminId);
    };

    if (bytes.length !== intent.declared_size || bytes.length < 1) {
      await discardInvalidUpload();
      throw new FileServiceError('INVALID_UPLOAD', 400, '업로드 파일 크기가 요청과 일치하지 않습니다.');
    }
    if (bytes.length > this.config.maxUploadBytes) {
      await discardInvalidUpload();
      throw new FileServiceError('FILE_TOO_LARGE', 413, '파일 크기 제한을 초과했습니다.');
    }
    const { name, extension } = validateOriginalName(intent.original_name);
    let mediaType: string;
    try { mediaType = await validateFileBytes(bytes, extension, this.config); }
    catch (error) {
      await discardInvalidUpload();
      throw error;
    }

    const fileId = randomUUID();
    const now = new Date().toISOString();
    return this.db.transaction(async () => {
      const claimed = await this.db.prepare(`DELETE FROM file_upload_intents
        WHERE id=? AND admin_id=? AND expires_at>? RETURNING storage_key,original_name,declared_size`)
        .get(uploadIntentId, adminId, now) as typeof intent | undefined;
      if (!claimed || claimed.storage_key !== intent.storage_key || claimed.original_name !== intent.original_name ||
        claimed.declared_size !== intent.declared_size) throw missing();
      const record = await this.repository.createFile({
        id: fileId, storageKey: claimed.storage_key, originalName: name, mediaType, extension,
        size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      return safe({
        id: record.id, storage_key: record.storageKey, original_name: record.originalName,
        media_type: record.mediaType, extension: record.extension, size: record.size,
        created_at: record.createdAt,
      });
    }).immediate();
  }

  async getFileMetadata(fileId: string): Promise<SafeFileMetadata> {
    if (!uuidPattern.test(fileId)) throw missing();
    const record = await this.repository.getFileMetadata(fileId);
    if (!record) throw missing();
    if (this.storage) {
      try {
        const file = await this.storage.getFile(record.storageKey);
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size) !== record.size) throw missing();
      } catch (error) {
        if (error instanceof FileServiceError) throw error;
        throw missing();
      }
    } else {
      const path = this.pathForKey(record.storageKey);
      if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).size !== record.size) throw missing();
    }
    return {
      id: record.id, originalName: record.originalName, mediaType: record.mediaType,
      extension: record.extension, size: record.size, createdAt: record.createdAt,
    };
  }

  async listUnlinked(): Promise<SafeFileMetadata[]> {
    return (await this.db.prepare(`SELECT f.* FROM files f WHERE NOT EXISTS(SELECT 1 FROM content_files cf WHERE cf.file_id=f.id)
      ORDER BY f.created_at DESC,f.id LIMIT 100`).all() as FileRow[]).map(safe);
  }

  async deleteUnlinked(fileId: string): Promise<void> {
    if (!uuidPattern.test(fileId)) throw missing();
    let original: string | undefined;
    let quarantined: string | undefined;
    if (this.storage) {
      try {
        await this.db.transaction(async () => {
          const lock = this.db.dialect === 'postgres' ? ' FOR UPDATE' : '';
          const row = await this.db.prepare(`SELECT * FROM files WHERE id=?${lock}`).get(fileId) as FileRow | undefined;
          if (!row) throw missing();
          if (await this.db.prepare('SELECT 1 FROM content_files WHERE file_id=? LIMIT 1').get(fileId)) {
            throw new FileServiceError('FILE_IN_USE', 409, '콘텐츠가 참조하는 파일입니다. 연결을 해제한 후 삭제해 주세요.');
          }
          await this.storage!.remove(row.storage_key);
          const result = await this.db.prepare('DELETE FROM files WHERE id=?').run(fileId);
          if (result.changes !== 1) throw missing();
        }).immediate();
      } catch (error) {
        if (error instanceof FileServiceError) throw error;
        throw new FileServiceError('STORAGE_UNAVAILABLE', 503, '첨부파일을 삭제하지 못했습니다. 다시 시도해 주세요.');
      }
      return;
    }
    try {
      await this.db.transaction(async () => {
        const row = await this.db.prepare('SELECT * FROM files WHERE id=?').get(fileId) as FileRow | undefined;
        if (!row) throw missing();
        if (await this.db.prepare('SELECT 1 FROM content_files WHERE file_id=? LIMIT 1').get(fileId)) {
          throw new FileServiceError('FILE_IN_USE', 409, '콘텐츠가 참조하는 파일입니다. 연결을 해제한 후 삭제해 주세요.');
        }
        original = this.pathForKey(row.storage_key);
        if (existsSync(original)) {
          quarantined = this.pathForKey(`delete-${randomUUID()}.pending`);
          renameSync(original, quarantined);
        }
        await this.db.prepare('DELETE FROM files WHERE id=?').run(fileId);
      }).immediate();
    } catch (error) {
      if (original && quarantined && existsSync(quarantined)) renameSync(quarantined, original);
      throw error;
    }
    // Metadata is gone and no content refers to this object. A cleanup failure retains private bytes.
    if (quarantined && existsSync(quarantined)) unlinkSync(quarantined);
  }

  async resolveDownload(fileId: string, contentId: string | undefined, administrator: boolean): Promise<DownloadFile> {
    if (!uuidPattern.test(fileId) || (!administrator && contentId === undefined) ||
        (contentId !== undefined && !uuidPattern.test(contentId))) throw missing();
    const row = await this.db.transaction(async () => {
      if (!await this.repository.canReadFile(fileId, contentId, administrator)) throw missing();
      return await this.db.prepare('SELECT * FROM files WHERE id=?').get(fileId) as FileRow | undefined;
    }).deferred();
    if (!row) throw missing();
    if (this.storage) {
      try {
        const file = await this.storage.getFile(row.storage_key);
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size) !== row.size) throw missing();
        return { metadata: safe(row), stream: file.createReadStream() };
      } catch (error) {
        if (error instanceof FileServiceError) throw error;
        throw missing();
      }
    }
    const path = this.pathForKey(row.storage_key);
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).size !== row.size) throw missing();
    return { metadata: safe(row), path };
  }

  private ensureRoot(): void {
    mkdirSync(this.config.uploadDirectory, { recursive: true });
    if (!lstatSync(this.config.uploadDirectory).isDirectory() || lstatSync(this.config.uploadDirectory).isSymbolicLink()) {
      throw new FileServiceError('STORAGE_UNAVAILABLE', 503, '첨부파일 저장소를 사용할 수 없습니다.');
    }
  }

  private pathForKey(key: string): string {
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_.-]+)*$/.test(key) || key.split('/').some(part => part === '.' || part === '..')) throw missing();
    const root = resolve(this.config.uploadDirectory);
    const path = resolve(root, key);
    const within = relative(root, path);
    if (!within || within.startsWith(`..${sep}`) || within === '..' || isAbsolute(within)) throw missing();
    if (existsSync(root)) {
      if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw missing();
      const physicalRoot = realpathSync(root);
      let cursor = root;
      for (const part of within.split(sep)) {
        cursor = join(cursor, part);
        if (!existsSync(cursor)) break;
        const physical = relative(physicalRoot, realpathSync(cursor));
        if (lstatSync(cursor).isSymbolicLink() || physical === '..' || physical.startsWith(`..${sep}`) || isAbsolute(physical)) throw missing();
      }
    }
    return path;
  }

  private diskBytes(): number {
    let total = 0;
    let count = 0;
    const walk = (directory: string, depth: number) => {
      if (depth > 8) throw new FileServiceError('STORAGE_UNAVAILABLE', 503, '첨부파일 저장소 구성을 확인해 주세요.');
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        if (++count > 20_000 || item.isSymbolicLink()) throw new FileServiceError('STORAGE_UNAVAILABLE', 503, '첨부파일 저장소 구성을 확인해 주세요.');
        const path = join(directory, item.name);
        if (item.isDirectory()) walk(path, depth + 1);
        else if (item.isFile()) total += lstatSync(path).size;
        if (total > this.config.maxStorageBytes) return;
      }
    };
    walk(this.config.uploadDirectory, 0);
    return total;
  }
}
