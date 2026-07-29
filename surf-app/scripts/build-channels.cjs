#!/usr/bin/env node
// Bakes the A1 lineup into surf-app/web/channels/<id>/.
// npm install (NOT npm ci - package-lock.json is gitignored repo-wide).
// reef trap: reef-client/.env.production pins the mainnet GATEWAY endpoint;
// the in-app node is loopback, so VITE_RPC_ENDPOINT must be forced on EVERY
// build - and grep-verified after (A0 rule: never trust an unverified bundle).
const { execSync } = require('node:child_process');
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

for (const ch of CHANNELS) {
  const cwd = path.join(REPO, ch.dir);
  console.log(`\n=== ${ch.id} (${ch.dir}) ===`);
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    execSync('npm install', { cwd, stdio: 'inherit', env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' } });
  }
  const outDir = path.join(OUT, ch.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  execSync(`npx vite build --base=/channels/${ch.id}/ --outDir ${JSON.stringify(outDir)} --emptyOutDir`, {
    cwd, stdio: 'inherit', env: { ...process.env, ...ch.env },
  });
  // verify the bake
  const idx = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  if (!idx.includes(`/channels/${ch.id}/`)) {
    throw new Error(`${ch.id}: index.html assets are not rooted at /channels/${ch.id}/`);
  }
}
// reef endpoint verification: the loopback endpoint must be in the bundle and
// the production gateway must NOT be.
const reefAssets = path.join(OUT, 'reef', 'assets');
const js = fs.readdirSync(reefAssets).filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(reefAssets, f), 'utf8')).join('');
if (!js.includes('127.0.0.1:9736')) throw new Error('reef: loopback endpoint not baked');
if (js.includes('swimchain.io/rpc')) throw new Error('reef: PRODUCTION GATEWAY LEAKED INTO THE BAKE');
console.log('\nall channels baked and verified');
