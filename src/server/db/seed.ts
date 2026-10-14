import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { ContentRepository, ContentRepositoryError } from '../repositories/contentRepository.js';
import type { ContentInput, HomeItemInput } from '../../shared/content.js';

interface SeedManifest { key: string; contents: ContentInput[]; homeItems: HomeItemInput[] }
export interface SeedResult { inserted: number; skipped: number; alreadyApplied: boolean }

/** Explicit, atomic, once-only seed. Never called from server startup or migration. */
export function seedExamples(db: Database.Database, seedPath: string): SeedResult {
  const source = readFileSync(seedPath, 'utf8');
  // Git's Windows newline conversion must not make unchanged examples a different seed.
  const checksum = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
  const manifest: SeedManifest = JSON.parse(source);
  if (!manifest || typeof manifest !== 'object' || !/^[a-z0-9-]{1,100}$/.test(manifest.key) ||
    !Array.isArray(manifest.contents) || manifest.contents.length === 0 || manifest.contents.length > 100 ||
    !Array.isArray(manifest.homeItems) || manifest.homeItems.length > 100 ||
    Object.keys(manifest).some((key) => !['key', 'contents', 'homeItems'].includes(key))) {
    throw new ContentRepositoryError('VALIDATION_ERROR', '예시 seed 문서 형식을 확인해 주세요.');
  }
  const repository = new ContentRepository(db);
  return db.transaction(() => {
    const applied = db.prepare('SELECT checksum FROM seed_runs WHERE key=?').get(manifest.key) as { checksum: string } | undefined;
    if (applied) {
      if (applied.checksum !== checksum) throw new ContentRepositoryError('CONFLICT', '이미 적용한 seed 파일의 내용이 변경되었습니다. 기존 seed 버전을 보존해 주세요.');
      return { inserted: 0, skipped: manifest.contents.length, alreadyApplied: true };
    }

    const ids = new Set<string>();
    const identities = new Set<string>();
    const skipped = new Set<string>();
    // Check every collision before inserting anything. Stable matching IDs are left entirely alone.
    for (const item of manifest.contents) {
      if (!item || typeof item.id !== 'string' || ids.has(item.id) ||
        typeof item.title !== 'string' || !item.title.includes('[예시]') ||
        typeof item.bodyHtml !== 'string' || !item.bodyHtml.includes('[예시]') ||
        item.fileIds?.length || item.fileLinks?.length) {
        throw new ContentRepositoryError('VALIDATION_ERROR', '예시에는 고유한 고정 ID와 제목·본문의 [예시] 표시가 필요하며 파일 원본을 가장하지 않습니다.');
      }
      const identity = `${item.kind}:${item.slug}`;
      if (identities.has(identity)) throw new ContentRepositoryError('CONFLICT', 'seed에 중복 종류·slug가 있습니다.');
      ids.add(item.id); identities.add(identity);
      const existingId = db.prepare('SELECT id,kind,slug FROM contents WHERE id=?').get(item.id) as { id: string; kind: string; slug: string } | undefined;
      const existingSlug = db.prepare('SELECT id FROM contents WHERE kind=? AND slug=?').get(item.kind, item.slug) as { id: string } | undefined;
      if ((existingId && (existingId.kind !== item.kind || existingId.slug !== item.slug)) ||
        (existingSlug && existingSlug.id !== item.id)) {
        throw new ContentRepositoryError('CONFLICT', '기존 콘텐츠와 예시 ID 또는 slug가 충돌합니다. 데이터는 변경하지 않았습니다.');
      }
      if (existingId) skipped.add(item.id);
    }

    const inserted = new Set<string>();
    for (const item of manifest.contents) {
      if (skipped.has(item.id!)) continue;
      repository.create({ ...item, relatedIds: [] });
      inserted.add(item.id!);
    }
    // Resolve relationships only after all new contents exist; existing contents/relationships are never replaced.
    for (const item of manifest.contents) {
      if (!inserted.has(item.id!)) continue;
      if (item.relatedIds !== undefined && (!Array.isArray(item.relatedIds) || item.relatedIds.length > 100 ||
        new Set(item.relatedIds).size !== item.relatedIds.length)) throw new ContentRepositoryError('VALIDATION_ERROR', 'seed 관련 콘텐츠 목록을 확인해 주세요.');
      for (const [index, targetId] of (item.relatedIds ?? []).entries()) {
        if (targetId === item.id || !ids.has(targetId)) throw new ContentRepositoryError('VALIDATION_ERROR', 'seed 관련 콘텐츠는 같은 예시 묶음의 다른 ID를 참조해야 합니다.');
        db.prepare('INSERT INTO content_relations(source_id,target_id,sort_order) VALUES (?,?,?)').run(item.id!, targetId, index);
      }
    }

    const uniqueHome = new Set<string>();
    for (const item of manifest.homeItems) {
      if (!item || !['featured', 'notice', 'program', 'resource'].includes(item.section) || !ids.has(item.contentId) ||
        Object.keys(item).some((key) => !['section', 'contentId'].includes(key))) throw new ContentRepositoryError('VALIDATION_ERROR', 'seed 메인 노출 대상을 확인해 주세요.');
      const homeKey = `${item.section}:${item.contentId}`;
      if (uniqueHome.has(homeKey)) throw new ContentRepositoryError('CONFLICT', 'seed 메인 노출 대상이 중복됩니다.');
      uniqueHome.add(homeKey);
      if (!inserted.has(item.contentId)) continue;
      const { nextOrder } = db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS nextOrder FROM home_items WHERE section=?').get(item.section) as { nextOrder: number };
      db.prepare('INSERT INTO home_items(section,content_id,sort_order) VALUES (?,?,?)').run(item.section, item.contentId, nextOrder);
    }
    db.prepare('INSERT INTO seed_runs(key,checksum,applied_at) VALUES (?,?,?)').run(manifest.key, checksum, new Date().toISOString());
    return { inserted: inserted.size, skipped: skipped.size, alreadyApplied: false };
  }).immediate();
}
