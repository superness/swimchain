/**
 * `broke` — the descent's fold verb, and the one permanent decision in the
 * whole feature. Everything else about the descent is client policy and can be
 * retuned forever; this is on the chain and cannot be.
 *
 * The rules it must enforce, each of which is a test below:
 *   - it takes NO ARGUMENT. The band is whatever comes next, computed by the
 *     fold from state it can see. Same precedent as `tip`, and for the same
 *     reason: char is permanent prestige, so a hostile body must not be able
 *     to name its own depth or its own payout.
 *   - SEQUENTIAL. Porcelain before table, table before floor. It is a descent.
 *   - DEEP ENOUGH. `lifetimeChips` must clear the band's floor, which the fold
 *     already knows — so a fresh table cannot claim the lava.
 *   - ONCE PER BAND, EVER. Char is awarded only on a new personal best, so a
 *     player who descends a second time re-walks the bands without minting a
 *     single extra grain. That is what keeps the supply fixed at CHAR_TOTAL.
 *   - THE LAST BAND IS A TIP. Breaking the other side resets the run and pays
 *     salt, but keeps char, the personal best, and the bowl count.
 *
 * Run: npx tsx src/lib/chipsEngine.broke.test.ts
 */
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { DEEP_BAND_COUNT, CHAR_PER_BAND, CHAR_TOTAL, deepBandFloor, DIP_TIERS, bossHp } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const OWNER = 'a'.repeat(64);
const TABLE = 'sha256:table';
const header: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: OWNER };

/** ONE monotonic clock for the whole file. The fold orders moves by their
 *  embedded authoring ms, so any helper that mints its own timestamps must
 *  share this counter — an earlier draft gave dips and `broke`s overlapping
 *  ms values and the breaks sorted ahead of the lifetime that justified them,
 *  which fails in exactly the way a real out-of-order chain would. */
let n = 0;
const nextMs = () => 1_700_000_000_000 + ++n * 1000;

const reply = (body: string, h = 1): ChipsReply => {
  const ms = nextMs();
  return {
    author_id: OWNER,
    body: /#\d+~$/.test(body) ? body : `${body}#${ms}~`,
    block_height: h, content_id: `c${n}`, created_at: ms,
  };
};
/** Enough dips to put `chips` of lifetime on the board. The bowl cap clamps
 *  crumbs, never lifetime, so this reaches any depth cleanly. */
const lifetimeOf = (chips: number): ChipsReply[] => {
  // EXACT, not approximate. An earlier version stepped in whole billions and
  // overshot by up to one, which quietly turned "one chip short of the floor"
  // into "comfortably past it" — the test then passed against an
  // implementation that had no floor check at all.
  const per = 1_000_000_000;
  const want = Math.round(chips * 1000);
  const out: ChipsReply[] = [];
  let got = 0;
  while (got + per <= want) { out.push(reply(`dip ${per}`)); got += per; }
  if (want > got) out.push(reply(`dip ${want - got}`));
  return out;
};
const fold = (rs: ChipsReply[]) => foldChips(header, TABLE, rs, new Map());

/* ── it takes no argument ─────────────────────────────────────────────── */
{
  const deep = lifetimeOf(deepBandFloor(0));
  const ok = fold([...deep, reply('broke')]);
  check('`broke` with no argument is accepted', ok.moves[ok.moves.length - 1].outcome === 'broke',
    ok.moves[ok.moves.length - 1]);
  // THE NUMBER IS A PAYMENT, NEVER A BAND — the anti-forgery property, moved
  // to where it now lives. The body carries what the chip was worth; the FOLD
  // still takes the band from `state.broken` alone. If this ever regresses, a
  // fresh table could claim the lava and mint 13 char for it.
  const named = fold([...deep, reply('broke 5')]);
  check('a body naming "5" still breaks band 0, not band 5', named.broken === 1, named.broken);
  check('...and mints only band 0 char', named.char === CHAR_PER_BAND[0], named.char);

  // THE CHIP IS SPENT. A break must credit nothing — not crumbs, not lifetime.
  // Banking the winning chip as well is what carried a live player past five
  // unfought bands in one move (2026-07-29).
  const before = fold(deep);
  const after = fold([...deep, reply('broke 4826726400')]);
  check('a break pays no crumbs', after.crumbs === before.crumbs,
    { before: before.crumbs, after: after.crumbs });
  check('a break adds no lifetime', after.lifetimeChips === before.lifetimeChips,
    { before: before.lifetimeChips, after: after.lifetimeChips });
  check('but the cost is recorded', after.paidToBosses === 4826726400, after.paidToBosses);
}

/* ── deep enough ──────────────────────────────────────────────────────── */
{
  const shallow = fold([reply('dip 1000#1~'), reply('broke')]);
  check('a shallow table cannot break anything',
    shallow.moves[shallow.moves.length - 1].outcome === 'rejected-shallow');
  check('and earns no char for trying', shallow.char === 0, shallow.char);

  // One chip short of the floor is still short.
  const nearly = fold([...lifetimeOf(deepBandFloor(0) - 2000), reply('broke')]);
  check('just under the floor is refused',
    nearly.moves[nearly.moves.length - 1].outcome === 'rejected-shallow', nearly.broken);
}

