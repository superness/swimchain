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
        <ul>
          <li>
            <strong>Grow</strong> (−{COST_GROW} energy): click open water beside your reef. Your
            very first coral can go anywhere.
          </li>
          <li>
            <strong>Tend</strong> (free, {TEND_CAP} per tide): click your own coral to restore it
            to full health.
          </li>
          <li>
            <strong>Strike</strong> (−{COST_CONTEST} energy): click enemy coral on your border —
            it loses {CONTEST_DAMAGE} health. Break it, then take the square (captured coral starts weak, at {CAPTURE_VITALITY} health).
          </li>
        </ul>
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
        <ul>
          <li>Coral shrinks as its health drops.</li>
          <li>Your own reef has a bright ring.</li>
          <li>A pulsing square dies next tide — tend it.</li>
        </ul>
        <p className="fine">
          You score the health you keep alive each tide — sprawl you can't tend just feeds the
          current. Every coral you grow is provably yours while it stands: the reef lives on the
          Swimchain network, not on anyone's server, and no one can take it down.
        </p>
        <button className="btn primary" onClick={onClose} autoFocus>
          Back to the reef
        </button>
      </div>
    </div>
  );
}
