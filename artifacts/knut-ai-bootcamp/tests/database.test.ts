import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { seedExamples } from '../src/server/db/seed.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';
import type { ContentInput, ContentRecord, FileMetadataInput } from '../src/shared/content.js';

const cacheRoot = resolve('.cache/tests');
const migrations = resolve('migrations');
const seedPath = resolve('seed/example-contents.json');

async function fixture(t: TestContext) {
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, 'database-'));
  const db = openDatabase(join(directory, 'fixture.sqlite'), { create: true });
  t.after(() => {
    if (db.open) db.close();
    const boundary = relative(cacheRoot, directory);
    assert.ok(boundary && !boundary.startsWith('..') && !isAbsolute(boundary));
    assert.equal(resolve(cacheRoot, boundary), directory);
    rmSync(directory, { recursive: true, force: true });
  });
  await migrateDatabase(db, migrations, join(directory, 'backups'));
  return { db, directory, repository: new ContentRepository(db) };
}

function content(overrides: Partial<ContentInput> = {}): ContentInput {
  return {
    kind: 'notice', slug: `test-${randomUUID()}`, title: '[예시] 테스트 공지',
    bodyHtml: '<p>테스트 전용 예시 내용입니다.</p>', publication: 'public', ...overrides,
  };
}

function replacement(record: ContentRecord): ContentInput {
  return {
    id: record.id, kind: record.kind, slug: record.slug, title: record.title,
    bodyHtml: record.bodyHtml, category: record.category, publication: record.publication,
    pinned: record.pinned, sortOrder: record.sortOrder, publishedAt: record.publishedAt,
    program: record.program ?? undefined, resource: record.resource ?? undefined,
    contact: record.contact ?? undefined, relatedIds: record.relatedContents.map(item => item.id),
    fileLinks: record.files.map(file => ({ fileId: file.id, role: file.role, altText: file.altText })),
    links: record.links,
  };
}

function file(overrides: Partial<FileMetadataInput> = {}): FileMetadataInput {
  return {
    storageKey: `documents/${randomUUID()}.pdf`, originalName: '[예시] 시험 자료.pdf',
    mediaType: 'application/pdf', extension: 'pdf', size: 10, sha256: 'a'.repeat(64), ...overrides,
  };
}

test('content types preserve their required details, stable IDs, timestamps and revisions', async t => {
  const { repository } = await fixture(t);
  const program = { level: '예시 수준', audience: '예시 대상', delivery: '예시 운영 방식', completionRequirements: '예시 이수요건' };
  for (const kind of ['curriculum', 'activity'] as const) {
    const created = await repository.create(content({ kind, program }));
    assert.deepEqual((await repository.getById(created.id))?.program, program);
    assert.equal((await repository.getPublicBySlug(kind, created.slug))?.id, created.id);
    const changed = await repository.update(created.id, { ...replacement(created), title: '[예시] 제목 수정' }, created.revision);
    assert.equal(changed.id, created.id);
    assert.equal(changed.slug, created.slug);
    assert.equal(changed.createdAt, created.createdAt);
    assert.equal(changed.revision, 2);
    assert.ok(Date.parse(changed.updatedAt) >= Date.parse(created.updatedAt));
    await assert.rejects(() => repository.update(created.id, { ...replacement(changed), slug: 'changed-slug' }, changed.revision));
    await assert.rejects(() => repository.update(created.id, { ...replacement(changed), kind: 'notice' }, changed.revision));
  }
  const resource = {
    audience: '예시 적용 대상', requiredDocuments: '예시 제출서류 목록', instructions: '예시 작성 안내',
    deadlineText: '예시 제출기한', submissionMethod: '예시 제출 방법', destination: '입력 대기',
    contact: '입력 대기', applicableYear: 2026,
  };
  const form = await repository.create(content({ kind: 'resource', resource }));
  assert.deepEqual((await repository.getById(form.id))?.resource, resource);
  const contact = { name: '입력 대기', phone: '', email: '', address: '', note: '예시 연락 정보' };
  const location = await repository.create(content({ kind: 'page', slug: 'location', contact }));
  assert.deepEqual((await repository.getPublicBySlug('page', 'location'))?.contact, contact);
  assert.equal(location.publication, 'public');
  const faq = await repository.create(content({ kind: 'faq' }));
  assert.equal((await repository.getPublicById(faq.id))?.bodyHtml, faq.bodyHtml);
});

