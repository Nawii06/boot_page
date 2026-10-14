import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Download, FileText } from 'lucide-react';
import type { ContactDetails, ContentKind, ContentRecord, ContentSummary } from '../../shared/content';
import { getPublicContent, getPublicPage, getPublicProgram, PublicContentRequestError } from '../api/content';
import { fileUrl } from '../api/notices';
import { dateLabel, sizeLabel } from './contentEditing';
import { Button } from './ui';

// Recheck public visibility on navigation and when returning from an editor tab.
// The request key prevents a previous page's data appearing during the next load.
export function usePublicRefresh() {
  const location = useLocation();
  const [attempt, setAttempt] = useState(0);
  const refresh = () => setAttempt((value) => value + 1);
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); window.removeEventListener('pageshow', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  return { requestKey: `${location.key}:${attempt}`, refresh };
}

export function usePublicPage(slug: string) {
  const { requestKey, refresh } = usePublicRefresh();
  const key = `${slug}:${requestKey}`;
  const [result, setResult] = useState<{ key: string; record: ContentRecord | null; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void getPublicPage(slug, controller.signal).then(({ data }) => {
      if (data.kind !== 'page' || data.slug !== slug || data.publication !== 'public') throw new PublicContentRequestError(404);
      if (active) setResult({ key, record: data, failed: false });
    }).catch((error: unknown) => { if (active) setResult({ key, record: null, failed: !(error instanceof PublicContentRequestError && error.status === 404) }); });
    return () => { active = false; controller.abort(); };
  }, [key, slug]);
  const current = result?.key === key ? result : null;
  return { loading: !current, record: current?.record ?? null, failed: current?.failed ?? false, refresh };
}

// Programs keep their original slug; notices and resources keep their UUID URL.
export function usePublicDetail(kind: Extract<ContentKind, 'notice' | 'resource' | 'curriculum' | 'activity'>, identifier: string) {
  const { requestKey, refresh } = usePublicRefresh();
  const key = `${kind}:${identifier}:${requestKey}`;
  const [result, setResult] = useState<{ key: string; record: ContentRecord | null; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const response = kind === 'curriculum' || kind === 'activity' ? getPublicProgram(kind, identifier, controller.signal) : getPublicContent(identifier, controller.signal);
    void response.then(({ data }) => {
      if (data.kind !== kind || data.publication !== 'public' || ((kind === 'curriculum' || kind === 'activity') ? data.slug !== identifier : data.id !== identifier)) throw new PublicContentRequestError(404);
      if (active) setResult({ key, record: data, failed: false });
    }).catch((error: unknown) => { if (active) setResult({ key, record: null, failed: !(error instanceof PublicContentRequestError && [400, 404].includes(error.status)) }); });
    return () => { active = false; controller.abort(); };
  }, [kind, identifier, key]);
  const current = result?.key === key ? result : null;
  return { loading: !current, record: current?.record ?? null, failed: current?.failed ?? false, refresh };
}

export function PublicContact({ contact }: { contact: ContactDetails | null }) {
  if (!contact || !Object.values(contact).some(Boolean)) return null;
  return <section className="notice-contact public-contact"><h3>문의처</h3><dl>{([['name', '담당'], ['phone', '전화'], ['email', '이메일'], ['address', '주소'], ['note', '안내']] as const).map(([key, label]) => contact[key] && <div key={key}><dt>{label}</dt><dd>{contact[key]}</dd></div>)}</dl></section>;
}

