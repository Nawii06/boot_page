import { useEffect, useState, type FormEvent } from 'react';
import { Link, matchPath, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import type { ContentKind, ContentList, ContentRecord, ContentSummary } from '../../shared/content';
import type { PageRoute } from '../../shared/pageRoutes';
import { getPublicCategories, listPublicContents } from '../api/content';
import { ContentPagination, dateLabel } from '../components/contentEditing';
import { PublicContentDetails, publicTarget, usePublicDetail, usePublicRefresh } from '../components/publicContent';
import { Button, DataTable, EmptyState, LinkButton, LoadingState, Notice, TextLink } from '../components/ui';

type CatalogKind = Extract<ContentKind, 'curriculum' | 'activity' | 'resource'>;
const catalogs: Record<CatalogKind, { title: string; path: string; intro: string }> = {
  curriculum: { title: '교육과정', path: '/programs/curriculum', intro: '수준별 교육과정과 대상, 운영 방식 및 이수요건을 확인하세요.' },
  activity: { title: '비교과·산학 프로그램', path: '/programs/activities', intro: '유형별 프로그램 소개와 참여에 필요한 안내를 확인하세요.' },
  resource: { title: '신청·제출 서식', path: '/resources', intro: '서식의 적용 대상과 작성 방법을 확인한 뒤 원본 파일을 내려받으세요.' },
};
function routeKind(route: PageRoute): CatalogKind { return ['PUB-06', 'PUB-07'].includes(route.id) ? 'curriculum' : ['PUB-08', 'PUB-09'].includes(route.id) ? 'activity' : 'resource'; }

function ProgramGroups({ records, kind }: { records: ContentSummary[]; kind: 'curriculum' | 'activity' }) {
  const groups = new Map<string, ContentSummary[]>();
  for (const record of records) {
    const level = record.programLevel?.trim() || `${kind === 'curriculum' ? '수준' : '유형'} 안내 입력 대기`;
    groups.set(level, [...(groups.get(level) ?? []), record]);
  }
  return <div className="catalog-groups">{[...groups].map(([level, items]) => <section className="catalog-group" key={level}><h2>{level}</h2><div className="catalog-cards">{items.map((item) => <article className="catalog-card" key={item.id}><p className="catalog-category">{item.category || '분류 미지정'}</p><h3><Link to={publicTarget(item)!.path}>{item.title}</Link></h3><dl><div><dt>{kind === 'curriculum' ? '수준' : '유형'}</dt><dd>{item.programLevel || '입력 대기'}</dd></div><div><dt>수정일</dt><dd>{dateLabel(item.updatedAt)}</dd></div></dl><Link className="text-link" to={publicTarget(item)!.path} aria-label={`${item.title} 상세 안내`}>상세 안내 보기<ArrowRight size={15} aria-hidden="true" /></Link></article>)}</div></section>)}</div>;
}

export function PublicListPage({ route }: { route: PageRoute }) {
  const kind = routeKind(route), spec = catalogs[kind];
  const [params, setParams] = useSearchParams();
  const query = params.toString(), q = (params.get('q') ?? '').slice(0, 200), category = (params.get('category') ?? '').slice(0, 100);
  const number = Number(params.get('page') || '1');
  const page = Number.isInteger(number) && number >= 1 && number <= 100000 ? number : 1;
  const { requestKey, refresh } = usePublicRefresh();
  const key = `${kind}:${query}:${requestKey}`;
  const [search, setSearch] = useState(q), [chosenCategory, setChosenCategory] = useState(category);
  const [result, setResult] = useState<{ key: string; list: ContentList | null; categories: string[]; failed: boolean } | null>(null);
  useEffect(() => { setSearch(q); setChosenCategory(category); }, [q, category, kind]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void Promise.all([listPublicContents({ kind, q, ...(category ? { category } : {}), page, pageSize: 10 }, controller.signal), getPublicCategories(kind, controller.signal)]).then(([list, choices]) => {
      if (!active) return;
      const lastPage = Math.max(1, Math.ceil(list.pagination.total / list.pagination.pageSize));
      if (page > lastPage) { const next = new URLSearchParams(params); next.set('page', String(lastPage)); setParams(next, { replace: true }); return; }
      setResult({ key, list, categories: choices.data, failed: false });
    }).catch(() => { if (active) setResult({ key, list: null, categories: [], failed: true }); });
    return () => { active = false; controller.abort(); };
  }, [key, kind, q, category, page]);
  const current = result?.key === key ? result : null;
  const records = current?.list?.data.filter((item) => item.kind === kind && item.publication === 'public') ?? [];
  function submit(event: FormEvent) { event.preventDefault(); const next = new URLSearchParams(); if (search.trim()) next.set('q', search.trim()); if (chosenCategory) next.set('category', chosenCategory); if (next.toString() === query) refresh(); else setParams(next); }
  function go(nextPage: number) { const next = new URLSearchParams(params); next.set('page', String(nextPage)); setParams(next); }
  return <div className="notice-page public-catalog"><p className="page-intro">{spec.intro}</p>
    <form className="notice-search" role="search" onSubmit={submit}><div className="field"><label htmlFor="catalog-query">검색어</label><input id="catalog-query" type="search" maxLength={200} value={search} placeholder="제목 또는 본문 검색" onChange={(event) => setSearch(event.target.value)} /></div><div className="field"><label htmlFor="catalog-category">분류</label><select id="catalog-category" value={chosenCategory} onChange={(event) => setChosenCategory(event.target.value)}><option value="">전체 분류</option>{[...new Set([...(current?.categories ?? []), ...(chosenCategory ? [chosenCategory] : [])])].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><Button type="submit"><Search size={16} aria-hidden="true" />검색</Button>{(q || category) && <Button variant="quiet" onClick={() => setParams({})}>검색 초기화</Button>}</form>
    {!current ? <LoadingState>{spec.title} 목록을 불러오고 있습니다.</LoadingState> : current.failed ? <div className="public-load-error"><Notice tone="error" title="목록을 불러오지 못했습니다">연결을 확인한 뒤 다시 시도해 주세요.</Notice><Button variant="secondary" onClick={refresh}>목록 다시 불러오기</Button></div> : current.list && <><p className="notice-count">전체 <strong>{current.list.pagination.total}</strong>건</p>{!records.length ? <section className="content-panel"><EmptyState title={q || category ? '검색 결과가 없습니다' : `공개된 ${spec.title} 안내가 없습니다`}>{q || category ? '검색어 또는 분류를 바꾸어 다시 확인해 주세요.' : '공식 콘텐츠 입력 대기 중입니다. 공개된 안내가 등록되면 이곳에서 확인할 수 있습니다.'}</EmptyState></section> : kind === 'resource' ? <DataTable caption="신청·제출 서식 목록" columns={['분류', '서식명', '수정일']}>{records.map((item) => <tr key={item.id}><td>{item.category || '미분류'}</td><td className="notice-title-cell"><Link className="table-link" to={publicTarget(item)!.path}>{item.title}</Link></td><td className="notice-date-cell">{dateLabel(item.updatedAt)}</td></tr>)}</DataTable> : <ProgramGroups records={records} kind={kind} />}<ContentPagination pagination={current.list.pagination} go={go} label={`${spec.title} 페이지 이동`} /></>}
    {kind !== 'resource' && <div className="related-links"><TextLink to="/programs/guide">참여 및 신청 안내 보기</TextLink></div>}
  </div>;
}

function DetailFields({ record }: { record: ContentRecord }) {
  const program = record.program, resource = record.resource;
  const fields: [string, string | number | null | undefined][] = record.kind === 'resource' ? [
    ['적용 대상', resource?.audience], ['제출서류', resource?.requiredDocuments], ['작성 방법', resource?.instructions], ['제출기한', resource?.deadlineText], ['제출방법', resource?.submissionMethod], ['제출처', resource?.destination], ['문의처', resource?.contact], ['적용 연도', resource?.applicableYear],
  ] : [[record.kind === 'curriculum' ? '수준' : '유형', program?.level], ['교육 대상', program?.audience], ['운영 방식', program?.delivery], ['이수요건', program?.completionRequirements]];
  return <section className="catalog-detail-fields" aria-label={record.kind === 'resource' ? '서식 작성·제출 안내' : '교육·프로그램 안내'}><h3>{record.kind === 'resource' ? '작성·제출 안내' : '교육·프로그램 안내'}</h3><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? '입력 대기' : value}</dd></div>)}</dl></section>;
}

