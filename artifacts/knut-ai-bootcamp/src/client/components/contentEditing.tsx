import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { ContentFile, ContentFileInput, ContentKind, ContentList, ContentSummary, FileRole, Publication } from '../../shared/content';
import { listAdminContents } from '../api/adminContents';
import { fileUrl, noticeError, uploadNoticeFile, type UploadConfig } from '../api/notices';
import { Button, LoadingState, Notice } from './ui';

export const publicationLabels: Record<Publication, string> = { draft: '초안', public: '공개', private: '비공개' };
export const kindLabels: Record<ContentKind, string> = { notice: '공지', curriculum: '교육과정', activity: '비교과·산학 프로그램', resource: '서식', faq: '질문·답변', page: '고정 안내' };
export const sizeLabel = (value: number) => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
export const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '미지정';
export const toFileLinks = (files: ContentFile[]): ContentFileInput[] => files.map((file) => ({ fileId: file.id, role: file.role, altText: file.altText }));
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
export function localDateTime(value: string | null) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
export function replaceBodyImageFileId(html: string, previousId: string, nextId: string) {
  // Inspect strings only; untrusted source HTML must never be mounted in the DOM.
  return html.replace(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, (tag) => tag.replace(
    /(\s+)([^\s"'<>/=]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    (attribute, space: string, name: string, equals: string, doubleQuoted: string | undefined, singleQuoted: string | undefined, unquoted: string | undefined) => {
      if (name.toLowerCase() !== 'data-file-id' || (doubleQuoted ?? singleQuoted ?? unquoted) !== previousId) return attribute;
      return `${space}${name}${equals}${doubleQuoted !== undefined ? `"${nextId}"` : singleQuoted !== undefined ? `'${nextId}'` : nextId}`;
    },
  ));
}
export function removeBodyImageFileId(html: string, fileId: string) {
  return html.replace(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, (tag) => {
    const attributes = tag.matchAll(/(\s+)([^\s"'<>/=]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g);
    for (const attribute of attributes) if (attribute[2].toLowerCase() === 'data-file-id' && (attribute[4] ?? attribute[5] ?? attribute[6]) === fileId) return '';
    return tag;
  });
}
export function EditField({ label, id, value, onValue, multiline, hint, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { label: string; id: string; value: string | number; onValue: (value: string) => void; multiline?: boolean; hint?: ReactNode }) {
  return <div className={`field ${multiline ? 'field-full' : ''}`}><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} rows={4} value={value} maxLength={rest.maxLength ?? 10000} required={rest.required} disabled={rest.disabled} placeholder={rest.placeholder} onChange={(event) => onValue(event.target.value)} /> : <input {...rest} id={id} value={value} onChange={(event) => onValue(event.target.value)} />}{hint && <p className="form-hint">{hint}</p>}</div>;
}

export function ContentPagination({ pagination, go, label = '콘텐츠 페이지 이동' }: { pagination: ContentList['pagination']; go: (page: number) => void; label?: string }) {
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return <nav className="notice-pagination" aria-label={label}><Button variant="secondary" disabled={pagination.page <= 1} onClick={() => go(pagination.page - 1)}>이전 페이지</Button><span aria-live="polite">{pagination.page} / {pages}</span><Button variant="secondary" disabled={pagination.page >= pages} onClick={() => go(pagination.page + 1)}>다음 페이지</Button></nav>;
}

export function ContentSelector({ label, selected, onChange, excludeId, kinds = ['notice', 'curriculum', 'activity', 'resource', 'faq'], max = 100 }: { label: string; selected: ContentSummary[]; onChange: (records: ContentSummary[]) => void; excludeId?: string; kinds?: ContentKind[]; max?: number }) {
  const selectorId = useId();
  const [term, setTerm] = useState(''); const [kind, setKind] = useState<ContentKind | ''>(kinds.length === 1 ? kinds[0] : '');
  const [query, setQuery] = useState({ q: '', page: 1, kind: kind as string, attempt: 0 });
  const [result, setResult] = useState<ContentList | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const scopeKey = kinds.join(',');
  useEffect(() => { const controller = new AbortController(); let active = true; setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(query.page), pageSize: '10', q: query.q }); if (query.kind) params.set('kind', query.kind);
    void listAdminContents(params, controller.signal).then((data) => { if (active) setResult(data); }).catch((failure) => { if (active) setError(noticeError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [query, scopeKey]);
  return <div className="content-selector" role="group" aria-label={label}><h3>{label}</h3><p className="form-hint">제목으로 찾아 선택하세요. 비공개·초안 대상은 공개 조회에서 제외됩니다. 선택 순서대로 저장합니다.</p>
    <ol className="content-selected">{selected.map((item, index) => <li key={item.id}><span><strong>{item.title}</strong><small>{kindLabels[item.kind]} · {publicationLabels[item.publication]}</small></span><div className="notice-row-actions"><Button variant="quiet" aria-label={`${item.title} 위로`} disabled={index === 0} onClick={() => { const next = [...selected]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>위로</Button><Button variant="quiet" aria-label={`${item.title} 선택 해제`} onClick={() => onChange(selected.filter((record) => record.id !== item.id))}>해제</Button></div></li>)}</ol>
    <div className="selector-search" onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); setQuery((old) => ({ q: term.trim(), kind, page: 1, attempt: old.attempt + 1 })); } }}><EditField label={`${label} 검색어`} id={`${selectorId}-q`} value={term} maxLength={200} onValue={setTerm} /><div className="field"><label htmlFor={`${selectorId}-kind`}>{label} 종류</label><select id={`${selectorId}-kind`} value={kind} onChange={(event) => setKind(event.target.value as ContentKind | '')}>{kinds.length > 1 && <option value="">전체 종류</option>}{kinds.map((value) => <option key={value} value={value}>{kindLabels[value]}</option>)}</select></div><Button variant="secondary" onClick={() => setQuery((old) => ({ q: term.trim(), kind, page: 1, attempt: old.attempt + 1 }))}>{label} 검색</Button></div>
    {loading ? <LoadingState>선택 가능한 콘텐츠를 불러옵니다.</LoadingState> : error ? <Notice title={error} tone="error" /> : result && <><ul className="content-options">{result.data.filter((record) => record.id !== excludeId && kinds.includes(record.kind)).map((record) => <li key={record.id}><span>{record.title}<small>{kindLabels[record.kind]} · {publicationLabels[record.publication]}</small></span><Button variant="quiet" disabled={selected.some((item) => item.id === record.id) || selected.length >= max} aria-label={`${record.title} 선택`} onClick={() => onChange([...selected, record])}>{selected.some((item) => item.id === record.id) ? '선택됨' : '선택'}</Button></li>)}{!result.data.some((record) => record.id !== excludeId && kinds.includes(record.kind)) && <li>이 페이지에 선택 가능한 콘텐츠가 없습니다.</li>}</ul><ContentPagination label={`${label} 결과 페이지`} pagination={result.pagination} go={(page) => setQuery((old) => ({ ...old, page }))} /></>}
  </div>;
}

type Action = (label: string, run: (csrf: string) => Promise<void>) => Promise<void>;
export function BodyAndFiles({ body, files, config, onChange, action, onError, home = false }: { body: string; files: ContentFile[]; config: UploadConfig; onChange: (body: string, files: ContentFile[]) => void; action: Action; onError: (message: string) => void; home?: boolean }) {
  const bodyRef = useRef<HTMLTextAreaElement>(null); const replaceRef = useRef<HTMLInputElement>(null); const [replacement, setReplacement] = useState<ContentFile | null>(null); const [link, setLink] = useState('');
  function insert(markup: string) { const input = bodyRef.current; const start = input?.selectionStart ?? body.length; const end = input?.selectionEnd ?? start; onChange(body.slice(0, start) + markup + body.slice(end), files); requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + markup.length, start + markup.length); }); }
  function markup(type: 'p' | 'ul' | 'ol' | 'table' | 'a') { const selected = bodyRef.current ? body.slice(bodyRef.current.selectionStart, bodyRef.current.selectionEnd) : '';
    if (type === 'p') insert(`<p>${escapeHtml(selected || '문단 내용을 입력하세요.')}</p>\n`);
    else if (type === 'ul' || type === 'ol') insert(`<${type}>\n${(selected || '첫 번째 항목\n두 번째 항목').split('\n').map((text) => `  <li>${escapeHtml(text)}</li>`).join('\n')}\n</${type}>\n`);
    else if (type === 'table') insert('<table><thead><tr><th>항목</th><th>내용</th></tr></thead><tbody><tr><td>항목 입력</td><td>내용 입력</td></tr></tbody></table>\n');
    else { try { const url = new URL(link); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); insert(`<a href="${escapeHtml(url.href)}">${escapeHtml(selected || '링크 안내')}</a>`); setLink(''); } catch { onError('외부 링크는 사용자 정보가 없는 http:// 또는 https:// 주소를 입력하세요.'); } }
  }
  async function upload(file: File | undefined, role: FileRole, previous?: ContentFile) { if (!file) return; const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (file.size > config.maxUploadBytes) { onError(`파일당 최대 ${sizeLabel(config.maxUploadBytes)}까지 업로드할 수 있습니다.`); return; }
    if (!config.extensions.includes(extension) || (role !== 'attachment' && !['jpg', 'jpeg', 'png', 'webp'].includes(extension))) { onError('선택한 파일 형식은 허용되지 않습니다.'); return; }
    if (new Set(files.filter((item) => item !== previous).map((item) => item.id)).size + 1 > config.maxFilesPerContent) { onError(`콘텐츠당 최대 ${config.maxFilesPerContent}개 파일을 연결할 수 있습니다.`); return; }
    await action('업로드', async (csrf) => { const { data } = await uploadNoticeFile(file, csrf); const next: ContentFile = { ...data, role, altText: previous?.altText ?? file.name.replace(/\.[^.]+$/, '') }; const nextFiles = previous ? files.map((item) => item.id === previous.id && item.role === previous.role ? next : item) : [...files, next];
      onChange(role === 'body' ? previous ? replaceBodyImageFileId(body, previous.id, next.id) : `${body}\n<img data-file-id="${next.id}" alt="${escapeHtml(next.altText)}">\n` : body, nextFiles);
    });
  }
  function unlink(file: ContentFile) { const nextBody = file.role === 'body' ? removeBodyImageFileId(body, file.id) : body; onChange(nextBody, files.filter((item) => item.id !== file.id || item.role !== file.role)); }
  return <><section className="content-panel form-panel"><h2>{home ? '소개 문구·주요 안내' : '본문 작성'}</h2><p className="notice-editor-help">문단·목록·표·링크를 작성할 수 있습니다. 저장·미리보기 때 허용한 HTML 서식만 반영됩니다.</p><div className="notice-editor-toolbar" aria-label="본문 서식 도구">{([['p', '문단'], ['ul', '글머리 목록'], ['ol', '번호 목록'], ['table', '표']] as const).map(([type, label]) => <Button key={type} variant="secondary" onClick={() => markup(type)}>{label}</Button>)}</div><div className="notice-link-tool"><label htmlFor="content-link-address" className="sr-only">본문 링크 주소</label><input id="content-link-address" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https:// 주소" /><Button variant="secondary" onClick={() => markup('a')}>링크 삽입</Button></div><div className="field"><label htmlFor="content-body">본문 HTML</label><textarea ref={bodyRef} id="content-body" className="notice-html-input" rows={12} required maxLength={200000} value={body} onChange={(event) => onChange(event.target.value, files)} /></div><div className="field"><label htmlFor="content-body-image">본문 이미지 선택</label><input id="content-body-image" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file, 'body'); }} /></div></section>
    <section className="content-panel form-panel"><h2>{home ? '메인 이미지·첨부파일' : '첨부파일'}</h2><p className="notice-editor-help">{config.extensions.map((value) => value.toUpperCase()).join(' · ')} · 파일당 최대 {sizeLabel(config.maxUploadBytes)} · 최대 {config.maxFilesPerContent}개<br />업로드 후 콘텐츠를 저장해야 연결됩니다. 저장 전 파일은 관리자만 볼 수 있습니다.</p>{home && !files.some((file) => file.role === 'home') && <div className="field"><label htmlFor="content-home-image">메인 이미지 선택</label><input id="content-home-image" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file, 'home'); }} /></div>}<div className="field"><label htmlFor="content-attachment">첨부파일 선택</label><input id="content-attachment" type="file" accept={config.extensions.map((value) => `.${value}`).join(',')} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file, 'attachment'); }} /></div><ul className="notice-edit-files">{files.map((file) => <li key={`${file.id}:${file.role}`}><div className="notice-edit-file-info"><FileText size={22} aria-hidden="true" /><div><a href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer">{file.originalName}</a><small>{file.role === 'home' ? '메인 이미지' : file.role === 'body' ? '본문 이미지' : '첨부파일'} · {sizeLabel(file.size)}</small></div></div>{file.role !== 'attachment' && <EditField label={file.role === 'home' ? '메인 이미지 설명' : '이미지 설명'} id={`content-alt-${file.id}-${file.role}`} maxLength={500} value={file.altText} onValue={(altText) => onChange(body, files.map((item) => item.id === file.id && item.role === file.role ? { ...item, altText } : item))} />}<div className="notice-row-actions"><Button variant="secondary" aria-label={`${file.originalName} 교체`} onClick={() => { setReplacement(file); if (replaceRef.current) { replaceRef.current.accept = file.role === 'attachment' ? config.extensions.map((value) => `.${value}`).join(',') : '.jpg,.jpeg,.png,.webp'; replaceRef.current.click(); } }}>교체</Button><Button variant="quiet" aria-label={`${file.originalName} 연결 해제`} onClick={() => unlink(file)}>연결 해제</Button></div></li>)}</ul>{!files.length && <p className="notice-file-empty">연결된 파일이 없습니다.</p>}<input ref={replaceRef} className="sr-only" aria-label="교체할 파일 선택" tabIndex={-1} type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (replacement) void upload(file, replacement.role, replacement); setReplacement(null); }} /><p className="form-hint">교체·연결 해제 후 저장하면 현재 콘텐츠에만 반영됩니다. 다른 콘텐츠가 사용하는 원본은 유지됩니다. 미연결 원본 정리는 공지 편집 화면에서 할 수 있습니다.</p></section></>;
}
