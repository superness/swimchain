/**
 * The dip tunnel — the whole room is inside it — plus the shelf.
 *
 * The dip ladder is VERTICAL and the viewport is IN the shaft. The strata are
 * the full-width background (`TunnelBed`): every tier is a layer of an endless
 * seven-layer dip (it keeps going and going — see lib/tunnelDepth.ts), the
 * already-dug hollow is darkened above, the undug dip is solid below, and the
 * floor between them is pinned at 76vh so the world scrolls up as you dig.
 * Dark cut walls frame the viewport as foreground sidebars; the fryers, the
 * counter and the boards float in the shaft between the two.
 *
 * Three rules this file exists to obey:
 *   1. DEPTH IS THE REWARD LADDER MADE PHYSICAL. The layer you are in is the
 *      one filling the screen; the next one is literally visible under the
 *      floor as you approach it, and the hollow above is the history you dug.
 *   2. THE FOLD DECIDES THE LAYER. `state.dipIndex` places the front;
 *      tunnelDepth only draws it (see its header for why it never re-derives).
 *   3. SOGGINESS IS VISIBLE BEFORE IT IS LEGIBLE. The pile at the dig floor
 *      (`DigFront`) slumps, dulls and wet-sheens exactly as the bowl's heap
 *      did — that language survives the vessel change untouched.
 */
import { useMemo } from 'react';
import type { ChipsState } from './lib/chipsEngine';
import { projectedCrumbs, soggyLook } from './lib/sogProjection';
import { tunnelDepth, bandsAround, type TunnelBand } from './lib/tunnelDepth';
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

/* ── the dip (doorway screens only) ──────────────────────────────────────── */

/**
 * Full-bleed dip, used by the pre-game doorway screens — outside the shop you
 * are still at the surface, looking at the dip itself rather than standing in
 * the shaft. In the shop the bed of the scene is `TunnelBed` below.
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

/** The tier-up ceremony: the new layer floods the screen and names itself. */
export function DipChange({ dipIndex }: { dipIndex: number }) {
  const tier = DIP_TIERS[Math.max(0, Math.min(DIP_TIERS.length - 1, dipIndex))];
  return (
    <div className="dip-change" data-dip={tier.key} role="status">
      <div className="flood" />
      <div className="proclaim">
        <span className="small">you break through into</span>
        <strong>{tier.label}</strong>
      </div>
    </div>
  );
}

/* ── the tunnel bed: the strata the whole room lives in ──────────────────── */

/**
 * One stratum, full viewport width. `dug` is how much of its height the dig
 * has hollowed: 1 for layers already passed, the front's own frac for the
 * current one, 0 below. The hollow overlay (and the chips wedged in the cut
 * face) lives INSIDE the band, so it scrolls with the strata and clips itself
 * for free — nothing else needs to know where the floor is.
 */
