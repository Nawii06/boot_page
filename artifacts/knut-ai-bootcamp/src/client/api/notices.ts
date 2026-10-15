import type { ContactDetails, ContentFile, ContentFileInput, ContentList, ContentRecord, Publication } from '../../shared/content';

export type UploadedFile = Omit<ContentFile, 'role' | 'altText'>;
export type UploadConfig = { maxUploadBytes: number; maxFilesPerContent: number; extensions: string[] };
export type DeleteImpact = { id: string; revision: number; incomingLinks: number; homeLinks: number; files: { id: string; originalName: string; otherReferences: number }[] };
export type NoticeInput = { kind: 'notice'; title: string; category: string; bodyHtml: string; publication: Publication; pinned: boolean; publishedAt: string | null; contact: ContactDetails; fileLinks: ContentFileInput[]; relatedIds?: string[]; revision?: number };

export class NoticeRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const messages: Record<number, string> = {
  400: '입력값과 파일 연결을 확인해 주세요.', 401: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  403: '요청을 확인할 수 없습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.',
  404: '요청한 공지 또는 파일을 찾을 수 없습니다.', 409: '다른 변경 사항 또는 파일 연결이 있습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.',
  413: '파일 또는 본문의 허용 크기를 초과했습니다.', 415: '허용되지 않거나 형식을 확인할 수 없는 파일입니다.',
  429: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
};

export async function request<T>(path: string, options: RequestInit = {}, csrfToken?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.body instanceof FormData ? 120_000 : 20_000);
  try {
    const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
      headers: { Accept: 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers } });
    if (!response.ok) {
      let message = messages[response.status] ?? '요청을 처리하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
      // Controlled validation diagnostics are rendered as React text, never HTML.
      if ([400, 404, 409, 413, 415].includes(response.status)) {
        try { const body: unknown = await response.json(); const detail = (body as { error?: { message?: unknown } })?.error?.message; if (typeof detail === 'string' && detail.length > 0 && detail.length <= 500) message = detail; } catch { /* Preserve the status fallback for non-JSON errors. */ }
      }
      throw new NoticeRequestError(response.status, message);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  } finally { window.clearTimeout(timeout); }
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
export function listNotices(params: URLSearchParams, admin = false, signal?: AbortSignal) {
  const query = new URLSearchParams(params); query.set('kind', 'notice');
  return request<ContentList>(`/api/${admin ? 'admin' : 'public'}/contents?${query}`, { signal });
}
export function noticeCategories(admin = false, signal?: AbortSignal) { return request<{ data: string[] }>(`/api/${admin ? 'admin' : 'public'}/notice-categories`, { signal }); }
export function readNotice(id: string, admin = false, signal?: AbortSignal) { return request<{ data: ContentRecord }>(`/api/${admin ? 'admin' : 'public'}/contents/${encodeURIComponent(id)}`, { signal }); }
export function saveNotice(input: NoticeInput, csrfToken: string, id?: string) { return request<{ data: ContentRecord }>(`/api/admin/contents${id ? `/${encodeURIComponent(id)}` : ''}`, json(id ? 'PATCH' : 'POST', input), csrfToken); }
export function noticeDeleteImpact(id: string) { return request<{ data: DeleteImpact }>(`/api/admin/contents/${encodeURIComponent(id)}/delete-impact`); }
export function deleteNotice(id: string, revision: number, csrfToken: string) { return request<void>(`/api/admin/contents/${encodeURIComponent(id)}`, json('DELETE', { revision }), csrfToken); }
export function previewNotice(bodyHtml: string, fileLinks: ContentFileInput[], csrfToken: string, contentId?: string) { return request<{ data: { bodyHtml: string } }>('/api/admin/notices/preview', json('POST', { bodyHtml, fileLinks, ...(contentId ? { contentId } : {}) }), csrfToken); }
export function uploadSettings(signal?: AbortSignal) { return request<{ data: UploadConfig }>('/api/admin/upload-config', { signal }); }
export async function uploadNoticeFile(file: File, csrfToken: string): Promise<{ data: UploadedFile }> {
  const intent = await request<{ data:
    | { transport: 'multipart' }
    | { transport: 'signed'; uploadIntentId: string; uploadUrl: string } }>(
    '/api/admin/files/upload-url',
    json('POST', { originalName: file.name, size: file.size }),
    csrfToken,
  );
  if (intent.data.transport === 'multipart') {
    const body = new FormData();
    body.append('file', file);
    return request<{ data: UploadedFile }>('/api/admin/files', { method: 'POST', body }, csrfToken);
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(intent.data.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new NoticeRequestError(response.status, '파일을 저장소로 전송하지 못했습니다. 다시 시도해 주세요.');
  } catch (error) {
    if (error instanceof NoticeRequestError) throw error;
    throw new NoticeRequestError(503, '파일을 저장소로 전송하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
  } finally {
    window.clearTimeout(timeout);
  }
  return request<{ data: UploadedFile }>(
    '/api/admin/files/complete',
    json('POST', { uploadIntentId: intent.data.uploadIntentId }),
    csrfToken,
  );
}
export function listUnlinkedFiles() { return request<{ data: UploadedFile[] }>('/api/admin/files'); }
export function deleteUnlinkedFile(id: string, csrfToken: string) { return request<void>(`/api/admin/files/${encodeURIComponent(id)}`, { method: 'DELETE' }, csrfToken); }
export function fileUrl(id: string, contentId?: string, inline = false) { const params = new URLSearchParams(); if (contentId) params.set('contentId', contentId); if (inline) params.set('inline', '1'); return `/api/files/${encodeURIComponent(id)}${params.size ? `?${params}` : ''}`; }
export function noticeError(error: unknown) { return error instanceof NoticeRequestError ? error.message : '서버에 연결하지 못했습니다. 입력 내용은 유지됩니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.'; }
