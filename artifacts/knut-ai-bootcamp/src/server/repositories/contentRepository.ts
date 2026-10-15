import { randomUUID } from 'node:crypto';
import type BetterSqlite from 'better-sqlite3';
import { asDataDatabase, type DataDatabase } from '../db/dataDatabase.js';
import {
  contentKinds,
  type ContentKind, type ContentInput, type ContentRecord, type ContentSummary,
  type ContentListQuery, type ContentList, type ContentFileInput, type HomeItemInput,
  type PublicHome, type FileMetadataInput, type FileMetadata, type Publication,
} from '../../shared/content.js';

type Row = Record<string, any>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pageSlugs = ['overview', 'organization', 'cooperation', 'location', 'guide', 'home'];
const ordering = 'c.pinned DESC, c.sort_order ASC, COALESCE(c.published_at,c.created_at) DESC, c.id ASC';

export class ContentRepositoryError extends Error {
  constructor(public readonly code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT', message: string,
    public readonly statusCode = code === 'VALIDATION_ERROR' ? 400 : code === 'NOT_FOUND' ? 404 : 409) {
    super(message);
    this.name = 'ContentRepositoryError';
  }
}

function invalid(message: string): never { throw new ContentRepositoryError('VALIDATION_ERROR', message); }
function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} 형식을 확인해 주세요.`);
}
function keys(value: object, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid('지원하지 않는 입력 항목입니다.');
}
function text(value: unknown, label: string, max = 2000, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || value.includes('\0')) {
    invalid(`${label} 값을 확인해 주세요.`);
  }
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid('유효한 UUID 식별자가 필요합니다.');
}
function integer(value: unknown, label: string, min: number, max: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(`${label} 범위를 확인해 주세요.`);
}
function strings(value: unknown, fields: string[], label: string) {
  object(value, label);
  keys(value, fields);
  for (const field of fields) text(value[field], `${label}: ${field}`, 10000);
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) invalid(`${label}에 중복 식별자가 있습니다.`);
}
function summary(row: Row): ContentSummary {
  return {
    id: row.id, kind: row.kind, slug: row.slug, title: row.title, category: row.category,
    publication: row.publication, pinned: row.pinned === 1, sortOrder: row.sort_order,
    publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision,
    ...(['curriculum', 'activity'].includes(row.kind) && typeof row.program_level === 'string' ? { programLevel: row.program_level } : {}),
  };
}

/** Trusted server services only. HTTP callers must pass the auth/CSRF middleware first. */
export class ContentRepository {
  private readonly db: DataDatabase;

  constructor(db: DataDatabase | BetterSqlite.Database) {
    this.db = asDataDatabase(db);
  }

  private async write<T>(operation: () => T | Promise<T>): Promise<T> {
    try { return await this.db.transaction(operation).immediate(); }
    catch (error) {
      if (error instanceof ContentRepositoryError) throw error;
      if (error instanceof Error && 'code' in error &&
        (String(error.code).startsWith('SQLITE_CONSTRAINT') || ['23505', '23503', '23514'].includes(String(error.code)))) {
        throw new ContentRepositoryError('CONFLICT', '중복 식별자 또는 데이터 연결 제약을 확인해 주세요.');
      }
      throw error;
    }
  }

  private validate(input: ContentInput) {
    object(input, '콘텐츠');
    keys(input, ['id', 'kind', 'slug', 'title', 'bodyHtml', 'publication', 'category', 'pinned', 'sortOrder',
      'publishedAt', 'program', 'resource', 'contact', 'relatedIds', 'fileIds', 'fileLinks', 'links']);
    if (input.id !== undefined) id(input.id);
    if (!contentKinds.includes(input.kind)) invalid('콘텐츠 종류를 확인해 주세요.');
    text(input.slug, 'slug', 100, true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) invalid('slug는 영문 소문자, 숫자, 하이픈으로 입력해 주세요.');
    if (input.kind === 'page' && !pageSlugs.includes(input.slug)) invalid('고정 페이지 slug를 확인해 주세요.');
    text(input.title, '제목', 200, true);
    text(input.bodyHtml, '본문', 200000, true);
    if (!['draft', 'public', 'private'].includes(input.publication)) invalid('게시 여부를 확인해 주세요.');
    text(input.category ?? '', '분류', 100);
    if (input.pinned !== undefined && typeof input.pinned !== 'boolean') invalid('상단 고정 값을 확인해 주세요.');
    integer(input.sortOrder ?? 0, '정렬', 0, 1000000);
    if (input.publishedAt != null && (typeof input.publishedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.publishedAt) ||
      !Number.isFinite(Date.parse(input.publishedAt)) || new Date(input.publishedAt).toISOString() !== input.publishedAt)) {
      invalid('게시일은 UTC ISO 날짜로 입력해 주세요.');
    }
    const isProgram = input.kind === 'curriculum' || input.kind === 'activity';
    if (isProgram) strings(input.program, ['level', 'audience', 'delivery', 'completionRequirements'], '교육·프로그램 안내');
    else if (input.program !== undefined) invalid('이 콘텐츠에는 교육·프로그램 안내를 입력할 수 없습니다.');
    if (input.kind === 'resource') {
      object(input.resource, '서식 안내');
      const { applicableYear, ...fields } = input.resource;
      strings(fields, ['audience', 'requiredDocuments', 'instructions', 'deadlineText', 'submissionMethod', 'destination', 'contact'], '서식 안내');
      if (applicableYear !== null) integer(applicableYear, '적용 연도', 1900, 9999);
    } else if (input.resource !== undefined) invalid('이 콘텐츠에는 서식 안내를 입력할 수 없습니다.');
    if (input.contact !== undefined) {
      if (!['notice', 'page'].includes(input.kind)) invalid('문의처 필드는 공지·고정 페이지에만 사용할 수 있습니다.');
      strings(input.contact, ['name', 'phone', 'email', 'address', 'note'], '문의처');
    }
    if (input.relatedIds !== undefined) {
      if (!Array.isArray(input.relatedIds) || input.relatedIds.length > 100) invalid('관련 콘텐츠 목록을 확인해 주세요.');
      input.relatedIds.forEach(id);
      unique(input.relatedIds, '관련 콘텐츠');
    }
    if (input.fileIds !== undefined && input.fileLinks !== undefined) invalid('fileIds와 fileLinks는 동시에 입력할 수 없습니다.');
    if (input.fileIds !== undefined) {
      if (!Array.isArray(input.fileIds) || input.fileIds.length > 100) invalid('파일 목록을 확인해 주세요.');
      input.fileIds.forEach(id);
      unique(input.fileIds, '파일');
    }
    if (input.fileLinks !== undefined) {
      if (!Array.isArray(input.fileLinks) || input.fileLinks.length > 300) invalid('파일 연결 목록을 확인해 주세요.');
      for (const file of input.fileLinks) {
        object(file, '파일 연결'); keys(file, ['fileId', 'role', 'altText']); id(file.fileId);
        if (!['attachment', 'body', 'home'].includes(file.role)) invalid('파일 연결 용도를 확인해 주세요.');
        text(file.altText ?? '', '대체 텍스트', 1000);
      }
      unique(input.fileLinks.map((file) => `${file.fileId}:${file.role}`), '파일 연결');
      if (new Set(input.fileLinks.map(file => file.fileId)).size > 100) invalid('파일은 콘텐츠당 최대 100개까지 연결할 수 있습니다.');
    }
    if (input.links !== undefined) {
      if (!Array.isArray(input.links) || input.links.length > 50) invalid('외부 링크 목록을 확인해 주세요.');
      const linkIds: string[] = [];
      for (const link of input.links) {
        object(link, '외부 링크'); keys(link, ['id', 'label', 'url']);
        if (link.id !== undefined) { id(link.id); linkIds.push(link.id); }
        text(link.label, '링크 이름', 200, true); text(link.url, '링크 URL', 2048, true);
        let parsed: URL;
        try { parsed = new URL(link.url); } catch { invalid('링크 URL을 확인해 주세요.'); }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\x00-\x20]/.test(link.url)) invalid('http/https 외부 링크만 허용합니다.');
      }
      unique(linkIds, '외부 링크');
    }
  }

  async create(input: ContentInput): Promise<ContentRecord> {
    this.validate(input);
    return this.write(async () => {
      const contentId = input.id ?? randomUUID();
      const now = new Date().toISOString();
      await this.db.prepare(`INSERT INTO contents
        (id,kind,slug,title,body_html,category,publication,pinned,sort_order,published_at,created_at,updated_at,revision)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(contentId, input.kind, input.slug, input.title, input.bodyHtml,
        input.category ?? '', input.publication, input.pinned ? 1 : 0, input.sortOrder ?? 0,
        input.publishedAt === undefined ? (input.publication === 'public' ? now : null) : input.publishedAt, now, now);
      await this.replaceDetails(contentId, input);
      return (await this.getById(contentId))!;
    });
  }

  async update(contentId: string, input: ContentInput, expectedRevision: number): Promise<ContentRecord> {
    id(contentId); this.validate(input); integer(expectedRevision, '수정 버전', 1, Number.MAX_SAFE_INTEGER);
    return this.write(async () => {
      const old = await this.db.prepare('SELECT * FROM contents WHERE id=?').get(contentId) as Row | undefined;
      if (!old) throw new ContentRepositoryError('NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
      if ((input.id !== undefined && input.id !== contentId) || old.kind !== input.kind || old.slug !== input.slug) {
        throw new ContentRepositoryError('CONFLICT', '콘텐츠 식별자·종류·slug는 변경할 수 없습니다.');
      }
      if (old.revision !== expectedRevision) throw new ContentRepositoryError('CONFLICT', '다른 수정 내용이 있습니다. 새로 조회해 주세요.');
      const now = new Date().toISOString();
      const result = await this.db.prepare(`UPDATE contents SET title=?,body_html=?,category=?,publication=?,pinned=?,sort_order=?,
        published_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?`).run(input.title, input.bodyHtml,
        input.category ?? '', input.publication, input.pinned ? 1 : 0, input.sortOrder ?? 0,
        input.publishedAt === undefined ? (old.published_at ?? (input.publication === 'public' ? now : null)) : input.publishedAt,
        now, contentId, expectedRevision);
      if (result.changes !== 1) throw new ContentRepositoryError('CONFLICT', '수정 버전이 일치하지 않습니다.');
      await this.replaceDetails(contentId, input);
      return (await this.getById(contentId))!;
    });
  }

  private async replaceDetails(contentId: string, input: ContentInput): Promise<void> {
    const relatedIds = input.relatedIds ?? [];
    for (const targetId of relatedIds) {
      if (targetId === contentId || !await this.db.prepare('SELECT 1 FROM contents WHERE id=?').get(targetId)) invalid('관련 콘텐츠의 연결 대상을 확인해 주세요.');
    }
    const fileLinks: ContentFileInput[] = input.fileLinks ?? (input.fileIds ?? []).map((fileId) => ({ fileId, role: 'attachment' }));
    for (const file of fileLinks) {
      const target = await this.db.prepare('SELECT extension FROM files WHERE id=?').get(file.fileId) as Row | undefined;
      if (!target) invalid('파일의 연결 대상을 확인해 주세요.');
      if (file.role !== 'attachment' && !['jpg', 'jpeg', 'png', 'webp'].includes(target.extension)) invalid('본문·메인 이미지에는 이미지 파일만 연결할 수 있습니다.');
    }
    // Each table name is a fixed internal constant; user values only enter prepared bindings.
    for (const table of ['program_details', 'resource_details', 'contact_details', 'content_files', 'content_links']) {
      await this.db.prepare(`DELETE FROM ${table} WHERE content_id=?`).run(contentId);
    }
    await this.db.prepare('DELETE FROM content_relations WHERE source_id=?').run(contentId);
    if (input.program) {
      const p = input.program;
      await this.db.prepare(`INSERT INTO program_details(content_id,level,audience,delivery,completion_requirements)
        VALUES (?,?,?,?,?)`).run(contentId, p.level, p.audience, p.delivery, p.completionRequirements);
    }
    if (input.resource) {
      const r = input.resource;
      await this.db.prepare(`INSERT INTO resource_details(content_id,audience,required_documents,instructions,deadline_text,
        submission_method,destination,contact,applicable_year) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(contentId, r.audience, r.requiredDocuments, r.instructions, r.deadlineText, r.submissionMethod, r.destination, r.contact, r.applicableYear);
    }
    if (input.contact) {
      const c = input.contact;
      await this.db.prepare('INSERT INTO contact_details(content_id,name,phone,email,address,note) VALUES (?,?,?,?,?,?)')
        .run(contentId, c.name, c.phone, c.email, c.address, c.note);
    }
    for (const [index, targetId] of relatedIds.entries()) {
      await this.db.prepare('INSERT INTO content_relations(source_id,target_id,sort_order) VALUES (?,?,?)').run(contentId, targetId, index);
    }
    for (const [index, file] of fileLinks.entries()) {
      await this.db.prepare('INSERT INTO content_files(content_id,file_id,role,sort_order,alt_text) VALUES (?,?,?,?,?)')
        .run(contentId, file.fileId, file.role, index, file.altText ?? '');
    }
    for (const [index, link] of (input.links ?? []).entries()) {
      await this.db.prepare('INSERT INTO content_links(id,content_id,label,url,sort_order) VALUES (?,?,?,?,?)')
        .run(link.id ?? randomUUID(), contentId, link.label, link.url, index);
    }
  }

  getById(contentId: string): Promise<ContentRecord | null> { return this.read(contentId, false); }
  getPublicById(contentId: string): Promise<ContentRecord | null> { return this.read(contentId, true); }

  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    if (!uuidPattern.test(fileId)) return null;
    const row = await this.db.prepare('SELECT * FROM files WHERE id=?').get(fileId) as Row | undefined;
    return row ? { id: row.id, storageKey: row.storage_key, originalName: row.original_name, mediaType: row.media_type,
      extension: row.extension, size: row.size, sha256: row.sha256, createdAt: row.created_at } : null;
  }

  listNoticeCategories(publicOnly: boolean): Promise<string[]> {
    return this.listCategories('notice', publicOnly);
  }

  async listCategories(kind: ContentKind, publicOnly: boolean): Promise<string[]> {
    if (!contentKinds.includes(kind)) invalid('콘텐츠 종류를 확인해 주세요.');
    return (await this.db.prepare(`SELECT DISTINCT category FROM contents WHERE kind=? AND category<>''
      ${publicOnly ? "AND publication='public'" : ''} ORDER BY category LIMIT 500`).all(kind) as { category: string }[]).map(row => row.category);
  }

  listAdminNotices(query: ContentListQuery & { publication?: Publication } = {}): Promise<ContentList> {
    return this.listAdminContents({ ...query, kind: 'notice' });
  }

  async listAdminContents(query: ContentListQuery & { publication?: Publication } = {}): Promise<ContentList> {
    object(query, '검색'); keys(query, ['kind', 'q', 'category', 'page', 'pageSize', 'publication']);
    const kind = (query as ContentListQuery).kind;
    if (kind !== undefined && !contentKinds.includes(kind)) invalid('콘텐츠 종류를 확인해 주세요.');
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
    integer(page, '페이지', 1, 100000); integer(pageSize, '페이지 크기', 1, 100);
    const where = [kind === undefined ? "c.kind<>'page'" : 'c.kind=?'];
    const bindings: (string | number)[] = kind === undefined ? [] : [kind];
    const publication = (query as ContentListQuery & { publication?: Publication }).publication;
    if (publication !== undefined) {
      if (!['draft', 'public', 'private'].includes(publication)) invalid('게시 여부를 확인해 주세요.');
      where.push('c.publication=?'); bindings.push(publication);
    }
    if (query.category !== undefined) { text(query.category, '분류', 100); where.push('c.category=?'); bindings.push(query.category); }
    if (query.q !== undefined) {
      text(query.q, '검색어', 200);
      const escaped = query.q.trim().replace(/[\\%_]/g, '\\$&');
      if (escaped) { where.push("(c.title LIKE ? ESCAPE '\\' OR c.body_html LIKE ? ESCAPE '\\')"); bindings.push(`%${escaped}%`, `%${escaped}%`); }
    }
    return this.db.transaction(async () => {
      const condition = where.join(' AND ');
      const { total } = await this.db.prepare(`SELECT COUNT(*) AS total FROM contents c WHERE ${condition}`).get(...bindings) as { total: number };
      const rows = await this.db.prepare(`SELECT c.*,p.level AS program_level FROM contents c
        LEFT JOIN program_details p ON p.content_id=c.id WHERE ${condition} ORDER BY ${ordering} LIMIT ? OFFSET ?`)
        .all(...bindings, pageSize, (page - 1) * pageSize) as Row[];
      return { data: rows.map(summary), pagination: { page, pageSize, total } };
    }).deferred();
  }

  deleteImpact(contentId: string): Promise<{ id: string; revision: number; incomingLinks: number; homeLinks: number; files: { id: string; originalName: string; otherReferences: number }[] }> {
    id(contentId);
    return this.db.transaction(async () => {
      const content = await this.db.prepare('SELECT id, revision, kind, slug FROM contents WHERE id=?').get(contentId) as { id: string; revision: number; kind: ContentKind; slug: string } | undefined;
      if (!content) throw new ContentRepositoryError('NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
      const incomingLinks = (await this.db.prepare('SELECT count(*) AS n FROM content_relations WHERE target_id=?').get(contentId) as { n: number }).n;
      const homeLinks = content.kind === 'page' && content.slug === 'home'
        ? (await this.db.prepare('SELECT count(*) AS n FROM home_items').get() as { n: number }).n
        : (await this.db.prepare('SELECT count(*) AS n FROM home_items WHERE content_id=?').get(contentId) as { n: number }).n;
      const files = await this.db.prepare(`SELECT DISTINCT f.id, f.original_name AS originalName,
        (SELECT count(DISTINCT cf2.content_id) FROM content_files cf2 WHERE cf2.file_id=f.id AND cf2.content_id<>?) AS otherReferences
        FROM files f JOIN content_files cf ON cf.file_id=f.id WHERE cf.content_id=? ORDER BY f.id`).all(contentId, contentId) as { id: string; originalName: string; otherReferences: number }[];
      return { id: content.id, revision: content.revision, incomingLinks, homeLinks, files };
    }).deferred();
  }

  async deleteNotice(contentId: string, expectedRevision: number): Promise<void> {
    const content = await this.getById(contentId);
    if (!content || content.kind !== 'notice') throw new ContentRepositoryError('NOT_FOUND', '공지를 찾을 수 없습니다.');
    await this.deleteContent(contentId, expectedRevision);
  }

  async noticeDeleteImpact(contentId: string): Promise<Awaited<ReturnType<ContentRepository['deleteImpact']>>> {
    const content = await this.getById(contentId);
    if (!content || content.kind !== 'notice') throw new ContentRepositoryError('NOT_FOUND', '공지를 찾을 수 없습니다.');
    return this.deleteImpact(contentId);
  }

  async deleteContent(contentId: string, expectedRevision: number): Promise<void> {
    id(contentId); integer(expectedRevision, '수정 버전', 1, Number.MAX_SAFE_INTEGER);
    await this.write(async () => {
      const impact = await this.deleteImpact(contentId);
      if (impact.revision !== expectedRevision) throw new ContentRepositoryError('CONFLICT', '다른 수정 내용이 있습니다. 삭제 영향을 다시 확인해 주세요.');
      const content = (await this.getById(contentId))!;
      if (content.kind === 'page' && content.slug === 'home') await this.db.prepare('DELETE FROM home_items').run();
      // Only content-owned links are cascaded. Shared and unlinked file originals stay intact.
      await this.db.prepare('DELETE FROM contents WHERE id=? AND revision=?').run(contentId, expectedRevision);
    });
  }

  /** A file is public only through an actual public content link; paths/URLs confer no access. */
  async canReadFile(fileId: string, contentId: string | undefined, administrator: boolean): Promise<boolean> {
    if (!uuidPattern.test(fileId) || (contentId !== undefined && !uuidPattern.test(contentId))) return false;
    if (administrator && contentId === undefined) return Boolean(await this.db.prepare('SELECT 1 FROM files WHERE id=?').get(fileId));
    const sql = `SELECT 1 FROM content_files cf JOIN contents c ON c.id=cf.content_id JOIN files f ON f.id=cf.file_id
      WHERE f.id=?${contentId === undefined ? '' : ' AND c.id=?'}${administrator ? '' : " AND c.publication='public'"} LIMIT 1`;
    return Boolean(await this.db.prepare(sql).get(...(contentId === undefined ? [fileId] : [fileId, contentId])));
  }

  private read(contentId: string, publicOnly: boolean): Promise<ContentRecord | null> {
    return this.db.transaction(() => this.readSnapshot(contentId, publicOnly)).deferred();
  }

  private async readSnapshot(contentId: string, publicOnly: boolean): Promise<ContentRecord | null> {
    if (typeof contentId !== 'string' || !uuidPattern.test(contentId)) return null;
    const row = await this.db.prepare(`SELECT * FROM contents WHERE id=?${publicOnly ? " AND publication='public'" : ''}`).get(contentId) as Row | undefined;
    if (!row) return null;
    const program = await this.db.prepare('SELECT * FROM program_details WHERE content_id=?').get(contentId) as Row | undefined;
    const resource = await this.db.prepare('SELECT * FROM resource_details WHERE content_id=?').get(contentId) as Row | undefined;
    const contact = await this.db.prepare('SELECT * FROM contact_details WHERE content_id=?').get(contentId) as Row | undefined;
    const related = await this.db.prepare(`SELECT c.*,p.level AS program_level FROM content_relations r JOIN contents c ON c.id=r.target_id
      LEFT JOIN program_details p ON p.content_id=c.id
      WHERE r.source_id=?${publicOnly ? " AND c.publication='public'" : ''} ORDER BY r.sort_order,c.id`).all(contentId) as Row[];
    const files = await this.db.prepare(`SELECT f.id,f.original_name,f.media_type,f.extension,f.size,f.created_at,cf.role,cf.alt_text
      FROM content_files cf JOIN files f ON f.id=cf.file_id WHERE cf.content_id=? ORDER BY cf.sort_order,f.id`).all(contentId) as Row[];
    const links = await this.db.prepare('SELECT id,label,url FROM content_links WHERE content_id=? ORDER BY sort_order,id').all(contentId) as { id: string; label: string; url: string }[];
    return {
      ...summary({ ...row, program_level: program?.level }), bodyHtml: row.body_html,
      program: program ? { level: program.level, audience: program.audience, delivery: program.delivery, completionRequirements: program.completion_requirements } : null,
      resource: resource ? { audience: resource.audience, requiredDocuments: resource.required_documents, instructions: resource.instructions,
        deadlineText: resource.deadline_text, submissionMethod: resource.submission_method, destination: resource.destination, contact: resource.contact, applicableYear: resource.applicable_year } : null,
      contact: contact ? { name: contact.name, phone: contact.phone, email: contact.email, address: contact.address, note: contact.note } : null,
      relatedContents: related.map(summary),
      files: files.map((f) => ({ id: f.id, originalName: f.original_name, mediaType: f.media_type, extension: f.extension,
        size: f.size, createdAt: f.created_at, role: f.role, altText: f.alt_text })),
      links,
    };
  }

  async getPublicBySlug(kind: ContentKind, slug: string): Promise<ContentRecord | null> {
    if (!contentKinds.includes(kind) || typeof slug !== 'string' || slug.length > 100) return null;
    return this.db.transaction(async () => {
      const row = await this.db.prepare("SELECT id FROM contents WHERE kind=? AND slug=? AND publication='public'").get(kind, slug) as { id: string } | undefined;
      return row ? this.getPublicById(row.id) : null;
    }).deferred();
  }

  async getBySlug(kind: ContentKind, slug: string): Promise<ContentRecord | null> {
    if (!contentKinds.includes(kind) || typeof slug !== 'string' || slug.length > 100) return null;
    return this.db.transaction(async () => {
      const row = await this.db.prepare('SELECT id FROM contents WHERE kind=? AND slug=?').get(kind, slug) as { id: string } | undefined;
      return row ? this.getById(row.id) : null;
    }).deferred();
  }

  /** Revision zero creates a missing fixed page; it never overwrites another first save. */
  async savePage(input: ContentInput, expectedRevision: number): Promise<ContentRecord> {
    if (input.kind !== 'page' || !pageSlugs.includes(input.slug)) invalid('고정 페이지를 확인해 주세요.');
    integer(expectedRevision, '수정 버전', 0, Number.MAX_SAFE_INTEGER);
    return this.write(async () => {
      const old = await this.getBySlug('page', input.slug);
      if (!old) {
        if (expectedRevision !== 0) throw new ContentRepositoryError('CONFLICT', '페이지가 삭제되었습니다. 새로 조회해 주세요.');
        return this.create(input);
      }
      if (expectedRevision === 0) throw new ContentRepositoryError('CONFLICT', '다른 관리자가 페이지를 저장했습니다. 새로 조회해 주세요.');
      return this.update(old.id, input, expectedRevision);
    });
  }

  getAdminHome(): Promise<{ page: ContentRecord | null; items: HomeItemInput[] }> {
    return this.db.transaction(async () => ({
      page: await this.getBySlug('page', 'home'),
      items: await this.db.prepare('SELECT section, content_id AS contentId FROM home_items ORDER BY sort_order,section,content_id').all() as HomeItemInput[],
    })).deferred();
  }

  async saveHome(input: ContentInput, items: HomeItemInput[], expectedRevision: number): Promise<{ page: ContentRecord; items: HomeItemInput[] }> {
    if (input.kind !== 'page' || input.slug !== 'home') invalid('메인 설정을 확인해 주세요.');
    return this.write(async () => {
      const page = await this.savePage(input, expectedRevision);
      await this.setHomeItems(items);
      return { page, items: (await this.getAdminHome()).items };
    });
  }

  listPublic(query: ContentListQuery = {}): Promise<ContentList> {
    return this.db.transaction(() => this.listPublicSnapshot(query)).deferred();
  }

  private async listPublicSnapshot(query: ContentListQuery): Promise<ContentList> {
    object(query, '검색'); keys(query, ['kind', 'q', 'category', 'page', 'pageSize']);
    const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
    integer(page, '페이지', 1, 100000); integer(pageSize, '페이지 크기', 1, 100);
    const where = ["c.publication='public'"]; const bindings: (string | number)[] = [];
    const kind = (query as ContentListQuery).kind;
    if (kind !== undefined) {
      if (!contentKinds.includes(kind)) invalid('콘텐츠 종류를 확인해 주세요.');
      where.push('c.kind=?'); bindings.push(kind);
    }
    if (query.category !== undefined) { text(query.category, '분류', 100); where.push('c.category=?'); bindings.push(query.category); }
    if (query.q !== undefined) {
      text(query.q, '검색어', 200);
      const escaped = query.q.trim().replace(/[\\%_]/g, '\\$&');
      if (escaped) { where.push("(c.title LIKE ? ESCAPE '\\' OR c.body_html LIKE ? ESCAPE '\\')"); bindings.push(`%${escaped}%`, `%${escaped}%`); }
    }
    const condition = where.join(' AND ');
    const { total } = await this.db.prepare(`SELECT COUNT(*) AS total FROM contents c WHERE ${condition}`).get(...bindings) as { total: number };
    const rows = await this.db.prepare(`SELECT c.*,p.level AS program_level FROM contents c
      LEFT JOIN program_details p ON p.content_id=c.id WHERE ${condition} ORDER BY ${ordering} LIMIT ? OFFSET ?`)
      .all(...bindings, pageSize, (page - 1) * pageSize) as Row[];
    return { data: rows.map(summary), pagination: { page, pageSize, total } };
  }

  getPublicHome(): Promise<PublicHome> {
    return this.db.transaction(() => this.publicHomeSnapshot()).deferred();
  }

  private async publicHomeSnapshot(): Promise<PublicHome> {
    const sections: PublicHome['sections'] = { featured: [], notice: [], program: [], resource: [] };
    const configuration = await this.getBySlug('page', 'home');
    const rows = await this.db.prepare(`SELECT c.*,h.section,p.level AS program_level FROM home_items h JOIN contents c ON c.id=h.content_id
      LEFT JOIN program_details p ON p.content_id=c.id
      WHERE c.publication='public' ORDER BY h.section,h.sort_order,c.id`).all() as Row[];
    if (!configuration || configuration.publication === 'public') {
      for (const row of rows) sections[row.section as keyof typeof sections].push(summary(row));
    }
    const latest = await this.db.prepare(`SELECT * FROM contents WHERE kind='notice' AND publication='public'
      ORDER BY COALESCE(published_at,created_at) DESC,id ASC LIMIT 5`).all() as Row[];
    return { page: await this.getPublicBySlug('page', 'home'), sections, latestNotices: latest.map(summary) };
  }

  async setHomeItems(items: HomeItemInput[]): Promise<void> {
    if (!Array.isArray(items) || items.length > 100) invalid('메인 노출 목록을 확인해 주세요.');
    for (const item of items) {
      object(item, '메인 노출'); keys(item, ['section', 'contentId']); id(item.contentId);
      if (!['featured', 'notice', 'program', 'resource'].includes(item.section)) invalid('메인 노출 영역을 확인해 주세요.');
    }
    unique(items.map((item) => `${item.section}:${item.contentId}`), '메인 노출');
    await this.write(async () => {
      for (const item of items) {
        const target = await this.db.prepare('SELECT kind,slug FROM contents WHERE id=?').get(item.contentId) as Row | undefined;
        if (!target) invalid('메인 노출 콘텐츠를 찾을 수 없습니다.');
        if (target.kind === 'page' && target.slug === 'home') invalid('메인 설정 자체는 노출 콘텐츠로 선택할 수 없습니다.');
        if ((item.section === 'notice' && target.kind !== 'notice') || (item.section === 'resource' && target.kind !== 'resource') ||
          (item.section === 'program' && !['curriculum', 'activity'].includes(target.kind))) invalid('콘텐츠 종류와 메인 노출 영역이 일치하지 않습니다.');
      }
      await this.db.prepare('DELETE FROM home_items').run();
      for (const [index, item] of items.entries()) {
        await this.db.prepare('INSERT INTO home_items(section,content_id,sort_order) VALUES (?,?,?)').run(item.section, item.contentId, index);
      }
    });
  }

  async createFile(input: FileMetadataInput): Promise<FileMetadata> {
    object(input, '파일 메타데이터'); keys(input, ['id', 'storageKey', 'originalName', 'mediaType', 'extension', 'size', 'sha256']);
    if (input.id !== undefined) id(input.id);
    text(input.storageKey, '저장키', 240, true);
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_.-]+)*$/.test(input.storageKey) || input.storageKey.split('/').some((part) => part === '.' || part === '..')) invalid('저장키는 안전한 상대 키여야 합니다.');
    text(input.originalName, '원본 파일명', 255, true);
    if (/[\\/\r\n]/.test(input.originalName)) invalid('원본 파일명에 경로 문자를 사용할 수 없습니다.');
    text(input.mediaType, '미디어 유형', 150, true);
    if (!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(input.mediaType)) invalid('미디어 유형을 확인해 주세요.');
    if (!['hwp', 'hwpx', 'pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp'].includes(input.extension)) invalid('지원하는 확장자를 확인해 주세요.');
    if (!input.originalName.toLowerCase().endsWith(`.${input.extension}`)) invalid('원본 파일명과 확장자가 일치하지 않습니다.');
    integer(input.size, '파일 크기', 0, Number.MAX_SAFE_INTEGER);
    if (typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)) invalid('SHA-256 값을 확인해 주세요.');
    return this.write(async () => {
      const file = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
      await this.db.prepare(`INSERT INTO files(id,storage_key,original_name,media_type,extension,size,sha256,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(file.id, file.storageKey, file.originalName, file.mediaType, file.extension, file.size, file.sha256, file.createdAt);
      return file;
    });
  }
}
