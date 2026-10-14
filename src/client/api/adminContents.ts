import type { ContentInput, ContentList, ContentRecord, HomeItemInput } from '../../shared/content';
import { request } from './notices';

export type AdminContentInput = Omit<ContentInput, 'id' | 'slug' | 'fileIds'> & { revision?: number };
export type AdminHome = { page: ContentRecord | null; items: HomeItemInput[] };
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
export function listAdminContents(params: URLSearchParams, signal?: AbortSignal) { return request<ContentList>(`/api/admin/contents?${params}`, { signal }); }
export function contentCategories(kind: string, signal?: AbortSignal) { return request<{ data: string[] }>(`/api/admin/content-categories?kind=${encodeURIComponent(kind)}`, { signal }); }
export function readAdminContent(id: string, signal?: AbortSignal) { return request<{ data: ContentRecord }>(`/api/admin/contents/${encodeURIComponent(id)}`, { signal }); }
export function saveAdminContent(input: AdminContentInput, csrf: string, id?: string) { return request<{ data: ContentRecord }>(`/api/admin/contents${id ? `/${encodeURIComponent(id)}` : ''}`, json(id ? 'PATCH' : 'POST', input), csrf); }
export function readAdminPage(slug: string, signal?: AbortSignal) { return request<{ data: ContentRecord | null }>(`/api/admin/pages/${encodeURIComponent(slug)}`, { signal }); }
export function saveAdminPage(slug: string, input: AdminContentInput, csrf: string) { return request<{ data: ContentRecord }>(`/api/admin/pages/${encodeURIComponent(slug)}`, json('PUT', input), csrf); }
export function readAdminHome(signal?: AbortSignal) { return request<{ data: AdminHome }>('/api/admin/home', { signal }); }
export function saveAdminHome(page: AdminContentInput, items: HomeItemInput[], csrf: string) { return request<{ data: AdminHome }>('/api/admin/home', json('PUT', { page, items }), csrf); }
export function previewAdminContent(bodyHtml: string, fileLinks: ContentInput['fileLinks'], csrf: string, contentId?: string) { return request<{ data: { bodyHtml: string } }>('/api/admin/contents/preview', json('POST', { bodyHtml, fileLinks, ...(contentId ? { contentId } : {}) }), csrf); }