test('schema and repository reject invalid references, duplicate identities and progress status fields', async t => {
  const { db, repository } = await fixture(t);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  const notice = await repository.create(content({ slug: 'unique-notice' }));
  await assert.rejects(() => repository.create(content({ slug: notice.slug })));
  await assert.rejects(() => repository.create(content({ id: notice.id, slug: 'another-notice' })));
  assert.throws(() => db.prepare('INSERT INTO content_relations(source_id,target_id,sort_order) VALUES(?,?,?)').run(notice.id, randomUUID(), 0));
  assert.throws(() => db.prepare('INSERT INTO content_relations(source_id,target_id,sort_order) VALUES(?,?,?)').run(notice.id, notice.id, 0));
  assert.throws(() => db.prepare('INSERT INTO program_details(content_id,level,audience,delivery,completion_requirements) VALUES(?,?,?,?,?)').run(notice.id, '', '', '', ''));
  await assert.rejects(() => repository.create(content({ kind: 'curriculum' })));
  await assert.rejects(() => repository.create(content({ kind: 'resource' })));
  await assert.rejects(() => repository.create({ ...content(), progressStatus: 'ongoing' } as ContentInput));
  await assert.rejects(() => repository.create(content({ program: { level: '', audience: '', delivery: '', completionRequirements: '' } })));
  for (const table of ['contents', 'program_details', 'resource_details']) {
    // The table names here are fixed test constants, never user input.
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    assert.ok(columns.length > 0);
    assert.ok(columns.every(column => !/status|progress|recruit/i.test(column.name)), `${table} must not model educational/recruitment progress.`);
  }
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('public records, related links and home selections exclude draft and private content', async t => {
  const { repository } = await fixture(t);
  const published = await repository.create(content({ title: '[예시] 공개 대상' }));
  const hidden = await repository.create(content({ title: '[예시] 비공개 대상', publication: 'private' }));
  const draft = await repository.create(content({ title: '[예시] 초안 대상', publication: 'draft' }));
  const metadata = await repository.createFile(file());
  const source = await repository.create(content({ relatedIds: [published.id, hidden.id, draft.id], fileIds: [metadata.id] }));
  assert.equal((await repository.getById(source.id))?.relatedContents.length, 3);
  const publicRecord = (await repository.getPublicById(source.id))!;
  assert.deepEqual(publicRecord.relatedContents.map(item => item.id), [published.id]);
  assert.equal(await repository.getPublicById(hidden.id), null);
  assert.equal(await repository.getPublicById(draft.id), null);
  assert.equal(await repository.getPublicBySlug('notice', hidden.slug), null);
  assert.equal(await repository.getPublicById(randomUUID()), null);
  assert.equal(publicRecord.files[0]?.id, metadata.id);
  assert.equal(publicRecord.files[0]?.originalName, '[예시] 시험 자료.pdf');
  const serialized = JSON.stringify(publicRecord);
  for (const secret of [metadata.storageKey, metadata.sha256, 'storageKey', 'storage_key', 'sha256']) assert.ok(!serialized.includes(secret));
  assert.deepEqual(new Set((await repository.listPublic({ kind: 'notice' })).data.map(item => item.id)), new Set([published.id, source.id]));
  await repository.setHomeItems([
    { section: 'featured', contentId: hidden.id }, { section: 'featured', contentId: published.id },
    { section: 'notice', contentId: draft.id }, { section: 'notice', contentId: source.id },
  ]);
  const home = await repository.getPublicHome();
  assert.deepEqual(home.sections.featured.map(item => item.id), [published.id]);
  assert.deepEqual(home.sections.notice.map(item => item.id), [source.id]);
  assert.ok(home.latestNotices.every(item => item.publication === 'public'));
  assert.ok(!JSON.stringify(home).includes(hidden.id));
  assert.ok(!JSON.stringify(home).includes(draft.id));
  await repository.update(published.id, { ...replacement(published), publication: 'private' }, published.revision);
  assert.equal((await repository.getPublicById(source.id))?.relatedContents.length, 0);
  assert.equal((await repository.getPublicHome()).sections.featured.length, 0);
});

test('search treats SQL syntax and wildcard characters as data and returns bounded pages', async t => {
  const { repository, db } = await fixture(t);
  const text = "[예시] 100%_ ' OR 1=1 --";
  const target = await repository.create(content({ title: text, category: "x' OR 1=1 --" }));
  await repository.create(content({ title: '[예시] 일반 공지', category: 'normal' }));
  await repository.create(content({ title: text, publication: 'private' }));
  assert.deepEqual((await repository.listPublic({ q: "' OR 1=1 --" })).data.map(item => item.id), [target.id]);
  assert.deepEqual((await repository.listPublic({ q: '%_' })).data.map(item => item.id), [target.id]);
  assert.deepEqual((await repository.listPublic({ category: "x' OR 1=1 --" })).data.map(item => item.id), [target.id]);
  assert.equal((await repository.listPublic({ q: "'; DROP TABLE contents;--" })).pagination.total, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }).count, 3);
  const first = await repository.listPublic({ page: 1, pageSize: 1 });
  const second = await repository.listPublic({ page: 2, pageSize: 1 });
  assert.equal(first.pagination.total, 2);
  assert.equal(first.data.length, 1);
  assert.equal(second.data.length, 1);
  assert.notEqual(first.data[0]?.id, second.data[0]?.id);
  await assert.rejects(() => repository.listPublic({ page: 0 }));
  await assert.rejects(() => repository.listPublic({ pageSize: 101 }));
  await assert.rejects(() => repository.listPublic({ kind: "notice' OR 1=1--" } as never));
});

