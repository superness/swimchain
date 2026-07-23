import { useEffect } from 'react';
import {
  COST_GROW,
  COST_CONTEST,
  CONTEST_DAMAGE,
  EPOCH_MOVES,
  TEND_CAP,
  REGEN_BASE,
  MAX_BUDGET,
  SEASON_EPOCHS,
  MAX_VITALITY,
  CAPTURE_VITALITY,
} from './lib/reefEngine';

/** A mini board tile for diagrams and the legend — the same visual language as
 *  the real grid (coral scaled by health, bright ring = yours, pulse = dying),
 *  so the panel SHOWS the board instead of describing it. */
function Tile({
  coral,
  open,
}: {
  coral?: { mine?: boolean; enemy?: boolean; size?: 'full' | 'small' | 'tiny'; dying?: boolean };
  open?: boolean;
}) {
  return (
    <span className={`hp-tile${open ? ' open' : ''}`} aria-hidden="true">
      {coral && (
        <span
          className={
            'hp-coral' +
            (coral.mine ? ' mine' : '') +
            (coral.enemy ? ' enemy' : '') +
            (coral.size && coral.size !== 'full' ? ` ${coral.size}` : '') +
            (coral.dying ? ' dying' : '')
          }
        />
      )}
    </span>
  );
}

/** The full plain-first reference — the old bottom text-wall's content, taught
 *  in order (plain rules first, lore last). Re-entry point for skipped tutorials. */
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
        <h2>How to play 🪸</h2>
        <p>
          The Reef is a territory game: grow a coral reef, keep it alive, outlast your rivals.
          Everyone plays on the same shared board.
        </p>

        <h3>Your three moves</h3>
        <div className="hp-moves">
          <div className="hp-move">
            <span className="hp-diagram">
              <Tile coral={{ mine: true }} />
              <span className="hp-arrow">→</span>
              <Tile open />
            </span>
            <span className="hp-what">
              <strong>Grow</strong> <span className="hp-chip">−{COST_GROW} energy</span>
              <span className="hp-how">
                Click open water beside your reef. Your very first coral can go anywhere.
              </span>
            </span>
          </div>
          <div className="hp-move">
            <span className="hp-diagram">
              <Tile coral={{ mine: true, size: 'small' }} />
              <span className="hp-arrow">→</span>
              <Tile coral={{ mine: true }} />
            </span>
            <span className="hp-what">
              <strong>Tend</strong> <span className="hp-chip">free · {TEND_CAP}/tide</span>
              <span className="hp-how">Click your own coral to restore it to full health.</span>
            </span>
          </div>
          <div className="hp-move">
            <span className="hp-diagram">
              <Tile coral={{ enemy: true }} />
              <span className="hp-arrow">→</span>
              <Tile coral={{ mine: true, size: 'tiny' }} />
            </span>
            <span className="hp-what">
              <strong>Strike</strong> <span className="hp-chip">−{COST_CONTEST} energy</span>
              <span className="hp-how">
                Click enemy coral on your border — it loses {CONTEST_DAMAGE} health. Break it,
                then take the square (captured coral starts weak, at {CAPTURE_VITALITY} health).
              </span>
            </span>
          </div>
        </div>

        <h3>The tide</h3>
        <p>
          Every {EPOCH_MOVES} moves — counting everyone's — the tide turns: all coral loses 1
          health, and your energy refills by {REGEN_BASE} + 1 for every 2 coral you hold (max{' '}
          {MAX_BUDGET}). Coral starts at {MAX_VITALITY} health and dies at 0 — shrinking coral is
          telling you it needs tending.
        </p>

        <h3>Scoring</h3>
        <p>
          Each tide you bank points equal to your coral's total health. After {SEASON_EPOCHS}{' '}
          tides the season ends: most points takes the crown, tallies reset, and your coral
          carries on into the new season.
        </p>

        <h3>Reading the board</h3>
        <div className="hp-legend">
          <span className="hp-key">
            <Tile coral={{ mine: true }} />
            <span className="fine">yours — bright ring</span>
          </span>
          <span className="hp-key">
            <Tile coral={{ enemy: true }} />
            <span className="fine">a rival's coral</span>
          </span>
          <span className="hp-key">
            <Tile coral={{ enemy: true, size: 'small' }} />
            <span className="fine">shrinking — health dropping</span>
          </span>
          <span className="hp-key">
            <Tile coral={{ mine: true, size: 'tiny', dying: true }} />
            <span className="fine">dies next tide — tend it!</span>
          </span>
        </div>

        <p className="fine hp-lore">
          You score the health you keep alive each tide — sprawl you can't tend just feeds the
          current. Every coral you grow is provably yours while it stands: the reef lives on the
          Swimchain network, not on anyone's server, and no one can take it down.
        </p>
        {/* No autoFocus: focusing the bottom button scrolls a tall panel to its
            end, clipping the heading off the top. Esc and click-outside close. */}
        <button className="btn primary" onClick={onClose}>
          Back to the reef
        </button>
      </div>
    </div>
  );
}
