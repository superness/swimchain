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
  { id: 'chess', dir: 'chess-client', env: { VITE_RPC_ENDPOINT: RPC } },
  { id: 'chips', dir: 'chips-client', env: { VITE_CHIPS_RPC: RPC } },
];

// Recursively collect every file under `dir`, at any depth, optionally
// filtered by a suffix. The reef anti-leak scan and the sourcemap-bake
// self-check both need this to catch nested chunks, not just direct
// children of assets/ — a non-recursive scan would false-pass the moment
// vite's output layout grows a subdirectory.
function walkFiles(dir, suffix) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p, suffix));
    else if (entry.isFile() && (!suffix || entry.name.endsWith(suffix))) out.push(p);
  }
  return out;
}
const walkJsFiles = (dir) => walkFiles(dir, '.js');

for (const ch of CHANNELS) {
  const cwd = path.join(REPO, ch.dir);
  console.log(`\n=== ${ch.id} (${ch.dir}) ===`);
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    execSync('npm install', { cwd, stdio: 'inherit', env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' } });
  }
  const outDir = path.join(OUT, ch.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  // Surf C3 sourcemap-bake self-check: vite.config.js (built by `tsc -b` from
  // vite.config.ts under the composite tsconfig.node.json, gitignored per
  // *-client/.gitignore) takes precedence over vite.config.ts when vite
  // resolves its config file. This script calls vite's `build` directly, NOT
  // via `tsc -b && vite build`, so it never regenerates that .js — a STALE
  // pre-C3 copy left over from before sourcemaps were stripped (sourcemap:
  // true) would silently win over the fixed, tracked .ts and re-emit maps
  // into the baked APK, invisible to scripts/check-bundle-sizes.sh (that
  // script only greps TRACKED files, and vite.config.js is gitignored).
  // Removing it forces vite to fall back to the tracked, fixed .ts.
  fs.rmSync(path.join(cwd, 'vite.config.js'), { force: true });
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
  // Surf C3 sourcemap-bake self-check (continued): even with the stale
  // vite.config.js removed above, verify the bake itself never emitted a
  // map — belt and suspenders against any other path (a future channel with
  // its own gitignored config quirk, a vite default changing upstream,
  // etc.) that could reintroduce sourcemap:true undetected. Checks both the
  // literal .map files AND the `//# sourceMappingURL=` trailer vite writes
  // into the referencing .js, since either one leaking into the APK exposes
  // the same unminified source.
  const stray = walkFiles(outDir, '.map');
  if (stray.length > 0) {
    throw new Error(`${ch.id}: sourcemap(s) baked into the channel output: ${stray.join(', ')}`);
  }
  for (const jsFile of walkJsFiles(outDir)) {
    if (fs.readFileSync(jsFile, 'utf8').includes('sourceMappingURL')) {
      throw new Error(`${ch.id}: ${jsFile} contains a sourceMappingURL trailer`);
    }
  }
}
// endpoint verification: for every channel whose env forces an RPC var (any
// channel with a non-empty env — reef, chess, chips as of C2b), the loopback
// endpoint must be in the bundle and the production gateway must NOT be.
// Recursive over the whole channel output dir (not just assets/) so nested
// chunks can't hide a leak.
for (const ch of CHANNELS) {
  if (Object.keys(ch.env).length === 0) continue;
  const js = walkJsFiles(path.join(OUT, ch.id)).map((f) => fs.readFileSync(f, 'utf8')).join('');
  if (!js.includes('127.0.0.1:9736')) throw new Error(`${ch.id}: loopback endpoint not baked`);
  if (js.includes('swimchain.io/rpc')) throw new Error(`${ch.id}: PRODUCTION GATEWAY LEAKED INTO THE BAKE`);
}
console.log('\nall channels baked and verified');

// B: the engage PoW worker is a separate bundle (not a vite channel), but one
// bake command should produce everything the shell needs.
console.log('\n=== engage worker ===');
require('./build-worker.cjs').buildWorker();
