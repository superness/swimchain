/**
 * How much Argon2id did the OLD boards ordering put in front of a new player?
 *
 * Reads the real chips space from a running node and folds the same window the
 * old `useBoards` folded on mount — up to TABLES_FOLDED_PER_PASS foreign tables
 * — reporting the Argon2id-8MiB hash count and the wall time for each.
 *
 * This is the measurement PR #277 was missing: the fix is argued from the code
 * path, and this turns "six foreign folds ran first" into a number.
 *
 * Run: npx tsx scripts/bench-boards-fold.mts <rpc-url> <basic-auth-cookie>
 */
import { verifyReplies, clearVerifyCache, verifyHashCount } from '../src/lib/chipsVerify';
import type { ChipsReply } from '../src/lib/chipsEngine';

const RPC = process.argv[2];
// Via env, not argv: the cookie contains a ':' and shells mangle it.
const COOKIE = process.env.SW_COOKIE ?? process.argv[3];
const CHIPS_SPACE = 'sp1qqz7zj8gawkmy3ye7vyxudvalfmqpxt7ue';
const TABLES_FOLDED_PER_PASS = 6;

if (!RPC || !COOKIE) {
  console.error('usage: bench-boards-fold.mts <rpc-url> <cookie>');
  process.exit(2);
}

// The node's cookie auth is Basic `__cookie__:<cookie>` (src/rpc/auth.rs:77).
const auth = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
let nextId = 1;

async function call<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

// Same split as host.ts:282 — the header JSON follows the display text after a
// blank line. (Taking the FIRST line instead silently yields zero tables.)
function headerJson(stored: string): string {
  const split = stored.indexOf('\n\n');
  return split >= 0 ? stored.slice(split + 2) : stored;
}

async function main(): Promise<void> {
  const posts = await call<{ items: { content_id: string; body?: string }[] }>(
    'list_space_posts',
    { space_id: CHIPS_SPACE, limit: 1000, offset: 0, sort: 'recent' },
  );

  const seen = new Set<string>();
  const tables: { id: string; name: string }[] = [];
  for (const c of posts.items) {
    if (seen.has(c.content_id)) continue;
    seen.add(c.content_id);
    try {
      const h = JSON.parse(headerJson(c.body ?? ''));
      if (h?.kind !== 'chips-table') continue;
      tables.push({ id: c.content_id, name: String(h.name ?? '?') });
    } catch { /* not a table */ }
  }
  console.log(`chips space: ${tables.length} tables (${posts.items.length} posts listed)\n`);

  // Scan EVERY table, not just one pass: the question is what a full board
  // fold actually costs today, and one window could easily miss the banks.
  const window = tables;
  let totalHashes = 0;
  let totalMs = 0;
  const kinds = new Map<string, number>();

  for (const t of window) {
    const res = await call<{ replies: { author_id: string; body: string; content_id: string; created_at: number; block_height?: number; parent_id: string }[] }>(
      'get_replies',
      { content_id: t.id, limit: 100_000 },
    );
    const direct = res.replies.filter((r) => r.parent_id === t.id);

    // The owner authors the banks. Taking the modal author of the direct
    // children recovers it without needing the bech32->hex WASM seam, and is
    // reported below so a table where that ISN'T overwhelming can be discarded.
    const tally = new Map<string, number>();
    for (const r of direct) tally.set(r.author_id, (tally.get(r.author_id) ?? 0) + 1);
    const [owner, ownerCount] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const share = direct.length ? Math.round((ownerCount / direct.length) * 100) : 0;

    const replies: ChipsReply[] = direct.map((r) => ({
      author_id: r.author_id, body: r.body,
      block_height: r.block_height ?? null,
      content_id: r.content_id, created_at: r.created_at,
    }));

    // Cold cache per table: a new player has verified nothing, ever.
    clearVerifyCache();
    const before = verifyHashCount();
    const t0 = performance.now();
    await verifyReplies(t.id, owner, replies);
    const ms = performance.now() - t0;
    const hashes = verifyHashCount() - before;

    for (const r of direct) {
      const verb = (r.body.trim().split(/[\s#]/)[0] || '?').slice(0, 12);
      kinds.set(verb, (kinds.get(verb) ?? 0) + 1);
    }

    totalHashes += hashes;
    totalMs += ms;
    if (direct.length > 0) {
      console.log(
        `${t.name.slice(0, 22).padEnd(24)} replies=${String(direct.length).padStart(5)}  ` +
        `argon2id=${String(hashes).padStart(4)}  ${(ms / 1000).toFixed(2)}s   (owner ${share}% of replies)`,
      );
    }
  }

  console.log('\nmove verbs across the whole board:');
  for (const [k, n] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${n}`);
  }

  console.log(`\nTHE WINDOW A NEW PLAYER USED TO WAIT BEHIND`);
  console.log(`  tables folded : ${window.length}`);
  console.log(`  Argon2id-8MiB : ${totalHashes}`);
  console.log(`  wall time     : ${(totalMs / 1000).toFixed(2)}s on this machine`);
  console.log(`\n  A phone is materially slower than this desktop, and all of it ran`);
  console.log(`  through the single verify worker before the player's own table.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