test('failed updates roll back content and relations; stale revisions do not overwrite data', async t => {
  const { repository } = await fixture(t);
  const related = await repository.create(content());
  const attachment = await repository.createFile(file());
  const original = await repository.create(content({ relatedIds: [related.id], fileIds: [attachment.id] }));
  await assert.rejects(() => repository.update(original.id, { ...replacement(original), title: '[예시] 저장되면 안 되는 제목', relatedIds: [randomUUID()] }, original.revision));
  assert.deepEqual(await repository.getById(original.id), original);
  await assert.rejects(() => repository.update(original.id, { ...replacement(original), fileLinks: [{ fileId: randomUUID(), role: 'attachment' }] }, original.revision));
  assert.deepEqual(await repository.getById(original.id), original);
  const external = await repository.create(content({ links: [{ label: '[예시] 외부 안내', url: 'https://example.invalid/' }] }));
  await assert.rejects(() => repository.update(original.id, {
    ...replacement(original), title: '[예시] 관계 교체 후 충돌', relatedIds: [], fileLinks: [], links: external.links,
  }, original.revision));
  assert.deepEqual(await repository.getById(original.id), original, 'A late link-ID conflict must restore deleted file/content relations too.');
  const changed = await repository.update(original.id, { ...replacement(original), title: '[예시] 정상 수정' }, original.revision);
  await assert.rejects(() => repository.update(original.id, { ...replacement(original), title: '[예시] 오래된 수정' }, original.revision), (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 409);
  assert.deepEqual(await repository.getById(original.id), changed);
  await assert.rejects(() => repository.createFile(file({ storageKey: attachment.storageKey })));
});

test('file metadata and external links reject paths or unsafe URLs without inventing download routes', async t => {
  const { repository } = await fixture(t);
  await assert.rejects(() => repository.create(content({ links: [{ label: '예시', url: 'javascript:alert(1)' }] })));
  await assert.rejects(() => repository.create(content({ links: [{ label: '예시', url: 'https://user:password@example.invalid/' }] })));
  for (const storageKey of ['../escape.pdf', '/absolute.pdf', 'C:\\private\\file.pdf', 'https://example.invalid/file.pdf']) {
    await assert.rejects(() => repository.createFile(file({ storageKey })));
  }
  await assert.rejects(() => repository.createFile(file({ originalName: '../document.pdf' })));
  const info = await repository.createFile(file());
  const attachment = await repository.create(content({ fileIds: [info.id] }));
  assert.equal('downloadUrl' in attachment.files[0], false, 'Upload/download routes are not implemented in P-03.');
});

test('explicit example seed is idempotent and preserves edits or later removals', async t => {
  const { db, directory, repository } = await fixture(t);
  const first = await seedExamples(db, seedPath);
  assert.ok(first.inserted > 0);
  assert.equal(first.alreadyApplied, false);
  const count = (db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }).count;
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM admins').get() as { count: number }).count, 0);
  const row = db.prepare('SELECT id FROM contents ORDER BY id LIMIT 1').get() as { id: string };
  const record = (await repository.getById(row.id))!;
  assert.match(record.title, /예시/);
  const modified = await repository.update(record.id, { ...replacement(record), title: '[예시] 사용자가 바꾼 제목', bodyHtml: '<p>사용자가 수정한 예시 본문입니다.</p>' }, record.revision);
  const second = await seedExamples(db, seedPath);
  assert.equal(second.alreadyApplied, true);
  assert.equal(second.inserted, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }).count, count);
  assert.deepEqual(await repository.getById(row.id), modified);
  const windowsSeedPath = join(directory, 'windows-line-endings-seed.json');
  writeFileSync(windowsSeedPath, readFileSync(seedPath, 'utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
  assert.equal((await seedExamples(db, windowsSeedPath)).alreadyApplied, true, 'Windows checkout line endings must not change seed identity.');
  db.prepare('DELETE FROM contents WHERE id=?').run(record.id);
  await seedExamples(db, seedPath);
  assert.equal(await repository.getById(record.id), null);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }).count, count - 1);
});

