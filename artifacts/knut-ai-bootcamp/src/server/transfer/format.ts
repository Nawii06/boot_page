import { cleanNoticeHtml } from '../content/noticeHtml.js';
import { validateOriginalName } from '../files/formats.js';
import type { Migration } from '../db/migrations.js';

export class ContentTransferError extends Error {
  constructor(public readonly code: 'VALIDATION_ERROR' | 'CONFLICT' | 'IO_ERROR', message: string) {
    super(message);
    this.name = 'ContentTransferError';
  }
}

export const tableColumns = {
  contents: ['id', 'kind', 'slug', 'title', 'body_html', 'category', 'publication', 'pinned', 'sort_order', 'published_at', 'created_at', 'updated_at', 'revision'],
  program_details: ['content_id', 'level', 'audience', 'delivery', 'completion_requirements'],
  resource_details: ['content_id', 'audience', 'required_documents', 'instructions', 'deadline_text', 'submission_method', 'destination', 'contact', 'applicable_year'],
  contact_details: ['content_id', 'name', 'phone', 'email', 'address', 'note'],
  files: ['id', 'storage_key', 'original_name', 'media_type', 'extension', 'size', 'sha256', 'created_at'],
  content_relations: ['source_id', 'target_id', 'sort_order'],
  content_files: ['content_id', 'file_id', 'role', 'sort_order', 'alt_text'],
  home_items: ['section', 'content_id', 'sort_order'],
  content_links: ['id', 'content_id', 'label', 'url', 'sort_order'],
} as const;
export type TableName = keyof typeof tableColumns;
export const tableNames = Object.keys(tableColumns) as TableName[];
export type Row = Record<string, string | number | null>;
export type Tables = Record<TableName, Row[]>;
export interface ContentPackage {
  format: 'bootcamp-content';
  formatVersion: 1;
  schemaVersion: string;
  migrations: { version: string; filename: string; checksum: string }[];
  exportedAt: string;
  tables: Tables;
}

export const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
export const MAX_ROWS = 100_000;
export const MAX_FILES = 20_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{64}$/;
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp'];

export function invalid(message: string): never { throw new ContentTransferError('VALIDATION_ERROR', message); }
export function conflict(message: string): never { throw new ContentTransferError('CONFLICT', message); }
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid('Expected a JSON object.');
}
function exact(value: Record<string, unknown>, fields: readonly string[]) {
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) invalid('Package contains missing or unknown fields.');
}
function text(value: unknown, max: number, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) invalid('Package text field is invalid or exceeds its limit.');
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid('Package integer field is invalid.');
}
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid('Package date must be a canonical UTC ISO timestamp.');
}
function identifier(value: unknown) { if (typeof value !== 'string' || !uuid.test(value)) invalid('Package identifier must be a UUID.'); }
function enumeration(value: unknown, allowed: readonly string[]) { if (typeof value !== 'string' || !allowed.includes(value)) invalid('Package enum field is invalid.'); }

/** Deliberately portable across Windows, Unix and future object stores. No platform aliases. */
export function storageKey(value: unknown): asserts value is string {
  text(value, 240, true);
  if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_.-]+)*$/.test(value) || value.split('/').length > 8 ||
      value.split('/').some(part => part === '.' || part === '..' || part.endsWith('.') || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    invalid('File storage key is not a safe relative portable path.');
  }
}

