/**
 * The bowl, the dip it sits in, and the shelf above it.
 *
 * Two rules this file exists to obey:
 *   1. THE DIP IS THE BED OF THE SCENE. It is not a badge or a label — it is
 *      the surface everything else rests on, full-bleed, and it changes
 *      completely when the tier does. That is the reward ladder made physical.
 *   2. SOGGINESS IS VISIBLE BEFORE IT IS LEGIBLE. The pile slumps, the crumbs
 *      round off and go dull, a wet sheen creeps over them, and the whole heap
 *      loses its edges — all of that before you read a single number.
 */
import { useMemo } from 'react';
import type { ChipsState } from './lib/chipsEngine';
import { projectedCrumbs, soggyLook } from './lib/sogProjection';
import { DIP_TIERS, UPGRADES, UPGRADE_CHAINS, type Upgrade } from './lib/chipsConst';
import { compact, sinceLabel } from './lib/format';
import { canAffordBuy } from './lib/chipsAfford';

function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ── the dip ─────────────────────────────────────────────────────────────── */

/**
 * Full-bleed dip. Every tier is a different SURFACE, not a different accent
 * colour: salsa is chunky and matte, guacamole is dense and flecked, queso
 * simmers, seven-layer is banded strata, buffalo glows, fondue swirls, and the
 * abyss is barely food any more. The look is carried by CSS keyed on
 * `data-dip`; these spans are the material it needs to work with.
 */
export function DipBed({ dipIndex }: { dipIndex: number }) {
  const tier = DIP_TIERS[Math.max(0, Math.min(DIP_TIERS.length - 1, dipIndex))];
  const blobs = useMemo(() => {
    const rnd = seeded(0x1f2e3d ^ dipIndex);
    return Array.from({ length: 46 }, () => ({
      x: rnd() * 100, y: 10 + rnd() * 95,
      s: 1.4 + rnd() * 5.4, d: rnd() * 14, r: rnd() * 360,
    }));
  }, [dipIndex]);

  return (
    <div className="dip" data-dip={tier.key} aria-hidden="true">
      <div className="dip-base" />
      <div className="dip-strata" />
      <div className="dip-swirl" />
      <div className="dip-chunks">
        {blobs.map((b, i) => (
          <span
            key={i}
            style={{
              left: `${b.x}%`, top: `${b.y}%`,
              width: `${b.s}vmin`, height: `${b.s * 0.72}vmin`,
              animationDelay: `${b.d}s`,
              transform: `rotate(${b.r}deg)`,
            }}
          />
        ))}
      </div>
      <div className="dip-sheen" />
    </div>
  );
}

/** The tier-up ceremony: the new dip floods the screen and names itself. */
export function DipChange({ dipIndex }: { dipIndex: number }) {
  const tier = DIP_TIERS[Math.max(0, Math.min(DIP_TIERS.length - 1, dipIndex))];
  return (
    <div className="dip-change" data-dip={tier.key} role="status">
      <div className="flood" />
      <div className="proclaim">
        <span className="small">the bowl is filled with</span>
        <strong>{tier.label}</strong>
      </div>
    </div>
  );
}

/* ── the bowl ────────────────────────────────────────────────────────────── */

interface Crumb { x: number; y: number; s: number; rot: number; shade: number }

function pileOf(count: number, height: number, seed: number): Crumb[] {
  const rnd = seeded(seed);
  const out: Crumb[] = [];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const ceiling = height * (1 - u * u * 0.86);
    const y = rnd() * ceiling;
    out.push({ x: u, y, s: 0.72 + rnd() * 0.6, rot: rnd() * 360, shade: rnd() });
  }
  // Back of the heap first, so the front crumbs overlap correctly.
  return out.sort((a, b) => b.y - a.y);
}

export interface BowlProps {
  state: ChipsState;
  nowMs: number;
  /** True while some bank's Argon2id proof is still unchecked — the number
   *  below is INCOMPLETE and must not be shown as if it were the truth. */
  counting: boolean;
  countProgress: { done: number; total: number } | null;
}

