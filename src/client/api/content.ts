import type { ContentKind, ContentList, ContentListQuery, ContentRecord, PublicHome } from '../../shared/content';

export class PublicContentRequestError extends Error {
  constructor(readonly status: number) { super(`데이터를 조회하지 못했습니다. (${status})`); }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new PublicContentRequestError(response.status);
  return await response.json() as T;
}

export async function getHealth(signal?: AbortSignal) {
  const result = await request<{ data: { status: string; stage: string; capabilities: { database: boolean; authentication: boolean; uploads: boolean } } }>('/api/health', signal);
  if (result?.data?.status !== 'ok' || typeof result.data.capabilities?.database !== 'boolean') throw new Error('올바른 API 상태 응답이 아닙니다.');
  return result.data;
}

// No browser storage or in-memory content fallback is used.
export function listPublicContents(query: ContentListQuery = {}, signal?: AbortSignal): Promise<ContentList> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  return request(`/api/public/contents?${params}`, signal);
}

export function getPublicContent(id: string, signal?: AbortSignal): Promise<{ data: ContentRecord }> {
  return request(`/api/public/contents/${encodeURIComponent(id)}`, signal);
}

export function getPublicPage(slug: string, signal?: AbortSignal): Promise<{ data: ContentRecord }> {
  return request(`/api/public/pages/${encodeURIComponent(slug)}`, signal);
}

export function getPublicProgram(kind: Extract<ContentKind, 'curriculum' | 'activity'>, slug: string, signal?: AbortSignal): Promise<{ data: ContentRecord }> {
  return request(`/api/public/programs/${kind}/${encodeURIComponent(slug)}`, signal);
}

export function getPublicHome(signal?: AbortSignal): Promise<{ data: PublicHome }> {
  return request('/api/public/home', signal);
}

export function getPublicCategories(kind: ContentKind, signal?: AbortSignal): Promise<{ data: string[] }> {
  return request(`/api/public/content-categories?kind=${encodeURIComponent(kind)}`, signal);
}
