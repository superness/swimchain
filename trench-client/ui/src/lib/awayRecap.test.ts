/**
 * awayRecap — executable rule spec. Run with: npx tsx src/lib/awayRecap.test.ts
 *
 * Expectations are hand-computed (arithmetic in comments), never derived by
 * re-invoking the code under test — the trenchEngine.test.ts discipline.
 */
import { foldClaim, type ReplyLike, type ClaimHeader } from './trenchEngine';
import { AWAY_MIN_MS, deriveAwayRecap } from './awayRecap';

const DAY = 86_400_000;
let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}
const r = (body: string | null, ms: number, cid: string, author = 'A'): ReplyLike => ({
  author_id: author,
  body,
  content_id: cid,
  created_at: ms,
  block_height: 10,
});
const hb = (n: number, day: number, tag = 'hb'): ReplyLike[] =>
  Array.from({ length: n }, (_, i) => r('heartbeat', day * DAY + i * 1000, `${tag}_${day}_${i}`));
const H: ClaimHeader = { v: 1, kind: 'trench-claim', name: 'home', x: 0, y: 0 };
const NONE: ReadonlySet<number> = new Set();

// ── 1) no accepted heartbeat ever -> null (fresh claim; the descent teaches) ──
{
  const s = foldClaim('c1', 'A', '', H, [r('build farm', 100 * DAY, 'b1')]);
  check('no heartbeat ever -> null', deriveAwayRecap(s, 100 * DAY + 1000, NONE) === null);
}

// ── 2) recently beating and LIT -> null ─────────────────────────────────────
// Days 100..106: 6 hb/day = 42 in the trailing week >= LIT_MIN(25) -> LIT.
// now = 12h after the last beat (< AWAY_MIN_MS) -> no recap.
{
  const replies = [100, 101, 102, 103, 104, 105, 106].flatMap((d) => hb(6, d));
  const s = foldClaim('c2', 'A', '', H, replies);
  const now = 106 * DAY + 12 * 3_600_000;
  check('sanity: 12h < AWAY_MIN_MS', 12 * 3_600_000 < AWAY_MIN_MS);
  check('recent + LIT -> null', deriveAwayRecap(s, now, NONE) === null);
}

// ── 3) away 3 days -> facts; daysAway from utcDay math ──────────────────────
// Beats: 6/day on days 100..106 (LIT), then silence; now = day 109 + 1h.
// daysAway = 109 - 106 = 3. Trailing week at 109 covers days 103..109 ->
// beat-days 103,104,105,106 = 4 days * 6 = 24 -> DIM (>= 8, < 25).
{
  const replies = [100, 101, 102, 103, 104, 105, 106].flatMap((d) => hb(6, d));
  const s = foldClaim('c3', 'A', '', H, replies);
  const now = 109 * DAY + 3_600_000;
  const f = deriveAwayRecap(s, now, NONE);
  check('away 3d -> facts', f !== null);
  check('away 3d -> daysAway 3', f?.daysAway === 3, f?.daysAway);
  check('away 3d -> hbWeek 24', f?.hbWeek === 24, f?.hbWeek);
  check('away 3d -> DIM', f?.brightness === 'DIM', f?.brightness);
}

// ── 4) DARK at login with absence < 24h -> facts (dark-login reminder) ──────
// One beat on day 100 only -> trailing week at day 100 has 1 beat < DIM_MIN(8)
// -> DARK. now = day 100 + 20h (< AWAY_MIN_MS after the beat) -> still
// triggers, daysAway 0.
{
  const s = foldClaim('c4', 'A', '', H, hb(1, 100));
  const now = 100 * DAY + 20 * 3_600_000;
  const f = deriveAwayRecap(s, now, NONE);
  check('dark login < 24h -> facts', f !== null);
  check('dark login -> daysAway 0', f?.daysAway === 0, f?.daysAway);
  check('dark login -> DARK', f?.brightness === 'DARK', f?.brightness);
}

// ── 5) damage + new-ruin detection, projected to now, respecting mourned ────
// Day 100: 6 hb + build farm (idx 0) + build beacon (idx 1). Then silence
// until now = day 109. The fold banks nothing after day 100 (lastDay = 100,
// both structures at integrity 20). project(now) banks days 101..109 (9 days):
//   brightness per banked day (trailing-7 window sees only day 100's 6 beats):
//   days 101..106 -> 6 beats < DIM_MIN(8) -> DARK; days 107..109 -> 0 -> DARK.
//   9 DARK days * DECAY_DARK(4) = 36 -> 20 - 36 <= 0 -> both ruined.
// mourned = {1} -> only idx 0 is a NEW ruin.
{
  const d = 100 * DAY;
  const replies = [...hb(6, 100), r('build farm', d + 50_000, 'bf'), r('build beacon', d + 60_000, 'bb')];
  const s = foldClaim('c5', 'A', '', H, replies);
  const now = 109 * DAY + 1000;
  const f = deriveAwayRecap(s, now, new Set([1]));
  check('ruin projection -> facts', f !== null);
  check(
    'ruin projection -> newRuins only unmourned idx 0',
    f?.newRuins.length === 1 && f?.newRuins[0].idx === 0 && f?.newRuins[0].kind === 'farm',
    f?.newRuins
  );
  check('ruin projection -> nothing alive left damaged', f?.damaged.length === 0, f?.damaged);
}

// ── 6) partial decay lands in `damaged` with projected integrity ────────────
// Day 100: 6 hb + build farm. now = day 103 + 1h -> project banks 101..103 =
// 3 DARK days (6 beats in window < 8). integrity 20 - 3*4 = 8, alive.
// daysAway = 3 -> the away trigger fires regardless of brightness.
{
  const replies = [...hb(6, 100), r('build farm', 100 * DAY + 50_000, 'bf2')];
  const s = foldClaim('c6', 'A', '', H, replies);
  const f = deriveAwayRecap(s, 103 * DAY + 3_600_000, NONE);
  check('partial decay -> damaged has farm at 8', f?.damaged.length === 1 && f?.damaged[0].integrity === 8, f?.damaged);
  check('partial decay -> damaged kind is farm', f?.damaged[0]?.kind === 'farm', f?.damaged);
  check('partial decay -> no new ruins', f?.newRuins.length === 0, f?.newRuins);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