export function validatePackage(value: unknown, migrations: Migration[]): ContentPackage {
  object(value);
  exact(value, ['format', 'formatVersion', 'schemaVersion', 'migrations', 'exportedAt', 'tables']);
  if (value.format !== 'bootcamp-content' || value.formatVersion !== 1 || value.schemaVersion !== migrations.at(-1)?.version) invalid('Unsupported content package or schema version.');
  date(value.exportedAt);
  if (!Array.isArray(value.migrations) || value.migrations.length !== migrations.length) invalid('Migration versions do not match this application.');
  value.migrations.forEach((entry, index) => {
    object(entry); exact(entry, ['version', 'filename', 'checksum']);
    const expected = migrations[index];
    if (entry.version !== expected.version || entry.filename !== expected.filename || entry.checksum !== expected.checksum) invalid('Migration versions or checksums do not match this application.');
  });
  object(value.tables); exact(value.tables, tableNames);
  let count = 0;
  for (const table of tableNames) {
    const rows = value.tables[table];
    if (!Array.isArray(rows) || (count += rows.length) > MAX_ROWS || (table === 'files' && rows.length > MAX_FILES)) invalid('Content package exceeds the row or file limit.');
    const identities = new Set<string>();
    for (const row of rows) {
      object(row); exact(row, tableColumns[table]);
      for (const [key, item] of Object.entries(row)) {
        if (['id', 'content_id', 'source_id', 'target_id', 'file_id'].includes(key)) identifier(item);
        else if (['created_at', 'updated_at', 'published_at'].includes(key)) { if (key !== 'published_at' || item !== null) date(item); }
        else if (key === 'sort_order') integer(item, 0, 1_000_000);
        else if (key === 'revision') integer(item, 1);
        else if (key === 'pinned') integer(item, 0, 1);
        else if (key === 'size') integer(item);
        else if (key === 'applicable_year') { if (item !== null) integer(item, 1900, 9999); }
        else if (key === 'slug') { if (item !== null && (typeof item !== 'string' || item.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item))) invalid('Invalid content slug.'); }
        else if (key === 'storage_key') storageKey(item);
        else if (key === 'sha256') { if (typeof item !== 'string' || !sha.test(item)) invalid('Invalid file SHA-256.'); }
        else if (key === 'kind') enumeration(item, ['notice', 'curriculum', 'activity', 'resource', 'faq', 'page']);
        else if (key === 'publication') enumeration(item, ['draft', 'public', 'private']);
        else if (key === 'role') enumeration(item, ['attachment', 'body', 'home']);
        else if (key === 'section') enumeration(item, ['featured', 'notice', 'program', 'resource']);
        else if (key === 'extension') enumeration(item, ['hwp', 'hwpx', 'pdf', 'docx', ...imageExtensions]);
        else if (key === 'body_html') text(item, 200_000);
        else if (['title', 'label', 'media_type'].includes(key)) text(item, 200, true);
        else if (key === 'category') text(item, 100);
        else if (key === 'original_name') text(item, 255, true);
        else if (key === 'url') text(item, 2048, true);
        else if (key === 'alt_text') text(item, 1000);
        else text(item, 10_000);
      }
      const primary = table === 'content_relations' ? [row.source_id, row.target_id]
        : table === 'content_files' ? [row.content_id, row.file_id, row.role]
          : table === 'home_items' ? [row.section, row.content_id] : [row.id ?? row.content_id];
      const key = JSON.stringify(primary);
      if (identities.has(key)) invalid(`Duplicate primary identifier in ${table}.`);
      identities.add(key);
    }
  }
  const pkg = value as unknown as ContentPackage;
  const contents = new Map(pkg.tables.contents.map(row => [row.id, row]));
  const files = new Map(pkg.tables.files.map(row => [row.id, row]));
  const portablePaths = new Set<string>();
  const directorySpellings = new Map<string, string>();
  for (const file of pkg.tables.files) {
    const key = (file.storage_key as string).toLowerCase();
    if (portablePaths.has(key)) invalid('File storage keys collide on a case-insensitive filesystem.');
    portablePaths.add(key);
    const segments = (file.storage_key as string).split('/');
    for (let i = 1; i < segments.length; i++) {
      const directory = segments.slice(0, i).join('/');
      const prior = directorySpellings.get(directory.toLowerCase());
      if (prior && prior !== directory) invalid('Storage directories use inconsistent letter case.');
      directorySpellings.set(directory.toLowerCase(), directory);
    }
    const name = validateOriginalName(file.original_name as string);
    if (name.name !== file.original_name || name.extension !== file.extension) invalid('Original filename does not match its registered extension.');
  }
  for (const key of portablePaths) {
    const segments = key.split('/');
    for (let i = 1; i < segments.length; i++) if (portablePaths.has(segments.slice(0, i).join('/'))) invalid('A file storage key conflicts with another file directory.');
  }
  for (const table of tableNames.filter(name => !['contents', 'files'].includes(name))) {
    for (const row of pkg.tables[table]) {
      for (const key of ['content_id', 'source_id', 'target_id']) if (key in row && !contents.has(row[key])) invalid(`Missing content reference in ${table}.`);
      if ('file_id' in row && !files.has(row.file_id)) invalid('Missing file reference.');
    }
  }
  const bodyLinks = new Map<string | number | null, Row[]>();
  const homeFiles = new Set<string | number | null>();
  for (const row of pkg.tables.content_files) {
    if (row.role !== 'attachment' && !imageExtensions.includes(files.get(row.file_id)!.extension as string)) invalid('Body and home files must be image formats.');
    if (row.role === 'home') {
      const owner = contents.get(row.content_id)!;
      if (owner.kind !== 'page' || owner.slug !== 'home' || homeFiles.has(row.content_id)) invalid('Only the home page may have one home image.');
      homeFiles.add(row.content_id);
    }
    if (row.role === 'body') {
      const rows = bodyLinks.get(row.content_id) ?? [];
      rows.push(row); bodyLinks.set(row.content_id, rows);
    }
  }
  const programs = new Set(pkg.tables.program_details.map(row => row.content_id));
  const resources = new Set(pkg.tables.resource_details.map(row => row.content_id));
  for (const content of pkg.tables.contents) {
    if (['curriculum', 'activity'].includes(content.kind as string) && !programs.has(content.id)) invalid('Program content is missing its details.');
    if (content.kind === 'resource' && !resources.has(content.id)) invalid('Resource content is missing its details.');
    const bodyFiles = bodyLinks.get(content.id) ?? [];
    const allowed = new Set(bodyFiles.map(row => row.file_id));
    const alts = new Map(bodyFiles.map(row => [row.file_id as string, row.alt_text as string]));
    const cleaned = cleanNoticeHtml(content.body_html, id => allowed.has(id), content.id as string, alts);
    if (cleaned.html !== content.body_html) invalid('Content body is unsafe or noncanonical. Save it through the administrator editor before export; imports never silently rewrite bodies.');
  }
  for (const link of pkg.tables.content_links) {
    let url: URL;
    try { url = new URL(link.url as string); } catch { invalid('Invalid external content link.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\x00-\x20]/.test(link.url as string)) invalid('Unsafe external content link.');
  }
  return pkg;
}
