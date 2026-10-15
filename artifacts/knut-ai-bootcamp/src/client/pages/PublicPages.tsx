import { ArrowRight } from 'lucide-react';
import { LinkButton, Notice } from '../components/ui';

export { HomePage } from './HomePage';

export function NotFoundPage() {
  return <><Notice title="요청하신 페이지가 없습니다" tone="error">주소를 확인하거나 아래 버튼으로 홈으로 이동해 주세요.</Notice><div className="not-found"><span>404</span><h2>페이지를 찾을 수 없습니다</h2><p>등록되지 않은 주소입니다.</p><LinkButton to="/">홈으로 이동 <ArrowRight size={17} aria-hidden="true" /></LinkButton></div></>;
}
