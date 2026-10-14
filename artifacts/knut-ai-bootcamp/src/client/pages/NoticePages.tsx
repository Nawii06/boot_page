import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, matchPath, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Pin, Plus, Search, Trash2 } from 'lucide-react';
import type { ContactDetails, ContentFile, ContentFileInput, ContentList, ContentRecord, Publication } from '../../shared/content';
import { useAdminAuth } from '../auth/AdminAuth';
import { Button, DataTable, EmptyState, LinkButton, LoadingState, Notice } from '../components/ui';
import { deleteNotice, deleteUnlinkedFile, fileUrl, listNotices, listUnlinkedFiles, noticeCategories, noticeDeleteImpact, noticeError, NoticeRequestError, previewNotice, readNotice, saveNotice, uploadNoticeFile, uploadSettings, type DeleteImpact, type UploadConfig, type UploadedFile } from '../api/notices';

import { ContentSelector, publicationLabels, dateLabel, sizeLabel, escapeHtml, toFileLinks as fileLinks, localDateTime, replaceBodyImageFileId, removeBodyImageFileId } from '../components/contentEditing';
import { PublicContentDetails, usePublicDetail, usePublicRefresh } from '../components/publicContent';

const emptyContact: ContactDetails = { name: '', phone: '', email: '', address: '', note: '' };