export function PublicDetailPage({ route }: { route: PageRoute }) {
  const kind = routeKind(route), spec = catalogs[kind];
  const location = useLocation();
  const values = matchPath(route.path, location.pathname)?.params;
  const { loading, record, failed, refresh } = usePublicDetail(kind, values?.slug ?? values?.post ?? '');
  return <div className="notice-page public-catalog-detail">{loading ? <LoadingState>상세 안내를 불러오고 있습니다.</LoadingState> : failed ? <div className="public-load-error"><Notice tone="error" title="상세 안내를 불러오지 못했습니다">연결을 확인한 뒤 다시 시도해 주세요.</Notice><Button variant="secondary" onClick={refresh}>다시 불러오기</Button></div> : record ? <article className="notice-article"><header><div className="notice-detail-tags"><span>{record.category || '미분류'}</span></div><h2>{record.title}</h2><dl className="notice-metadata"><div><dt>수정일</dt><dd>{dateLabel(record.updatedAt)}</dd></div></dl></header><DetailFields record={record} /><PublicContentDetails record={record} showEmptyFiles /></article> : <section className="content-panel"><EmptyState title="공개된 상세 안내를 찾을 수 없습니다">주소가 잘못되었거나 현재 공개된 콘텐츠가 없습니다. 목록에서 다시 확인해 주세요.</EmptyState></section>}
    <div className="notice-bottom-actions"><LinkButton variant="secondary" to={spec.path}><ArrowLeft size={16} aria-hidden="true" />{spec.title} 목록으로</LinkButton>{kind !== 'resource' && <LinkButton variant="secondary" to="/programs/guide">참여 및 신청 안내</LinkButton>}</div>
  </div>;
}
