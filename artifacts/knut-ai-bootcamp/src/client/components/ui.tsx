import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { AlertCircle, ArrowRight, FileText, Inbox, Info, LoaderCircle, Search } from 'lucide-react';

export function Button({ className = '', variant = 'primary', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props} />;
}

export function LinkButton({ className = '', variant = 'primary', ...props }: LinkProps & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  return <Link className={`button button-${variant} ${className}`} {...props} />;
}

export function TextLink({ children, ...props }: LinkProps) {
  return <Link className="text-link" {...props}>{children}<ArrowRight size={16} aria-hidden="true" /></Link>;
}

export function Notice({ title, children, tone = 'info' }: { title: string; children?: ReactNode; tone?: 'info' | 'error' }) {
  const Icon = tone === 'error' ? AlertCircle : Info;
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
    <Icon size={19} aria-hidden="true" />
    <div><strong>{title}</strong>{children && <div className="notice-body">{children}</div>}</div>
  </div>;
}

export function EmptyState({ title = '콘텐츠를 준비하고 있습니다', children, compact = false }: { title?: string; children?: ReactNode; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'empty-compact' : ''}`}>
    <span className="empty-icon"><Inbox size={25} strokeWidth={1.5} aria-hidden="true" /></span>
    <strong>{title}</strong>
    {children && <p>{children}</p>}
  </div>;
}

export function LoadingState({ children = '응답을 확인하고 있습니다.' }: { children?: ReactNode }) {
  return <div className="loading-state" role="status"><LoaderCircle size={19} aria-hidden="true" className="spin" />{children}</div>;
}

export function SearchForm({ placeholder = '검색어를 입력하세요', admin = false }: { placeholder?: string; admin?: boolean }) {
  const searchId = useId();
  const hintId = useId();
  return <form className="search-form" role="search" onSubmit={(event) => event.preventDefault()} aria-describedby={hintId}>
    <div className="search-controls">
      <label className="sr-only" htmlFor={searchId}>검색어</label>
      <div className="search-input-wrap"><Search size={18} aria-hidden="true" /><input id={searchId} type="search" disabled placeholder={placeholder} /></div>
      <Button disabled variant={admin ? 'primary' : 'secondary'}>검색 준비 중</Button>
    </div>
    <p className="form-hint" id={hintId}>목록과 검색 기능은 콘텐츠 연결 후 제공됩니다.</p>
  </form>;
}

export function DataTable({ caption, columns, children, emptyMessage = '목록 연결 준비 중' }: { caption: string; columns: string[]; children?: ReactNode; emptyMessage?: string }) {
  return <div className={`table-scroll ${children ? '' : 'table-empty'}`} tabIndex={0} role="region" aria-label={`${caption} 표`}>
    <table><caption className="sr-only">{caption}</caption>
      <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{children || <tr><td colSpan={columns.length}><EmptyState title={emptyMessage} compact>아직 데이터 저장소와 연결되지 않은 화면입니다.</EmptyState></td></tr>}</tbody>
    </table>
  </div>;
}

export function Field({ label, hint, multiline = false, type = 'text', placeholder = '입력 준비 중', options }: { label: string; hint?: string; multiline?: boolean; type?: string; placeholder?: string; options?: string[] }) {
  const id = useId();
  return <div className={`field ${multiline ? 'field-full' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {options ? <select id={id} disabled defaultValue=""><option value="">선택 준비 중</option>{options.map((option) => <option key={option}>{option}</option>)}</select>
      : multiline ? <textarea id={id} disabled rows={5} placeholder={placeholder} aria-describedby={hint ? `${id}-hint` : undefined} />
        : <input id={id} type={type} disabled placeholder={placeholder} autoComplete="off" aria-describedby={hint ? `${id}-hint` : undefined} />}
    {hint && <p className="form-hint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}

export function FileDisplay({ admin = false }: { admin?: boolean }) {
  return <div className="file-display"><span className="file-icon"><FileText size={23} aria-hidden="true" /></span>
    <div><strong>{admin ? '첨부파일 연결 준비 중' : '첨부파일 확인 준비 중'}</strong><p>HWP · HWPX · PDF · DOCX {admin ? '파일 업로드는 다음 구현 단계에서 제공됩니다.' : '파일은 콘텐츠 연결 후 제공됩니다.'}</p></div>
    {admin && <Button variant="secondary" disabled>파일 선택 준비 중</Button>}
  </div>;
}
