import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { PageRoute } from '../../shared/pageRoutes';
import type { ContentList, ContentRecord, ContentSummary } from '../../shared/content';
import { getPublicContent, listPublicContents, PublicContentRequestError } from '../api/content';
import { PublicContentDetails, PublicContentHeader, usePublicPage, usePublicRefresh } from '../components/publicContent';
import { Button, EmptyState, LinkButton, LoadingState, Notice } from '../components/ui';

const pageInformation: Record<string, { slug: string; intro: string }> = {
  'PUB-02': { slug: 'overview', intro: '사업의 목적, 교육 분야와 주요 추진내용을 안내합니다.' },
  'PUB-03': { slug: 'organization', intro: '사업단의 조직과 담당업무, 문의처를 안내합니다.' },
  'PUB-04': { slug: 'cooperation', intro: '기업 협력 분야와 참여 방식, 문의 절차를 안내합니다.' },
  'PUB-05': { slug: 'location', intro: '사업단의 방문 위치와 문의처를 확인하세요.' },
  'PUB-10': { slug: 'guide', intro: '참여 절차와 신청 경로, 제출 전 확인할 사항을 안내합니다.' },
};

export function PublicInfoPage({ route }: { route: PageRoute }) {
  const info = pageInformation[route.id]!;
  const { loading, record, failed, refresh } = usePublicPage(info.slug);
  return <div className="public-information"><p className="page-intro">{info.intro}</p>
    {loading ? <LoadingState>안내를 불러오고 있습니다.</LoadingState> : failed ? <div className="public-load-error"><Notice tone="error" title="안내를 불러오지 못했습니다">연결을 확인한 뒤 다시 시도해 주세요.</Notice><Button variant="secondary" onClick={refresh}>다시 불러오기</Button></div> : record ? <article className="notice-article public-info-article"><PublicContentHeader record={record} /><PublicContentDetails record={record} />{info.slug === 'location' && !record.contact?.address && <p className="public-input-pending">공식 주소 입력 대기 · 주소가 확인되면 방문 위치를 안내합니다.</p>}</article> : <section className="content-panel"><EmptyState title="공개된 안내가 없습니다">공식 정보 입력 대기 중입니다. 공개된 안내가 등록되면 이곳에서 확인할 수 있습니다.</EmptyState></section>}
  </div>;
}

function FaqItem({ summary, refreshKey, initialOpen = false }: { summary: ContentSummary; refreshKey: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; record: ContentRecord | null; failed: boolean } | null>(null);
  // A new open always fetches again; closing removes the loaded answer immediately.
  const key = `${summary.id}:${refreshKey}:${attempt}`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); let active = true;
    void getPublicContent(summary.id, controller.signal).then(({ data }) => {
      if (data.kind !== 'faq' || data.publication !== 'public') throw new PublicContentRequestError(404);
      if (active) { setUnavailable(false); setResult({ key, record: data, failed: false }); }
    }).catch((error: unknown) => { if (active) { const missing = error instanceof PublicContentRequestError && error.status === 404; if (missing) setUnavailable(true); setResult({ key, record: null, failed: !missing }); } });
    return () => { active = false; controller.abort(); };
  }, [open, key, summary.id]);
  const current = result?.key === key ? result : null;
  return <details className="faq-item" open={open} onToggle={(event) => { const next = event.currentTarget.open; if (next !== open) { setOpen(next); setAttempt((value) => value + 1); } }}>
    <summary><span className="faq-question-marker" aria-hidden="true">Q</span><span>{unavailable ? '현재 공개된 질문이 아닙니다' : current?.record?.title ?? summary.title}</span><ChevronDown size={19} aria-hidden="true" /></summary>
    {open && <div className="faq-answer">{!current ? <LoadingState>답변을 불러오고 있습니다.</LoadingState> : current.failed ? <div className="public-load-error"><Notice tone="error" title="답변을 불러오지 못했습니다">연결을 확인한 뒤 다시 시도해 주세요.</Notice><Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>답변 다시 불러오기</Button></div> : current.record ? <PublicContentDetails record={current.record} /> : <EmptyState title="공개된 답변을 찾을 수 없습니다">질문이 변경되었거나 현재 공개된 안내가 없습니다. 목록을 다시 확인해 주세요.</EmptyState>}</div>}
  </details>;
}

