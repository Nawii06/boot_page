import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { routeDefinitions } from '../shared/pageRoutes';
import { AdminLayout, PublicLayout } from './layouts';
import { AdminHomePage, AdminLoginPage } from './pages/AdminPages';
import { AdminContentEditorPage, AdminContentListPage } from './pages/AdminContentPages';
import { HomePage, NotFoundPage } from './pages/PublicPages';
import { PublicDetailPage, PublicListPage } from './pages/PublicCatalogPages';
import { PublicInfoPage, PublicFaqPage } from './pages/PublicContentPages';
import { AdminAuthBoundary, AdminAuthProvider } from './auth/AdminAuth';
import { AdminNoticeEditorPage, NoticeListPage, PublicNoticeDetailPage } from './pages/NoticePages';

export function App() {
  return <AdminAuthProvider><AppRoutes /></AdminAuthProvider>;
}

function AppRoutes() {
  const location = useLocation();
  const route = routeDefinitions.find((item) => matchPath({ path: item.path, end: true }, location.pathname));
  useEffect(() => {
    document.title = `${route?.title || '페이지 없음'} | 국립한국교통대학교 부트캠프(AI)사업단`;
    window.scrollTo(0, 0);
  }, [location.pathname, route?.title]);
  if (!route) return <PublicLayout><NotFoundPage /></PublicLayout>;
  if (route.area === 'admin') {
    return <AdminAuthBoundary loginPage={route.kind === 'login'}><AdminLayout route={route}>{route.kind === 'login' ? <AdminLoginPage /> : route.kind === 'admin-home' ? <AdminHomePage /> : route.id === 'ADM-06' ? <NoticeListPage admin /> : route.id === 'ADM-07' ? <AdminNoticeEditorPage key={location.pathname} /> : route.kind === 'list' ? <AdminContentListPage key={route.path} route={route} /> : <AdminContentEditorPage key={location.pathname} route={route} />}</AdminLayout></AdminAuthBoundary>;
  }
  return <PublicLayout route={route}>{route.id === 'PUB-11' ? <NoticeListPage /> : route.id === 'PUB-12' ? <PublicNoticeDetailPage /> : route.id === 'PUB-15' ? <PublicFaqPage /> : route.kind === 'home' ? <HomePage /> : route.kind === 'page' ? <PublicInfoPage route={route} /> : route.kind === 'list' ? <PublicListPage route={route} /> : <PublicDetailPage route={route} />}</PublicLayout>;
}
