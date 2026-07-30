/**
 * A report must survive being posted. The failure this prevents is specific: on
 * 2026-07-29 a 12,048-byte report was cut mid-array and the parts that recorded
 * what the client DID were the parts lost.
 *
 * Run: npx tsx src/lib/reportChunk.test.ts
 */
import { chunkReport } from './reportChunk';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) THE INVARIANT THAT MATTERS: nothing is lost. Rejoining the parts must give
//    back the input byte for byte, or the report is still being truncated —
//    just less obviously, which is worse.
{
  const text = Array.from({ length: 400 }, (_, i) => `  "line": ${i},`).join('\n');
  const parts = chunkReport(text, 1000);
  check('a long report is split', parts.length > 1, parts.length);
  check('and rejoins EXACTLY — nothing lost, nothing added', parts.join('') === text,
    { in: text.length, out: parts.join('').length });
  check('every part is within the limit', parts.every((p) => p.length <= 1000),
    parts.map((p) => p.length));
}

// 2) A short report stays ONE post, or every report gets a "(1/1)" title and
//    the common case gets uglier for nothing.
{
  const parts = chunkReport('small report', 1000);
  check('a short report is a single part', parts.length === 1 && parts[0] === 'small report');
  check('exactly-at-the-limit is still one part', chunkReport('x'.repeat(1000), 1000).length === 1);
  check('one over the limit splits', chunkReport('x'.repeat(1001), 1000).length === 2);
}

// 3) SPLIT ON LINES. A part that ends mid-token is unreadable alone, and the
//    parts arrive as separate posts that may be read out of order.
{
  const text = 'aaaa\nbbbb\ncccc\ndddd\n';
  const parts = chunkReport(text, 10);
  check('parts end on newlines', parts.slice(0, -1).every((p) => p.endsWith('\n')), parts);
  check('and still rejoin exactly', parts.join('') === text);
}

// 4) A SINGLE OVERLONG LINE. A giant user agent or one enormous error string
//    must be hard-split — the alternative is a part over the limit that fails to
//    post, which is the exact failure this module exists to prevent.
{
  const text = `short\n${'y'.repeat(2500)}\nshort`;
  const parts = chunkReport(text, 1000);
  check('an unsplittable line is hard-split', parts.every((p) => p.length <= 1000),
    parts.map((p) => p.length));
  check('and nothing is lost doing it', parts.join('') === text);
}

// 5) DEGENERATE INPUTS. This runs while filing a bug report, i.e. when things
//    are already wrong; it may not throw and may not silently produce nothing.
{
  let threw = false;
  let out: string[] = [];
  try {
    check('empty text yields one empty part', chunkReport('', 100).length === 1);
    check('a zero limit does not loop forever', chunkReport('abc', 0).join('') === 'abc');
    check('a negative limit does not either', chunkReport('abc', -5).join('') === 'abc');
    out = chunkReport('\n\n\n\n', 2);
  } catch { threw = true; }
  check('newlines-only does not throw', !threw);
  check('and still rejoins', out.join('') === '\n\n\n\n', out);
  check('never returns an empty set', chunkReport('', 10).length > 0);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
