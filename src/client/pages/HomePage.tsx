import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, FileText, GraduationCap, MessageCircle, Pin } from 'lucide-react';
import type { ContentRecord, ContentSummary, PublicHome } from '../../shared/content';
import { getPublicHome } from '../api/content';
import { fileUrl } from '../api/notices';
import { dateLabel, kindLabels } from '../components/contentEditing';
import { PublicAttachments, PublicRelated, publicTarget, usePublicRefresh } from '../components/publicContent';
import { Button, EmptyState, LinkButton, LoadingState, Notice, TextLink } from '../components/ui';
import { ConnectionGraphic } from '../components/ConnectionGraphic';

function HomeLinks({ items, label, limit = 4, date = false }: { items: ContentSummary[]; label: string; limit?: number; date?: boolean }) {
  const visible = items.filter((item) => item.publication === 'public' && publicTarget(item));
  const rows = (values: ContentSummary[]) => <ul className="home-content-list">{values.map((item) => <li key={item.id}><Link to={publicTarget(item)!.path}><span className="home-content-kind">{item.pinned && item.kind === 'notice' ? <><Pin size={12} aria-hidden="true" />고정</> : kindLabels[item.kind]}</span><strong>{item.title}</strong>{item.programLevel && <span className="home-content-level">{item.programLevel}</span>}{date && <time dateTime={item.kind === 'resource' ? item.updatedAt : item.publishedAt ?? item.createdAt}>{dateLabel(item.kind === 'resource' ? item.updatedAt : item.publishedAt ?? item.createdAt)}</time>}<ChevronRight size={16} aria-hidden="true" /></Link></li>)}</ul>;
  return <>{rows(visible.slice(0, limit))}{visible.length > limit && <details className="home-more"><summary>{label} 더보기 ({visible.length - limit})</summary>{rows(visible.slice(limit))}</details>}</>;
}

function HomeImage({ page }: { page: ContentRecord }) {
  const file = page.files.find((item) => item.role === 'home');
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [file?.id]);
  if (!file) return null;
  return <figure className="home-managed-image">{failed ? <p>이미지를 표시할 수 없습니다. 소개와 주요 안내는 텍스트로 확인해 주세요.</p> : <img src={fileUrl(file.id, page.id, true)} alt={file.altText || '메인 안내 이미지'} onError={() => setFailed(true)} />}{file.altText && <figcaption>{file.altText}</figcaption>}</figure>;
}

