import { Router } from 'express';
import { contentKinds, type ContentKind, type ContentListQuery } from '../../shared/content.js';
import type { ContentRepository } from '../repositories/contentRepository.js';
import { safeContentRecord } from '../content/noticeHtml.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicContentsRouter(repository: ContentRepository) {
  const router = Router();
  router.get('/notice-categories', (_req, res) => res.json({ data: repository.listNoticeCategories(true) }));
  router.get('/content-categories', (req, res) => {
    const kind = req.query.kind;
    if (Object.keys(req.query).some(key => key !== 'kind') || typeof kind !== 'string' || !contentKinds.includes(kind as ContentKind)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '콘텐츠 종류를 확인해 주세요.' } });
      return;
    }
    res.json({ data: repository.listCategories(kind as ContentKind, true) });
  });
  router.get('/contents', (req, res) => {
    const allowed = ['kind', 'q', 'category', 'page', 'pageSize'];
    const query: ContentListQuery = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (!allowed.includes(key) || typeof value !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '조회 조건을 확인해 주세요.' } });
        return;
      }
      if (key === 'kind') {
        if (!contentKinds.includes(value as ContentKind)) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '콘텐츠 종류를 확인해 주세요.' } });
          return;
        }
        query.kind = value as ContentKind;
      } else if (key === 'page' || key === 'pageSize') {
        const maximum = key === 'pageSize' ? 100 : 100000;
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '페이지 범위를 확인해 주세요.' } });
          return;
        }
        query[key] = Number(value);
      } else if (key === 'q' || key === 'category') {
        if (value.length > (key === 'q' ? 200 : 100)) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '검색 조건이 너무 깁니다.' } });
          return;
        }
        query[key] = value;
      }
    }
    res.json(repository.listPublic(query));
  });
  router.get('/contents/:id', (req, res) => {
    const content = uuid.test(req.params.id) ? repository.getPublicById(req.params.id) : null;
    if (!content) { res.status(404).json(notFound); return; }
    res.json({ data: safeContentRecord(content) });
  });
  router.get('/pages/:slug', (req, res) => {
    if (!['overview', 'organization', 'cooperation', 'location', 'guide', 'home'].includes(req.params.slug)) {
      res.status(404).json(notFound); return;
    }
    const content = repository.getPublicBySlug('page', req.params.slug);
    if (!content) { res.status(404).json(notFound); return; }
    res.json({ data: safeContentRecord(content) });
  });
  router.get('/programs/:kind/:slug', (req, res) => {
    const { kind, slug } = req.params;
    if (!['curriculum', 'activity'].includes(kind) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) {
      res.status(404).json(notFound); return;
    }
    const content = repository.getPublicBySlug(kind as ContentKind, slug);
    if (!content) { res.status(404).json(notFound); return; }
    res.json({ data: safeContentRecord(content) });
  });
  router.get('/home', (_req, res) => {
    const result = repository.getPublicHome();
    res.json({ data: { ...result, page: result.page ? safeContentRecord(result.page) : null } });
  });
  return router;
}

const notFound = { error: { code: 'NOT_FOUND', message: '공개된 콘텐츠를 찾을 수 없습니다.' } };
