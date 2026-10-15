import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ExternalLink, LockKeyhole, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routeDefinitions } from '../../shared/pageRoutes';
import { Button, DataTable, LoadingState, Notice } from '../components/ui';
import { getHealth } from '../api/content';
import { AuthRequestError, loginAdmin } from '../api/auth';
import { useAdminAuth } from '../auth/AdminAuth';

function ApiConnection() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [databaseReady, setDatabaseReady] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setState('loading');
    void getHealth(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) {
          setDatabaseReady(data.capabilities.database);
          setState('ready');
        }
      })
      .catch(() => { if (active) setState('error'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  return <section className="content-panel api-panel"><div className="panel-heading"><h2>로컬 API 연결</h2><Button variant="quiet" onClick={() => setAttempt(attempt + 1)} disabled={state === 'loading'}><RefreshCw size={15} aria-hidden="true" />다시 확인</Button></div>{state === 'loading' ? <LoadingState>로컬 API 응답을 확인하고 있습니다.</LoadingState> : state === 'error' ? <Notice title="로컬 API에 연결할 수 없습니다" tone="error">API 실행 상태를 확인한 후 다시 시도해 주세요.</Notice> : <div className="api-ready"><span aria-hidden="true" />로컬 API가 응답했습니다.<small>{databaseReady ? '로컬 DB 연결 확인 · 콘텐츠 등록·편집·첨부파일을 사용할 수 있습니다.' : '로컬 DB 연결 상태를 확인해 주세요.'}</small></div>}</section>;
}

export function AdminHomePage() {
  const primary = routeDefinitions.filter((route) => route.area === 'admin' && (route.kind === 'list' || ['/admin/about', '/admin/home', '/admin/guide'].includes(route.path)));
  const previewRoutes = [
    { label: '교육과정 목록', path: '/programs/curriculum' },
    { label: '프로그램 목록', path: '/programs/activities' },
    { label: '서식 목록', path: '/resources' },
  ];
  return <><ApiConnection /><section className="admin-section"><div className="section-heading"><div><h2>관리 메뉴 바로가기</h2><p>사업단 안내, 교육·프로그램, 공지, 서식, FAQ와 메인 노출을 관리합니다.</p></div></div><DataTable caption="관리 메뉴 바로가기" columns={['관리 항목', '화면', '바로가기']}>{primary.map((route) => <tr key={route.path}><td><strong>{route.title}</strong></td><td><span className="neutral-tag">콘텐츠 편집</span></td><td><Link className="table-link" to={route.path}>화면 열기 <ArrowRight size={14} aria-hidden="true" /></Link></td></tr>)}</DataTable></section><section className="content-panel preview-panel"><h2>공개 화면 연결 현황</h2><p>공개 홈페이지의 모든 메뉴가 저장한 콘텐츠와 연결됩니다. 공개 여부를 확인해 저장한 뒤 해당 화면에서 내용을 확인하세요.</p><div className="preview-links">{previewRoutes.map((route) => <Link key={route.path} to={route.path}>{route.label}<ExternalLink size={14} aria-hidden="true" /></Link>)}</div></section></>;
}

export function AdminLoginPage() {
  const usernameId = useId();
  const passwordId = useId();
  const errorId = useId();
  const { acceptSession } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (!retryAt) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || Date.now() < retryAt) return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    const submittedPassword = password;
    setPassword('');
    try {
      const session = await loginAdmin(username, submittedPassword);
      if (mounted.current) acceptSession(session);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AuthRequestError && error.status === 429) {
        setRetryAt(Date.now() + (error.retryAfter ?? 60) * 1000);
        setMessage('로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
      } else if (error instanceof AuthRequestError && [400, 401].includes(error.status)) {
        setMessage('관리자 아이디 또는 비밀번호를 확인해 주세요.');
      } else if (error instanceof AuthRequestError && error.status === 403) {
        setMessage('로그인 요청을 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      } else {
        setMessage('로그인 요청을 처리하지 못했습니다. 로컬 API 연결을 확인한 뒤 다시 시도해 주세요.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return <div className="login-panel content-panel"><span className="login-icon"><LockKeyhole size={27} strokeWidth={1.5} aria-hidden="true" /></span><h2>지정 관리자 로그인</h2><p>사업단 콘텐츠를 관리하는 관리자 전용 화면입니다. 지정된 계정으로 로그인해 주세요.</p>
    {message && <div id={errorId}><Notice title={message} tone="error" /></div>}
    <form onSubmit={(event) => { void submit(event); }} aria-busy={pending} aria-describedby={message ? errorId : undefined}>
      <div className="field"><label htmlFor={usernameId}>관리자 아이디</label><input id={usernameId} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={100} value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} /></div>
      <div className="field"><label htmlFor={passwordId}>비밀번호</label><input id={passwordId} name="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} /></div>
      <Button className="full-width" type="submit" disabled={pending || remaining > 0}>{pending ? '로그인 확인 중…' : remaining > 0 ? `${remaining}초 후 다시 시도` : '로그인'}</Button>
    </form><p className="login-help">일반 회원가입은 제공하지 않습니다. 계정 설정·비밀번호 재설정은 로컬 관리자 명령으로 진행합니다.</p><Link className="text-link" to="/">공개 홈페이지로 <ArrowRight size={16} aria-hidden="true" /></Link></div>;
}