export function HomePage() {
  const { requestKey, refresh } = usePublicRefresh();
  const [result, setResult] = useState<{ key: string; data: PublicHome | null; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void getPublicHome(controller.signal).then(({ data }) => { if (active) setResult({ key: requestKey, data, failed: false }); }).catch(() => { if (active) setResult({ key: requestKey, data: null, failed: true }); });
    return () => { active = false; controller.abort(); };
  }, [requestKey]);
  const current = result?.key === requestKey ? result : null;
  const home = current?.data, page = home?.page?.publication === 'public' ? home.page : null;
  const section = (name: keyof PublicHome['sections']) => home?.sections[name].filter((item) => item.publication === 'public') ?? [];
  const featured = section('featured'), notices = section('notice'), programs = section('program'), resources = section('resource');
  const selectedIds = new Set(notices.map((item) => item.id));
  const latest = home?.latestNotices.filter((item) => item.publication === 'public' && !selectedIds.has(item.id)) ?? [];
  return <div className="connected-home">
    <section className="hero"><div className="container hero-grid"><div className="hero-copy"><div className="hero-eyebrow"><span />KNUT AI BOOTCAMP</div><h1>내 전공에<br /><span>AI를 더하다</span></h1><p>교육과정, 공지와 제출 서식을 한곳에서 확인하세요.</p><div className="home-hero-actions"><LinkButton to="/programs/curriculum">교육과정 알아보기<ArrowRight size={17} aria-hidden="true" /></LinkButton><LinkButton to="/resources" variant="secondary">서식 바로가기</LinkButton></div></div><ConnectionGraphic /></div></section>
    {!current ? <div className="container home-data-status"><LoadingState>메인 안내를 불러오고 있습니다.</LoadingState></div> : current.failed ? <div className="container home-data-status public-load-error"><Notice tone="error" title="메인 안내를 불러오지 못했습니다">연결을 확인한 뒤 다시 시도해 주세요.</Notice><Button variant="secondary" onClick={refresh}>메인 다시 불러오기</Button></div> : <>
      <section className="container home-introduction" aria-label="사업단 핵심 소개">{page ? <><div className="home-introduction-text"><h2>{page.title}</h2>{page.bodyHtml.length > 900 ? <details className="home-intro-more"><summary>소개 자세히 보기</summary><div className="notice-content-body" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} /></details> : <div className="notice-content-body" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />}</div><HomeImage page={page} /></> : <p className="public-input-pending">메인 소개 문구는 공식 정보 입력 대기 중입니다.</p>}</section>
      <section className="container home-notice-section" id="campus-information" aria-labelledby="home-notices-heading"><div className="section-heading"><div><p className="eyebrow">NOTICE</p><h2 id="home-notices-heading">주요·최근 공지</h2></div><TextLink to="/notices">공지 전체 보기</TextLink></div>
        {featured.length > 0 && <div className="home-featured"><h3>주요 안내</h3><HomeLinks items={featured} label="주요 안내" /></div>}
        <div className="home-notice-columns"><div><h3>주요 공지</h3>{notices.length ? <HomeLinks items={notices} label="주요 공지" date /> : <EmptyState title="선택된 주요 공지가 없습니다" compact>최근 공지와 전체 목록에서 공개된 소식을 확인하세요.</EmptyState>}</div><div><h3>최근 공지</h3>{latest.length ? <HomeLinks items={latest} label="최근 공지" date /> : <EmptyState title={notices.length ? '추가된 최근 공지가 없습니다' : '공개된 공지가 없습니다'} compact>공개된 소식이 등록되면 이곳에서 확인할 수 있습니다.</EmptyState>}</div></div>
      </section>
      <section className="container home-program-section" aria-labelledby="home-programs-heading"><div className="section-heading"><div><p className="eyebrow">PROGRAM</p><h2 id="home-programs-heading">교육·프로그램</h2></div><div className="home-section-links"><TextLink to="/programs/curriculum">교육과정 전체</TextLink><TextLink to="/programs/activities">프로그램 전체</TextLink></div></div>{programs.length ? <HomeLinks items={programs} label="교육·프로그램" /> : <EmptyState title="선택된 교육·프로그램이 없습니다" compact>전체 목록에서 공개된 교육과정과 프로그램을 확인하세요.</EmptyState>}</section>
      <section className="container home-resource-section" aria-labelledby="home-resources-heading"><div className="section-heading"><div><p className="eyebrow">RESOURCES</p><h2 id="home-resources-heading">신청·제출 서식</h2></div><TextLink to="/resources">서식 전체 보기</TextLink></div>{resources.length ? <HomeLinks items={resources} label="서식" date /> : <EmptyState title="선택된 서식이 없습니다" compact>전체 목록에서 서식과 작성·제출 안내를 확인하세요.</EmptyState>}{page && <div className="home-extra-links"><PublicRelated record={page} /><PublicAttachments record={page} /></div>}</section>
    </>}
    <section className="container quick-links" aria-label="주요 바로가기"><Link to="/programs/guide"><span className="quick-icon"><GraduationCap size={24} aria-hidden="true" /></span><span><strong>참여 및 신청 안내</strong><small>참여 절차와 신청 경로</small></span><ChevronRight size={19} aria-hidden="true" /></Link><Link to="/resources"><span className="quick-icon"><FileText size={23} aria-hidden="true" /></span><span><strong>신청·제출 서식</strong><small>작성 안내와 원본 파일</small></span><ChevronRight size={19} aria-hidden="true" /></Link><Link to="/faq"><span className="quick-icon"><MessageCircle size={23} aria-hidden="true" /></span><span><strong>자주 묻는 질문</strong><small>질문과 답변 확인</small></span><ChevronRight size={19} aria-hidden="true" /></Link></section>
  </div>;
}
