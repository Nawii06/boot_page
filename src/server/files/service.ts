import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { AppConfig } from '../config.js';
import { ContentRepository } from '../repositories/contentRepository.js';
import { FileServiceError } from './errors.js';
import { validateFileBytes, validateOriginalName, type FileExtension } from './formats.js';

export { FileServiceError } from './errors.js';
export interface SafeFileMetadata {
  id: string; originalName: string; mediaType: string; extension: FileExtension; size: number; createdAt: string;
}
interface FileRow {
  id: string; storage_key: string; original_name: string; media_type: string; extension: FileExtension;
  size: number; created_at: string;
}
const activeUploads = new Map<string, number>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safe = (file: FileRow): SafeFileMetadata => ({
  id: file.id, originalName: file.original_name, mediaType: file.media_type,
  extension: file.extension, size: file.size, createdAt: file.created_at,
});
const missing = () => new FileServiceError('NOT_FOUND', 404, '첨부파일을 찾을 수 없습니다.');

/** Local bytes are private. Only download routes may expose a file after ID-based permission checks. */
export class FileService {
  private readonly repository: ContentRepository;
  constructor(private readonly db: Database.Database, public readonly config: AppConfig) {
    this.repository = new ContentRepository(db);
  }

  /** Acquired before parsing multipart data; failed/aborted requests release the slot in finally. */
  acquireUploadSlot(actor = 'local-service'): () => void {
    const key = resolve(this.config.uploadDirectory);
    if ((activeUploads.get(key) ?? 0) >= 2) {
      throw new FileServiceError('UPLOAD_BUSY', 429, '파일 업로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
    }
    const rateKey = createHash('sha256').update(`upload\0${actor}`).digest('hex');
    const now = new Date().toISOString();
    const reset = new Date(Date.now() + 60_000).toISOString();
    this.db.transaction(() => {
      const record = this.db.prepare('SELECT attempts,reset_at FROM auth_rate_limits WHERE key_hash=?').get(rateKey) as { attempts: number; reset_at: string } | undefined;
      if (record && record.reset_at > now && record.attempts >= 30) {
        throw new FileServiceError('UPLOAD_RATE_LIMIT', 429, '업로드 시도가 많습니다. 1분 후 다시 시도해 주세요.');
      }
      this.db.prepare(`INSERT INTO auth_rate_limits(key_hash,attempts,reset_at) VALUES(?,?,?)
        ON CONFLICT(key_hash) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at`)
        .run(rateKey, record && record.reset_at > now ? record.attempts + 1 : 1, record && record.reset_at > now ? record.reset_at : reset);
    }).immediate();
    activeUploads.set(key, (activeUploads.get(key) ?? 0) + 1);
    let released = false;
    return () => { if (!released) { released = true; activeUploads.set(key, Math.max(0, (activeUploads.get(key) ?? 1) - 1)); } };
  }

  async saveUpload(originalName: string, bytes: Buffer): Promise<SafeFileMetadata> {
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
      return this.db.transaction(() => {
        this.ensureRoot();
        if (this.diskBytes() + bytes.length > this.config.maxStorageBytes) {
          throw new FileServiceError('STORAGE_LIMIT', 413, '첨부파일 저장소 한도를 초과했습니다. 미연결 파일을 정리해 주세요.');
        }
        filePath = this.pathForKey(storageKey);
        const descriptor = openSync(filePath, 'wx', 0o600);
        created = true;
        try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); }
        finally { closeSync(descriptor); }
        const record = this.repository.createFile({ id: fileId, storageKey, originalName: name, mediaType,
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

  listUnlinked(): SafeFileMetadata[] {
    return (this.db.prepare(`SELECT f.* FROM files f WHERE NOT EXISTS(SELECT 1 FROM content_files cf WHERE cf.file_id=f.id)
      ORDER BY f.created_at DESC,f.id LIMIT 100`).all() as FileRow[]).map(safe);
  }

  deleteUnlinked(fileId: string): void {
    if (!uuidPattern.test(fileId)) throw missing();
    let original: string | undefined;
    let quarantined: string | undefined;
    try {
      this.db.transaction(() => {
        const row = this.db.prepare('SELECT * FROM files WHERE id=?').get(fileId) as FileRow | undefined;
        if (!row) throw missing();
        if (this.db.prepare('SELECT 1 FROM content_files WHERE file_id=? LIMIT 1').get(fileId)) {
          throw new FileServiceError('FILE_IN_USE', 409, '콘텐츠가 참조하는 파일입니다. 연결을 해제한 후 삭제해 주세요.');
        }
        original = this.pathForKey(row.storage_key);
        if (existsSync(original)) {
          quarantined = this.pathForKey(`delete-${randomUUID()}.pending`);
          renameSync(original, quarantined);
        }
        this.db.prepare('DELETE FROM files WHERE id=?').run(fileId);
      }).immediate();
    } catch (error) {
      if (original && quarantined && existsSync(quarantined)) renameSync(quarantined, original);
      throw error;
    }
    // Metadata is gone and no content refers to this object. A cleanup failure retains private bytes.
    if (quarantined && existsSync(quarantined)) unlinkSync(quarantined);
  }

  resolveDownload(fileId: string, contentId: string | undefined, administrator: boolean): { metadata: SafeFileMetadata; path: string } {
    if (!uuidPattern.test(fileId) || (!administrator && contentId === undefined) ||
        (contentId !== undefined && !uuidPattern.test(contentId))) throw missing();
    if (!this.repository.canReadFile(fileId, contentId, administrator)) throw missing();
    const row = this.db.prepare('SELECT * FROM files WHERE id=?').get(fileId) as FileRow | undefined;
    if (!row) throw missing();
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
