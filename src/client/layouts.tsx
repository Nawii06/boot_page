import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, ChevronRight, House, LogOut, Menu, X } from 'lucide-react';
import type { PageRoute } from '../shared/pageRoutes';
import { useAdminAuth } from './auth/AdminAuth';
import { Button, Notice } from './components/ui';
import { PublicFooterContact } from './components/publicContent';

export const publicNavigation = [
  { title: '사업단 소개', items: [
    { title: '사업소개', path: '/about/overview' },
    { title: '조직 및 담당업무', path: '/about/organization' },
    { title: '기업 협력 안내', path: '/about/cooperation' },
    { title: '오시는 길', path: '/about/location' },
  ] },
  { title: '교육·참여 프로그램', items: [
    { title: '교육과정', path: '/programs/curriculum' },
    { title: '비교과·산학 프로그램', path: '/programs/activities' },
    { title: '참여 및 신청 안내', path: '/programs/guide' },
  ] },
  { title: '공지·자료실', items: [
    { title: '공지사항', path: '/notices' },
    { title: '신청·제출 서식', path: '/resources' },
    { title: '자주 묻는 질문', path: '/faq' },
  ] },
];

export const adminNavigation = [
  { title: '시작', items: [{ title: '관리자 메인', path: '/admin' }] },
  { title: '콘텐츠 관리', items: [
    { title: '교육·프로그램', path: '/admin/programs' },
    { title: '공지사항', path: '/admin/notices' },
    { title: '신청·제출 서식', path: '/admin/resources' },
    { title: '질문·답변', path: '/admin/faq' },
  ] },
  { title: '고정 정보', items: [
    { title: '사업단 기본정보', path: '/admin/about' },
    { title: '메인페이지', path: '/admin/home' },
    { title: '참여 및 신청 안내', path: '/admin/guide' },
  ] },
];

export function Brand({ admin = false }: { admin?: boolean }) {
  return <Link to={admin ? '/admin' : '/'} className="brand" aria-label={admin ? '부트캠프 AI 관리자 메인' : '국립한국교통대학교 부트캠프 AI 사업단 홈'}>
    <span className="brand-words"><span className="brand-university">국립한국교통대학교</span><strong>부트캠프<span className="brand-ai">(AI)</span>사업단</strong></span>
  </Link>;
}

function Breadcrumb({ route }: { route?: PageRoute }) {
  return <nav className="breadcrumb" aria-label="현재 위치">
    <Link to="/" aria-label="홈"><House size={15} aria-hidden="true" /></Link>
    <ChevronRight size={14} aria-hidden="true" />
    {route && route.section !== route.title && <><span>{route.section}</span><ChevronRight size={14} aria-hidden="true" /></>}
    <span aria-current="page">{route?.title || '페이지를 찾을 수 없음'}</span>
  </nav>;
}

export function PublicLayout({ route, children }: { route?: PageRoute; children: ReactNode }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  useEffect(() => { setMobileOpen(false); setActiveMenu(null); }, [location.pathname]);
  const currentSection = publicNavigation.find((section) => section.title === route?.section);
  return <div className="public-shell">
    <a href="#main-content" className="skip-link">본문 바로가기</a>
    <div className="utility-bar"><div className="container utility-inner"><span>국립한국교통대학교 · AI BOOTCAMP</span><span className="pilot-label">파일럿 홈페이지</span></div></div>
    <header className="public-header" onKeyDown={(event) => { if (event.key === 'Escape') { setActiveMenu(null); setMobileOpen(false); } }}>
      <div className="container header-inner">
        <Brand />
        <button className="mobile-menu-button" aria-label={mobileOpen ? '전체 메뉴 닫기' : '전체 메뉴 열기'} aria-expanded={mobileOpen} aria-controls="public-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button>
        <nav id="public-navigation" className={`public-navigation ${mobileOpen ? 'is-open' : ''}`} aria-label="주 메뉴">
          <NavLink className="nav-home" to="/" end>홈</NavLink>
          {publicNavigation.map((section) => <div className="nav-section" key={section.title} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActiveMenu(null); }}>
            <button className={`nav-trigger ${route?.section === section.title ? 'current' : ''}`} aria-expanded={activeMenu === section.title} aria-controls={`nav-${section.items[0].path.split('/')[1]}`} onClick={() => setActiveMenu(activeMenu === section.title ? null : section.title)}>{section.title}<ChevronDown size={14} aria-hidden="true" /></button>
            <div id={`nav-${section.items[0].path.split('/')[1]}`} className="nav-dropdown" hidden={activeMenu !== section.title}>
              {section.items.map((item) => <NavLink key={item.path} to={item.path}>{item.title}<ChevronRight size={14} aria-hidden="true" /></NavLink>)}
            </div>
          </div>)}
        </nav>
      </div>
    </header>
    {route?.kind !== 'home' && <div className="page-band"><div className="container"><Breadcrumb route={route} /><div className="page-band-heading"><span className="eyebrow">KNUT AI BOOTCAMP</span><h1>{route?.title || '페이지를 찾을 수 없습니다'}</h1></div></div></div>}
    {currentSection && <nav className="section-navigation" aria-label={`${currentSection.title} 하위 메뉴`}><div className="container">{currentSection.items.map((item) => <NavLink key={item.path} to={item.path}>{item.title}</NavLink>)}</div></nav>}
    <main id="main-content" tabIndex={-1} className={route?.kind === 'home' ? 'home-main' : 'container public-content'}>{children}</main>
    <footer className="public-footer"><div className="container footer-main"><div><Brand /><p className="footer-description">국립한국교통대학교 부트캠프(AI)사업단<br />교육과 참여에 필요한 안내를 확인하세요.</p></div>
      <PublicFooterContact />
    </div><div className="container footer-bottom"><span>국립한국교통대학교 부트캠프(AI)사업단 · 로컬 파일럿</span><Link to="/admin/login">관리자 화면 <ArrowUpRight size={14} aria-hidden="true" /></Link></div></footer>
  </div>;
}

