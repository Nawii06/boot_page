import sharp from 'sharp';
import { SaxesParser } from 'saxes';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { crc32 } from 'node:zlib';
import { TextDecoder } from 'node:util';
import { FileServiceError, invalidFile } from './errors.js';
import { validateHwp } from './hwpValidation.js';

export const allowedExtensions = ['hwp', 'hwpx', 'pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp'] as const;
export type FileExtension = typeof allowedExtensions[number];
export const imageExtensions = new Set<FileExtension>(['jpg', 'jpeg', 'png', 'webp']);

const mediaTypes: Record<FileExtension, string> = {
  hwp: 'application/x-hwp', hwpx: 'application/hwp+zip', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

/** MIME headers are deliberately not consulted: office browsers often send octet-stream. */
export function validateOriginalName(value: string): { name: string; extension: FileExtension } {
  const name = value.normalize('NFC');
  if (!name.trim() || name.length > 255 || Buffer.byteLength(name, 'utf8') > 1024 ||
      /[\\/\x00-\x1f\x7f<>:"|?*]/.test(name) || /[. ]$/.test(name) || name.startsWith('.') ||
      /[\u202a-\u202e\u2066-\u2069]/.test(name)) {
    throw new FileServiceError('INVALID_FILENAME', 400, '경로 문자 없이 원본 파일명을 확인해 주세요.');
  }
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (!allowedExtensions.includes(extension as FileExtension)) {
    throw new FileServiceError('UNSUPPORTED_FILE', 415, 'HWP·HWPX·PDF·DOCX·JPG·PNG·WEBP 파일을 선택해 주세요.');
  }
  return { name, extension: extension as FileExtension };
}

interface FormatLimits { maxZipExpandedBytes: number; maxImagePixels: number }

export async function validateFileBytes(bytes: Buffer, extension: FileExtension, limits: FormatLimits): Promise<string> {
  if (bytes.length === 0) invalidFile('빈 파일은 업로드할 수 없습니다.');
  try {
    if (extension === 'hwp') await validateHwp(bytes);
    else if (extension === 'hwpx' || extension === 'docx') await validateOfficeZip(bytes, extension, limits.maxZipExpandedBytes);
    else if (extension === 'pdf') validatePdf(bytes);
    else {
      const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: limits.maxImagePixels, pages: 1 });
      const metadata = await decoder.metadata();
      const format = extension === 'jpg' ? 'jpeg' : extension;
      if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 ||
          metadata.width * metadata.height > limits.maxImagePixels) invalidFile();
      // Metadata alone is insufficient: force decoding of every pixel to reject truncated raster files.
      await decoder.raw().toBuffer();
    }
  } catch (error) {
    if (error instanceof FileServiceError) throw error;
    invalidFile('파일이 손상되었거나 지원하지 않는 내부 형식입니다.');
  }
  return mediaTypes[extension];
}

function validatePdf(bytes: Buffer): void {
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(bytes.subarray(0, 16).toString('latin1'))) invalidFile();
  const text = bytes.toString('latin1');
  if (!/\d+\s+\d+\s+obj\b/.test(text) || !/\bendobj\b/.test(text) ||
      !/startxref\s+\d+\s+%%EOF\s*$/.test(text)) invalidFile();
  // Structural sanity only. PDF is always downloaded, never embedded/executed by the application.
}

type XmlFacts = { rootLocal: string; rootUri: string; documentType: boolean };