function Stratum({ band, dug }: { band: TunnelBand; dug: number }) {
  const chunks = useMemo(() => {
    const rnd = seeded(0x517cc1 ^ Math.imul(band.ordinal, 2654435761));
    return Array.from({ length: 14 }, () => ({
      x: rnd() * 100, y: 6 + rnd() * 88,
      w: 1.2 + rnd() * 3.4, r: rnd() * 360, d: rnd() * 14,
    }));
  }, [band.ordinal]);

  // The chips piling up in the tunnel: every hollowed band keeps a scatter of
  // them wedged in the cut face — the history of the dig, all around you.
  const wallChips = useMemo(() => {
    const rnd = seeded(0x2ab7de ^ Math.imul(band.ordinal, 40503));
    return Array.from({ length: 12 }, () => ({
      x: 3 + rnd() * 92,
      y: 4 + rnd() * 90,
      s: 10 + rnd() * 14, r: rnd() * 360, shade: rnd(),
    }));
  }, [band.ordinal]);

  return (
    <div
      className={`t-band${band.beyond ? ' beyond' : ''}`}
      data-dip={band.key}
      style={{ ['--ord' as string]: band.ordinal }}
    >
      <div className="t-fill" />
      <div className="t-chunks">
        {chunks.map((c, i) => (
          <span key={i} style={{
            left: `${c.x}%`, top: `${c.y}%`,
            width: `${c.w}vmin`, height: `${c.w * 0.72}vmin`,
            transform: `rotate(${c.r}deg)`, animationDelay: `${c.d}s`,
          }} />
        ))}
      </div>
      <span className="t-name">{band.label}</span>
      {dug > 0 && (
        <div className="t-dug" style={{ height: `${(dug * 100).toFixed(2)}%` }}>
          {wallChips.map((c, i) => (
            <i key={i} className="t-chip" style={{
              left: `${c.x}%`, top: `${c.y}%`,
              width: `${c.s}px`, height: `${c.s}px`,
              transform: `rotate(${c.r}deg)`,
              ['--shade' as string]: c.shade.toFixed(2),
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Debris wedged into the foreground cut walls — seeded once, never moves. */
function wallDebris(seed: number): { y: number; x: number; s: number; r: number }[] {
  const rnd = seeded(seed);
  return Array.from({ length: 9 }, () => ({
    y: 3 + rnd() * 92, x: rnd() * 60, s: 8 + rnd() * 12, r: rnd() * 360,
  }));
}

/**
 * The full-viewport bed of the shop: strata behind everything, cut walls in
 * front of everything (pointer-events: none, so they frame without blocking).
 * `state` is null for the handful of frames before the first fold — that
 * renders the surface (depth 0), which is also the truth.
 */
export function TunnelBed({ state }: { state: ChipsState | null }) {
  const { layer, frac, depth } = tunnelDepth(state?.dipIndex ?? 0, state?.lifetimeChips ?? 0);
  const bands = bandsAround(depth, 2, 3);
  const left = useMemo(() => wallDebris(0x77aa11), []);
  const right = useMemo(() => wallDebris(0x33cc55), []);

  return (
    <>
      <div className="t-bed" aria-hidden="true">
        <div className="t-sky" />
        {/* The scroll position is an inline `top` on the STACK, not a CSS var
            the bands each consume: a change to a custom property does not
            reliably retrigger/interpolate a transition on a property that
            reads it through calc() (measured: the bands snapped late instead
            of gliding), while a direct inline `top` change transitions every
            time. `--floor`/`--bh` are static per viewport (media queries set
            them), so they never change mid-transition — only the depth number
            React writes here does. */}
        <div
          className="t-stack"
          style={{ top: `calc(var(--floor) - ${depth.toFixed(4)} * var(--bh))` }}
        >
          {bands.map((b) => (
            <Stratum
              key={b.ordinal}
              band={b}
              dug={b.ordinal < layer ? 1 : b.ordinal === layer ? frac : 0}
            />
          ))}
        </div>
        <div className="t-grain" />
      </div>
      {/* The cut walls are SIBLINGS of the bed, not children: the bed is a
          z-0 stacking context behind the whole room, and a child can never
          escape it to paint in front of the stage. These frame the viewport
          as foreground, pointer-events: none so they never block a click. */}
      <div className="t-walls" aria-hidden="true">
        <div className="t-wall t-wall-l">
          {left.map((c, i) => (
            <i key={i} className="t-chip" style={{
              left: `${c.x}%`, top: `${c.y}%`, width: `${c.s}px`, height: `${c.s}px`,
              transform: `rotate(${c.r}deg)`, ['--shade' as string]: '0.2',
            }} />
          ))}
        </div>
        <div className="t-wall t-wall-r">
          {right.map((c, i) => (
            <i key={i} className="t-chip" style={{
              right: `${c.x}%`, top: `${c.y}%`, width: `${c.s}px`, height: `${c.s}px`,
              transform: `rotate(${c.r}deg)`, ['--shade' as string]: '0.2',
            }} />
          ))}
        </div>
      </div>
    </>
  );
}

/* ── the dig front: the pile on the floor ────────────────────────────────── */

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

/**
 * The crumb pile, resting on the dig floor — fixed at the same 76vh line the
 * bed scrolls the strata against, so the pile always sits exactly on the
 * boundary between hollow and dip. The flight (App.tsx's launchDip) measures
 * this element, so it must exist even when the pile itself is empty.
 */
export function DigFront({ state, nowMs, counting }: { state: ChipsState; nowMs: number; counting: boolean }) {
  const crumbs = projectedCrumbs(state, nowMs);
  const soggy = soggyLook(state, nowMs);
  const fill = state.bowlCap > 0 ? Math.max(0, Math.min(1, crumbs / state.bowlCap)) : 0;
  // A heap's height goes as the square root of its area — the physically right
  // curve, and it also keeps the first few chips visible instead of invisible.
  const height = Math.sqrt(fill) * (1 - 0.28 * soggy);
  const atRim = crumbs >= state.bowlCap && crumbs > 0;

  const count = crumbs <= 0 ? 0 : Math.max(5, Math.round(fill ** 0.5 * 84));
  const pile = useMemo(() => pileOf(count, height, 0x9e37 ^ count), [count, height]);

  const sat = 78 - 46 * soggy;
  const lum = 56 - 14 * soggy;
  const hue = 38 - 8 * soggy;

  return (
    <div className={`tunnel-front${counting ? ' counting' : ''}`} aria-hidden="true">
      <svg className="t-pile" viewBox="0 0 120 64">
        <defs>
          <radialGradient id="t-wet" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="heap" style={{ ['--soggy' as string]: soggy.toFixed(3) }}>
          {pile.map((c, i) => (
            <g key={i} transform={`translate(${60 + c.x * 44} ${58 - c.y * 50}) rotate(${c.rot}) scale(${c.s})`}>
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
        {/* the sheen of a pile that has been sitting out */}
        {soggy > 0.02 && (
          <ellipse className="wet-sheen" cx="60" cy={58 - height * 50 + 8}
            rx={42} ry={13} fill="url(#t-wet)" opacity={Math.min(0.85, soggy)} />
        )}
        {atRim && (
          <g className="spill" aria-hidden="true">
            <path d="M104 50 L110 60 L98 60 Z" />
            <path d="M12 46 L18 56 L6 56 Z" />
          </g>
        )}
      </svg>
    </div>
  );
}

/* ── the counter read ────────────────────────────────────────────────────── */

export interface TunnelReadProps {
  state: ChipsState;
  nowMs: number;
  /** True while some bank's Argon2id proof is still unchecked — the number
   *  below is INCOMPLETE and must not be shown as if it were the truth. */
  counting: boolean;
  countProgress: { done: number; total: number } | null;
}

/** The crumb count and its condition — the accessible source of truth for
 *  everything the bed and the pile only show. */
export function TunnelRead({ state, nowMs, counting, countProgress }: TunnelReadProps) {
  const crumbs = projectedCrumbs(state, nowMs);
  const soggy = soggyLook(state, nowMs);
  const atRim = crumbs >= state.bowlCap && crumbs > 0;
  const { layer } = tunnelDepth(state.dipIndex, state.lifetimeChips);

  return (
    <section
      className="tunnel-wrap"
      aria-label={counting
        ? 'counting the crumbs'
        : `${compact(crumbs)} crumbs piled up, ${layer + 1} ${layer === 0 ? 'layer' : 'layers'} deep in the dip`}
    >
      <div className="tunnel-read">
        {counting ? (
          <p className="checking">
            still counting the crumbs
            {countProgress && countProgress.total > 0 && (
              <em> — {countProgress.done} of {countProgress.total} chips checked</em>
            )}
          </p>
        ) : (
          <>
            <p className="depth-line">{layer + 1} {layer === 0 ? 'layer' : 'layers'} down</p>
            <p className="crumbs tunnel-crumbs">
              <strong>{compact(crumbs)}</strong> crumbs
              {/* The cap was previously invisible until you hit it ("packed
                  to the walls") — the player had no way to know how big
                  their bowl even was, or what a Bigger Bowl would change. */}
              <span className="cap-line">bowl holds {compact(state.bowlCap)}</span>
            </p>
            <p className="sub">
              {atRim
                ? 'packed to the walls — anything more goes on the floor'
                : soggy > 0.66
                  ? `gone soft — last touched ${sinceLabel(nowMs - state.lastConfirmedAt)}`
                  : soggy > 0.25
                    ? 'starting to go soft'
                    : state.lastConfirmedAt > 0 ? 'still crisp' : 'a fresh dig'}
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
 * from the raw payout — so a full pile announces "+0" rather than a number
 * the counter did not move for.
 */
export interface GainFloat {
  /** The chip's own `ms` — stable across its pending -> confirmed transition,
   *  which is what lets `App.tsx` key React's list reconciliation on it. */
  key: number;
  text: string;
  golden: boolean;
  /** The fold doubled this chip — the float dresses up to say so. */
  doubled: boolean;
  /** The pile was already at the cap: this chip's crispness earned nothing.
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
 * — the counter's own crumb count (announced via `TunnelRead`'s `aria-label`)
 * is the accessible source of truth; this is a flourish layered on top of it,
 * never a substitute for it.
 */
export function GainFloats({ floats }: { floats: GainFloat[] }) {
  return (
    <>
      {floats.map((f) => (
        <span
          key={f.key}
          className={`gain-float${f.golden ? ' golden' : ''}${f.doubled ? ' doubled' : ''}${f.empty ? ' empty' : ''}`}
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
  season6: 'the shaker has its own stool at the bar',
  cellar: 'cool, dark, dry. crumbs keep.',
  doubledip1: 'nobody is watching. dip it again.',
  doubledip2: 'shameless. both hands.',
  detector2: 'you can smell 14 bits through the oil',
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
                // A bowl jar states its actual capacity — "Bigger Bowl II"
                // was otherwise a 2M purchase with an unstated effect.
                title={(FLAVOUR[u.key] ?? u.label) + (u.bowlCap ? ` — holds ${compact(u.bowlCap)}` : '')}
              >
                <span className="jar-glass" aria-hidden="true"><i /></span>
                <span className="jar-name">{u.label}</span>
                <span className="jar-cost">{compact(u.cost)}</span>
                {/* Visible, not title-only: touch screens have no hover, and
                    an upgrade's whole point is its effect. */}
                {u.bowlCap !== undefined && <span className="jar-fx">holds {compact(u.bowlCap)}</span>}
                {u.doubleDipMod !== undefined && (
                  <span className="jar-fx">{u.doubleDipMod === 2 ? 'every other chip dips twice' : `1 in ${u.doubleDipMod} chips dips twice`}</span>
                )}
                {u.sogBonus !== undefined && <span className="jar-fx">crumbs stay crisp longer</span>}
                {u.goldenBits !== undefined && <span className="jar-fx">golden from {u.goldenBits} bits</span>}
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