function Pagination({ pagination, go }: { pagination: ContentList['pagination']; go: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return <nav className="notice-pagination" aria-label="공지 페이지 이동"><Button variant="secondary" disabled={pagination.page <= 1} onClick={() => go(pagination.page - 1)}>이전 페이지</Button><span aria-live="polite">{pagination.page} / {pages}</span><Button variant="secondary" disabled={pagination.page >= pages} onClick={() => go(pagination.page + 1)}>다음 페이지</Button></nav>;
}

export function NoticeListPage({ admin = false }: { admin?: boolean }) {
  const auth = useAdminAuth();
  const publicRefresh = usePublicRefresh();
  const publicKey = admin ? '' : publicRefresh.requestKey;
  const [params, setParams] = useSearchParams();
  const queryKey = params.toString();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [publication, setPublication] = useState(params.get('publication') ?? '');
  const [categories, setCategories] = useState<string[]>([]);
  const [result, setResult] = useState<ContentList | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [deleteTitle, setDeleteTitle] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setSearch(params.get('q') ?? ''); setCategory(params.get('category') ?? ''); setPublication(params.get('publication') ?? '');
    setLoading(true); setError('');
    const query = new URLSearchParams(params); query.set('pageSize', '10');
    if (!admin) query.delete('publication');
    void Promise.all([listNotices(query, admin, controller.signal), noticeCategories(admin, controller.signal)]).then(([list, choices]) => {
      if (active) {
        const lastPage = Math.max(1, Math.ceil(list.pagination.total / list.pagination.pageSize));
        if (list.pagination.page > lastPage) {
          const corrected = new URLSearchParams(params); corrected.set('page', String(lastPage)); setParams(corrected, { replace: true });
          return;
        }
        setResult(list); setCategories(choices.data);
      }
    }).catch((failure: unknown) => { if (active) { setError(noticeError(failure)); if (admin && failure instanceof NoticeRequestError && failure.status === 401) void auth.refresh(); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  // The URL is the source of truth for navigation and reloads.
  }, [queryKey, admin, attempt, publicKey]);
  useEffect(() => { if (impact) deleteDialog.current?.showModal(); }, [impact]);
  function searchNotices(event: FormEvent) {
    event.preventDefault(); const next = new URLSearchParams();
    if (search.trim()) next.set('q', search.trim()); if (category) next.set('category', category); if (admin && publication) next.set('publication', publication);
    setParams(next); if (next.toString() === queryKey) setAttempt((value) => value + 1);
  }
  function go(page: number) { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }
  async function inspectDelete(record: ContentRecord | ContentList['data'][number]) {
    setActionError(''); setMessage(''); setDeleting(true);
    try { const response = await noticeDeleteImpact(record.id); setDeleteTitle(record.title); setImpact(response.data); }
    catch (failure) { setActionError(noticeError(failure)); if (failure instanceof NoticeRequestError && failure.status === 401) void auth.refresh(); }
    finally { setDeleting(false); }
  }
  async function confirmDelete() {
    if (!impact || !auth.session || deleting) return; setDeleting(true); setActionError('');
    try { await deleteNotice(impact.id, impact.revision, auth.session.csrfToken); setImpact(null); setMessage('공지를 삭제했습니다.'); setAttempt((value) => value + 1); }
    catch (failure) { setActionError(noticeError(failure)); if (failure instanceof NoticeRequestError && failure.status === 401) void auth.refresh(); }
    finally { setDeleting(false); }
  }
  return <div className="notice-page">
    <div className="notice-list-heading"><div><h2>{admin ? '공지사항 목록' : '사업단 공지'}</h2><p>{admin ? '게시 여부와 첨부파일을 함께 관리합니다.' : '사업단의 안내와 공지사항을 확인하세요.'}</p></div>{admin && <LinkButton to="/admin/notices/new"><Plus size={16} aria-hidden="true" />공지 등록</LinkButton>}</div>
    <form className="notice-search" role="search" onSubmit={searchNotices}><div className="field"><label htmlFor="notice-query">검색어</label><input id="notice-query" type="search" maxLength={200} value={search} placeholder="제목 또는 본문 검색" onChange={(event) => setSearch(event.target.value)} /></div><div className="field"><label htmlFor="notice-category-filter">분류</label><select id="notice-category-filter" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">전체 분류</option>{[...new Set([...categories, ...(category ? [category] : [])])].map((name) => <option key={name} value={name}>{name}</option>)}</select></div>{admin && <div className="field"><label htmlFor="notice-publication-filter">게시 여부</label><select id="notice-publication-filter" value={publication} onChange={(event) => setPublication(event.target.value)}><option value="">전체</option>{Object.entries(publicationLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>}<Button type="submit"><Search size={16} aria-hidden="true" />검색</Button>{queryKey && <Button variant="quiet" onClick={() => setParams({})}>검색 초기화</Button>}</form>
    {message && <div role="status"><Notice title={message} /></div>}{actionError && !impact && <Notice title={actionError} tone="error" />}
    {loading ? <LoadingState>공지 목록을 불러오고 있습니다.</LoadingState> : error ? <><Notice title={error} tone="error" /><Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>목록 다시 불러오기</Button></> : result && <><p className="notice-count">전체 <strong>{result.pagination.total}</strong>건</p>{result.data.length === 0 ? <EmptyState title="표시할 공지가 없습니다">검색 조건을 바꾸거나 등록된 공지를 확인해 주세요.</EmptyState> : <DataTable caption={admin ? '공지사항 관리 목록' : '공지사항 목록'} columns={admin ? ['제목', '분류', '게시 여부', '게시일', '관리'] : ['제목', '분류', '게시일']}>
      {result.data.map((item) => <tr key={item.id}><td className="notice-title-cell">{item.pinned && <span className="notice-pin"><Pin size={12} aria-hidden="true" />고정</span>}<Link className="table-link" to={admin ? `/admin/notices/${item.id}/edit` : `/notices/${item.id}`}>{item.title}</Link></td><td>{item.category || '미분류'}</td>{admin && <td><span className={`publication-tag publication-${item.publication}`}>{publicationLabels[item.publication]}</span></td>}<td className="notice-date-cell">{dateLabel(item.publishedAt)}</td>{admin && <td><div className="notice-row-actions"><Link className="table-link" to={`/admin/notices/${item.id}/edit`}>수정</Link><Button variant="quiet" disabled={deleting} onClick={() => { void inspectDelete(item); }} aria-label={`${item.title} 삭제`}>삭제</Button></div></td>}</tr>)}
    </DataTable>}<Pagination pagination={result.pagination} go={go} /></>}
    {impact && <dialog ref={deleteDialog} className="notice-dialog" aria-labelledby="delete-notice-title" onCancel={(event) => { if (deleting) event.preventDefault(); else setImpact(null); }}><h2 id="delete-notice-title">공지를 삭제하시겠습니까?</h2><p><strong>{deleteTitle}</strong></p><p>연결된 관련 콘텐츠 {impact.incomingLinks}건, 메인 노출 {impact.homeLinks}건이 해제됩니다. 삭제한 공지는 화면에서 되돌릴 수 없습니다.</p><p>첨부파일 {impact.files.length}개는 게시물과의 연결만 해제합니다. 다른 콘텐츠가 사용하는 파일은 유지됩니다. 미연결 파일은 별도로 확인한 후 정리할 수 있습니다.</p>{impact.files.some((file) => file.otherReferences > 0) && <ul>{impact.files.filter((file) => file.otherReferences > 0).map((file) => <li key={file.id}>{file.originalName}: 다른 콘텐츠 {file.otherReferences}건에서 사용 중</li>)}</ul>}{actionError && <Notice title={actionError} tone="error" />}<div className="notice-dialog-actions"><Button variant="secondary" disabled={deleting} onClick={() => setImpact(null)}>취소</Button><Button disabled={deleting} onClick={() => { void confirmDelete(); }}>{deleting ? '삭제 중…' : '삭제 확인'}</Button></div></dialog>}
  </div>;
}

export function PublicNoticeDetailPage() {
  const location = useLocation();
  const id = matchPath('/notices/:post', location.pathname)?.params.post ?? '';
  const { record, loading, failed, refresh } = usePublicDetail('notice', id);
  return <div className="notice-page">{loading ? <LoadingState>공지를 불러오고 있습니다.</LoadingState> : failed ? <><Notice title="공지를 불러오지 못했습니다" tone="error">연결을 확인한 뒤 다시 시도해 주세요.</Notice><Button variant="secondary" onClick={refresh}>다시 불러오기</Button></> : record ? <article className="notice-article"><header><div className="notice-detail-tags"><span>{record.category || '미분류'}</span>{record.pinned && <span className="notice-pin"><Pin size={12} aria-hidden="true" />상단 고정</span>}</div><h2>{record.title}</h2><dl className="notice-metadata"><div><dt>게시일</dt><dd>{dateLabel(record.publishedAt)}</dd></div><div><dt>수정일</dt><dd>{dateLabel(record.updatedAt)}</dd></div></dl></header><PublicContentDetails record={record} showEmptyFiles /></article> : <Notice title="공지를 찾을 수 없습니다. 공개 중인 공지인지 확인해 주세요." tone="error" />}<div className="notice-bottom-actions"><LinkButton variant="secondary" to="/notices"><ArrowLeft size={16} aria-hidden="true" />공지 목록으로</LinkButton></div></div>;
}

type FormState = { title: string; category: string; bodyHtml: string; publication: Publication; pinned: boolean; publishedAt: string; contact: ContactDetails };
const blankForm = (): FormState => ({ title: '', category: '', bodyHtml: '', publication: 'draft', pinned: false, publishedAt: '', contact: { ...emptyContact } });
function formFrom(record: ContentRecord): FormState { return { title: record.title, category: record.category, bodyHtml: record.bodyHtml, publication: record.publication, pinned: record.pinned, publishedAt: localDateTime(record.publishedAt), contact: record.contact ?? { ...emptyContact } }; }

export function AdminNoticeEditorPage() {
  const location = useLocation(); const navigate = useNavigate(); const auth = useAdminAuth();
  const id = matchPath('/admin/notices/:id/edit', location.pathname)?.params.id;
  const [related, setRelated] = useState<ContentRecord['relatedContents']>([]);
  const [form, setForm] = useState<FormState>(blankForm); const [files, setFiles] = useState<ContentFile[]>([]); const [revision, setRevision] = useState<number>();
  const [config, setConfig] = useState<UploadConfig | null>(null); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<{ html: string; source: string } | null>(null); const [linkAddress, setLinkAddress] = useState('');
  const [unlinked, setUnlinked] = useState<UploadedFile[] | null>(null); const [removeTarget, setRemoveTarget] = useState<UploadedFile | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null); const replaceRef = useRef<HTMLInputElement>(null); const [replaceFile, setReplaceFile] = useState<ContentFile | null>(null);
  const requestBusy = useRef(false); const fileDeleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const controller = new AbortController(); let active = true; setLoading(true); setLoadError('');
    void Promise.all([uploadSettings(controller.signal), id ? readNotice(id, true, controller.signal) : Promise.resolve(null)]).then(([settings, response]) => {
      if (!active) return; if (response && response.data.kind !== 'notice') throw new NoticeRequestError(404, '요청한 공지를 찾을 수 없습니다.');
      setConfig(settings.data); setForm(response ? formFrom(response.data) : blankForm()); setFiles(response?.data.files ?? []); setRelated(response?.data.relatedContents ?? []); setRevision(response?.data.revision); setDirty(false); setPreview(null);
      if ((location.state as { saved?: boolean } | null)?.saved) setMessage('공지를 저장했습니다.');
    }).catch((failure) => { if (active) { setLoadError(noticeError(failure)); if (failure instanceof NoticeRequestError && failure.status === 401) void auth.refresh(); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, attempt]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  useEffect(() => { setPreview(null); }, [files]);
  useEffect(() => { if (removeTarget) fileDeleteDialog.current?.showModal(); }, [removeTarget]);
  function change<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((old) => ({ ...old, [key]: value })); setDirty(true); setMessage(''); }
  function failure(value: unknown) { setError(noticeError(value)); if (value instanceof NoticeRequestError && value.status === 401) void auth.refresh(); }
  async function action(label: string, run: (csrf: string) => Promise<void>) { if (requestBusy.current || !auth.session) return; requestBusy.current = true; setBusy(label); setError(''); setMessage(''); try { await run(auth.session.csrfToken); } catch (value) { failure(value); } finally { requestBusy.current = false; setBusy(''); } }
  async function submit(event: FormEvent) { event.preventDefault(); await action('저장', async (csrf) => {
    const { data } = await saveNotice({ kind: 'notice', title: form.title, category: form.category, bodyHtml: form.bodyHtml, publication: form.publication, pinned: form.pinned, publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null, contact: form.contact, relatedIds: related.map((item) => item.id), fileLinks: fileLinks(files), ...(id ? { revision } : {}) }, csrf, id);
    setDirty(false); setPreview(null); setForm(formFrom(data)); setFiles(data.files); setRelated(data.relatedContents); setRevision(data.revision); setMessage('공지를 저장했습니다.');
    if (!id) navigate(`/admin/notices/${data.id}/edit`, { replace: true, state: { saved: true } });
  }); }
  function insert(markup: string, focusBody = true) { const input = bodyRef.current; const start = input?.selectionStart ?? form.bodyHtml.length; const end = input?.selectionEnd ?? start; change('bodyHtml', form.bodyHtml.slice(0, start) + markup + form.bodyHtml.slice(end)); if (focusBody) requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + markup.length, start + markup.length); }); }
  function selection() { const input = bodyRef.current; return input ? form.bodyHtml.slice(input.selectionStart, input.selectionEnd) : ''; }
  function insertText(kind: 'paragraph' | 'list' | 'ordered' | 'table' | 'link') {
    const text = selection();
    if (kind === 'paragraph') insert(`<p>${escapeHtml(text || '문단 내용을 입력하세요.')}</p>\n`);
    if (kind === 'list' || kind === 'ordered') { const tag = kind === 'list' ? 'ul' : 'ol'; insert(`<${tag}>\n${(text || '첫 번째 항목\n두 번째 항목').split('\n').map((line) => `  <li>${escapeHtml(line)}</li>`).join('\n')}\n</${tag}>\n`); }
    if (kind === 'table') insert('<table>\n  <thead><tr><th>항목</th><th>내용</th></tr></thead>\n  <tbody><tr><td>첫 번째 항목</td><td>내용 입력</td></tr><tr><td>두 번째 항목</td><td>내용 입력</td></tr></tbody>\n</table>\n');
    if (kind === 'link') { if (!/^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(linkAddress.trim())) { setError('링크는 http://, https://, mailto:, tel: 또는 /로 시작하는 사이트 내부 주소를 입력해 주세요.'); return; } insert(`<a href="${escapeHtml(linkAddress.trim())}">${escapeHtml(text || '링크 안내')}</a>`); setLinkAddress(''); setError(''); }
  }
  async function upload(selected: File | undefined, role: 'attachment' | 'body', replacing?: ContentFile) {
    if (!selected || !config) return;
    if (selected.size > config.maxUploadBytes) { setError(`파일 한 개의 크기는 ${sizeLabel(config.maxUploadBytes)} 이하여야 합니다.`); return; }
    const retainedLinks = replacing ? files.filter((file) => file.id !== replacing.id || file.role !== replacing.role) : files;
    if (new Set(retainedLinks.map((file) => file.id)).size + 1 > config.maxFilesPerContent) { setError(`한 공지에 연결할 수 있는 파일은 최대 ${config.maxFilesPerContent}개입니다.`); return; }
    const extension = selected.name.split('.').pop()?.toLowerCase() ?? '';
    if (!config.extensions.includes(extension) || (role === 'body' && !['jpg', 'jpeg', 'png', 'webp'].includes(extension))) { setError('선택한 파일의 형식은 허용되지 않습니다.'); return; }
    await action('업로드', async (csrf) => { const { data } = await uploadNoticeFile(selected, csrf); const newFile: ContentFile = { ...data, role, altText: replacing?.altText ?? selected.name.replace(/\.[^.]+$/, '') };
      setFiles((old) => replacing ? old.map((file) => file.id === replacing.id && file.role === replacing.role ? newFile : file) : [...old, newFile]);
      // Upload completion must not take focus from an input the administrator is editing.
      if (role === 'body') { if (replacing) change('bodyHtml', replaceBodyImageFileId(form.bodyHtml, replacing.id, data.id)); else insert(`<img data-file-id="${data.id}" alt="${escapeHtml(newFile.altText)}">\n`, false); }
      setDirty(true); setMessage('파일을 업로드했습니다. 공지를 저장하면 파일 연결에 반영됩니다.'); setUnlinked(null);
    });
  }
  function unlink(file: ContentFile) { setFiles((old) => old.filter((item) => item.id !== file.id || item.role !== file.role)); if (file.role === 'body') change('bodyHtml', removeBodyImageFileId(form.bodyHtml, file.id)); setDirty(true); setMessage('파일 연결을 해제했습니다. 공지를 저장하면 반영됩니다. 원본 파일은 유지됩니다.'); }
  async function showPreview() { await action('미리보기', async (csrf) => { const { data } = await previewNotice(form.bodyHtml, fileLinks(files), csrf, id); setPreview({ html: data.bodyHtml, source: form.bodyHtml }); }); }
  async function loadUnlinked() { await action('파일 조회', async () => { const { data } = await listUnlinkedFiles(); setUnlinked(data); }); }
  async function removeFile() { if (!removeTarget) return; await action('파일 삭제', async (csrf) => { await deleteUnlinkedFile(removeTarget.id, csrf); setUnlinked((old) => old?.filter((file) => file.id !== removeTarget.id) ?? null); setRemoveTarget(null); setMessage('미연결 파일을 삭제했습니다.'); }); }
  if (loading) return <LoadingState>공지 편집 정보를 불러오고 있습니다.</LoadingState>;
  if (loadError) return <><Notice title={loadError} tone="error" /><div className="notice-bottom-actions"><Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>다시 불러오기</Button><LinkButton variant="secondary" to="/admin/notices">목록으로</LinkButton></div></>;
  return <div className="notice-page notice-editor">{error && <Notice title={error} tone="error" />}{message && <div role="status"><Notice title={message} /></div>}
    <form className="editor-form" onSubmit={(event) => { void submit(event); }} aria-busy={Boolean(busy)}>
      <fieldset disabled={Boolean(busy)} className="notice-fieldset"><section className="content-panel form-panel"><h2>기본 정보</h2><div className="field"><label htmlFor="notice-title">제목</label><input id="notice-title" required maxLength={200} value={form.title} onChange={(event) => change('title', event.target.value)} /></div><div className="form-grid"><div className="field"><label htmlFor="notice-category">분류</label><input id="notice-category" maxLength={80} value={form.category} onChange={(event) => change('category', event.target.value)} placeholder="분류를 입력하세요" /></div><div className="field"><label htmlFor="notice-publication">공개 여부</label><select id="notice-publication" value={form.publication} onChange={(event) => change('publication', event.target.value as Publication)}>{Object.entries(publicationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label htmlFor="notice-published-at">게시일</label><input id="notice-published-at" type="datetime-local" value={form.publishedAt} onChange={(event) => change('publishedAt', event.target.value)} /><p className="form-hint">표시할 날짜입니다. 예약 공개나 자동 전환은 하지 않습니다.</p></div><div className="field notice-checkbox-field"><label htmlFor="notice-pinned"><input id="notice-pinned" type="checkbox" checked={form.pinned} onChange={(event) => change('pinned', event.target.checked)} />상단 고정</label></div></div><p className="form-hint">초안·비공개 공지와 파일은 관리자만 열람할 수 있습니다.</p></section>
      <section className="content-panel form-panel"><h2>본문 작성</h2><p className="notice-editor-help">내용을 입력하고 서식 버튼으로 문단·목록·표를 추가하세요. HTML 편집이 가능하며 저장·미리보기 시 허용한 서식만 반영됩니다.</p><div className="notice-editor-toolbar" aria-label="본문 서식 도구"><Button variant="secondary" onClick={() => insertText('paragraph')}>문단</Button><Button variant="secondary" onClick={() => insertText('list')}>글머리 목록</Button><Button variant="secondary" onClick={() => insertText('ordered')}>번호 목록</Button><Button variant="secondary" onClick={() => insertText('table')}>표</Button></div><div className="notice-link-tool"><label className="sr-only" htmlFor="notice-link-address">링크 주소</label><input id="notice-link-address" value={linkAddress} onChange={(event) => setLinkAddress(event.target.value)} placeholder="https:// 또는 사이트 내부 주소" /><Button variant="secondary" onClick={() => insertText('link')}>링크 삽입</Button></div><div className="field"><label htmlFor="notice-body-html">본문 HTML</label><textarea ref={bodyRef} id="notice-body-html" className="notice-html-input" rows={14} required maxLength={200000} value={form.bodyHtml} onChange={(event) => change('bodyHtml', event.target.value)} spellCheck={false} /></div><div className="notice-body-actions"><div className="field"><label htmlFor="notice-body-image">본문 이미지 선택</label><input id="notice-body-image" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ''; void upload(selected, 'body'); }} /></div><Button variant="secondary" onClick={() => { void showPreview(); }}>미리보기</Button></div>
      {preview && preview.source === form.bodyHtml && <section className="notice-preview" aria-label="본문 미리보기"><h3>본문 미리보기 · 관리자 전용</h3><p className="form-hint">미리보기만으로 공개되거나 저장되지 않습니다.</p><div className="notice-content-body" dangerouslySetInnerHTML={{ __html: preview.html }} /></section>}</section>
      <section className="content-panel form-panel"><h2>문의처</h2><p className="notice-editor-help">확인된 문의처만 입력하세요. 비어 있는 항목은 공개 화면에 표시하지 않습니다.</p><div className="form-grid">{([['name', '담당 부서·담당자', 'text'], ['phone', '전화', 'tel'], ['email', '이메일', 'email'], ['address', '주소', 'text']] as const).map(([key, label, type]) => <div className="field" key={key}><label htmlFor={`notice-contact-${key}`}>{label}</label><input id={`notice-contact-${key}`} type={type} maxLength={500} value={form.contact[key]} onChange={(event) => change('contact', { ...form.contact, [key]: event.target.value })} /></div>)}</div><div className="field"><label htmlFor="notice-contact-note">문의 안내</label><textarea id="notice-contact-note" rows={3} maxLength={2000} value={form.contact.note} onChange={(event) => change('contact', { ...form.contact, note: event.target.value })} /></div></section>
      <section className="content-panel form-panel"><h2>첨부파일 <span className="notice-count-inline">{new Set(files.map((file) => file.id)).size} / {config?.maxFilesPerContent}</span></h2><p className="notice-editor-help">{config?.extensions.map((extension) => extension.toUpperCase()).join(' · ')} · 파일당 최대 {config ? sizeLabel(config.maxUploadBytes) : ''}<br />파일을 선택하면 업로드됩니다. 공지를 저장하기 전에는 관리자에게만 보입니다.</p><div className="field"><label htmlFor="notice-attachment">첨부파일 선택</label><input id="notice-attachment" type="file" accept={config?.extensions.map((extension) => `.${extension}`).join(',')} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ''; void upload(selected, 'attachment'); }} /></div>
      {files.length ? <ul className="notice-edit-files">{files.map((file) => <li key={`${file.id}:${file.role}`}><div className="notice-edit-file-info"><FileText size={22} aria-hidden="true" /><div><a href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer">{file.originalName}</a><small>{file.role === 'body' ? '본문 이미지' : '첨부파일'} · {sizeLabel(file.size)}</small></div></div>{file.role === 'body' && <div className="field"><label htmlFor={`file-alt-${file.id}`}>이미지 설명</label><input id={`file-alt-${file.id}`} maxLength={500} value={file.altText} onChange={(event) => { const altText = event.target.value; setFiles((old) => old.map((item) => item.id === file.id && item.role === 'body' ? { ...item, altText } : item)); setDirty(true); }} /></div>}<div className="notice-row-actions"><Button variant="secondary" onClick={() => { setReplaceFile(file); if (replaceRef.current) { replaceRef.current.accept = file.role === 'body' ? '.jpg,.jpeg,.png,.webp' : config?.extensions.map((extension) => `.${extension}`).join(',') ?? ''; replaceRef.current.click(); } }} aria-label={`${file.originalName} 교체`}>교체</Button><Button variant="quiet" onClick={() => unlink(file)} aria-label={`${file.originalName} 연결 해제`}>연결 해제</Button></div></li>)}</ul> : <p className="notice-file-empty">연결된 파일이 없습니다.</p>}<input ref={replaceRef} type="file" className="sr-only" tabIndex={-1} aria-label="교체할 파일 선택" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ''; if (replaceFile) void upload(selected, replaceFile.role === 'body' ? 'body' : 'attachment', replaceFile); setReplaceFile(null); }} /><p className="form-hint">교체·연결 해제는 현재 공지에만 적용됩니다. 다른 콘텐츠에서 사용하는 파일을 함께 삭제하지 않습니다.</p></section>
      <section className="content-panel form-panel"><h2>관련 콘텐츠</h2><ContentSelector label="관련 콘텐츠" excludeId={id} selected={related} onChange={(items) => { setRelated(items); setDirty(true); setMessage(''); }} /></section>
      </fieldset><div className="editor-actions"><LinkButton to="/admin/notices" variant="secondary" onClick={(event) => { if (dirty && !window.confirm('저장하지 않은 변경 사항이 있습니다. 목록으로 이동하시겠습니까?')) event.preventDefault(); }}>목록으로 돌아가기</LinkButton><Button type="submit" disabled={Boolean(busy)}>{busy ? `${busy} 중…` : id ? '수정 저장' : '저장'}</Button></div>
    </form>
    <details className="content-panel notice-file-cleanup"><summary>미연결 업로드 파일 정리</summary><p>등록을 취소했거나 교체 후 남은 파일을 확인합니다. 다른 관리자가 작성 중인 파일일 수 있으므로 파일명을 확인한 후 삭제하세요.</p><Button variant="secondary" disabled={Boolean(busy)} onClick={() => { void loadUnlinked(); }}>미연결 파일 조회</Button>{unlinked && <ul>{unlinked.filter((file) => !files.some((linked) => linked.id === file.id)).map((file) => <li key={file.id}><div><strong>{file.originalName}</strong><small>{sizeLabel(file.size)} · 업로드 {dateLabel(file.createdAt)}</small></div><Button variant="quiet" disabled={Boolean(busy)} onClick={() => setRemoveTarget(file)} aria-label={`${file.originalName} 원본 삭제`}><Trash2 size={15} aria-hidden="true" />원본 삭제</Button></li>)}{unlinked.filter((file) => !files.some((linked) => linked.id === file.id)).length === 0 && <li>정리할 미연결 파일이 없습니다.</li>}</ul>}</details>
    {removeTarget && <dialog ref={fileDeleteDialog} className="notice-dialog" aria-labelledby="delete-file-title" onCancel={(event) => { if (busy) event.preventDefault(); else setRemoveTarget(null); }}><h2 id="delete-file-title">미연결 원본 파일 삭제</h2><p>{removeTarget.originalName}</p><p>원본 파일을 삭제하면 되돌릴 수 없습니다. 서버에서 다른 콘텐츠와의 연결 여부를 다시 확인합니다.</p>{error && <Notice title={error} tone="error" />}<div className="notice-dialog-actions"><Button variant="secondary" disabled={Boolean(busy)} onClick={() => setRemoveTarget(null)}>취소</Button><Button disabled={Boolean(busy)} onClick={() => { void removeFile(); }}>파일 삭제 확인</Button></div></dialog>}
  </div>;
}