export function PublicFaqPage() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const item = params.get('item');
  const q = (params.get('q') ?? '').slice(0, 200);
  const pageValue = Number(params.get('page') || '1');
  const page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= 100000 ? pageValue : 1;
  const { requestKey, refresh } = usePublicRefresh();
  const key = `${requestKey}:${query}`;
  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<{ key: string; list: ContentList | null; selected: ContentRecord | null; failed: boolean } | null>(null);
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const run = async () => {
      if (item !== null) {
        const { data } = await getPublicContent(item, controller.signal);
        if (data.kind !== 'faq' || data.publication !== 'public') throw new PublicContentRequestError(404);
        if (active) setResult({ key, list: null, selected: data, failed: false });
      } else {
        const list = await listPublicContents({ kind: 'faq', q, page, pageSize: 10 }, controller.signal);
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(list.pagination.total / list.pagination.pageSize));
        if (page > lastPage) { const next = new URLSearchParams(params); next.set('page', String(lastPage)); setParams(next, { replace: true }); return; }
        setResult({ key, list, selected: null, failed: false });
      }
    };
    void run().catch((error: unknown) => { if (active) setResult({ key, list: null, selected: null, failed: !(error instanceof PublicContentRequestError && error.status === 404) }); });
    return () => { active = false; controller.abort(); };
  }, [key, item, q, page]);
  const current = result?.key === key ? result : null;
  function submit(event: FormEvent) { event.preventDefault(); const next = new URLSearchParams(); if (search.trim()) next.set('q', search.trim()); if (next.toString() === query) refresh(); else setParams(next); }
  function go(nextPage: number) { const next = new URLSearchParams(params); next.set('page', String(nextPage)); setParams(next); }
  const list = current?.list;
  const totalPages = list ? Math.max(1, Math.ceil(list.pagination.total / list.pagination.pageSize)) : 1;
  return <div className="public-faq"><p className="page-intro">질문을 선택하면 답변과 관련 안내를 확인할 수 있습니다.</p>
    {item === null && <form className="notice-search faq-search" role="search" onSubmit={submit}><div className="field"><label htmlFor="faq-search">질문 검색어</label><input id="faq-search" type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="질문 또는 답변의 내용을 입력하세요" /></div><Button type="submit">검색</Button>{q && <Button variant="quiet" onClick={() => setParams({})}>검색 초기화</Button>}</form>}
    {!current ? <LoadingState>질문과 답변을 불러오고 있습니다.</LoadingState> : current.failed ? <div className="public-load-error"><Notice tone="error" title="질문과 답변을 불러오지 못했습니다">연결을 확인한 뒤 다시 시도해 주세요.</Notice><Button variant="secondary" onClick={refresh}>목록 다시 불러오기</Button></div> : current.selected ? <FaqItem key={`${current.selected.id}:${key}`} summary={current.selected} refreshKey={key} initialOpen /> : list?.data.length ? <><p className="notice-count">전체 <strong>{list.pagination.total}</strong>건</p><div className="faq-list">{list.data.map((summary) => <FaqItem key={summary.id} summary={summary} refreshKey={key} />)}</div><nav className="notice-pagination" aria-label="질문과 답변 페이지 이동"><Button variant="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>이전 페이지</Button><span aria-live="polite">{page} / {totalPages}</span><Button variant="secondary" disabled={page >= totalPages} onClick={() => go(page + 1)}>다음 페이지</Button></nav></> : <section className="content-panel"><EmptyState title="공개된 질문과 답변이 없습니다">{q ? '검색어를 바꾸어 다시 확인해 주세요.' : '공식 질문과 답변 입력 대기 중입니다. 공개된 안내가 등록되면 이곳에서 확인할 수 있습니다.'}</EmptyState></section>}
    {item !== null && <div className="notice-bottom-actions"><LinkButton to="/faq" variant="secondary">전체 질문과 답변 보기</LinkButton></div>}
  </div>;
}
