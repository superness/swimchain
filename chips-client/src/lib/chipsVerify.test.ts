/**
 * Verification memoization. Each chip is verified once EVER; the cache is pure
 * memoization and must never change what the fold produces.
 * Run: npx tsx src/lib/chipsVerify.test.ts
 */
import { verifyReplies, clearVerifyCache } from './chipsVerify';
import type { ChipsReply } from './chipsEngine';

const TABLE = 'sha256:table';
const A = 'a'.repeat(64);
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const replies: ChipsReply[] = [
  { author_id: A, body: `bank 8 01#${T0}~`,  block_height: 1, content_id: 'v1', created_at: T0 },
  { author_id: A, body: `buy season1#${T0}~`, block_height: 1, content_id: 'v2', created_at: T0 },
];

async function main() {
  clearVerifyCache();

  const t1 = Date.now();
  const m1 = await verifyReplies(TABLE, A, replies);
  const cold = Date.now() - t1;

  check('only bank moves are verified', m1.size === 1 && m1.has('v1'), [...m1.keys()]);
  check('bits are an integer', Number.isInteger(m1.get('v1')));

  const t2 = Date.now();
  const m2 = await verifyReplies(TABLE, A, replies);
  const warm = Date.now() - t2;

  check('second pass returns the same bits', m2.get('v1') === m1.get('v1'));
  check('second pass is cached (much faster)', warm < Math.max(cold / 4, 5), { cold, warm });

  let seen = 0;
  await verifyReplies(TABLE, A, replies, (done) => { seen = Math.max(seen, done); });
  check('progress is reported', seen >= 1, seen);

  // A stranger's bank reply must never be hashed. The fold skips non-owner
  // replies, but this runs BEFORE the fold — without the same filter here,
  // spam replies cost the victim one Argon2id-8MiB hash each.
  clearVerifyCache();
  const spam: ChipsReply[] = [
    ...replies,
    { author_id: 'b'.repeat(64), body: `bank 8 02#${T0}~`, block_height: 1, content_id: 'spam1', created_at: T0 },
  ];
  const m3 = await verifyReplies(TABLE, A, spam);
  check('foreign bank is not verified', !m3.has('spam1'), [...m3.keys()]);
  check('owner bank still verified', m3.has('v1'));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
