/**
 * Build feed-client and copy its dist into mobile-app/public/clients/.
 * Vite copies public/ into dist/ on `npm run build:shell`, so bundled client
 * assets ship inside the Tauri app. Trimmed from desktop-app's build-clients.js
 * (single client, single write target - no dist/public dual-write).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const CLIENTS = ['feed'];
const PUBLIC_CLIENTS_DIR = path.resolve(__dirname, '../public/clients');

function log(msg) {
  console.log(`[build-clients] ${msg}`);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

for (const client of CLIENTS) {
  const clientDir = path.join(ROOT_DIR, `${client}-client`);
  if (!fs.existsSync(path.join(clientDir, 'node_modules'))) {
    log(`Installing dependencies for ${client}-client...`);
    execSync('npm install', { cwd: clientDir, stdio: 'inherit' });
  }
  log(`Building ${client}-client...`);
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });

  const dist = path.join(clientDir, 'dist');
  if (!fs.existsSync(dist)) {
    console.error(`[build-clients] ${dist} missing after build`);
    process.exit(1);
  }
  const dest = path.join(PUBLIC_CLIENTS_DIR, `${client}-client`);
  fs.rmSync(dest, { recursive: true, force: true });
  log(`Copying to ${dest}`);
  copyDirSync(dist, dest);
}
log('Done.');
