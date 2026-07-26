/**
 * The batch grammar, and the v1 form that must outlive it.
 * Run: npx tsx src/lib/chipsParse.test.ts
 */
import { parseMove } from './chipsEngine';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) v1 single form still parses — as a one-entry batch, with the chip's ms
//    taken from the authoring-ms, which is what it has always meant.
{
  const p = parseMove('bank 12 ff#1000~');
  check('v1 parses', p?.kind === 'bank');
  if (p?.kind === 'bank') {
    check('v1 is one entry', p.chips.length === 1, p.chips.length);
    check('v1 bits', p.chips[0].bits === 12);
    check('v1 nonce', p.chips[0].nonce === 0xffn);
    check('v1 chip ms is the authoring ms', p.chips[0].ms === 1000);
  }
}

// 2) Batch form.
{
  const p = parseMove('bank 1000:12:ff,1001:9:a3#1002~');
  check('batch parses', p?.kind === 'bank');
  if (p?.kind === 'bank') {
    check('two entries', p.chips.length === 2, p.chips.length);
    check('entry 0', p.chips[0].ms === 1000 && p.chips[0].bits === 12 && p.chips[0].nonce === 0xffn);
    check('entry 1', p.chips[1].ms === 1001 && p.chips[1].bits === 9 && p.chips[1].nonce === 0xa3n);
    check('authoring ms is separate', p.ms === 1002);
  }
}

// 3) Exactly MAX_BATCH is allowed; one more is oversize and is NOT parsed
//    into entries — the fold must be able to reject it without hashing.
{
  const mk = (n: number) => 'bank ' + Array.from({ length: n }, (_, i) => `${2000 + i}:8:${(i + 1).toString(16)}`).join(',') + '#9~';
  const at = parseMove(mk(MAX_BATCH));
  check('MAX_BATCH entries parse', at?.kind === 'bank' && at.chips.length === MAX_BATCH);

  const over = parseMove(mk(MAX_BATCH + 1));
  check('over cap is oversize', over?.kind === 'oversize', over?.kind);
  if (over?.kind === 'oversize') check('oversize reports its count', over.count === MAX_BATCH + 1, over.count);
}

// 4) Malformed input yields null, never a partial batch.
{
  check('no authoring ms', parseMove('bank 1000:12:ff') === null);
  check('non-hex nonce', parseMove('bank 1000:12:zz#9~') === null);
  check('missing field', parseMove('bank 1000:12#9~') === null);
  check('trailing comma', parseMove('bank 1000:12:ff,#9~') === null);
  check('empty batch', parseMove('bank #9~') === null);
  check('bits over MAX_BITS', parseMove('bank 1000:99:ff#9~') === null);
}

// 5) buy is untouched.
{
  const p = parseMove('buy season1#9~');
  check('buy parses', p?.kind === 'buy' && p.key === 'season1');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
