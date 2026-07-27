/**
 * The crew ON SCREEN: loitering critters at the dig floor, speech bubbles,
 * the angel's glow, the feed-mode banner, and the news ticker.
 *
 * Rules of the room:
 *   - Critters LOITER. They stand on the dig floor (the same `--floor` line
 *     the pile rests on), bob gently, and stay out of the pile's corner.
 *   - One bubble at a time, app-wide. Chatter is seasoning, not soup.
 *   - Everything here is a render of App state; the rules (who is recruited,
 *     what they sell, when the rat latches) live in lib/crew.ts and
 *     lib/crewJobs.ts. This file owns SVG and CSS hooks only.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CrewMember } from './lib/crew';
import { tickerPoolFor } from './lib/crew';
import type { AngelState } from './lib/crewJobs';

/* ── the art ─────────────────────────────────────────────────────────────── */

/**
 * Every critter is deliberately SIMPLE SHAPES — the bestiary describes them
 * that way on purpose (dot eyes, one big pit, seven stripes). viewBox 0 0 100
 * 100, feet at y=96 so the row can sit them all on one floor line.
 */
export function CritterArt({ id }: { id: string }) {
  switch (id) {
    case 'scoop': return (
      <svg viewBox="0 0 100 100" className="critter-art">
        <ellipse cx="46" cy="74" rx="26" ry="18" fill="#c8955c" />
        <rect x="28" y="84" width="7" height="12" rx="3" fill="#b07f49" />
        <rect x="56" y="84" width="7" height="12" rx="3" fill="#b07f49" />
        <path d="M70 70 Q86 62 84 48" stroke="#c8955c" strokeWidth="7" fill="none" strokeLinecap="round" />
        <circle cx="34" cy="46" r="17" fill="#d3a267" />
        <path d="M22 34 L16 18 L32 28 Z" fill="#a97b45" />
        <path d="M44 32 L52 17 L54 34 Z" fill="#a97b45" />
        <circle cx="28" cy="44" r="2.6" fill="#2b1c10" />
        <circle cx="40" cy="44" r="2.6" fill="#2b1c10" />
        <ellipse cx="33" cy="54" rx="4.5" ry="3.2" fill="#2b1c10" />
        <path d="M29 58 Q33 61 37 58" stroke="#2b1c10" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    );
    case 'avo': return (
      <svg viewBox="0 0 100 100" className="critter-art">
        <ellipse cx="50" cy="58" rx="26" ry="38" fill="#2e5c33" />
        <ellipse cx="50" cy="66" rx="15" ry="16" fill="#6b4a2b" opacity="0.85" />
        <ellipse cx="50" cy="66" rx="15" ry="16" fill="none" stroke="#254a29" strokeWidth="2" strokeDasharray="3 4" />
        <circle cx="46" cy="38" r="2.4" fill="#12240f" />
        <circle cx="54" cy="38" r="2.4" fill="#12240f" />
        <path d="M46 46 Q50 44 54 46" stroke="#12240f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    );
    case 'limewedge': return (
      <svg viewBox="0 0 100 100" className="critter-art" style={{ transform: 'rotate(-12deg)' }}>
        <path d="M50 14 L82 92 L18 92 Z" fill="#7fbf4d" />
        <path d="M50 22 L74 88 L26 88 Z" fill="#a8d97a" />
        <path d="M18 92 L82 92 L79 97 L21 97 Z" fill="#eef7df" />
        <circle cx="44" cy="60" r="2.6" fill="#1e3a12" />
        <circle cx="58" cy="60" r="2.6" fill="#1e3a12" />
        <path d="M44 70 Q51 74 58 70" stroke="#1e3a12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    );
    case 'onion': return (
      <svg viewBox="0 0 100 100" className="critter-art">
        <ellipse cx="50" cy="93" rx="30" ry="5" fill="#8fb6c9" opacity="0.5" />
        <circle cx="50" cy="56" r="34" fill="#e8d5ae" />
        <circle cx="50" cy="56" r="25" fill="none" stroke="#cdb488" strokeWidth="2.4" />
        <circle cx="50" cy="56" r="16" fill="none" stroke="#cdb488" strokeWidth="2.4" />
        <path d="M38 50 Q42 47 46 50" stroke="#5b4426" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M54 50 Q58 47 62 50" stroke="#5b4426" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path className="onion-tear" d="M42 53 Q41 72 42 90" stroke="#9fd0e8" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path className="onion-tear t2" d="M58 53 Q59 72 58 90" stroke="#9fd0e8" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M44 64 Q50 63 56 64" stroke="#5b4426" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    );
    case 'rat': return <RatArt gorge={1} />;
    case 'angel': return (
      <svg viewBox="0 0 100 100" className="critter-art">
        <path d="M26 72 Q50 96 74 72 L70 96 L30 96 Z" fill="#f3d873" />
        <path d="M24 58 L8 66 L26 70 Z" fill="#fdf3cf" />
        <path d="M76 58 L92 66 L74 70 Z" fill="#fdf3cf" />
        <circle cx="50" cy="50" r="24" fill="#f7e08e" />
        <path className="halo-drip" d="M28 22 Q36 14 50 15 Q64 14 72 22 Q66 27 60 24 Q57 32 53 25 Q48 33 44 25 Q38 30 32 26 Q30 24 28 22 Z" fill="#f2b73c" />
        <path d="M40 48 Q44 45 48 48" stroke="#6b4d14" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M52 48 Q56 45 60 48" stroke="#6b4d14" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M44 60 Q50 63 56 60" stroke="#6b4d14" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    );
    case 'committee': {
      const stripes = ['#8a5a34', '#5c8a3a', '#e8e2ce', '#e0b53e', '#b8452f', '#7a4a7e', '#4a6d8a'];
      return (
        <svg viewBox="0 0 100 100" className="critter-art">
          {stripes.map((c, i) => (
            <g key={i}>
              <rect x="24" y={12 + i * 12} width="52" height="12" rx="3" fill={c} />
              <circle cx="40" cy={18 + i * 12} r="1.9" fill="#141414" opacity="0.85" />
              <circle cx="60" cy={18 + i * 12} r="1.9" fill="#141414" opacity="0.85" />
            </g>
          ))}
        </svg>
      );
    }
    case 'hermit': return (
      <svg viewBox="0 0 100 100" className="critter-art">
        <rect x="12" y="30" width="76" height="10" rx="5" fill="#7fae5a" transform="rotate(-7 50 35)" />
        <path d="M28 96 Q22 60 36 50 Q50 40 64 50 Q78 62 72 96 Z" fill="#cfd8e2" />
        <circle cx="44" cy="62" r="4" fill="#8b95b5" opacity="0.7" />
        <circle cx="60" cy="74" r="3" fill="#8b95b5" opacity="0.7" />
        <circle cx="52" cy="84" r="3.4" fill="#8b95b5" opacity="0.7" />
        <circle cx="54" cy="60" r="5.5" fill="#fff" />
        <circle cx="54" cy="60" r="2.4" fill="#20304a" />
      </svg>
    );
    case 'wing': return (
      <svg viewBox="0 0 100 100" className="critter-art wing-hop">
        <path d="M34 30 Q60 18 72 44 Q80 64 62 78 Q46 88 36 74 Q24 56 34 30 Z" fill="#d96c2a" />
        <circle cx="34" cy="28" r="7" fill="#f5efe3" />
        <circle cx="44" cy="22" r="7" fill="#f5efe3" />
        <circle cx="52" cy="56" r="2.4" fill="#3a1c08" />
        <circle cx="62" cy="56" r="2.4" fill="#3a1c08" />
      </svg>
    );
    case 'oracle': return (
      <svg viewBox="0 0 100 100" className="critter-art">
        <path d="M18 46 Q18 40 26 40 L74 40 Q82 40 82 46 Q82 76 66 88 L34 88 Q18 76 18 46 Z" fill="#1d1a22" />
        <rect x="26" y="88" width="12" height="8" fill="#1d1a22" />
        <rect x="62" y="88" width="12" height="8" fill="#1d1a22" />
        <ellipse cx="50" cy="44" rx="30" ry="7" fill="#f2c53c" />
        <circle cx="50" cy="60" r="15" fill="#f2c53c" />
        <path d="M43 57 Q46 54 49 57" stroke="#7a5a10" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M53 57 Q56 54 59 57" stroke="#7a5a10" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M45 68 Q50 71 55 68" stroke="#7a5a10" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <line x1="86" y1="30" x2="86" y2="90" stroke="#8a7f6a" strokeWidth="3" strokeLinecap="round" />
        <path d="M86 30 L80 20 L92 20 Z" fill="#e0b46a" />
      </svg>
    );
    case 'firstchip': return (
      <svg viewBox="0 0 100 100" className="critter-art">
        <path d="M50 8 L94 96 L6 96 Z" fill="#efe3c2" stroke="#cbb98e" strokeWidth="2" />
        <path d="M50 8 L58 40 L54 66 L60 96" stroke="#cbb98e" strokeWidth="1.6" fill="none" />
        <path d="M36 62 Q46 56 56 62" stroke="#8a7a54" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </svg>
    );
    default: return null;
  }
}

/** The rat, separately parameterised: his cheeks are the UI. `gorge` runs
 *  1.0 → 1.75 and the cheeks scale with it. */
export function RatArt({ gorge }: { gorge: number }) {
  const cheek = 4 + (gorge - 1) * 14;
  return (
    <svg viewBox="0 0 100 100" className="critter-art">
      <path d="M24 78 Q20 46 46 40 Q76 34 80 66 Q82 88 58 90 L34 90 Q26 86 24 78 Z" fill="#e0862f" />
      <path d="M34 44 L26 28 L44 36 Z" fill="#b5661d" />
      <path d="M52 38 L52 20 L64 34 Z" fill="#b5661d" />
      <path d="M80 70 Q98 74 96 90" stroke="#b5661d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="54" r="6.5" fill="#fff" />
      <circle cx="58" cy="52" r="6.5" fill="#fff" />
      <circle cx="42" cy="54" r="2.6" fill="#241505" />
      <circle cx="58" cy="52" r="2.6" fill="#241505" />
      <ellipse cx="33" cy="68" rx={cheek} ry={cheek * 0.8} fill="#f0a45a" />
      <ellipse cx="66" cy="66" rx={cheek} ry={cheek * 0.8} fill="#f0a45a" />
      <ellipse cx="50" cy="66" rx="3.4" ry="2.6" fill="#241505" />
    </svg>
  );
}

/* ── the row ─────────────────────────────────────────────────────────────── */

/** Where each critter loiters, in vw-ish percent. Everyone stays left of
 *  ~68%: the counter column owns the right third on desktop and the pile
 *  owns the right corner (`.tunnel-front { right: 6vw }`) — a critter under
 *  either is unreadable, and the glowing angel must always be clickable. */
const SPOTS: Record<string, number> = {
  wing: 4, scoop: 11, avo: 18, limewedge: 25, committee: 32, firstchip: 38,
  oracle: 44, onion: 50, angel: 56, rat: 62, hermit: 68,
};

export interface CrewBubble {
  id: string;
  line: string;
  /** Keys the CSS animation so consecutive lines each replay it. */
  key: number;
}

export interface CrewRowProps {
  crew: CrewMember[];
  bubble: CrewBubble | null;
  /** Vendor currently waiting to be fed (feed mode) — gets the arm pose. */
  feedingId: string | null;
  angel: AngelState;
  /** The rat is latched to a fryer — he is up there, not down here. */
  ratAway: boolean;
  onCritterClick: (id: string) => void;
}

export function CrewRow({ crew, bubble, feedingId, angel, ratAway, onCritterClick }: CrewRowProps) {
  return (
    <div className="crew-row" aria-label="your crew">
      {crew.map((m) => {
        if (m.id === 'rat' && ratAway) return null;
        const glowing = m.id === 'angel' && angel.glowing;
        return (
          <button
            key={m.id}
            type="button"
            className={
              `critter critter-${m.id}` +
              (glowing ? ' glowing' : '') +
              (feedingId === m.id ? ' feeding' : '')
            }
            style={{ left: `${SPOTS[m.id] ?? 50}%` }}
            onClick={() => onCritterClick(m.id)}
            title={glowing ? `${m.name} is glowing — a blessing waits` : m.name}
            aria-label={glowing ? `${m.name}, glowing — click for a guaranteed crackle` : m.name}
          >
            <CritterArt id={m.id} />
            <span className="critter-name">{m.name}</span>
            {bubble && bubble.id === m.id && (
              <span key={bubble.key} className="say" role="status">{bubble.line}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── feed mode banner ────────────────────────────────────────────────────── */

export function FeedBanner({ vendor, jarLabel, onCancel }: {
  vendor: CrewMember; jarLabel: string; onCancel: () => void;
}) {
  return (
    <div className="feed-banner" role="status">
      <span className="feed-text">
        <strong>{vendor.name}</strong> wants a chip for the {jarLabel} —{' '}
        {vendor.feed === 'golden' ? 'click a GOLDEN chip on the fryer' : 'click a chip on the fryer'}
      </span>
      <button type="button" className="feed-cancel" onClick={onCancel}>never mind</button>
    </div>
  );
}

/* ── the ticker ──────────────────────────────────────────────────────────── */

const TICKER_ROTATE_MS = 11_000;

/** One rotating deadpan line — the narrative spine of the descent. The pool
 *  deepens with the dig (lib/crew.ts); rotation avoids immediate repeats. */
export function DipTicker({ dipIndex }: { dipIndex: number }) {
  const pool = useMemo(() => tickerPoolFor(dipIndex), [dipIndex]);
  const [at, setAt] = useState(() => Math.floor(Math.random() * Math.max(1, pool.length)));

  useEffect(() => {
    if (pool.length <= 1) return;
    const t = setInterval(() => {
      setAt((prev) => {
        let next = Math.floor(Math.random() * pool.length);
        if (next === prev) next = (next + 1) % pool.length;
        return next;
      });
    }, TICKER_ROTATE_MS);
    return () => clearInterval(t);
  }, [pool]);

  const line = pool[Math.min(at, pool.length - 1)];
  if (!line) return null;
  return (
    <div className="dip-ticker" aria-label="the dip daily">
      <span className="ticker-tag">the dip daily</span>
      {/* key replays the slide-in on every rotation */}
      <span key={line.text} className="ticker-line">{line.text}</span>
    </div>
  );
}
