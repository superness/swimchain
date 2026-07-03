#!/usr/bin/env node
/**
 * End-to-end proof for the wiki importer, against a scratch regtest node
 * (harness logic mirrors tests/e2e-write-paths/harness/node-harness.ts).
 *
 * Steps:
 *  1. Boot an isolated regtest node (temp data dir, temp identity).
 *  2. DRY RUN: import 3 short Wikipedia pages; assert converted markdown +
 *     attribution footer on every page.
 *  3. REAL IMPORT: publish the same 3 pages; assert content_ids returned.
 *  4. Verify each page via get_content: title matches, body ends with the
 *     CC BY-SA attribution footer. NO ATTRIBUTION = FAIL.
 *  5. Render smoke test: run wiki-client's own markdown.ts + wikilinks.ts
 *     (imported directly via Node type stripping) over every published body.
 *
 * Usage: node tools/wiki-import/e2e/run-e2e.js
 *   env SW_BIN=<path to sw binary> to override binary discovery.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, openSync, closeSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TOOL_DIR = path.resolve(__dirname, '..');

const P2P_PORT = 39935;
const RPC_PORT = P2P_PORT + 1;
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;

const PAGES = ['Proof of work', 'Distributed hash table', 'Gossip protocol'];
const SPACE = `wiki-import-e2e-${Date.now()}`;
const IMPORT_DATE = new Date().toISOString().slice(0, 10);

let passed = 0;
function assert(cond, label) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${label}`);
  }
  passed++;
  console.log(`  ok - ${label}`);
}

function findBinary() {
  if (process.env.SW_BIN && existsSync(process.env.SW_BIN)) return process.env.SW_BIN;
  const exe = process.platform === 'win32' ? 'sw.exe' : 'sw';
  const candidates = [
    path.join(REPO_ROOT, 'target', 'release', exe),
    path.join(REPO_ROOT, 'target', 'debug', exe),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`sw binary not found (${candidates.join(', ')}). Build with cargo or set SW_BIN.`);
}

class NodeHarness {
  async start() {
    this.binary = findBinary();
    this.dataDir = mkdtempSync(path.join(tmpdir(), 'swimchain-wiki-import-e2e-'));
    this.logPath = path.join(this.dataDir, 'node.log');
    const env = {
      ...process.env,
      SWIMCHAIN_DATA_DIR: this.dataDir,
      SWIMCHAIN_PASSWORD: 'wiki-import-e2e-password',
      RUST_LOG: process.env.RUST_LOG ?? 'swimchain=info',
    };

    const create = spawnSync(this.binary, ['--regtest', 'identity', 'create'], {
      env,
      encoding: 'utf-8',
      timeout: 30000,
    });
    if (create.status !== 0) {
      throw new Error(`identity create failed (exit ${create.status}):\n${create.stdout}\n${create.stderr}`);
    }

    this.logFd = openSync(this.logPath, 'w');
    this.proc = spawn(this.binary, ['--regtest', 'node', 'start', '--listen', `127.0.0.1:${P2P_PORT}`], {
      env,
      stdio: ['ignore', this.logFd, this.logFd],
      windowsHide: true,
    });
    let exited = false;
    this.proc.on('exit', () => {
      exited = true;
    });

    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (exited) throw new Error(`node exited early. Log tail:\n${this.logTail()}`);
      try {
        const res = await fetch(`${RPC_URL}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`node not healthy within 60s. Log tail:\n${this.logTail()}`);
  }

  logTail(lines = 40) {
    try {
      return readFileSync(this.logPath, 'utf-8').split('\n').slice(-lines).join('\n');
    } catch {
      return '(no log)';
    }
  }

  async stop() {
    if (this.proc && this.proc.pid && this.proc.exitCode === null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { encoding: 'utf-8' });
      } else {
        try {
          this.proc.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
      const deadline = Date.now() + 10000;
      while (this.proc.exitCode === null && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (this.logFd !== undefined) {
      try {
        closeSync(this.logFd);
      } catch {
        /* ignore */
      }
    }
    if (this.dataDir) {
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(this.dataDir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }
}

