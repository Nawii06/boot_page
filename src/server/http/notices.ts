import { Router, json } from 'express';
import { randomUUID } from 'node:crypto';
import { contentKinds, type ContentInput, type ContentKind, type ContentRecord, type ContentFileInput, type ContentListQuery, type HomeItemInput, type Publication } from '../../shared/content.js';
import { ContentRepository, ContentRepositoryError } from '../repositories/contentRepository.js';
import type { FileService } from '../files/service.js';
import type { AppConfig } from '../config.js';
import { cleanNoticeHtml, safeContentRecord } from '../content/noticeHtml.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fail(message: string): never { throw new ContentRepositoryError('VALIDATION_ERROR', message); }
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('입력 형식을 확인해 주세요.');
}
function allowedKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) fail('지원하지 않는 입력 항목입니다.');
}

const editableKinds = ['notice', 'curriculum', 'activity', 'resource', 'faq'];
const fixedSlugs = ['overview', 'organization', 'cooperation', 'location', 'guide'];

/** Every editor shares the same sanitized content/file pipeline behind the app's auth/CSRF guards. */
export function contentAdminRouter(repository: ContentRepository, files: FileService, config: AppConfig) {
  const router = Router();
  router.use(json({ limit: '1mb', strict: true }));
  router.get('/upload-config', (_req, res) => res.json({ data: {
    maxUploadBytes: config.maxUploadBytes, maxFilesPerContent: config.maxFilesPerContent,
    extensions: ['hwp', 'hwpx', 'pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp'],
  } }));
  router.get('/notice-categories', (_req, res) => res.json({ data: repository.listNoticeCategories(false) }));
  router.get('/content-categories', (req, res) => {
    if (Object.keys(req.query).some(key => key !== 'kind') || typeof req.query.kind !== 'string' || !contentKinds.includes(req.query.kind as ContentKind)) fail('콘텐츠 종류를 확인해 주세요.');
    res.json({ data: repository.listCategories(req.query.kind as ContentKind, false) });
  });
  router.get('/contents', (req, res) => {
    const query: ContentListQuery & { publication?: Publication } = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (!['kind', 'q', 'category', 'publication', 'page', 'pageSize'].includes(key) || typeof value !== 'string') fail('조회 조건을 확인해 주세요.');
      if (key === 'page' || key === 'pageSize') {
        if (!/^\d+$/.test(value)) fail('페이지 범위를 확인해 주세요.');
        query[key] = Number(value);
      } else Object.assign(query, { [key]: value });
    }
    res.json(repository.listAdminContents(query));
  });
  router.get('/contents/:id/delete-impact', (req, res) => res.json({ data: repository.deleteImpact(req.params.id) }));
  router.get('/contents/:id', (req, res) => {
    const record = repository.getById(req.params.id);
    if (!record) throw new ContentRepositoryError('NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
    res.json({ data: safeContentRecord(record) });
  });

  function prepareBody(input: unknown, old?: ContentRecord, fixedSlug?: string): ContentInput {
    object(input);
    allowedKeys(input, ['kind', 'title', 'bodyHtml', 'category', 'pinned', 'sortOrder', 'publication', 'publishedAt', 'program', 'resource', 'contact', 'fileLinks', 'relatedIds', 'links', ...(old || fixedSlug ? ['revision'] : [])]);
    const kind = fixedSlug ? 'page' : old?.kind ?? input.kind;
    if (typeof kind !== 'string' || (!fixedSlug && !editableKinds.includes(kind)) || (input.kind !== undefined && input.kind !== kind)) fail('콘텐츠 종류는 생성 후 변경할 수 없습니다.');
    const contentId = old?.id ?? randomUUID();
    const base: ContentInput = old ? {
      id: old.id, kind: old.kind, slug: old.slug, title: old.title, bodyHtml: old.bodyHtml,
      category: old.category, pinned: old.pinned, publication: old.publication, publishedAt: old.publishedAt,
      sortOrder: old.sortOrder, ...(old.contact ? { contact: old.contact } : {}),
      ...(old.program ? { program: old.program } : {}), ...(old.resource ? { resource: old.resource } : {}),
      relatedIds: old.relatedContents.map(item => item.id), links: old.links,
      fileLinks: old.files.map(file => ({ fileId: file.id, role: file.role, altText: file.altText })),
    } : { id: contentId, kind: kind as ContentKind, slug: fixedSlug ?? `${kind}-${contentId}`, title: '', bodyHtml: '', publication: 'draft', fileLinks: [] };
    const { revision: _revision, ...fields } = input;
    const merged = { ...base, ...fields } as ContentInput;
    // Omitted details and nested fields preserve existing values during PATCH/PUT.
    for (const detail of ['program', 'resource', 'contact'] as const) {
      if (fields[detail] !== undefined) {
        object(fields[detail]);
        Object.assign(merged, { [detail]: { ...base[detail], ...fields[detail] } });
      }
    }
    const links = validateFileLinks(merged.fileLinks ?? [], fixedSlug === 'home');
    const clean = cleanBody(merged.bodyHtml, contentId, links);
    // Body links follow the sanitized HTML rather than arbitrary client-supplied URLs.
    const bodyIds = new Set(clean.imageIds);
    const finalLinks = links.filter(link => link.role !== 'body' || bodyIds.has(link.fileId));
    for (const fileId of bodyIds) if (!finalLinks.some(link => link.fileId === fileId && link.role === 'body')) finalLinks.push({ fileId, role: 'body', altText: clean.imageAltTexts.get(fileId) ?? '' });
    if (new Set(finalLinks.map(link => link.fileId)).size > config.maxFilesPerContent) fail(`콘텐츠당 최대 ${config.maxFilesPerContent}개 파일을 연결할 수 있습니다.`);
    merged.fileLinks = finalLinks;
    merged.bodyHtml = clean.html;
    if (!merged.bodyHtml.trim()) fail('본문을 입력해 주세요.');
    return merged;
  }

  function validateFileLinks(value: unknown, allowHome = false): ContentFileInput[] {
    if (!Array.isArray(value) || value.length > config.maxFilesPerContent * (allowHome ? 3 : 2)) fail('첨부파일 개수를 확인해 주세요.');
    const result: ContentFileInput[] = [];
    for (const link of value) {
      object(link); allowedKeys(link, ['fileId', 'role', 'altText']);
      if (typeof link.fileId !== 'string' || !uuid.test(link.fileId) || !(allowHome ? ['attachment', 'body', 'home'] : ['attachment', 'body']).includes(String(link.role))) fail('첨부파일 연결을 확인해 주세요.');
      if (link.altText !== undefined && (typeof link.altText !== 'string' || link.altText.length > 1000)) fail('이미지 대체 텍스트를 확인해 주세요.');
      const file = files.resolveDownload(link.fileId, undefined, true).metadata;
      if (link.role !== 'attachment' && !['jpg', 'jpeg', 'png', 'webp'].includes(file.extension)) fail('본문·메인에는 이미지 파일만 사용할 수 있습니다.');
      result.push({ fileId: link.fileId, role: link.role as ContentFileInput['role'], altText: link.altText as string | undefined });
    }
    if (result.filter(link => link.role === 'home').length > 1) fail('메인 이미지는 한 개만 선택해 주세요.');
    if (new Set(result.map(link => link.fileId)).size > config.maxFilesPerContent) fail('연결할 파일 개수를 확인해 주세요.');
    return result;
  }

  function cleanBody(body: unknown, contentId?: string, links: ContentFileInput[] = []) {
    return cleanNoticeHtml(body, id => {
      const file = files.resolveDownload(id, undefined, true).metadata;
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(file.extension)) fail('본문에는 이미지 파일만 사용할 수 있습니다.');
      return true;
    }, contentId, new Map(links.filter(link => link.role === 'body' && link.altText !== undefined).map(link => [link.fileId, link.altText!])));
  }

  router.post(['/contents/preview', '/notices/preview'], (req, res) => {
    object(req.body); allowedKeys(req.body, ['bodyHtml', 'fileLinks', 'contentId']);
    if (req.body.contentId !== undefined && (typeof req.body.contentId !== 'string' || !uuid.test(req.body.contentId))) fail('콘텐츠 식별자를 확인해 주세요.');
    const links = req.body.fileLinks !== undefined ? validateFileLinks(req.body.fileLinks, true) : [];
    // Preview URLs deliberately have no contentId: unlinked files still require the admin cookie.
    const clean = cleanBody(req.body.bodyHtml, undefined, links);
    res.json({ data: { bodyHtml: clean.html } });
  });
  router.post('/contents', (req, res) => {
    const record = repository.create(prepareBody(req.body));
    res.status(201).json({ data: safeContentRecord(record) });
  });
  router.patch('/contents/:id', (req, res) => {
    const old = repository.getById(req.params.id);
    if (!old) throw new ContentRepositoryError('NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
    if (old.kind === 'page') fail('고정 페이지는 해당 설정 화면에서 저장해 주세요.');
    const input = prepareBody(req.body, old);
    const record = repository.update(old.id, input, req.body.revision);
    res.json({ data: safeContentRecord(record) });
  });
  router.delete('/contents/:id', (req, res) => {
    object(req.body); allowedKeys(req.body, ['revision']);
    repository.deleteContent(req.params.id, req.body.revision as number);
    res.status(204).end();
  });
  router.get('/pages/:slug', (req, res) => {
    if (!fixedSlugs.includes(req.params.slug)) throw new ContentRepositoryError('NOT_FOUND', '페이지를 찾을 수 없습니다.');
    const record = repository.getBySlug('page', req.params.slug);
    res.json({ data: record ? safeContentRecord(record) : null });
  });
  router.put('/pages/:slug', (req, res) => {
    if (!fixedSlugs.includes(req.params.slug)) throw new ContentRepositoryError('NOT_FOUND', '페이지를 찾을 수 없습니다.');
    const old = repository.getBySlug('page', req.params.slug);
    const input = prepareBody(req.body, old ?? undefined, req.params.slug);
    const record = repository.savePage(input, req.body.revision);
    res.json({ data: safeContentRecord(record) });
  });
  router.get('/home', (_req, res) => {
    const result = repository.getAdminHome();
    res.json({ data: { ...result, page: result.page ? safeContentRecord(result.page) : null } });
  });
  router.put('/home', (req, res) => {
    object(req.body); allowedKeys(req.body, ['page', 'items']); object(req.body.page);
    const old = repository.getBySlug('page', 'home');
    const input = prepareBody(req.body.page, old ?? undefined, 'home');
    const result = repository.saveHome(input, req.body.items as HomeItemInput[], req.body.page.revision as number);
    res.json({ data: { ...result, page: safeContentRecord(result.page) } });
  });
  return router;
}
