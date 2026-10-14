import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import * as CFB from 'cfb';
import { loadConfig } from '../src/server/config.js';
import { openDatabase } from '../src/server/db/connection.js';
import { migrateDatabase } from '../src/server/db/migrations.js';
import { ContentRepository } from '../src/server/repositories/contentRepository.js';
import { FileService, FileServiceError } from '../src/server/files/service.js';
import { validateFileBytes, validateOriginalName } from '../src/server/files/formats.js';
import { pdfFixture, docxFixture, zipFixture } from './helpers/documents.js';

const cacheRoot = resolve('.cache/tests');
async function fixture(t: TestContext) {
  mkdirSync(cacheRoot, { recursive: true });
  const directory = mkdtempSync(join(cacheRoot, 'files-'));
  const config = loadConfig({}, directory);
  const db = openDatabase(config.dbPath, { create: true });
  await migrateDatabase(db, resolve('migrations'), config.backupDirectory);
  t.after(() => {
    if (db.open) db.close();
    const boundary = relative(cacheRoot, directory);
    assert.ok(boundary && !boundary.startsWith('..') && !isAbsolute(boundary));
    assert.equal(resolve(cacheRoot, boundary), directory);
    rmSync(directory, { recursive: true, force: true });
  });
  return { db, config, service: new FileService(db, config), repository: new ContentRepository(db) };
}
const hasStatus = (status: number) => (error: unknown) => error instanceof FileServiceError && error.statusCode === status;
const notice = (fileIds: string[], publication: 'public' | 'private' = 'public') => ({
  kind: 'notice' as const, slug: `files-${randomUUID()}`, title: '[예시] 파일 권한 테스트',
  bodyHtml: '<p>격리된 파일 검증 자료</p>', publication, fileIds,
});

test('file originals retain Korean names, generate distinct immutable storage keys, and survive reopening SQLite', async t => {
  const { db, config, service, repository } = await fixture(t);
  const bytes = pdfFixture();
  const first = await service.saveUpload('한글 공지 안내.pdf', bytes);
  const second = await service.saveUpload('한글 공지 안내.pdf', bytes);
  assert.equal(first.originalName, '한글 공지 안내.pdf');
  assert.notEqual(first.id, second.id);
  assert.equal(first.mediaType, 'application/pdf');
  assert.deepEqual(Object.keys(first).sort(), ['id', 'originalName', 'mediaType', 'extension', 'size', 'createdAt'].sort());
  const content = repository.create(notice([first.id]));
  const firstDisk = service.resolveDownload(first.id, content.id, false);
  const secondDisk = service.resolveDownload(second.id, undefined, true);
  assert.notEqual(firstDisk.path, secondDisk.path);
  assert.deepEqual(readFileSync(firstDisk.path), bytes);
  db.close();
  const reopened = openDatabase(config.dbPath);
  try {
    const fresh = new FileService(reopened, config);
    assert.deepEqual(readFileSync(fresh.resolveDownload(first.id, content.id, false).path), bytes);
    assert.equal(fresh.resolveDownload(first.id, content.id, false).metadata.originalName, '한글 공지 안내.pdf');
  } finally { reopened.close(); }
});

test('temporary attachments stay private; each public download must name a public linked content ID', async t => {
  const { service, repository, db } = await fixture(t);
  const file = await service.saveUpload('임시 자료.pdf', pdfFixture());
  assert.throws(() => service.resolveDownload(file.id, undefined, false), hasStatus(404));
  assert.throws(() => service.resolveDownload(file.id, randomUUID(), false), hasStatus(404));
  assert.equal(service.resolveDownload(file.id, undefined, true).metadata.id, file.id);
  const hidden = repository.create(notice([file.id], 'private'));
  assert.throws(() => service.resolveDownload(file.id, hidden.id, false), hasStatus(404));
  assert.equal(service.resolveDownload(file.id, hidden.id, true).metadata.id, file.id);
  const visible = repository.create(notice([file.id]));
  assert.equal(service.resolveDownload(file.id, visible.id, false).metadata.id, file.id);
  assert.throws(() => service.resolveDownload(file.id, hidden.id, false), hasStatus(404), 'Sharing the same bytes must not make a private content context public.');
  db.prepare("UPDATE contents SET publication='private' WHERE id=?").run(visible.id);
  assert.throws(() => service.resolveDownload(file.id, visible.id, false), hasStatus(404));
  assert.throws(() => service.resolveDownload(file.id, '../../etc/passwd', true), hasStatus(404));
  assert.throws(() => service.resolveDownload('../../file.pdf', undefined, true), hasStatus(404));
});

