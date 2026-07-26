/**
 * The dip tunnel, the dip it is cut through, and the shelf above it.
 *
 * The tunnel replaced the bowl: the dip ladder is now VERTICAL. Every tier is
 * a stratum in an endless seven-layer dip (it keeps going and going — see
 * lib/tunnelDepth.ts), the player digs DOWN through it chip by chip, and the
 * crumbs pile up at the dig front. Three rules this file exists to obey:
 *   1. DEPTH IS THE REWARD LADDER MADE PHYSICAL. The layer you are in is the
 *      band the dig front sits in; the layers still coming are literally
 *      visible below you, and the shaft above is the history you dug through.
 *   2. THE FOLD DECIDES THE LAYER. `state.dipIndex` places the front;
 *      tunnelDepth only draws it (see its header for why it never re-derives).
 *   3. SOGGINESS IS VISIBLE BEFORE IT IS LEGIBLE. The pile at the front
 *      slumps, dulls and wet-sheens exactly as the bowl's heap did — that
 *      language survives the vessel change untouched.
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

/* ── the tunnel ──────────────────────────────────────────────────────────── */

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
 * One stratum. `dug` is how much of its height the shaft has eaten: 1 for
 * layers already passed, the front's own frac for the current one, 0 below.
 * The dug overlay (and the chips stuck in its walls) lives INSIDE the band,
 * so it scrolls with the strata and clips itself for free — the shaft never
 * needs to know where the front is, only each band does.
 */
function Stratum({ band, dug }: { band: TunnelBand; dug: number }) {
  const chunks = useMemo(() => {
    const rnd = seeded(0x517cc1 ^ Math.imul(band.ordinal, 2654435761));
    return Array.from({ length: 10 }, () => ({
      x: rnd() * 100, y: 8 + rnd() * 84,
      w: 4 + rnd() * 9, r: rnd() * 360, d: rnd() * 12,
    }));
  }, [band.ordinal]);

  // The chips piling up in the tunnel: every dug band keeps a scatter of them
  // wedged along the shaft walls — the history of the dig, visible above you.
  const wallChips = useMemo(() => {
    const rnd = seeded(0x2ab7de ^ Math.imul(band.ordinal, 40503));
    return Array.from({ length: 7 }, () => {
      const leftWall = rnd() < 0.5;
      return {
        x: leftWall ? 26 + rnd() * 9 : 65 + rnd() * 9,
        y: 4 + rnd() * 88,
        s: 7 + rnd() * 7, r: rnd() * 360, shade: rnd(),
      };
    });
  }, [band.ordinal]);

  return (
    <div
      className={`t-band${band.beyond ? ' beyond' : ''}`}
      data-dip={band.key}
      style={{ ['--ord' as string]: band.ordinal }}
    >
      <div className="t-fill" />
      <div className="t-chunks" aria-hidden="true">
        {chunks.map((c, i) => (
          <span key={i} style={{
            left: `${c.x}%`, top: `${c.y}%`,
            width: `${c.w}px`, height: `${c.w * 0.7}px`,
            transform: `rotate(${c.r}deg)`, animationDelay: `${c.d}s`,
          }} />
        ))}
      </div>
      <span className="t-name">{band.label}</span>
      {dug > 0 && (
        <div className="t-dug" style={{ height: `${(dug * 100).toFixed(2)}%` }} aria-hidden="true">
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

export interface TunnelProps {
  state: ChipsState;
  nowMs: number;
  /** True while some bank's Argon2id proof is still unchecked — the number
   *  below is INCOMPLETE and must not be shown as if it were the truth. */
  counting: boolean;
  countProgress: { done: number; total: number } | null;
}

export function Tunnel({ state, nowMs, counting, countProgress }: TunnelProps) {
  const crumbs = projectedCrumbs(state, nowMs);
  const soggy = soggyLook(state, nowMs);
  const fill = state.bowlCap > 0 ? Math.max(0, Math.min(1, crumbs / state.bowlCap)) : 0;
  // A heap's height goes as the square root of its area — the physically right
  // curve, and it also keeps the first few chips visible instead of invisible.
  const height = Math.sqrt(fill) * (1 - 0.28 * soggy);
  const atRim = crumbs >= state.bowlCap && crumbs > 0;

  const count = crumbs <= 0 ? 0 : Math.max(5, Math.round(fill ** 0.5 * 84));
  const pile = useMemo(() => pileOf(count, height, 0x9e37 ^ count), [count, height]);

  const { layer, frac, depth } = tunnelDepth(state.dipIndex, state.lifetimeChips);
  const bands = bandsAround(depth);

  const sat = 78 - 46 * soggy;
  const lum = 56 - 14 * soggy;
  const hue = 38 - 8 * soggy;

  return (
    <section className={`tunnel-wrap${counting ? ' counting' : ''}`} aria-label="the dip tunnel">
      <div
        className="tunnel"
        role="img"
        aria-label={counting
          ? 'counting the crumbs'
          : `${compact(crumbs)} crumbs piled up, ${layer + 1} ${layer === 0 ? 'layer' : 'layers'} deep in the dip`}
      >
        {/* the open air above the surface — only ever visible while the dig
            front is still in the first band or two */}
        <div className="t-sky" aria-hidden="true" />

        {/* The scroll position is an inline `top` on the STACK, not a CSS var
            the bands each consume: a change to a custom property does not
            reliably retrigger/interpolate a transition on a property that
            reads it through calc() (measured: the bands snapped late instead
            of gliding), while a direct inline `top` change transitions every
            time. One animated element instead of nine, too. */}
        <div
          className="t-stack"
          aria-hidden="true"
          style={{ top: `calc(42% - ${depth.toFixed(4)} * var(--bh))` }}
        >
          {bands.map((b) => (
            <Stratum
              key={b.ordinal}
              band={b}
              dug={b.ordinal < layer ? 1 : b.ordinal === layer ? frac : 0}
            />
          ))}
        </div>

        {/* The dig front: the crumb pile, resting on the undug dip below. It
            never moves — the strata scroll behind it — which is exactly what
            makes the dig read as GOING somewhere. The flight (App.tsx's
            launchDip) measures this element, so it must exist even when the
            pile itself is empty. */}
        <div className="tunnel-front" aria-hidden="true">
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

        {/* the cut-away's glass: vignette and side walls, so the strata read
            as a core sample out of the dip, not a striped rectangle */}
        <div className="tunnel-glass" aria-hidden="true" />
      </div>

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
            <p className="crumbs tunnel-crumbs"><strong>{compact(crumbs)}</strong> crumbs</p>
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
 * from the raw payout — so a full tunnel announces "+0" rather than a number
 * the counter did not move for.
 */
export interface GainFloat {
  /** The chip's own `ms` — stable across its pending -> confirmed transition,
   *  which is what lets `App.tsx` key React's list reconciliation on it. */
  key: number;
  text: string;
  golden: boolean;
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
 * — the tunnel's own crumb count (announced via its `aria-label`) is the
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
