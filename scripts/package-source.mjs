import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-only allowlist. Never copy an entire worktree, .env, dependencies or runtime data.
const rootFiles = [
  '.env.example', '.gitignore', '.node-version', '.npmrc', 'README.md', 'index.html',
  'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json',
  'tsconfig.server.json', 'vite.config.ts',
  '로컬 제작 순서 및 VS Code Codex 실행 프롬프트.md',
  '로컬 제작 순서 및 VS Code Codex 실행 프롬프트.txt',
];
const trees = {
  src: new Set(['.ts', '.tsx', '.css', '.svg']),
  scripts: new Set(['.ts', '.mjs', '.ps1']),
  tests: new Set(['.ts', '.mjs']),
  docs: new Set(['.md']),
  migrations: new Set(['.sql']),
  seed: new Set(['.json']),
};
const excludedDirectories = new Set(['node_modules', 'dist', 'var', 'uploads', 'backups', 'coverage', 'test-results', 'playwright-report']);
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};
function physical(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : resolve(physical(parent), relative(parent, path));
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  const [flag, destination, ...extra] = process.argv.slice(2);
  if (flag !== '--output' || !destination?.trim() || extra.length) {
    throw new Error('Use npm.cmd run source:package -- --output NEW_DIRECTORY. Existing paths are never overwritten.');
  }
  const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const output = resolve(destination);
  // lstat also sees broken symlinks; resolving ancestors prevents junction escapes into source.
  try { lstatSync(output); throw new Error('Output already exists. Choose a new directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const target = physical(output);
  if (inside(target, root) || Object.keys(trees).some(tree => inside(resolve(root, tree), target))) {
    throw new Error('Output must not replace or be nested inside source directories. Use .cache/releases or a separate new folder.');
  }
  // Preflight before creating the destination. Reject links and private/unknown files in source trees.
  const sources = [];
  function add(name) {
    const path = resolve(root, name);
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular source file: ${name}`);
    sources.push({ name: name.split(sep).join('/'), path });
  }
  for (const name of rootFiles) add(name);
  function walk(folder, allowed) {
    if (lstatSync(resolve(root, folder)).isSymbolicLink()) throw new Error(`Source link is not allowed: ${folder}`);
    for (const entry of readdirSync(resolve(root, folder), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${folder}/${entry.name}`;
      if (entry.isSymbolicLink() || entry.name.startsWith('.') || excludedDirectories.has(entry.name.toLowerCase())) {
        throw new Error(`Private or linked entry in source tree; review before packaging: ${name}`);
      }
      if (entry.isDirectory()) walk(name, allowed);
      else if (entry.isFile() && allowed.has(extname(entry.name).toLowerCase())) add(name);
      else throw new Error(`Unexpected source entry; review the allowlist: ${name}`);
    }
  }
  for (const [folder, extensions] of Object.entries(trees)) walk(folder, extensions);
  const env = readFileSync(resolve(root, '.env.example'), 'utf8');
  if (env.split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith('#') && !/^[A-Z][A-Z0-9_]*=\s*$/.test(line))) {
    throw new Error('.env.example must contain comments and empty variable assignments only.');
  }
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output); // exclusive create; no recursive merge or overwrite
  const files = [];
  for (const item of sources) {
    const bytes = readFileSync(item.path);
    const dest = resolve(output, item.name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes, { flag: 'wx' });
    files.push({ path: item.name, size: bytes.length, sha256: hash(bytes) });
  }
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const manifest = { format: 'knut-ai-source', version: 1, createdAt: new Date().toISOString(),
    node: pkg.engines.node, packageManager: pkg.packageManager, files };
  writeFileSync(resolve(output, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(`Source package complete: ${output}\nFiles: ${files.length}. Verify source-manifest.json before installation. Content backups and credentials are excluded.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Source packaging failed.');
  console.error('No successful package was reported. A partial output, if any, is preserved; choose a new path after reviewing the failure.');
  process.exitCode = 1;
}
