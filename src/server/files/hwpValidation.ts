import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { invalidFile } from './errors.js';

const require = createRequire(import.meta.url);
// Only this fixed parser program executes. Uploaded bytes are supplied as data, never code or a path.
// Using a fixed eval worker also works in both tsx development and compiled .js without TS loaders.
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
try {
  const CFB = require(workerData.modulePath);
  const bytes = Buffer.from(workerData.bytes);
  const document = CFB.read(bytes, { type: 'buffer' });
  if (document.FileIndex.length > 4096) throw new Error('Too many streams');
  const header = CFB.find(document, 'FileHeader');
  const info = CFB.find(document, 'DocInfo');
  if (!header || !header.content || !info || !info.content || header.content.length < 256 || info.content.length === 0) throw new Error('Missing streams');
  const head = Buffer.from(header.content);
  if (head.subarray(0, 17).toString('ascii') !== 'HWP Document File' || head[35] !== 5) throw new Error('Invalid HWP header');
  if ((head.readUInt32LE(36) & 2) !== 0) throw new Error('Encrypted HWP');
  const body = document.FullPaths.some((path, index) => /\\/BodyText\\/Section\\d+$/.test(path) &&
    document.FileIndex[index].content && document.FileIndex[index].content.length > 0);
  parentPort.postMessage(Boolean(body));
} catch { parentPort.postMessage(false); }
`;

export async function validateHwp(bytes: Buffer): Promise<void> {
  if (bytes.length < 512 || !bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) invalidFile();
  const copy = Uint8Array.from(bytes);
  const valid = await new Promise<boolean>((resolve) => {
    const worker = new Worker(workerSource, {
      eval: true, workerData: { modulePath: require.resolve('cfb'), bytes: copy }, transferList: [copy.buffer],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      stdout: true, stderr: true,
    });
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate(); resolve(result);
    };
    const timer = setTimeout(() => finish(false), 5000);
    timer.unref();
    worker.once('message', (result: unknown) => finish(result === true));
    worker.once('error', () => finish(false));
    worker.once('exit', () => finish(false));
  });
  if (!valid) invalidFile('HWP 5.x 문서 구조를 확인할 수 없습니다. 손상·암호 설정 여부를 확인해 주세요.');
}
