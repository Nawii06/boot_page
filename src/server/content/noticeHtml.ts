import sanitizeHtml from 'sanitize-html';
import type { ContentRecord } from '../../shared/content.js';
import { ContentRepositoryError } from '../repositories/contentRepository.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Only the server constructs image URLs. External/data/SVG images never survive. */
export function cleanNoticeHtml(input: unknown, imageAllowed: (id: string) => boolean, contentId?: string, imageAlts: ReadonlyMap<string, string> = new Map()) {
  if (typeof input !== 'string' || input.length > 200000 || input.includes('\0')) {
    throw new ContentRepositoryError('VALIDATION_ERROR', '본문은 200,000자 이내로 입력해 주세요.');
  }
  const imageIds = new Set<string>();
  const imageAltTexts = new Map<string, string>();
  const html = sanitizeHtml(input, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4', 'blockquote',
      'ul', 'ol', 'li', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a', 'img',
      'hr', 'span', 'pre', 'code', 'sub', 'sup'],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'], img: ['data-file-id', 'src', 'alt', 'loading'],
      th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'], ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'svg', 'math', 'template'],
    nestingLimit: 40,
    transformTags: {
      a: (_tag, attrs) => ({ tagName: 'a', attribs: {
        ...(attrs.href ? { href: attrs.href } : {}), ...(attrs.title ? { title: attrs.title.slice(0, 200) } : {}),
        ...(attrs.target === '_blank' ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      } }),
      img: (_tag, attrs): sanitizeHtml.Tag => {
        const fileId = attrs['data-file-id'];
        if (!fileId || !uuid.test(fileId) || !imageAllowed(fileId)) return { tagName: 'span', attribs: {} };
        imageIds.add(fileId);
        const alt = (imageAlts.get(fileId) ?? attrs.alt ?? '').slice(0, 1000);
        imageAltTexts.set(fileId, alt);
        const query = contentId ? `?contentId=${encodeURIComponent(contentId)}&inline=1` : '?inline=1';
        return { tagName: 'img', attribs: {
          'data-file-id': fileId, src: `/api/files/${fileId}${query}`, alt, loading: 'lazy',
        } };
      },
      '*': (tag, attrs): sanitizeHtml.Tag => {
        if (tag === 'td' || tag === 'th') {
          const safe: Record<string, string> = {};
          for (const key of ['colspan', 'rowspan']) if (/^\d{1,2}$/.test(attrs[key] || '') && Number(attrs[key]) >= 1 && Number(attrs[key]) <= 20) safe[key] = attrs[key];
          if (tag === 'th' && ['row', 'col'].includes(attrs.scope)) safe.scope = attrs.scope;
          return { tagName: tag, attribs: safe };
        }
        if (tag === 'ol') return { tagName: tag, attribs: /^\d{1,4}$/.test(attrs.start || '') ? { start: attrs.start } : {} };
        return { tagName: tag, attribs: attrs };
      },
    },
  });
  return { html, imageIds: [...imageIds], imageAltTexts };
}

/** Sanitize on reads as well, so old seed/import/local DB HTML cannot execute in the UI. */
export function safeContentRecord(record: ContentRecord): ContentRecord {
  const images = new Set(record.files.filter(file => file.role === 'body' && ['jpg', 'jpeg', 'png', 'webp'].includes(file.extension)).map(file => file.id));
  const alts = new Map(record.files.filter(file => file.role === 'body').map(file => [file.id, file.altText]));
  return { ...record, bodyHtml: cleanNoticeHtml(record.bodyHtml, id => images.has(id), record.id, alts).html };
}

// P-05 callers retain the original name while every content type uses the same sanitizer.
export const safeNoticeRecord = safeContentRecord;
