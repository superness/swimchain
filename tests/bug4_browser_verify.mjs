// Bug #4 browser verification via Playwright (runs against forum-client + local node).
//
// Expected: forum-client's useSpaces hook detects placeholder names like
// "Space 000661b4", fires resolve_space_name RPC, then re-fetches after 1.5s
// to display the real names.
//
// Run: node tests/bug4_browser_verify.mjs

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = process.cwd().replace(/\\/g, '/');
const VITE = 'http://localhost:5173/';
const SHOTS_DIR = join(REPO, 'tests', 'shots');
import { mkdirSync } from 'fs';
try { mkdirSync(SHOTS_DIR, { recursive: true }); } catch {}

const rpcAddr = readFileSync(join(REPO, 'genesis-testnet', '.rpc_addr'), 'utf8').trim();
const cookie  = readFileSync(join(REPO, 'genesis-testnet', '.cookie'),  'utf8').trim();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', m => {
  const t = m.type();
  if (t === 'log' || t === 'warn' || t === 'error') {
    console.log(`[console.${t}] ${m.text()}`);
  }
});
page.on('pageerror', err => console.log(`[pageerror] ${err.message}`));

console.log(`vite=${VITE}  rpc=${rpcAddr}  cookie=${cookie.slice(0,8)}…`);

// Seed connection config into localStorage so forum-client connects to our
// running node without going through an interactive setup flow.
await page.addInitScript(({ rpcAddr, cookie }) => {
  // The forum-client reads parent config in iframes; fall back to localStorage
  // here. We don't know exact keys, so write a wide net of plausible names —
  // the hooks ignore unknown ones.
  try {
    localStorage.setItem('swimchain-rpc-addr', rpcAddr);
    localStorage.setItem('swimchain-rpc-cookie', cookie);
    localStorage.setItem('swimchain-node-addr', rpcAddr);
    localStorage.setItem('rpc.addr', rpcAddr);
    localStorage.setItem('rpc.cookie', cookie);
  } catch {}
}, { rpcAddr, cookie });

await page.goto(VITE, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.screenshot({ path: join(SHOTS_DIR, '01_landing.png'), fullPage: true });
console.log('shot: 01_landing.png');

// Wait a beat for hydration
await page.waitForTimeout(2000);
await page.screenshot({ path: join(SHOTS_DIR, '02_hydrated.png'), fullPage: true });

// Navigate to /spaces
await page.goto(VITE + 'spaces', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: join(SHOTS_DIR, '03_spaces_initial.png'), fullPage: true });
console.log('shot: 03_spaces_initial.png');

const initialBody = await page.locator('body').innerText();
console.log('--- body excerpt (initial) ---');
console.log(initialBody.slice(0, 600));

// Give the resolve-then-refetch flow time to land (1500ms setTimeout + RPC RTT)
await page.waitForTimeout(4500);
await page.screenshot({ path: join(SHOTS_DIR, '04_spaces_after_resolve.png'), fullPage: true });
const finalBody = await page.locator('body').innerText();
console.log('--- body excerpt (after 4.5s) ---');
console.log(finalBody.slice(0, 600));

// Check whether any of the real names appeared
const realNames = ['RemoteSeed', 'BugFiveTest', 'BugFiveFixed', 'Validation'];
const placeholderHits = (finalBody.match(/Space [0-9a-f]{8}/g) || []);
const realHits = realNames.filter(n => finalBody.includes(n));

console.log('\n=== VERDICT ===');
console.log(`Real names visible: ${realHits.join(', ') || '(none)'}`);
console.log(`Placeholders visible: ${placeholderHits.length} (${placeholderHits.slice(0,5).join(', ')})`);

await browser.close();