test('shared references prevent deletion and one content replacement does not break another attachment', async t => {
  const { service, repository, db } = await fixture(t);
  const old = await service.saveUpload('이전 자료.pdf', pdfFixture('Original'));
  const replacement = await service.saveUpload('교체 자료.pdf', pdfFixture('Replacement'));
  const oneInput = notice([old.id]);
  const one = repository.create(oneInput);
  const two = repository.create(notice([old.id]));
  assert.throws(() => service.deleteUnlinked(old.id), hasStatus(409));
  repository.update(one.id, { ...oneInput, fileIds: [replacement.id] }, one.revision);
  assert.equal(service.resolveDownload(old.id, two.id, false).metadata.id, old.id);
  assert.throws(() => service.resolveDownload(old.id, one.id, false), hasStatus(404));
  assert.throws(() => service.deleteUnlinked(old.id), hasStatus(409));
  db.prepare('DELETE FROM contents WHERE id=?').run(two.id);
  const originalPath = service.resolveDownload(old.id, undefined, true).path;
  service.deleteUnlinked(old.id);
  assert.equal(existsSync(originalPath), false);
  assert.equal(db.prepare('SELECT 1 FROM files WHERE id=?').get(old.id), undefined);
  assert.equal(service.resolveDownload(replacement.id, one.id, false).metadata.id, replacement.id);
});

test('a failed metadata insert removes the newly written object and failed deletion restores its private bytes', async t => {
  const { db, config, service } = await fixture(t);
  db.exec("CREATE TEMP TRIGGER fail_file_insert BEFORE INSERT ON files BEGIN SELECT RAISE(ABORT,'injected test failure'); END");
  await assert.rejects(() => service.saveUpload('실패 시험.pdf', pdfFixture()));
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM files').get() as { count: number }).count, 0);
  assert.deepEqual(readdirSync(config.uploadDirectory), []);
  db.exec('DROP TRIGGER fail_file_insert');
  const saved = await service.saveUpload('보존 시험.pdf', pdfFixture());
  const path = service.resolveDownload(saved.id, undefined, true).path;
  db.exec("CREATE TEMP TRIGGER fail_file_delete BEFORE DELETE ON files BEGIN SELECT RAISE(ABORT,'injected test failure'); END");
  assert.throws(() => service.deleteUnlinked(saved.id));
  assert.deepEqual(readFileSync(path), pdfFixture());
  assert.equal(service.resolveDownload(saved.id, undefined, true).metadata.id, saved.id);
  assert.equal(readdirSync(config.uploadDirectory).length, 1);
  db.exec('DROP TRIGGER fail_file_delete');
});

test('byte limits, actual disk quota, upload slots and persistent attempt limits are bounded', async t => {
  const { service, config } = await fixture(t);
  const bytes = pdfFixture();
  config.maxUploadBytes = bytes.length - 1;
  await assert.rejects(() => service.saveUpload('초과.pdf', bytes), hasStatus(413));
  config.maxUploadBytes = bytes.length;
  config.maxStorageBytes = bytes.length * 2;
  await service.saveUpload('한도.pdf', bytes);
  writeFileSync(join(config.uploadDirectory, 'private-orphan.pending'), Buffer.alloc(bytes.length));
  await assert.rejects(() => service.saveUpload('저장소 초과.pdf', bytes), hasStatus(413));
  const releaseA = service.acquireUploadSlot('parallel-test');
  const releaseB = service.acquireUploadSlot('parallel-test');
  assert.throws(() => service.acquireUploadSlot('parallel-test'), hasStatus(429));
  releaseA(); releaseA(); releaseB();
  service.acquireUploadSlot('parallel-test')();
  for (let index = 0; index < 30; index++) service.acquireUploadSlot('rate-test')();
  assert.throws(() => service.acquireUploadSlot('rate-test'), hasStatus(429));
});

test('unsafe names, unsupported files and extension-only substitutions are rejected before disk storage', async t => {
  const { service, config } = await fixture(t);
  for (const name of ['../자료.pdf', 'C:\\자료.pdf', '자료\r\n.pdf', '.pdf', '자료.pdf ', '자료\u202e.pdf', '자료.exe']) {
    assert.throws(() => validateOriginalName(name));
  }
  assert.deepEqual(validateOriginalName('한글 이름.PDF'), { name: '한글 이름.PDF', extension: 'pdf' });
  for (const name of ['위장.hwp', '위장.hwpx', '위장.docx', '위장.png', '위장.pdf']) {
    await assert.rejects(() => service.saveUpload(name, Buffer.from('This is not the advertised document format.')), hasStatus(415));
  }
  assert.equal(existsSync(config.uploadDirectory), false);
});