function xmlInspector(): { write: (chunk: Buffer) => void; finish: () => XmlFacts } {
  const parser = new SaxesParser({ xmlns: true });
  let facts: XmlFacts | undefined;
  let failed: unknown;
  let decoder: TextDecoder | undefined;
  const initial: Buffer[] = [];
  let initialSize = 0;
  parser.on('error', error => { failed = error; });
  parser.on('doctype', () => { failed = new Error('DTD is not allowed.'); });
  parser.on('opentag', tag => {
    facts ??= { rootLocal: tag.local, rootUri: tag.uri, documentType: false };
    if (tag.local === 'Override') {
      const attributes = Object.values(tag.attributes);
      const target = attributes.find(attribute => attribute.local === 'PartName')?.value;
      const type = attributes.find(attribute => attribute.local === 'ContentType')?.value;
      if (target === '/word/document.xml' && type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') facts.documentType = true;
    }
  });
  const feed = (chunk: Buffer) => {
    if (!decoder) {
      initial.push(chunk); initialSize += chunk.length;
      if (initialSize < 4) return;
      const first = Buffer.concat(initial);
      const utf16le = first[0] === 0xff && first[1] === 0xfe || first[0] === 0x3c && first[1] === 0;
      const utf16be = first[0] === 0xfe && first[1] === 0xff || first[0] === 0 && first[1] === 0x3c;
      decoder = new TextDecoder(utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8', { fatal: true });
      parser.write(decoder.decode(first, { stream: true }));
      initial.length = 0;
    } else parser.write(decoder.decode(chunk, { stream: true }));
    if (failed) throw failed;
  };
  return {
    write: feed,
    finish() {
      if (!decoder) invalidFile();
      parser.write(decoder.decode()).close();
      if (failed || !facts) invalidFile();
      return facts;
    },
  };
}

function openZip(bytes: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => fromBuffer(bytes, {
    lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true,
  }, (error, zip) => error || !zip ? reject(error) : resolve(zip)));
}

async function validateOfficeZip(bytes: Buffer, extension: 'docx' | 'hwpx', maxExpanded: number): Promise<void> {
  if (!bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))) invalidFile();
  const zip = await openZip(bytes);
  if (zip.entryCount < 3 || zip.entryCount > 2000) { zip.close(); invalidFile(); }
  const names = new Set<string>();
  const xml = new Map<string, XmlFacts>();
  let expanded = 0;
  let mimeType = '';
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; zip.close(); reject(error); } };
    zip.on('error', fail);
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        const name = entry.fileName;
        const mode = entry.externalFileAttributes >>> 16;
        if (names.has(name.toLowerCase()) || /[\\\x00-\x1f]/.test(name) || name.startsWith('/') ||
            /^[a-z]:/i.test(name) || name.split('/').some(part => part === '..' || part === '.') ||
            (mode & 0xf000) === 0xa000 || (entry.generalPurposeBitFlag & 1) || ![0, 8].includes(entry.compressionMethod) ||
            /(?:^|\/)(?:vbaproject\.bin|[^/]+\.(?:exe|dll|js|vbs|ps1|bat|cmd))$/i.test(name)) invalidFile();
        names.add(name.toLowerCase());
        expanded += entry.uncompressedSize;
        if (expanded > maxExpanded || entry.uncompressedSize > Math.max(1024 * 1024, entry.compressedSize * 1000)) {
          throw new FileServiceError('ZIP_LIMIT', 413, '압축 해제 크기 또는 압축률 제한을 초과한 문서입니다.');
        }
        if (name.endsWith('/')) {
          if (entry.uncompressedSize !== 0) invalidFile();
          zip.readEntry(); return;
        }
        const isXml = /\.(?:xml|rels|hpf)$/i.test(name);
        const inspector = isXml ? xmlInspector() : undefined;
        let actual = 0;
        let crc = 0;
        const mimeChunks: Buffer[] = [];
        const stream = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) =>
          zip.openReadStream(entry, (error, source) => error || !source ? rejectStream(error) : resolveStream(source)));
        await new Promise<void>((resolveStream, rejectStream) => {
          stream.on('data', (chunk: Buffer) => {
            try {
              actual += chunk.length;
              if (actual > entry.uncompressedSize || actual > maxExpanded) invalidFile();
              crc = crc32(chunk, crc);
              inspector?.write(chunk);
              if (name === 'mimetype') {
                if (actual > 256) invalidFile();
                mimeChunks.push(chunk);
              }
            } catch (error) {
              (stream as NodeJS.ReadableStream & { destroy: (error?: Error) => void }).destroy(error instanceof Error ? error : new Error('Invalid file'));
            }
          });
          stream.once('error', rejectStream);
          stream.once('end', resolveStream);
        });
        if (actual !== entry.uncompressedSize || crc !== entry.crc32) invalidFile();
        if (inspector) xml.set(name, inspector.finish());
        if (name === 'mimetype') mimeType = Buffer.concat(mimeChunks).toString('utf8').trim();
        if (!settled) zip.readEntry();
      })().catch(fail);
    });
    zip.on('end', () => { if (!settled) { settled = true; resolve(); } });
    zip.readEntry();
  });
  zip.close();
  if (extension === 'docx') {
    const types = xml.get('[Content_Types].xml');
    const relations = xml.get('_rels/.rels');
    const body = xml.get('word/document.xml');
    if (!types?.documentType || types.rootLocal !== 'Types' || types.rootUri !== 'http://schemas.openxmlformats.org/package/2006/content-types' ||
        relations?.rootLocal !== 'Relationships' || relations.rootUri !== 'http://schemas.openxmlformats.org/package/2006/relationships' ||
        body?.rootLocal !== 'document' || !['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main'].includes(body.rootUri)) invalidFile();
  } else {
    const header = xml.get('Contents/header.xml');
    const section = xml.get('Contents/section0.xml');
    if (!['application/hwp+zip', 'application/vnd.hancom.hwpx'].includes(mimeType) || !xml.has('version.xml') ||
        !xml.has('Contents/content.hpf') || header?.rootLocal !== 'head' || section?.rootLocal !== 'sec') invalidFile();
  }
}
