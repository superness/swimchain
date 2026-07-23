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

/** The rewritten guide (designer spec §2): a compact panel — one 10-word loop
 *  line, then six titled cards in a 2-column grid (single column under
 *  ~640px), reading order = play order. Each card is scannable as a
 *  fragment, not prose — the HUD already teaches resources/brightness/build
 *  costs via its own labels, so the guide's job is just the numbers behind
 *  them. Re-entry point via the "?" link in the header. */
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
      <div className="help-panel hp-cards" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>How to play 🏮</h2>
        <p className="hp-intro">You are the lantern. Claim ground. Build. Keep it lit.</p>

        <div className="hp-grid">
          <div className="hp-card">
            <h3>Found</h3>
            <p>
              Name yourself, click open ground — <strong>{CLAIM_MIN_SPACING}+ units</strong> from any
              neighbor.
            </p>
            <p>
              You start with <strong>{half(START_SALVAGE)} salvage</strong>.
            </p>
          </div>

          <div className="hp-card">
            <h3>Your lantern</h3>
            <p>
              Burns while the game runs — up to <strong>{HB_CAP_PER_DAY} beats a day</strong>.
            </p>
            <p className="fine">Beats this week set brightness:</p>
            <div className="hp-legend hp-lanterns">
              <span className="hp-key">
                <LanternTile tier="LIT" />
                <span className="fine">
                  <strong>LIT</strong> · {LIT_MIN}+ · farms {half(YIELD_LIT)}/day · slow decay
                </span>
              </span>
              <span className="hp-key">
                <LanternTile tier="DIM" />
                <span className="fine">
                  <strong>DIM</strong> · {DIM_MIN}+ · farms {half(YIELD_DIM)}/day
                </span>
              </span>
              <span className="hp-key">
                <LanternTile tier="DARK" />
                <span className="fine">
                  <strong>DARK</strong> · under {DIM_MIN} · farms {half(YIELD_DARK)}/day · fast decay
                </span>
              </span>
            </div>
          </div>

          <div className="hp-card">
            <h3>The abyss</h3>
            <p>
              Everything wears: −{half(DECAY_BASE)} health a day ({half(DECAY_LIT)} LIT ·{' '}
              {half(DECAY_DARK)} DARK).
            </p>
            <p>
              <strong>Tend</strong> for {half(TEND_COST)} biomass — farms grow it.
            </p>
            <p>
              At 0 it's a <strong>ruin</strong>. Ruins don't come back.
            </p>
          </div>

          <div className="hp-card">
            <h3>Build</h3>
            <p className="fine">Spend salvage. Expeditions bring more.</p>
            <div className="hp-moves">
              <div className="hp-move">
                <span className="hp-diagram">
                  <StructTile icon="🌾" />
                </span>
                <span className="hp-what">
                  <strong>Kelp farm</strong> <span className="hp-chip">{half(COST_FARM)} salvage</span>
                  <span className="hp-how">grows biomass daily. Brighter = more.</span>
                </span>
              </div>
              <div className="hp-move">
                <span className="hp-diagram">
                  <StructTile icon="📦" />
                </span>
                <span className="hp-what">
                  <strong>Storehouse</strong>{' '}
                  <span className="hp-chip">{half(COST_STOREHOUSE)} salvage</span>
                  <span className="hp-how">
                    both caps +{half(CAP_PER_STOREHOUSE)} (base {half(CAP_BASE)}).
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
                    reach +{RANGE_PER_BEACON} (base {EXPEDITION_BASE_RANGE}).
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="hp-card">
            <h3>Expeditions</h3>
            <p>Visit any lantern in reach — once each per day.</p>
            <p>
              Brings home <strong>1–3 salvage</strong>; your light keeps their claim burning.
            </p>
          </div>

          <div className="hp-card">
            <h3>Glow</h3>
            <p>
              {GLOW_PER_STRUCTURE_LIT_DAY} glow per standing structure, per LIT day.
            </p>
            <p className="fine">Bragging rights.</p>
          </div>
        </div>

        <p className="fine hp-lore">
          Go dark and the abyss advances. No server, no company — The Trench runs on the Swimchain
          network, kept alive by its players.
        </p>
        <button className="btn primary" onClick={onClose}>
          Back to the trench
        </button>
      </div>
    </div>
  );
}
