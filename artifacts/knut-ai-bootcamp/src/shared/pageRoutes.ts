export type PageRoute = {
  id: string;
  path: string;
  title: string;
  area: 'public' | 'admin';
  section: string;
  kind: 'home' | 'page' | 'list' | 'detail' | 'login' | 'admin-home' | 'editor';
};

// Route metadata only: safe to share with the HTTP server and route checks.
export const routeDefinitions: readonly PageRoute[] = [
  { id: 'PUB-01', path: '/', title: '홈', area: 'public', section: '홈', kind: 'home' },
  { id: 'PUB-02', path: '/about/overview', title: '사업소개', area: 'public', section: '사업단 소개', kind: 'page' },
  { id: 'PUB-03', path: '/about/organization', title: '조직 및 담당업무', area: 'public', section: '사업단 소개', kind: 'page' },
  { id: 'PUB-04', path: '/about/cooperation', title: '기업 협력 안내', area: 'public', section: '사업단 소개', kind: 'page' },
  { id: 'PUB-05', path: '/about/location', title: '오시는 길', area: 'public', section: '사업단 소개', kind: 'page' },
  { id: 'PUB-06', path: '/programs/curriculum', title: '교육과정 목록·현황', area: 'public', section: '교육·참여 프로그램', kind: 'list' },
  { id: 'PUB-07', path: '/programs/curriculum/:slug', title: '교육과정 상세', area: 'public', section: '교육·참여 프로그램', kind: 'detail' },
  { id: 'PUB-08', path: '/programs/activities', title: '비교과·산학 프로그램 목록·현황', area: 'public', section: '교육·참여 프로그램', kind: 'list' },
  { id: 'PUB-09', path: '/programs/activities/:slug', title: '프로그램 상세', area: 'public', section: '교육·참여 프로그램', kind: 'detail' },
  { id: 'PUB-10', path: '/programs/guide', title: '참여 및 신청 안내', area: 'public', section: '교육·참여 프로그램', kind: 'page' },
  { id: 'PUB-11', path: '/notices', title: '공지사항', area: 'public', section: '공지·자료실', kind: 'list' },
  { id: 'PUB-12', path: '/notices/:post', title: '공지 상세', area: 'public', section: '공지·자료실', kind: 'detail' },
  { id: 'PUB-13', path: '/resources', title: '신청·제출 서식', area: 'public', section: '공지·자료실', kind: 'list' },
  { id: 'PUB-14', path: '/resources/:post', title: '서식 안내 상세', area: 'public', section: '공지·자료실', kind: 'detail' },
  { id: 'PUB-15', path: '/faq', title: '자주 묻는 질문', area: 'public', section: '공지·자료실', kind: 'list' },
  { id: 'ADM-01', path: '/admin/login', title: '관리자 로그인', area: 'admin', section: '관리자', kind: 'login' },
  { id: 'ADM-02', path: '/admin', title: '관리자 메인', area: 'admin', section: '관리자', kind: 'admin-home' },
  { id: 'ADM-03', path: '/admin/about', title: '사업단 기본정보 편집', area: 'admin', section: '고정 정보', kind: 'editor' },
  { id: 'ADM-04', path: '/admin/programs', title: '교육·프로그램 관리', area: 'admin', section: '콘텐츠 관리', kind: 'list' },
  { id: 'ADM-05', path: '/admin/programs/new', title: '교육·프로그램 등록', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-05', path: '/admin/programs/:id/edit', title: '교육·프로그램 수정', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-06', path: '/admin/notices', title: '공지사항 관리', area: 'admin', section: '콘텐츠 관리', kind: 'list' },
  { id: 'ADM-07', path: '/admin/notices/new', title: '공지사항 등록', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-07', path: '/admin/notices/:id/edit', title: '공지사항 수정', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-08', path: '/admin/resources', title: '서식 관리', area: 'admin', section: '콘텐츠 관리', kind: 'list' },
  { id: 'ADM-09', path: '/admin/resources/new', title: '서식 등록', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-09', path: '/admin/resources/:id/edit', title: '서식 수정', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-10', path: '/admin/faq', title: '질문·답변 관리', area: 'admin', section: '콘텐츠 관리', kind: 'list' },
  { id: 'ADM-11', path: '/admin/faq/new', title: '질문·답변 등록', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-11', path: '/admin/faq/:id/edit', title: '질문·답변 수정', area: 'admin', section: '콘텐츠 관리', kind: 'editor' },
  { id: 'ADM-12', path: '/admin/home', title: '메인페이지 편집', area: 'admin', section: '고정 정보', kind: 'editor' },
  { id: 'ADM-13', path: '/admin/guide', title: '참여 및 신청 안내 편집', area: 'admin', section: '고정 정보', kind: 'editor' },
];