/**
 * Deep enough for every band, and the blows that actually kill each one.
 *
 * Bands 1+ have HEALTH now ("chipping away at the table"), so a bare `broke`
 * only chips them. Band 0 is exempt and still settles in one blow, which is why
 * the first reply is bare and the rest are paid to full HP.
 */
const LIFE_ALL = deepBandFloor(DEEP_BAND_COUNT - 1);
const richFor = (life: number) => lifetimeOf(life);
const killAll = (life: number, bands = DEEP_BAND_COUNT) => [
  reply('broke'),
  ...Array.from({ length: bands - 1 }, (_, i) => reply(`broke ${bossHp(i + 1, life)}`)),
];

/* ── sequential, and once per band ────────────────────────────────────── */
{
  // Deep enough for EVERY band at once. Sequencing must still hold: six kills
  // take you through six bands, not six times the last one.
  //
  // Bands 1+ now have HEALTH ("chipping away at the table"), so each needs a
  // blow big enough to finish it — a bare `broke` carries no amount and would
  // only chip. Band 0 is exempt and still settles in one blow, which is why the
  // first reply here is bare and the rest are paid.
  const six = fold([...richFor(LIFE_ALL), ...killAll(LIFE_ALL)]);
  check('six breaks walk six bands in order', six.deepest === DEEP_BAND_COUNT, six.deepest);
  check('and pay every grain of char exactly once', six.char === CHAR_TOTAL, six.char);
  check('char rises with depth', CHAR_PER_BAND[5] > CHAR_PER_BAND[0]);

  // The seventh has nowhere to go: the last band is a tip, so the run reset
  // and there is not enough lifetime to start again.
  const seventh = fold([...richFor(LIFE_ALL), ...killAll(LIFE_ALL), reply(`broke ${bossHp(0, LIFE_ALL)}`)]);
  const last = seventh.moves[seventh.moves.length - 1].outcome;
  check('a break past the descent is refused', last !== 'broke', last);
  check('and cannot mint a grain beyond the fixed supply', seventh.char === CHAR_TOTAL, seventh.char);
}

/* ── the last band is a tip ───────────────────────────────────────────── */
{
  const through = fold([...richFor(LIFE_ALL), reply('buy season1'),
    ...killAll(LIFE_ALL)]);
  check('coming up through a bowl counts it', through.bowls === 1, through.bowls);
  check('the run resets — lifetime is zero again', through.lifetimeChips === 0, through.lifetimeChips);
  check('...and the jars are gone', through.owned.size === 0, [...through.owned]);
  check('...and this bowl\'s descent starts over', through.broken === 0, through.broken);
  check('but CHAR survives it', through.char === CHAR_TOTAL, through.char);
  check('and so does the personal best', through.deepest === DEEP_BAND_COUNT, through.deepest);
  check('and it pays salt like the tip it is', through.oldSalt > 0, through.oldSalt);
}

/* ── ONCE PER BAND, EVER — the property that fixes the supply ─────────── */
{
  const rich = lifetimeOf(deepBandFloor(DEEP_BAND_COUNT - 1));
  const firstDescent = [...richFor(LIFE_ALL), ...killAll(LIFE_ALL)];
  // Second descent: earn the lifetime again and re-walk every band.
  const second = fold([...firstDescent, ...lifetimeOf(deepBandFloor(DEEP_BAND_COUNT - 1)),
    ...killAll(LIFE_ALL)]);
  check('a second descent walks the bands again', second.bowls === 2, second.bowls);
  check('AND MINTS NO NEW CHAR — once per band, ever', second.char === CHAR_TOTAL, second.char);
  check('the supply is fixed at CHAR_TOTAL forever', CHAR_TOTAL === 32, CHAR_TOTAL);
}

/* ── an ordinary tip resets the descent but not the prestige ──────────── */
{
  // Band 0 in one blow, then band 1 killed properly — a bare `broke` would only
  // chip it now that bands 1+ have health.
  const tipped = fold([
    ...richFor(LIFE_ALL),
    reply('broke'),
    reply(`broke ${bossHp(1, LIFE_ALL)}`),
    reply('tip'),
  ]);
  check('a tip clears this bowl\'s descent progress', tipped.broken === 0, tipped.broken);
  check('but not the personal best', tipped.deepest === 2, tipped.deepest);
  check('and not the char', tipped.char === CHAR_PER_BAND[0] + CHAR_PER_BAND[1], tipped.char);
}

/* ── only the owner ───────────────────────────────────────────────────── */
{
  const rich = lifetimeOf(deepBandFloor(0));
  const stranger: ChipsReply = { ...reply('broke'), author_id: 'b'.repeat(64) };
  const st = fold([...richFor(LIFE_ALL), stranger]);
  check('a stranger cannot break a band on your table', st.broken === 0 && st.char === 0,
    { broken: st.broken, char: st.char });
}

/* ── the floors themselves ────────────────────────────────────────────── */
{
  const last = DIP_TIERS[DIP_TIERS.length - 1].minLifetime;
  check('band 0 is one doubling past the deepest dip', deepBandFloor(0) === last * 2);
  check('each band doubles the one above', deepBandFloor(3) === deepBandFloor(2) * 2);
  check('there are six of them', DEEP_BAND_COUNT === 6 && CHAR_PER_BAND.length === 6);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