export function AdminLayout({ route, children }: { route: PageRoute; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const { session, logout } = useAdminAuth();
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  if (route.kind === 'login') return <div className="admin-shell admin-login-shell"><a href="#main-content" className="skip-link">본문 바로가기</a><div className="admin-workspace"><header className="admin-header login-header"><Brand /><Link to="/">공개 홈페이지 <ArrowUpRight size={15} aria-hidden="true" /></Link></header><main className="admin-content login-content" id="main-content" tabIndex={-1}><div className="admin-title-row"><div><p className="eyebrow">관리자</p><h1>{route.title}</h1></div><span className="route-label">{route.id}</span></div>{children}</main><footer className="admin-footer">국립한국교통대학교 부트캠프(AI)사업단 · 로컬 파일럿 관리 화면</footer></div></div>;
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(false);
    try {
      await logout();
    } catch {
      setLogoutError(true);
      setSigningOut(false);
    }
  }
  return <div className="admin-shell">
    <a href="#main-content" className="skip-link">본문 바로가기</a>
    <aside className="admin-sidebar">
      <div className="admin-brand-row"><Brand admin /><button className="mobile-menu-button" aria-label={menuOpen ? '관리 메뉴 닫기' : '관리 메뉴 열기'} aria-controls="admin-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div>
      <div className="admin-panel-name">콘텐츠 관리</div>
      <nav id="admin-navigation" className={menuOpen ? 'is-open' : ''} aria-label="관리자 메뉴" onKeyDown={(event) => { if (event.key === 'Escape') setMenuOpen(false); }}>
        {adminNavigation.map((group) => <div className="admin-nav-group" key={group.title}><p>{group.title}</p>{group.items.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/admin'}>{item.title}<ChevronRight size={14} aria-hidden="true" /></NavLink>)}</div>)}
        <div className="admin-sidebar-note"><span className="small-label">콘텐츠 관리</span><p>안내·교육·공지·서식을 관리합니다.<br />공개 여부를 확인해 저장하세요.</p></div>
      </nav>
    </aside>
    <div className="admin-workspace"><header className="admin-header"><div className="admin-session"><span className="admin-session-label">관리자 로그인</span><strong className="admin-username">{session?.admin.username}</strong><Button variant="quiet" disabled={signingOut} onClick={() => { void signOut(); }}><LogOut size={14} aria-hidden="true" />{signingOut ? '로그아웃 중…' : '로그아웃'}</Button></div><Link to="/">공개 홈페이지 <ArrowUpRight size={15} aria-hidden="true" /></Link></header>
      <main className="admin-content" id="main-content" tabIndex={-1}><nav className="breadcrumb" aria-label="현재 위치"><Link to="/admin">관리자</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{route.title}</span></nav><div className="admin-title-row"><div><p className="eyebrow">{route.section}</p><h1>{route.title}</h1></div><span className="route-label">{route.id}</span></div>
        {logoutError && <Notice tone="error" title="로그아웃을 확인하지 못했습니다">연결을 확인한 뒤 로그아웃을 다시 눌러 주세요. 서버에서 로그아웃이 확인될 때까지 로그인 상태를 유지합니다.</Notice>}
        <div className="admin-stage-note"><span className="stage-dot" aria-hidden="true" /><strong>관리자 로그인 확인</strong><span>콘텐츠 편집과 파일 관리를 사용할 수 있습니다.</span></div>
        {children}
      </main><footer className="admin-footer">국립한국교통대학교 부트캠프(AI)사업단 · 로컬 파일럿 관리 화면</footer>
    </div>
  </div>;
}