test('first seed preserves pre-existing matching IDs, edits and home placement', async t => {
  const { db, repository } = await fixture(t);
  const manifest = JSON.parse(readFileSync(seedPath, 'utf8'));
  const input: ContentInput = manifest.contents[0];
  const original = await repository.create({ ...input, title: '[예시] 먼저 저장한 사용자 편집', bodyHtml: '<p>사용자가 먼저 작성한 내용</p>', relatedIds: [] });
  await repository.setHomeItems([{ section: 'featured', contentId: original.id }]);
  const result = await seedExamples(db, seedPath);
  assert.equal(result.inserted, manifest.contents.length - 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(await repository.getById(original.id), original);
  assert.ok((await repository.getAdminHome()).items.some(item => item.section === 'featured' && item.contentId === original.id), 'Seeding must retain the saved home placement even while the home page is a draft.');
  assert.ok(!(await repository.getAdminHome()).items.some(item => item.section === 'notice' && item.contentId === original.id), 'An existing content ID must retain its chosen home placement.');
  assert.deepEqual((await repository.getPublicHome()).sections.featured, [], 'A draft home configuration must not expose configured placements publicly.');
});

test('seed conflicts and changed manifests fail without partial records or overwriting data', async t => {
  const { db, directory, repository } = await fixture(t);
  const manifest = JSON.parse(readFileSync(seedPath, 'utf8'));
  const seedRecords: ContentInput[] = manifest.contents;
  assert.ok(seedRecords.length > 1, 'The checked-in seed should contain several example kinds.');
  const finalSeed = seedRecords[seedRecords.length - 1];
  const existing = await repository.create({ ...finalSeed, id: randomUUID(), title: '[예시] 기존 콘텐츠 보존 시험' });
  await assert.rejects(async () => seedExamples(db, seedPath));
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }).count, 1);
  assert.deepEqual(await repository.getById(existing.id), existing);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM seed_runs').get() as { count: number }).count, 0);
  db.prepare('DELETE FROM contents WHERE id=?').run(existing.id);
  const invalidManifest = structuredClone(manifest);
  invalidManifest.contents[0].relatedIds = [randomUUID()];
  const invalidPath = join(directory, 'invalid-related-seed.json');
  writeFileSync(invalidPath, JSON.stringify(invalidManifest), 'utf8');
  await assert.rejects(async () => seedExamples(db, invalidPath));
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM contents').get() as { count: number }).count, 0, 'Late relation failure must roll back every inserted seed record.');
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM seed_runs').get() as { count: number }).count, 0);
  await seedExamples(db, seedPath);
  const before = db.prepare('SELECT * FROM contents ORDER BY id').all();
  manifest.contents[0].title = '[예시] 같은 버전의 변경된 원본';
  const changedPath = join(directory, 'changed-seed.json');
  writeFileSync(changedPath, JSON.stringify(manifest), 'utf8');
  await assert.rejects(async () => seedExamples(db, changedPath));
  assert.deepEqual(db.prepare('SELECT * FROM contents ORDER BY id').all(), before);
});
