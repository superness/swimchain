import { useMemo } from 'react';
import {
  cellKey,
  intentAt,
  ownerHue,
  MAX_VITALITY,
  type Intent,
  type ReefState,
} from './lib/reefEngine';

interface Props {
  state: ReefState;
  myPubkeyHex: string;
  myAddress: string;
  canAct: boolean;
  onAct: (x: number, y: number, intent: Intent) => void;
}

/** Coral fills more of its tile the healthier it is — vitality is legible as SIZE. */
function vitalityScale(v: number): number {
  const t = Math.max(0, Math.min(1, v / MAX_VITALITY));
  return 0.28 + 0.72 * t; // 28%..100% of the tile
}

export function Reef({ state, myPubkeyHex, myAddress, canAct, onAct }: Props) {
  const { w, h } = state.header;

  const cellsView = useMemo(() => {
    const out: Array<{ x: number; y: number; intent: Intent | null }> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        out.push({ x, y, intent: canAct ? intentAt(state, myPubkeyHex, myAddress, x, y) : null });
      }
    }
    return out;
  }, [state, myPubkeyHex, myAddress, canAct, w, h]);

  const isMe = (owner: string) => owner === myPubkeyHex || owner === myAddress;

  return (
    <div className="reef" style={{ gridTemplateColumns: `repeat(${w}, 1fr)` }}>
      {cellsView.map(({ x, y, intent }) => {
        const cell = state.cells.get(cellKey(x, y));
        const actionable = !!intent && intent.affordable;
        let cls = 'cell';
        if (intent) cls += ` ${intent.kind}` + (actionable ? ' act' : ' broke');

        // Coral rendered as an inner tile scaled by vitality, so fading coral shrinks.
        let coral: React.ReactNode = null;
        if (cell) {
          const hue = ownerHue(cell.owner);
          const size = `${Math.round(vitalityScale(cell.vitality) * 100)}%`;
          const mine = isMe(cell.owner);
          let coralCls = 'coral';
          if (mine) coralCls += ' mine';
          if (cell.vitality <= 2) coralCls += ' fading'; // will recede within ~2 tides
          if (cell.vitality <= 1) coralCls += ' dying'; // recedes NEXT tide
          coral = (
            <span
              className={coralCls}
              style={{ width: size, height: size, background: `hsl(${hue} 70% 52%)` }}
            />
          );
        }

        const base = cell
          ? `(${x},${y}) ${isMe(cell.owner) ? 'yours' : 'coral'} · vitality ${cell.vitality}/${MAX_VITALITY}${cell.vitality <= 1 ? ' — recedes next tide!' : ''}`
          : `(${x},${y}) open water`;
        const price = intent ? (intent.cost === 0 ? 'free' : `−${intent.cost}`) : '';
        const title = intent
          ? `${base} — ${intent.kind} (${price}${intent.affordable ? '' : ', not enough budget'})`
          : base;

        return (
          <button
            key={cellKey(x, y)}
            className={cls}
            title={title}
            disabled={!actionable}
            onClick={() => actionable && intent && onAct(x, y, intent)}
          >
            {coral}
          </button>
        );
      })}
    </div>
  );
}