function runImport(extraArgs, outDir) {
  const args = [
    path.join(TOOL_DIR, 'import.js'),
    '--wiki', 'https://en.wikipedia.org',
    '--pages', PAGES.join(','),
    '--date', IMPORT_DATE,
    '--out', outDir,
    ...extraArgs,
  ];
  console.log(`\n$ node ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  const res = spawnSync(process.execPath, args, { encoding: 'utf-8', timeout: 600000, cwd: TOOL_DIR });
  process.stdout.write(res.stdout ?? '');
  process.stderr.write(res.stderr ?? '');
  if (res.status !== 0) {
    throw new Error(`import.js exited with ${res.status}`);
  }
  return res.stdout;
}

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

const FOOTER_RE = /\*Imported from \[[^\]]+\]\(https:\/\/en\.wikipedia\.org\/wiki\/[^)]+\) on Wikipedia\. Content available under \[Creative Commons Attribution-Share Alike 4\.0\]\(https:\/\/creativecommons\.org\/[^)]+\)\. Imported \d{4}-\d{2}-\d{2}\.\*\s*$/;

async function main() {
  const harness = new NodeHarness();
  console.log('=== wiki-import e2e proof ===');
  console.log(`Pages: ${PAGES.join(' | ')}`);
  console.log('\n[1/5] Booting scratch regtest node ...');
  await harness.start();
  console.log(`  node healthy at ${RPC_URL}`);

  try {
    // --- dry run ---------------------------------------------------------
    console.log('\n[2/5] Dry run (convert only, nothing published) ...');
    const dryOut = mkdtempSync(path.join(tmpdir(), 'wiki-import-dry-'));
    runImport(['--dry-run'], dryOut);
    const mdFiles = readdirSync(dryOut).filter((f) => f.endsWith('.md'));
    assert(mdFiles.length === PAGES.length, `dry run wrote ${PAGES.length} markdown files`);
    for (const f of mdFiles) {
      const body = readFileSync(path.join(dryOut, f), 'utf-8');
      assert(FOOTER_RE.test(body), `dry-run ${f} ends with CC BY-SA attribution footer`);
      assert(body.includes('# ') || body.includes('## '), `dry-run ${f} contains converted headings`);
    }

    // --- real import -------------------------------------------------------
    console.log('\n[3/5] Real import (PoW-mined submit_post per page) ...');
    const realOut = mkdtempSync(path.join(tmpdir(), 'wiki-import-real-'));
    runImport(['--space', SPACE, '--rpc', RPC_URL, '--network', 'regtest'], realOut);
    const manifest = JSON.parse(readFileSync(path.join(realOut, 'manifest.json'), 'utf-8'));
    assert(manifest.spaceId, 'manifest has spaceId');
    assert(manifest.pages.length === PAGES.length, `manifest lists ${PAGES.length} pages`);
    for (const p of manifest.pages) {
      assert(/^sha256:[0-9a-f]{64}$/.test(p.contentId ?? ''), `"${p.title}" has a content_id (${p.contentId})`);
    }

    // --- verify on-chain via get_content -----------------------------------
    console.log('\n[4/5] Verifying published pages via get_content ...');
    const bodies = [];
    for (const p of manifest.pages) {
      const content = await rpcCall('get_content', { content_id: p.contentId });
      assert(content.title === p.title, `get_content("${p.title}") title matches`);
      assert(typeof content.body === 'string' && content.body.length > 200, `"${p.title}" body retrieved (${content.body?.length} chars)`);
      assert(FOOTER_RE.test(content.body), `"${p.title}" on-chain body ends with CC BY-SA attribution footer`);
      bodies.push({ title: p.title, body: content.body });
    }

    // --- render smoke through wiki-client's own renderer ------------------
    console.log("\n[5/5] Render smoke test through wiki-client's markdown.ts + wikilinks.ts ...");
    const markdownTs = pathToFileURL(path.join(REPO_ROOT, 'wiki-client', 'src', 'lib', 'markdown.ts')).href;
    const wikilinksTs = pathToFileURL(path.join(REPO_ROOT, 'wiki-client', 'src', 'lib', 'wikilinks.ts')).href;
    const { renderMarkdown } = await import(markdownTs);
    const { parseWikiLinks } = await import(wikilinksTs);
    const batchTitles = manifest.pages.map((p) => p.title);
    for (const { title, body } of bodies) {
      const html = parseWikiLinks(renderMarkdown(body), batchTitles);
      assert(html.length > 200, `"${title}" renders to HTML (${html.length} chars)`);
      assert(/<h[1-6]/.test(html) && /<p>/.test(html), `"${title}" HTML has headings and paragraphs`);
      assert(html.includes('Content available under'), `"${title}" rendered HTML shows the attribution footer`);
    }

    console.log(`\n=== PASS: ${passed} assertions ===`);
    console.log(`Imported ${manifest.pages.length} pages into space "${SPACE}" (${manifest.spaceId}):`);
    for (const p of manifest.pages) console.log(`  - ${p.title}: ${p.contentId}`);
  } finally {
    console.log('\nStopping node, cleaning up ...');
    await harness.stop();
  }
}

main().catch((err) => {
  console.error(`\n=== FAIL: ${err?.message ?? err} ===`);
  process.exit(1);
});
