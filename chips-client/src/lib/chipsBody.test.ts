/**
 * bankBody / buyBody: the move-body grammar producers, checked as the exact
 * inverse of the fold's own parser (parseMove) at the boundaries that matter,
 * plus the input asserts that keep a caller from silently minting an
 * unparseable (and therefore lost-forever) move.
 * Run: npx tsx src/lib/chipsBody.test.ts
 * Dependency-free (chipsConst only) — no RPC/PoW/WASM in this test's import
 * chain, unlike host.ts.
 */
import { bankBody, buyBody, bankBatchBody, brokeBody } from './chipsBody';
import { parseMove } from './chipsEngine';
import { BANK_MIN_BITS, MAX_BITS, MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) bits boundaries: BANK_MIN_BITS and MAX_BITS both round-trip exactly.
for (const bits of [BANK_MIN_BITS, MAX_BITS]) {
  const body = bankBody(bits, 0xdeadbeefn, 1_000_000);
  const parsed = parseMove(body);
  check(`bank bits=${bits} parses`, parsed?.kind === 'bank', body);
  check(`bank bits=${bits} round-trips`, parsed?.kind === 'bank' && parsed.chips[0].bits === bits);
}

// 2) nonce boundaries: 0n and the max representable u64 (16 hex digits) both
// round-trip, and the max case is exactly 16 hex chars — the regex boundary.
{
  const zero = bankBody(8, 0n, 1);
  const zp = parseMove(zero);
  check('nonce 0n parses', zp?.kind === 'bank', zero);
  check('nonce 0n round-trips', zp?.kind === 'bank' && zp.chips[0].nonce === 0n);

  const max = 2n ** 64n - 1n;
  check('max u64 nonce hex is exactly 16 chars', max.toString(16).length === 16, max.toString(16));
  const full = bankBody(8, max, 1);
  const fp = parseMove(full);
  check('max u64 nonce parses', fp?.kind === 'bank', full);
  check('max u64 nonce round-trips', fp?.kind === 'bank' && fp.chips[0].nonce === max);
  check('hex nonce is lowercase', /^bank 8 [0-9a-f]+#1~$/.test(full), full);
}

// 3) buyBody round-trips a known key.
{
  const body = buyBody('season1', 42);
  const parsed = parseMove(body);
  check('buy parses', parsed?.kind === 'buy', body);
  check('buy key round-trips', parsed?.kind === 'buy' && parsed.key === 'season1');
  check('buy ms round-trips', parsed?.kind === 'buy' && parsed.ms === 42);
}

// 4) bankBody rejects inputs that would otherwise silently mint an
// unparseable (and therefore permanently lost) move.
{
  let threw = false;
  try { bankBody(-1, 1n, 1); } catch { threw = true; }
  check('bankBody rejects negative bits', threw);

  threw = false;
  try { bankBody(MAX_BITS + 1, 1n, 1); } catch { threw = true; }
  check('bankBody rejects bits over MAX_BITS', threw);

  threw = false;
  try { bankBody(1.5, 1n, 1); } catch { threw = true; }
  check('bankBody rejects non-integer bits', threw);

  threw = false;
  try { bankBody(8, -1n, 1); } catch { threw = true; }
  check('bankBody rejects negative nonce', threw);

  threw = false;
  try { bankBody(8, 2n ** 64n, 1); } catch { threw = true; }
  check('bankBody rejects nonce over 64 bits', threw);

  threw = false;
  try { bankBody(8, 1n, 0); } catch { threw = true; }
  check('bankBody rejects ms == 0', threw);

  threw = false;
  try { bankBody(8, 1n, -5); } catch { threw = true; }
  check('bankBody rejects negative ms', threw);

  threw = false;
  try { bankBody(8, 1n, 1.5); } catch { threw = true; }
  check('bankBody rejects non-integer ms', threw);
}

// 5) buyBody rejects inputs that would not match parseMove's key grammar.
{
  let threw = false;
  try { buyBody('Season1', 1); } catch { threw = true; }
  check('buyBody rejects uppercase key', threw);

  threw = false;
  try { buyBody('season-1', 1); } catch { threw = true; }
  check('buyBody rejects key with a hyphen', threw);

  threw = false;
  try { buyBody('', 1); } catch { threw = true; }
  check('buyBody rejects empty key', threw);

  threw = false;
  try { buyBody('season1', 0); } catch { threw = true; }
  check('buyBody rejects ms == 0', threw);
}

// A batch body must parse back to exactly the chips that went in — the grammar
// and its inverse cannot be allowed to drift.
{
  const chips = [
    { ms: 1_000_000, bits: BANK_MIN_BITS, nonce: 0n },
    { ms: 1_000_001, bits: MAX_BITS, nonce: 2n ** 64n - 1n },
    { ms: 1_000_002, bits: 12, nonce: 0xdeadbeefn },
  ];
  const p = parseMove(bankBatchBody(chips, 1_000_009));
  check('batch round-trips', p?.kind === 'bank');
  if (p?.kind === 'bank') {
    check('same length', p.chips.length === chips.length);
    check('same values', chips.every((c, i) =>
      p.chips[i].ms === c.ms && p.chips[i].bits === c.bits && p.chips[i].nonce === c.nonce));
  }
}

// The emitter must refuse to build what the fold would reject whole.
{
  const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ ms: 1_000_000 + i, bits: 8, nonce: BigInt(i) }));
  let threw = false;
  try { bankBatchBody(many, 1); } catch { threw = true; }
  check('refuses over MAX_BATCH', threw);

  let threwEmpty = false;
  try { bankBatchBody([], 1); } catch { threwEmpty = true; }
  check('refuses empty', threwEmpty);
}

// A full batch must stay inside the 1 KB inline-storage threshold.
{
  const full = Array.from({ length: MAX_BATCH }, (_, i) => ({ ms: 1_785_000_000_000 + i, bits: 20, nonce: 2n ** 64n - 1n }));
  const body = bankBatchBody(full, 1_785_000_000_099);
  check('full batch stays inline (<1024 bytes)', new TextEncoder().encode(body).length < 1024, new TextEncoder().encode(body).length);
}

/* ── `broke` — the descent's verb ─────────────────────────────────────── */
{
  check('brokeBody carries only the ms', brokeBody(12345) === 'broke#12345~', brokeBody(12345));
  // The anti-forgery property, from the other end: what we BUILD must be what
  // the fold will accept, and it must be impossible to build one that names a
  // band. There is no parameter to pass.
  check('what brokeBody builds parses as broke', parseMove(brokeBody(7))?.kind === 'broke');
  check('a broke that names a band does not parse', parseMove('broke 5#7~')?.kind !== 'broke');
  for (const bad of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 2]) {
    let threw = false;
    try { brokeBody(bad); } catch { threw = true; }
    check(`brokeBody rejects ${bad}`, threw);
  }
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
