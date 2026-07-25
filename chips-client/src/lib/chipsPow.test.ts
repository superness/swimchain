/**
 * Chip proof round-trip. Run: npx tsx src/lib/chipsPow.test.ts
 * Uses REAL Argon2id at the pinned params, so this takes a few seconds.
 */
import { chipPreimage, verifyChipBits, mineChip } from './chipsPow';

const AUTHOR = 'a'.repeat(64);
const TABLE = 'sha256:beef';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

async function main() {
  // Preimage binds every field — changing any one changes the bytes.
  const base = chipPreimage(AUTHOR, TABLE, 1000, 7n);
  check('preimage differs on nonce', !eq(base, chipPreimage(AUTHOR, TABLE, 1000, 8n)));
  check('preimage differs on ms', !eq(base, chipPreimage(AUTHOR, TABLE, 1001, 7n)));
  check('preimage differs on table', !eq(base, chipPreimage(AUTHOR, 'sha256:other', 1000, 7n)));
  check('preimage differs on author', !eq(base, chipPreimage('b'.repeat(64), TABLE, 1000, 7n)));

  // Length-prefixed encoding prevents delimiter collision: different field boundaries
  // don't produce identical bytes even if one field ends with a pipe or contains a delimiter.
  // Test case: (author="a|b", table="c", ms=5) vs (author="a", table="b|c", ms=5)
  // With old delimiter encoding: "chips-v1|a|b|c|5|" — could collide if the pipe moves.
  // With length prefixes: impossible to shift across length-prefixed boundaries.
  const collision1 = chipPreimage('a|b', 'c', 5, 0n);
  const collision2 = chipPreimage('a', 'b|c', 5, 0n);
  check('length-prefixed encoding prevents delimiter collision', !eq(collision1, collision2));

  // Verification is deterministic: same input, same bits, every time.
  const b1 = await verifyChipBits(AUTHOR, TABLE, 1000, 7n);
  const b2 = await verifyChipBits(AUTHOR, TABLE, 1000, 7n);
  check('verification is deterministic', b1 === b2, { b1, b2 });
  check('bits is a non-negative integer', Number.isInteger(b1) && b1 >= 0, b1);

  // Mining to a low target returns a nonce that verifies to at least that target.
  const mined = await mineChip(AUTHOR, TABLE, 2000, { targetBits: 10 });
  const actual = await verifyChipBits(AUTHOR, TABLE, 2000, mined.nonce);
  check('mined nonce meets its target', actual >= 10, { actual });
  check('mined bits match verification', mined.bits === actual, { mined: mined.bits, actual });

  // A chip mined for one author must NOT verify for another — non-transferable.
  const other = await verifyChipBits('b'.repeat(64), TABLE, 2000, mined.nonce);
  check('chip is author-bound', other < 10, { other, actual });

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

function eq(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

main();
