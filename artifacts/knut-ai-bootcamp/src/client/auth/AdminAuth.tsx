import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, matchPath, Navigate, useLocation } from 'react-router-dom';
import { routeDefinitions } from '../../shared/pageRoutes';
import { AuthRequestError, getAdminSession, logoutAdmin, type AdminSession } from '../api/auth';
import { Button, LoadingState, Notice } from '../components/ui';

type AuthState = {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  session: AdminSession | null;
  checkedLocation: string;
};

type AuthContextValue = AuthState & {
  refresh: (background?: boolean) => Promise<void>;
  acceptSession: (session: AdminSession) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// This only selects a post-login destination. The server remains the authority
// for session validity and permission checks on every protected request.
export function safeAdminDestination(value: string | null): string {
  if (!value || !value.startsWith('/admin') || /[\\?#]/.test(value)) return '/admin';
  try {
    if (new URL(value, 'https://local.invalid').pathname !== value) return '/admin';
  } catch {
    return '/admin';
  }
  return routeDefinitions.some((route) => route.area === 'admin' && route.kind !== 'login'
    && matchPath({ path: route.path, end: true }, value)) ? value : '/admin';
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const locationKey = `${location.key}:${location.pathname}`;
  const isAdminPath = /^\/admin(?:\/|$)/i.test(location.pathname);
  const requestVersion = useRef(0);
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, checkedLocation: '' });

  const refresh = useCallback(async (background = false) => {
    const version = ++requestVersion.current;
    // A file picker or another tab can trigger focus. Keep the editor mounted
    // during background validation; the API still verifies every operation.
    if (!background) setState({ status: 'loading', session: null, checkedLocation: locationKey });
    try {
      const session = await getAdminSession();
      if (version === requestVersion.current) {
        setState({ status: session ? 'authenticated' : 'anonymous', session, checkedLocation: locationKey });
      }
    } catch {
      if (version === requestVersion.current) setState((previous) => background && previous.session && Date.parse(previous.session.expiresAt) > Date.now()
        ? previous : { status: 'error', session: null, checkedLocation: locationKey });
    }
  }, [locationKey]);

  useEffect(() => {
    if (!isAdminPath) return;
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      requestVersion.current++;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isAdminPath, refresh]);

  useEffect(() => {
    if (!isAdminPath || !state.session) return;
    const timer = window.setTimeout(() => {
      requestVersion.current++;
      setState({ status: 'anonymous', session: null, checkedLocation: locationKey });
    }, Math.max(0, Date.parse(state.session.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [isAdminPath, locationKey, state.session]);

  const acceptSession = useCallback((session: AdminSession) => {
    requestVersion.current++;
    setState({ status: 'authenticated', session, checkedLocation: locationKey });
  }, [locationKey]);

  const logout = useCallback(async () => {
    if (!state.session) return;
    try {
      await logoutAdmin(state.session.csrfToken);
    } catch (error) {
      if (!(error instanceof AuthRequestError && error.status === 401)) throw error;
    }
    requestVersion.current++;
    setState({ status: 'anonymous', session: null, checkedLocation: locationKey });
  }, [locationKey, state.session]);

  // A changed location has not yet been verified, even before its effect runs.
  const currentState: AuthState = isAdminPath && state.checkedLocation !== locationKey
    ? { status: 'loading', session: null, checkedLocation: locationKey } : state;
  return <AuthContext.Provider value={{ ...currentState, refresh, acceptSession, logout }}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('관리자 인증 영역이 필요합니다.');
  return context;
}

export function AdminAuthBoundary({ children, loginPage = false }: { children: ReactNode; loginPage?: boolean }) {
  const { status, refresh } = useAdminAuth();
  const location = useLocation();
  if (status === 'loading') return <div className="auth-check-shell"><LoadingState>관리자 세션을 확인하고 있습니다.</LoadingState></div>;
  if (status === 'error') return <div className="auth-check-shell"><Notice tone="error" title="로그인 상태를 확인할 수 없습니다">로컬 API 실행 상태와 연결을 확인한 뒤 다시 시도해 주세요.</Notice><div className="auth-check-actions"><Button onClick={() => { void refresh(); }}>다시 확인</Button><Link to="/" className="text-link">공개 홈페이지로</Link></div></div>;
  if (!loginPage && status !== 'authenticated') return <Navigate replace to={`/admin/login?next=${encodeURIComponent(safeAdminDestination(location.pathname))}`} />;
  if (loginPage && status === 'authenticated') return <Navigate replace to={safeAdminDestination(new URLSearchParams(location.search).get('next'))} />;
  return children;
}
