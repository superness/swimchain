#!/usr/bin/env node
// Bakes the A1 lineup into surf-app/web/channels/<id>/.
// npm install (NOT npm ci - package-lock.json is gitignored repo-wide).
// reef trap: reef-client/.env.production pins the mainnet GATEWAY endpoint;
// the in-app node is loopback, so VITE_RPC_ENDPOINT must be forced on EVERY
// build - and grep-verified after (A0 rule: never trust an unverified bundle).
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'web', 'channels');
const RPC = 'http://127.0.0.1:9736';

const CHANNELS = [
  { id: 'feed', dir: 'feed-client', env: {} },
  { id: 'wiki', dir: 'wiki-client', env: {} },
  { id: 'reef', dir: 'reef-client', env: { VITE_RPC_ENDPOINT: RPC } },
];

// Recursively collect every .js file under `dir`, at any depth. The reef
// anti-leak scan (below) must catch a leaked gateway string regardless of
// chunk nesting, not just direct children of assets/ — a non-recursive scan
// would false-pass the one check the A0 rule calls load-bearing the moment
// vite's output layout grows a subdirectory.
function walkJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsFiles(p));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

for (const ch of CHANNELS) {
  const cwd = path.join(REPO, ch.dir);
  console.log(`\n=== ${ch.id} (${ch.dir}) ===`);
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    execSync('npm install', { cwd, stdio: 'inherit', env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' } });
  }
  const outDir = path.join(OUT, ch.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  // argv array via spawnSync, not an execSync shell string: outDir must
  // reach vite exactly as given, never re-tokenized by a shell (a Windows
  // path's backslashes/spaces are not safe inside a shell template string).
  // Invoke vite's own JS entrypoint through `node` directly (process.execPath)
  // rather than the npx/.bin .cmd shim — this sidesteps Windows .cmd/.bat
  // spawning entirely (empirically confirmed: spawnSync('npx.cmd', ..., {})
  // without shell:true fails EINVAL on this platform/Node version, so no
  // shell is ever in the loop for this call, on any platform).
  const viteBin = path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const res = spawnSync(process.execPath, [
    viteBin, 'build',
    `--base=/channels/${ch.id}/`,
    '--outDir', outDir,
    '--emptyOutDir',
  ], { cwd, stdio: 'inherit', env: { ...process.env, ...ch.env } });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${ch.id}: vite build failed (exit ${res.status ?? res.signal})`);
  // verify the bake
  const idx = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  if (!idx.includes(`/channels/${ch.id}/`)) {
    throw new Error(`${ch.id}: index.html assets are not rooted at /channels/${ch.id}/`);
  }
}
// reef endpoint verification: the loopback endpoint must be in the bundle and
// the production gateway must NOT be. Recursive over the whole reef output
// dir (not just assets/) so nested chunks can't hide a leak.
const js = walkJsFiles(path.join(OUT, 'reef')).map((f) => fs.readFileSync(f, 'utf8')).join('');
if (!js.includes('127.0.0.1:9736')) throw new Error('reef: loopback endpoint not baked');
if (js.includes('swimchain.io/rpc')) throw new Error('reef: PRODUCTION GATEWAY LEAKED INTO THE BAKE');
console.log('\nall channels baked and verified');

// B: the engage PoW worker is a separate bundle (not a vite channel), but one
// bake command should produce everything the shell needs.
console.log('\n=== engage worker ===');
require('./build-worker.cjs').buildWorker();
