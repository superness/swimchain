/**
 * Preflight for `tauri build`: refuse to bundle a desktop app whose embedded
 * client set is incomplete. Runs as tauri.conf.json beforeBuildCommand.
 *
 * On 2026-07-03 a desktop installer shipped with only chat + search bundled
 * (forum/feed/wiki had silently failed their client builds), so the app —
 * which defaults to the forum client — hung on "Checking setup" loading a
 * missing iframe. This check makes that a loud build failure, not a shipped bug.
 */
const fs = require('fs');
const path = require('path');

const EXPECTED = ['forum', 'chat', 'feed', 'search', 'wiki'];
const distClients = path.join(__dirname, '..', 'dist', 'clients');

const missing = EXPECTED.filter((c) => {
  const index = path.join(distClients, `${c}-client`, 'index.html');
  return !fs.existsSync(index);
});

if (missing.length > 0) {
  console.error(
    `\n[verify-clients] REFUSING TO BUNDLE: missing client(s): ${missing.join(', ')}.` +
    `\n  Expected an index.html under dist/clients/<name>-client for each of: ${EXPECTED.join(', ')}.` +
    `\n  Run: node scripts/build-clients.js  (and fix any client that fails to build)\n`
  );
  process.exit(1);
}

// THE NODE BINARY IS AS LOAD-BEARING AS THE CLIENTS.
//
// Same failure, one layer down: on 2026-07-29 a desktop bundle was found to
// carry NO node at all. `binaries/` is gitignored, so an empty directory made
// the `binaries/*` resource match nothing and fail the build; #46 removed the
// resource entry instead of staging the file, and every installer since shipped
// an app that spawns `resource_dir()/binaries/sw.exe` and cannot find it.
//
// A missing client hangs one screen. A missing node means the app does nothing
// at all — so it earns the same loud failure rather than a shipped bug.
const nodeBin = process.platform === 'win32' ? 'sw.exe' : 'sw';
const stagedNode = path.join(__dirname, '..', 'src-tauri', 'binaries', nodeBin);

if (!fs.existsSync(stagedNode)) {
  console.error(
    `
[verify-clients] REFUSING TO BUNDLE: no node binary at ${stagedNode}.` +
    `
  The app spawns resource_dir()/binaries/${nodeBin}; without it an installed` +
    `
  desktop app has no node and cannot start.` +
    `
  Run: node scripts/stage-node.js  (after cargo build --release --bin sw)
`
  );
  process.exit(1);
}

console.log(`[verify-clients] OK - all ${EXPECTED.length} clients bundled, node binary staged.`);