test('generated valid DOCX package is parsed, while arbitrary ZIPs, truncated archives, CRC mismatch and unsafe XML fail', async t => {
  const { config, service } = await fixture(t);
  const bytes = docxFixture();
  const saved = await service.saveUpload('예시 문서.docx', bytes);
  assert.equal(saved.mediaType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await assert.rejects(() => validateFileBytes(zipFixture([['example.txt', 'x'], ['readme.txt', 'y'], ['other.txt', 'z']]), 'docx', config), hasStatus(415));
  await assert.rejects(() => validateFileBytes(bytes.subarray(0, bytes.length - 15), 'docx', config), hasStatus(415));
  const corrupt = Buffer.from(bytes);
  const offset = corrupt.indexOf(Buffer.from('<?xml'));
  assert.ok(offset >= 0);
  corrupt[offset + 2] ^= 1;
  await assert.rejects(() => validateFileBytes(corrupt, 'docx', config), hasStatus(415));
  const badXml = zipFixture([
    ['[Content_Types].xml', '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'],
    ['_rels/.rels', '<Relationships/>'], ['word/document.xml', '<document/>'],
  ]);
  await assert.rejects(() => validateFileBytes(badXml, 'docx', config), hasStatus(415));
  const duplicate = zipFixture([['A.xml', '<root/>'], ['a.xml', '<root/>'], ['x.xml', '<root/>']]);
  await assert.rejects(() => validateFileBytes(duplicate, 'docx', config), hasStatus(415));
  const escaped = zipFixture([['../x.xml', '<root/>'], ['y.xml', '<root/>'], ['z.xml', '<root/>']]);
  await assert.rejects(() => validateFileBytes(escaped, 'docx', config), hasStatus(415));
  const smallLimit = { ...config, maxZipExpandedBytes: 10 };
  await assert.rejects(() => validateFileBytes(bytes, 'docx', smallLimit), hasStatus(413));
});

test('PNG JPEG and WebP are fully decoded; wrong extension, truncation and pixel limits fail', async t => {
  const { service, config } = await fixture(t);
  const source = sharp({ create: { width: 4, height: 4, channels: 3, background: '#17324D' } });
  for (const extension of ['png', 'jpeg', 'webp'] as const) {
    const bytes = await source.clone().toFormat(extension).toBuffer();
    const saved = await service.saveUpload(`이미지.${extension}`, bytes);
    assert.equal(saved.mediaType, `image/${extension}`);
    await assert.rejects(() => validateFileBytes(bytes.subarray(0, Math.floor(bytes.length / 2)), extension, config), hasStatus(415));
    await assert.rejects(() => validateFileBytes(bytes, extension, { ...config, maxImagePixels: 2 }), hasStatus(415));
  }
  const png = await source.png().toBuffer();
  await assert.rejects(() => service.saveUpload('확장자 오류.jpeg', png), hasStatus(415));
});

test('missing or altered stored bytes are not returned and cleanup listing does not leak storage keys', async t => {
  const { service, repository } = await fixture(t);
  const unattached = await service.saveUpload('미연결.pdf', pdfFixture());
  const attached = await service.saveUpload('연결.pdf', pdfFixture());
  repository.create(notice([attached.id]));
  const listing = service.listUnlinked();
  assert.deepEqual(listing.map(file => file.id), [unattached.id]);
  assert.ok(!JSON.stringify(listing).includes('storage'));
  const path = service.resolveDownload(unattached.id, undefined, true).path;
  writeFileSync(path, 'truncated');
  assert.throws(() => service.resolveDownload(unattached.id, undefined, true), hasStatus(404));
  service.deleteUnlinked(unattached.id);
  assert.equal(existsSync(path), false);
});

test('HWP/HWPX masquerading is rejected; real authoring-tool HWP/HWPX compatibility remains unverified', async t => {
  const { config } = await fixture(t);
  await assert.rejects(() => validateFileBytes(pdfFixture(), 'hwp', config), hasStatus(415));
  await assert.rejects(() => validateFileBytes(docxFixture(), 'hwpx', config), hasStatus(415));
  const truncatedCompound = Buffer.alloc(512);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(truncatedCompound);
  await assert.rejects(() => validateFileBytes(truncatedCompound, 'hwp', config), hasStatus(415));
});

test('synthetic HWP/HWPX structural units exercise acceptance paths only, not real document compatibility', async t => {
  const { config } = await fixture(t);
  // These minimal internal structures are not documents exported by Hancom Office.
  // They prevent a broken checker that rejects every input from passing all negative tests.
  const header = Buffer.alloc(256);
  header.write('HWP Document File', 'ascii'); header[35] = 5;
  const synthetic = CFB.utils.cfb_new();
  CFB.utils.cfb_add(synthetic, 'FileHeader', header);
  CFB.utils.cfb_add(synthetic, 'DocInfo', Buffer.from([1]));
  CFB.utils.cfb_add(synthetic, 'BodyText/Section0', Buffer.from([1]));
  const hwp = Buffer.from(CFB.write(synthetic, { type: 'buffer' }));
  assert.equal(await validateFileBytes(hwp, 'hwp', config), 'application/x-hwp');
  header.writeUInt32LE(2, 36);
  CFB.utils.cfb_add(synthetic, 'FileHeader', header);
  await assert.rejects(() => validateFileBytes(Buffer.from(CFB.write(synthetic, { type: 'buffer' })), 'hwp', config), hasStatus(415));
  const hwpx = zipFixture([
    ['mimetype', 'application/hwp+zip'], ['version.xml', '<version/>'],
    ['Contents/content.hpf', '<package/>'],
    ['Contents/header.xml', '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"/>'],
    ['Contents/section0.xml', '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"/>'],
  ]);
  assert.equal(await validateFileBytes(hwpx, 'hwpx', config), 'application/hwp+zip');
});
