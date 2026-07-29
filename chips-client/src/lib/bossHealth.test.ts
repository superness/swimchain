/**
 * CHIPPING AWAY AT THE TABLE — bands 1+ have health.
 *
 * Every chip fed does its worth in damage; the band gives only when the total
 * lands, so a fight can span sessions. The Porcelain rewards one enormous swing;
 * The Table makes you keep coming back.
 *
 * Two operator rulings are load-bearing and both are pinned here:
 *   - "leave porcelein alone" — band 0 still settles in ONE blow. This is also
 *     what makes the change safe: the single `broke` on mainnet is the legacy
 *     bare form carrying NO amount, so under HP rules it would deal zero damage
 *     and silently un-break a real player's band, taking their char and their
 *     ability with it.
 *   - "does damage survive a tip? no" — the fight belongs to the bowl.
 *
 * Run: npx tsx src/lib/bossHealth.test.ts
 */
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { bossHp, deepBandFloor, DEEP_BAND_COUNT, CRUMBS_PER_CHIP, FIRST_HP_BAND } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = 'a'.repeat(64);
const HEADER = { v: 1, kind: 'chips-table', name: 't', owner: ME } as ChipsHeader;
let n = 0;
const reply = (body: string): ChipsReply => ({
  content_id: `c${++n}`, author_id: ME, body: `${body}#${1700000000000 + n * 1000}~`,
  created_at: 1700000000000 + n * 1000, block_height: 1,
} as ChipsReply);
const fold = (rs: ChipsReply[]) => foldChips(HEADER, 'T', rs, new Map());
const last = (s: ReturnType<typeof fold>) => s.moves[s.moves.length - 1];

/** Deep enough for band 1, with band 0 already behind you. */
const LIFE = deepBandFloor(1);
const past0 = () => [reply(`dip ${LIFE * CRUMBS_PER_CHIP}`), reply('broke')];

/* ── 1. THE PORCELAIN IS UNTOUCHED — and the legacy reply still kills ──── */
{
  const st = fold(past0());
  check('a bare legacy `broke` still takes band 0 in one blow', st.broken === 1, st.broken);
  check('and it still mints its char', st.char > 0, st.char);
  // THE REGRESSION THAT WOULD HAVE EATEN A REAL SAVE: if band 0 were HP-based,
  // this bare reply would deal 0 damage and leave `broken` at 0.
  check('band 0 never reads as a chip', last(st).outcome === 'broke', last(st));
}

/* ── 2. BANDS 1+ TAKE MORE THAN ONE BLOW ───────────────────────────────── */
{
  const hp = bossHp(1, LIFE);
  check('band 1 has real health', hp > 0, hp);

  const oneTap = fold([...past0(), reply('broke 1')]);
  check('a single crumb does not fell the table', oneTap.broken === 1, oneTap.broken);
  check('...it CHIPS it, and says so', last(oneTap).outcome === 'chipped', last(oneTap));
  check('and the damage is remembered', oneTap.bossDamage === 1, oneTap.bossDamage);

  const half = fold([...past0(), reply(`broke ${Math.floor(hp / 2)}`)]);
  check('half its health still leaves it standing', half.broken === 1, half.broken);

  const twoBlows = fold([
    ...past0(),
    reply(`broke ${Math.floor(hp / 2)}`),
    reply(`broke ${hp - Math.floor(hp / 2)}`),
  ]);
  check('two blows totalling its health DO fell it', twoBlows.broken === 2, twoBlows.broken);
  check('and the damage resets for what is under it', twoBlows.bossDamage === 0, twoBlows.bossDamage);
}

/* ── 3. A BARE BROKE CANNOT FELL AN HP BAND ────────────────────────────── */
{
  // The legacy form carries no amount. It must not be a free kill on the new
  // bands — that would make every old client an instant-win button.
  const bare = fold([...past0(), reply('broke'), reply('broke'), reply('broke')]);
  check('bare replies cannot chip past band 1', bare.broken === 1, bare.broken);
  check('and deal no damage at all', bare.bossDamage === 0, bare.bossDamage);
}

/* ── 4. DAMAGE BELONGS TO THE BOWL ─────────────────────────────────────── */
{
  const hp = bossHp(1, LIFE);
  const tipped = fold([
    ...past0(),
    reply(`broke ${Math.floor(hp / 2)}`),   // wound it
    reply('tip'),
  ]);
  check('a tip clears the damage', tipped.bossDamage === 0, tipped.bossDamage);
  check('...and the descent with it', tipped.broken === 0, tipped.broken);
  check('but char survives, as prestige', tipped.char > 0, tipped.char);
}

/* ── 5. HEALTH RISES WITH DEPTH ────────────────────────────────────────── */
{
  const hps = Array.from({ length: DEEP_BAND_COUNT }, (_, b) => bossHp(b, LIFE));
  const deep = hps.slice(FIRST_HP_BAND);
  check('each band is tougher than the last',
    deep.every((v, i) => i === 0 || v > deep[i - 1]), deep);
  check('and HP scales with what you have banked',
    bossHp(1, LIFE * 2) > bossHp(1, LIFE),
    { atLife: bossHp(1, LIFE), atDouble: bossHp(1, LIFE * 2) });
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