export function Bowl({ state, nowMs, counting, countProgress }: BowlProps) {
  const crumbs = projectedCrumbs(state, nowMs);
  const soggy = soggyLook(state, nowMs);
  const fill = state.bowlCap > 0 ? Math.max(0, Math.min(1, crumbs / state.bowlCap)) : 0;
  // A heap's height goes as the square root of its area — the physically right
  // curve, and it also keeps the first few chips visible instead of invisible.
  const height = Math.sqrt(fill) * (1 - 0.28 * soggy);
  const atRim = crumbs >= state.bowlCap && crumbs > 0;

  const count = crumbs <= 0 ? 0 : Math.max(5, Math.round(fill ** 0.5 * 84));
  const pile = useMemo(() => pileOf(count, height, 0x9e37 ^ count), [count, height]);

  const tier = DIP_TIERS[Math.max(0, Math.min(DIP_TIERS.length - 1, state.dipIndex))];
  const sat = 78 - 46 * soggy;
  const lum = 56 - 14 * soggy;
  const hue = 38 - 8 * soggy;

  return (
    <section className={`bowl-wrap${counting ? ' counting' : ''}`} aria-label="your bowl">
      <svg className="bowl" viewBox="0 0 220 150" role="img"
        aria-label={counting ? 'counting the crumbs' : `${compact(crumbs)} crumbs in the bowl`}>
        <defs>
          {/* the cavity. Opaque and warm, not a black wash: you are looking
              INTO a bowl under a hood light, and a translucent overlay just
              greys the stoneware out and makes the whole thing read as glass. */}
          <radialGradient id="bowl-inner" cx="50%" cy="6%" r="98%">
            <stop offset="0%" stopColor="#241a11" />
            <stop offset="58%" stopColor="#3a2a1a" />
            <stop offset="100%" stopColor="#63492b" />
          </radialGradient>
          {/* warm stoneware, not glass — a snack bowl on a counter under a
              hood light, lit from above and falling into shadow at the foot */}
          <linearGradient id="bowl-glaze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f2e6cf" />
            <stop offset="34%" stopColor="#cbb695" />
            <stop offset="72%" stopColor="#7d6949" />
            <stop offset="100%" stopColor="#3b2f20" />
          </linearGradient>
          <clipPath id="bowl-clip">
            <path d="M23 44 Q23 122 110 128 Q197 122 197 44 Z" />
          </clipPath>
          <radialGradient id="wet" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* the vessel */}
        <path className="bowl-body" d="M14 40 Q14 134 110 142 Q206 134 206 40 Z" fill="url(#bowl-glaze)" />
        <path d="M23 44 Q23 122 110 128 Q197 122 197 44 Z" fill="url(#bowl-inner)" />

        <g clipPath="url(#bowl-clip)">
          {/* the dip pooled in the bottom — same tier as the bed it sits on */}
          <ellipse className={`bowl-dip dip-${tier.key}`} cx="110" cy="140" rx="94" ry="34" />

          {/* the heap */}
          <g className="heap" style={{ ['--soggy' as string]: soggy.toFixed(3) }}>
            {pile.map((c, i) => (
              <g key={i} transform={`translate(${110 + c.x * 82} ${126 - c.y * 96}) rotate(${c.rot}) scale(${c.s})`}>
                <path
                  d="M0 -6.4 L5.7 4 L-5.7 4 Z"
                  fill={`hsl(${hue + c.shade * 8} ${sat}% ${lum + c.shade * 12}%)`}
                  // Sog rounds the corners off: a soft crumb has no edges left.
                  // A round-joined stroke that fattens with `soggy` does exactly
                  // that to a triangle — sharp points swell into soft lobes.
                  stroke={`hsl(${hue - 4} ${sat}% ${Math.max(16, lum - 12 + soggy * 10)}%)`}
                  strokeWidth={0.7 + soggy * 3.1}
                  strokeLinejoin="round"
                />
              </g>
            ))}
          </g>

          {/* the sheen of a bowl that has been sitting out */}
          {soggy > 0.02 && (
            <ellipse className="wet-sheen" cx="110" cy={126 - height * 96 + 12}
              rx={78} ry={26} fill="url(#wet)" opacity={Math.min(0.85, soggy)} />
          )}
        </g>

        {/* the lit foot of the vessel — without it the cavity swallows the
            whole silhouette and the bowl reads as a glass fishbowl */}
        <path className="bowl-foot" d="M14 92 Q30 138 110 142 Q190 138 206 92 Q190 128 110 132 Q30 128 14 92 Z" />

        {/* rim last, so crumbs sit inside it */}
        <ellipse className="bowl-rim" cx="110" cy="40" rx="96" ry="20" />
        {atRim && (
          <g className="spill" aria-hidden="true">
            <path d="M186 34 L192 44 L180 44 Z" />
            <path d="M40 30 L46 40 L34 40 Z" />
          </g>
        )}
      </svg>

      <div className="bowl-read">
        {counting ? (
          <p className="checking">
            still counting the crumbs
            {countProgress && countProgress.total > 0 && (
              <em> — {countProgress.done} of {countProgress.total} chips checked</em>
            )}
          </p>
        ) : (
          <>
            <p className="crumbs bowl-crumbs"><strong>{compact(crumbs)}</strong> crumbs</p>
            <p className="sub">
              {atRim
                ? 'at the rim — anything more goes on the floor'
                : soggy > 0.66
                  ? `gone soft — last touched ${sinceLabel(nowMs - state.lastConfirmedAt)}`
                  : soggy > 0.25
                    ? 'starting to go soft'
                    : state.lastConfirmedAt > 0 ? 'still crisp' : 'a fresh bowl'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* ── what did I just get ─────────────────────────────────────────────────── */

/**
 * One newly-banked chip's actual credit, ready to float up from the counter.
 * `App.tsx` builds these from `chipsPayoutDisplay.ts`'s `actualGains` — never
 * from the raw payout — so a full bowl announces "+0" rather than a number
 * the counter did not move for.
 */
export interface GainFloat {
  /** The chip's own `ms` — stable across its pending -> confirmed transition,
   *  which is what lets `App.tsx` key React's list reconciliation on it. */
  key: number;
  text: string;
  golden: boolean;
  /** The bowl was already at the rim: this chip's crispness earned nothing.
   *  Styled distinctly so "+0" reads as the honest truth, not a stall. */
  empty: boolean;
  x: number; y: number;
  dx: number;
  delay: number;
}

/**
 * The gain a bank just credited, rising from the crumb counter and fading —
 * the other half of the crumb burst that already flies there (Kitchen.tsx's
 * `DipFlight`): that answers "what did the chip become", this answers "what
 * did I get". `aria-hidden` throughout, same as the crumb burst it accompanies
 * — the bowl's own crumb count (announced via its `aria-label`) is the
 * accessible source of truth; this is a flourish layered on top of it, never
 * a substitute for it.
 */
export function GainFloats({ floats }: { floats: GainFloat[] }) {
  return (
    <>
      {floats.map((f) => (
        <span
          key={f.key}
          className={`gain-float${f.golden ? ' golden' : ''}${f.empty ? ' empty' : ''}`}
          aria-hidden="true"
          style={{
            '--gx': `${f.x}px`, '--gy': `${f.y}px`, '--gdx': `${f.dx}px`,
            animationDelay: `${f.delay}s`,
          } as React.CSSProperties}
        >
          {f.text}
        </span>
      ))}
    </>
  );
}

/* ── the shelf ───────────────────────────────────────────────────────────── */

/**
 * Only the NEXT jar in each chain is on the shelf — the ones behind it are in
 * the back room, and the fold would reject them as `rejected-order` anyway.
 * Owned jars stay visible but spent, so the shelf reads as a history of what
 * this kitchen has become.
 */
function shelfItems(owned: Set<string>): { open: Upgrade[]; got: Upgrade[] } {
  const chained = new Set(UPGRADE_CHAINS.flat());
  const open: Upgrade[] = [];
  const got: Upgrade[] = [];
  for (const chain of UPGRADE_CHAINS) {
    const next = chain.find((k) => !owned.has(k));
    if (next) open.push(UPGRADES[next]);
  }
  for (const key of Object.keys(UPGRADES)) {
    if (chained.has(key)) continue;
    if (!owned.has(key)) open.push(UPGRADES[key]);
  }
  for (const key of Object.keys(UPGRADES)) if (owned.has(key)) got.push(UPGRADES[key]);
  open.sort((a, b) => a.cost - b.cost);
  return { open, got };
}

const FLAVOUR: Record<string, string> = {
  season1: 'a heavier hand with the shaker',
  season2: 'the good stuff, from the back',
  season3: 'a blend nobody will give you the recipe for',
  season4: 'you stopped measuring years ago',
  season5: 'the shaker is a legend in three counties',
  airtight: 'a lid that actually seals. it lasts.',
  bowl1: 'a bigger bowl. obviously.',
  bowl2: 'less a bowl, more a basin',
  bowl3: 'you had to widen a doorway',
  fryer2: 'a second basket in the oil',
  fryer3: 'a third. the extractor complains.',
  fryer4: 'four baskets. the fire marshal has been.',
  detector: 'you can spot a golden one a beat sooner',
};

export interface ShelfProps {
  state: ChipsState;
  crumbsNow: number;
  /** Cost of queued buys `crumbsNow` does not yet reflect — see
   *  chipsAfford.ts. Almost always 0; passed through rather than assumed so
   *  this stays the SAME predicate `onBuy`'s guard evaluates. */
  committed: number;
  onBuy: (key: string) => void;
}

export function Shelf({ state, crumbsNow, committed, onBuy }: ShelfProps) {
  const { open, got } = useMemo(() => shelfItems(state.owned), [state.owned]);
  return (
    <section className="shelf" aria-label="the shelf">
      <ul className="jars">
        {open.map((u) => {
          const afford = canAffordBuy(crumbsNow, committed, u.cost);
          return (
            <li key={u.key}>
              <button
                type="button"
                className={`jar${afford ? ' afford' : ' dear'}`}
                disabled={!afford}
                onClick={() => onBuy(u.key)}
                title={FLAVOUR[u.key] ?? u.label}
              >
                <span className="jar-glass" aria-hidden="true"><i /></span>
                <span className="jar-name">{u.label}</span>
                <span className="jar-cost">{compact(u.cost)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {got.length > 0 && (
        <p className="got" aria-label="already on the shelf">
          {got.map((u) => <span key={u.key} className="got-jar">{u.label}</span>)}
        </p>
      )}
    </section>
  );
}
