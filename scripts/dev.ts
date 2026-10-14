import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { loadConfig } from '../src/server/config.js';

if (existsSync('.env')) loadEnvFile('.env');
loadConfig();
const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function launch(args: string[]) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.once('error', () => stop(1));
  child.once('exit', code => { if (!stopping) stop(code || 0); });
}
// Direct child processes (no nested shell/watch process) keep Ctrl+C shutdown predictable on Windows.
launch(['--import', 'tsx', resolve('src/server/index.ts'), '--dev']);
launch([resolve('node_modules/vite/bin/vite.js')]);
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