export function publicTarget(content: ContentSummary): { path: string } | null {
  if (content.kind === 'notice') return { path: `/notices/${encodeURIComponent(content.id)}` };
  if (content.kind === 'faq') return { path: `/faq?item=${encodeURIComponent(content.id)}` };
  if (content.kind === 'resource') return { path: `/resources/${encodeURIComponent(content.id)}` };
  if (content.kind === 'curriculum' || content.kind === 'activity') return { path: `/programs/${content.kind === 'curriculum' ? 'curriculum' : 'activities'}/${encodeURIComponent(content.slug)}` };
  if (content.kind === 'page') {
    if (content.slug === 'home') return { path: '/' };
    if (content.slug === 'guide') return { path: '/programs/guide' };
    if (['overview', 'organization', 'cooperation', 'location'].includes(content.slug)) return { path: `/about/${content.slug}` };
  }
  return null;
}

function safeExternalUrl(value: string) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/[\u0000-\u0020\u007f]/.test(value); } catch { return false; }
}

export function PublicAttachments({ record, showEmpty = false }: { record: ContentRecord; showEmpty?: boolean }) {
  const files = record.files.filter((file) => file.role === 'attachment');
  if (!files.length && !showEmpty) return null;
  return <section className="notice-attachments"><h3>첨부파일 <span>{files.length}</span></h3>{files.length ? <ul>{files.map((file) => <li key={file.id}><FileText size={21} aria-hidden="true" /><div><a href={fileUrl(file.id, record.id)}>{file.originalName}<Download size={15} aria-hidden="true" /></a><small>{file.extension.toUpperCase()} · {sizeLabel(file.size)}</small></div></li>)}</ul> : <p>등록된 첨부파일이 없습니다.</p>}</section>;
}

export function PublicRelated({ record }: { record: ContentRecord }) {
  const related = record.relatedContents.filter((item) => item.publication === 'public').map((item) => ({ item, target: publicTarget(item) })).filter(({ target }) => target !== null);
  const links = record.links.filter((link) => safeExternalUrl(link.url));
  return <>
    {related.length > 0 && <section className="public-related"><h3>관련 안내</h3><ul>{related.map(({ item, target }) => <li key={item.id}><Link to={target!.path}>{item.title}</Link></li>)}</ul></section>}
    {links.length > 0 && <section className="public-related"><h3>관련 사이트·신청 경로</h3><ul>{links.map((link) => <li key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (외부 사이트, 새 창)</span></a></li>)}</ul></section>}
  </>;
}

export function PublicContentDetails({ record, showEmptyFiles = false }: { record: ContentRecord; showEmptyFiles?: boolean }) {
  return <><div className="notice-content-body" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} /><PublicContact contact={record.contact} /><PublicAttachments record={record} showEmpty={showEmptyFiles} /><PublicRelated record={record} /></>;
}

export function PublicContentHeader({ record }: { record: ContentRecord }) {
  return <header><h2>{record.title}</h2><dl className="notice-metadata"><div><dt>수정일</dt><dd>{dateLabel(record.updatedAt)}</dd></div></dl></header>;
}

export function PublicFooterContact() {
  const { loading, failed, record, refresh } = usePublicPage('location');
  const contact = record?.contact;
  return <div className="footer-contact"><strong>사업단 문의</strong>
    {loading ? <p role="status">문의처를 불러오고 있습니다.</p> : failed ? <div className="footer-contact-error" role="alert"><p>문의처를 불러오지 못했습니다.</p><Button variant="quiet" onClick={refresh}>문의처 다시 불러오기</Button></div> : <dl>
      {contact?.name && <div><dt>담당</dt><dd>{contact.name}</dd></div>}
      <div><dt>전화 · 이메일</dt><dd>{contact?.phone || contact?.email ? <>{contact.phone && <span>{contact.phone}</span>}{contact.email && <span>{contact.email}</span>}</> : '공식 문의처 입력 대기'}</dd></div>
      <div><dt>주소</dt><dd>{contact?.address || '공식 주소 입력 대기'}</dd></div>
      {contact?.note && <div><dt>안내</dt><dd>{contact.note}</dd></div>}
    </dl>}
    <Link to="/about/location">오시는 길 <ArrowUpRight size={15} aria-hidden="true" /></Link>
  </div>;
}
