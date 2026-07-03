#!/usr/bin/env node
/**
 * swimchain wiki importer — seed a wiki namespace from a CC BY-SA MediaWiki wiki.
 *
 * "Your wiki, without the ads — because we host it."
 *
 * Licensing is the point: imports are refused unless the source wiki's API
 * declares a CC BY-SA license (meta=siteinfo rightsinfo), and every imported
 * page ends with an attribution footer (source URL, wiki name, license,
 * import date). No attribution, no import.
 *
 * Usage:
 *   node tools/wiki-import/import.js \
 *     --wiki https://en.wikipedia.org \
 *     --pages "Proof of work,Distributed hash table,Gossip protocol" \
 *     --space my-wiki \
 *     --rpc http://127.0.0.1:29736 \
 *     --date 2026-07-02
 *
 * Options:
 *   --wiki <url>        Source wiki base URL (required)
 *   --pages "A,B,C"     Comma-separated page titles
 *   --category <name>   OR: import pages from one category (capped, no crawling)
 *   --space <name>      Target swimchain namespace/space name (required unless --dry-run)
 *   --rpc <url>         Node RPC endpoint (default http://127.0.0.1:29736)
 *   --date <YYYY-MM-DD> Import date for the attribution footer (required)
 *   --network <net>     regtest | testnet (PoW difficulty/params, default regtest)
 *   --seed <hex>        64-hex-char Ed25519 seed; the page author identity.
 *                       Omitted: an ephemeral identity is generated and printed.
 *   --dry-run           Convert only; write markdown to --out, publish nothing
 *   --out <dir>         Output dir for dry-run files + manifest.json (default ./out)
 *   --limit <n>         Max pages from --category (default 25)
 *   --user-agent <ua>   Override the polite User-Agent
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { MediaWikiClient, assertCcBySa } from './lib/mediawiki.js';
import { wikitextToMarkdown, attributionFooter, normalizeTitle } from './lib/convert.js';
import { SwimchainRpc, keypairFromSeed, generateSeedHex } from './lib/rpc.js';
import { ensureSpace, publishPage } from './lib/publish.js';

function parseArgs(argv) {
  const args = { rpc: 'http://127.0.0.1:29736', network: 'regtest', out: './out', limit: 25 };
  const flags = new Set(['dry-run']);
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (flags.has(key)) {
      args[key === 'dry-run' ? 'dryRun' : key] = true;
    } else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for --${key}`);
      args[key === 'user-agent' ? 'userAgent' : key] = value;
    }
  }
  return args;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.wiki) fail('--wiki <base url> is required');
  if (!args.pages && !args.category) fail('--pages "A,B,C" or --category <name> is required');
  if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    fail('--date <YYYY-MM-DD> is required (import date for the attribution footer)');
  }
  if (!args.dryRun && !args.space) fail('--space <name> is required (or use --dry-run)');
  if (!['regtest', 'testnet'].includes(args.network)) fail('--network must be regtest or testnet');

  const mw = new MediaWikiClient(args.wiki, { userAgent: args.userAgent });

  // --- 1. Site info + license gate --------------------------------------
  console.log(`Resolving MediaWiki API at ${args.wiki} ...`);
  const site = await mw.getSiteInfo();
  console.log(`Source wiki: ${site.sitename}`);
  console.log(`Declared license: ${site.license.text} (${site.license.url})`);
  assertCcBySa(site.license); // throws -> abort if not CC BY-SA
  console.log('License gate: CC BY-SA confirmed.');

  // --- 2. Page list (requested set ONLY — no crawling) -------------------
  let titles;
  if (args.pages) {
    titles = args.pages.split(',').map((t) => t.trim()).filter(Boolean);
  } else {
    console.log(`Listing category "${args.category}" (max ${args.limit}) ...`);
    titles = await mw.getCategoryMembers(args.category, Number(args.limit));
    if (titles.length === 0) fail(`category "${args.category}" has no pages`);
    console.log(`Category pages: ${titles.join(', ')}`);
  }

  // --- 3. Fetch wikitext (throttled, 1 req/s) ----------------------------
  const fetched = [];
  for (const title of titles) {
    process.stdout.write(`Fetching "${title}" ... `);
    const page = await mw.getPageWikitext(title);
    if (!page) {
      console.log('MISSING (skipped)');
      continue;
    }
    console.log(`ok (${page.wikitext.length} bytes wikitext, canonical: "${page.title}")`);
    fetched.push(page);
  }
  if (fetched.length === 0) fail('no pages could be fetched');

  // --- 4. Convert + attribution footer ------------------------------------
  // Canonical titles of the batch: internal links to these become [[wikilinks]].
  const importedTitles = new Map(fetched.map((p) => [normalizeTitle(p.title), p.title]));
  const externalUrl = (title) => mw.articleUrl(site, title);

  const pages = fetched.map((page) => {
    const markdown = wikitextToMarkdown(page.wikitext, { importedTitles, externalUrl });
    const footer = attributionFooter({
      title: page.title,
      sourceUrl: mw.articleUrl(site, page.title),
      sitename: site.sitename,
      license: site.license,
      importDate: args.date,
    });
    return { title: page.title, body: `${markdown}\n${footer}`.trim() };
  });

  // --- 5. Dry run: write markdown for review ------------------------------
  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const manifest = {
    source: { wiki: args.wiki, sitename: site.sitename, license: site.license },
    importDate: args.date,
    network: args.network,
    dryRun: Boolean(args.dryRun),
    space: args.space ?? null,
    spaceId: null,
    pages: [],
  };

  for (const page of pages) {
    const file = path.join(outDir, `${slugify(page.title)}.md`);
    writeFileSync(file, `${page.body}\n`, 'utf-8');
    manifest.pages.push({ title: page.title, file, contentId: null });
    console.log(`Converted: "${page.title}" -> ${file} (${page.body.length} chars)`);
  }

  if (args.dryRun) {
    writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`\nDry run complete. ${pages.length} page(s) written to ${outDir} — nothing published.`);
    return;
  }

  // --- 6. Publish via the wiki-client write contract ----------------------
  // Identity: the wiki write path validates `signature` against `author_id`
  // (the submitting keypair), so a local Ed25519 seed IS the author identity.
  let seedHex = args.seed;
  if (!seedHex) {
    seedHex = generateSeedHex();
    console.log(`\nNo --seed given; generated ephemeral author identity.`);
    console.log(`  seed: ${seedHex}  (save this to keep editing these pages)`);
  }
  const keypair = keypairFromSeed(seedHex);
  console.log(`Author (pubkey): ${keypair.publicKeyHex}`);

  const rpc = new SwimchainRpc({ endpoint: args.rpc, keypair });
  const info = await rpc.call('get_info', {});
  console.log(`Connected to node: ${info.version ?? '?'} network=${info.network ?? '?'} @ ${args.rpc}`);
  if (info.network && info.network !== args.network) {
    fail(`node is on "${info.network}" but --network is "${args.network}" (PoW params would not match)`);
  }

  const spaceId = await ensureSpace(rpc, keypair, args.space, args.network);
  manifest.spaceId = spaceId;
  console.log(`Namespace "${args.space}" -> ${spaceId}`);

  for (const [i, page] of pages.entries()) {
    process.stdout.write(`Publishing [${i + 1}/${pages.length}] "${page.title}" (mining PoW) ... `);
    const contentId = await publishPage(rpc, keypair, {
      spaceId,
      title: page.title,
      body: page.body,
      network: args.network,
    });
    manifest.pages[i].contentId = contentId;
    console.log(contentId);
  }

  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nImport complete: ${pages.length} page(s) published to space "${args.space}" (${spaceId}).`);
  console.log(`Manifest: ${path.join(outDir, 'manifest.json')}`);
}

main().catch((err) => {
  console.error(`error: ${err?.message ?? err}`);
  process.exit(1);
});
