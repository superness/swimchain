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

console.log(`[verify-clients] OK - all ${EXPECTED.length} clients bundled.`);
