import { useEffect } from 'react';
import {
  START_SALVAGE,
  COST_FARM,
  COST_STOREHOUSE,
  COST_BEACON,
  CAP_BASE,
  CAP_PER_STOREHOUSE,
  TEND_COST,
  HB_CAP_PER_DAY,
  LIT_MIN,
  DIM_MIN,
  YIELD_LIT,
  YIELD_DIM,
  YIELD_DARK,
  DECAY_LIT,
  DECAY_BASE,
  DECAY_DARK,
  EXPEDITION_BASE_RANGE,
  RANGE_PER_BEACON,
  CLAIM_MIN_SPACING,
  GLOW_PER_STRUCTURE_LIT_DAY,
} from './lib/trenchEngine';

/** Values are stored in half-units on-chain; every number shown to a player
 *  is the WHOLE-unit display value (spec's "display divides by 2"). */
const half = (n: number): string => (n % 2 === 0 ? String(n / 2) : (n / 2).toFixed(1));

/** A mini lantern tile for the brightness legend — same visual language as
 *  the map's claim pins (see TrenchMap.tsx / styles.css `.claim-pin`), so the
 *  panel SHOWS the map instead of describing it. */
function LanternTile({ tier }: { tier: 'LIT' | 'DIM' | 'DARK' }) {
  return (
    <span className={`hp-tile hp-lantern b-${tier}`} aria-hidden="true">
      <span className="claim-dot" />
    </span>
  );
}

/** A mini structure icon for the build/tend legend. */
function StructTile({ icon, ruined }: { icon: string; ruined?: boolean }) {
  return (
    <span className={`hp-tile hp-struct${ruined ? ' ruined' : ''}`} aria-hidden="true">
      {icon}
    </span>
  );
}

/** The full plain-first reference — plain rules first, lore last (spec §4).
 *  Re-entry point via the "?" link in the header. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="help-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>How to play 🏮</h2>
        <p>
          The Trench is a homestead game where <strong>you are the lantern</strong>. You found one
          claim on a shared map, then tend it while your lantern burns — no server, nobody who can
          turn the lights off but you.
        </p>

        <h3>Founding</h3>
        <p>
          Pick a name and click open ground on the map, at least{' '}
          <strong>{CLAIM_MIN_SPACING} units</strong> from any neighbor. You start with{' '}
          <strong>{half(START_SALVAGE)} salvage</strong> and nothing built.
        </p>

        <h3>What you gather</h3>
        <div className="hp-moves">
          <div className="hp-move">
            <span className="hp-diagram">
              <StructTile icon="⚙" />
            </span>
            <span className="hp-what">
              <strong>Salvage</strong>
              <span className="hp-how">
                Scrap raised from the deep — this is what you <strong>build</strong> with. You
                start with {half(START_SALVAGE)}; expeditions to other claims bring back more.
              </span>
            </span>
          </div>
          <div className="hp-move">
            <span className="hp-diagram">
              <StructTile icon="🌿" />
            </span>
            <span className="hp-what">
              <strong>Biomass</strong>
              <span className="hp-how">
                Grown daily by your kelp farms — this is what you <strong>tend</strong> with,
                repairing what the abyss wears down.
              </span>
            </span>
          </div>
        </div>
        <p className="fine">
          You can hold at most <strong>{half(CAP_BASE)}</strong> of each — until you build
          storehouses.
        </p>

        <h3>Your lantern</h3>
        <p>
          While The Trench is running, your lantern posts a <strong>heartbeat</strong> at most once
          every 4 hours — up to <strong>{HB_CAP_PER_DAY} a day</strong>. Your lantern's brightness
          is how many heartbeats landed over the trailing 7 days:
        </p>
        <div className="hp-legend hp-lanterns">
          <span className="hp-key">
            <LanternTile tier="LIT" />
            <span className="fine">
              <strong>LIT</strong> — ≥{LIT_MIN}/week · farms yield {half(YIELD_LIT)}
              /day · slowest decay
            </span>
          </span>
          <span className="hp-key">
            <LanternTile tier="DIM" />
            <span className="fine">
              <strong>DIM</strong> — ≥{DIM_MIN}/week · farms yield {half(YIELD_DIM)}/day
            </span>
          </span>
          <span className="hp-key">
            <LanternTile tier="DARK" />
            <span className="fine">
              <strong>DARK</strong> — below {DIM_MIN}/week · farms yield {half(YIELD_DARK)}
              /day · fastest decay
            </span>
          </span>
        </div>
        <h3>The abyss</h3>
        <p>
          Everything you build wears down: a structure loses <strong>{half(DECAY_BASE)}</strong>{' '}
          health a day — only {half(DECAY_LIT)} while your lantern is LIT, but{' '}
          {half(DECAY_DARK)} when DARK. <strong>Tend</strong> a worn structure (
          {half(TEND_COST)} biomass) to restore it to full. If its health reaches 0 it becomes a{' '}
          <strong>ruin</strong> — gone for good; build anew.
        </p>

        <h3>Building</h3>
        <p className="fine">Each costs salvage and stands until the abyss takes it.</p>
        <div className="hp-moves">
          <div className="hp-move">
            <span className="hp-diagram">
              <StructTile icon="🌾" />
            </span>
            <span className="hp-what">
              <strong>Kelp farm</strong> <span className="hp-chip">{half(COST_FARM)} salvage</span>
              <span className="hp-how">
                Grows biomass every day — the brighter your lantern, the bigger the harvest.
              </span>
            </span>
          </div>
          <div className="hp-move">
            <span className="hp-diagram">
              <StructTile icon="📦" />
            </span>
            <span className="hp-what">
              <strong>Storehouse</strong> <span className="hp-chip">{half(COST_STOREHOUSE)} salvage</span>
              <span className="hp-how">
                Lets you hold more: raises both the salvage and biomass caps by{' '}
                {half(CAP_PER_STOREHOUSE)} each while it stands.
              </span>
            </span>
          </div>
          <div className="hp-move">
            <span className="hp-diagram">
              <StructTile icon="🗼" />
            </span>
            <span className="hp-what">
              <strong>Beacon</strong> <span className="hp-chip">{half(COST_BEACON)} salvage</span>
              <span className="hp-how">
                Reaches farther into the dark: your expeditions can visit claims{' '}
                {RANGE_PER_BEACON} units farther away (everyone starts at {EXPEDITION_BASE_RANGE}).
              </span>
            </span>
          </div>
        </div>

        <h3>Expeditions</h3>
        <p>
          Send an expedition to any visible claim within range (base {EXPEDITION_BASE_RANGE} units
          + {RANGE_PER_BEACON} per beacon you hold) — once per target per day. It gains{' '}
          <strong>1–3 salvage</strong>, and your light reaches that claim so it stays visible for
          everyone. Expeditions are how you keep the world alive, not just your own corner of it.
        </p>

        <h3>Glow</h3>
        <p>
          Every alive structure earns <strong>{GLOW_PER_STRUCTURE_LIT_DAY} glow</strong> for each
          day your lantern is LIT — a prestige leaderboard, nothing more. It only counts claims
          you've loaded (your own, and any you've visited).
        </p>

        <p className="fine hp-lore">
          Go dark too long and the abyss doesn't wait for anyone's permission to advance.{' '}
          The Trench runs on the Swimchain network — no server, no company; its world is kept
          alive by its players.
        </p>
        <button className="btn primary" onClick={onClose}>
          Back to the trench
        </button>
      </div>
    </div>
  );
}
