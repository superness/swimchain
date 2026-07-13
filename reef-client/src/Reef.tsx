import { useMemo } from 'react';
import {
  cellKey,
  moveIntent,
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

/** Vitality → 0.35–1.0 opacity, so fading coral visibly recedes. */
function vitalityAlpha(v: number): number {
  const t = Math.max(0, Math.min(1, v / MAX_VITALITY));
  return 0.35 + 0.65 * t;
}

export function Reef({ state, myPubkeyHex, myAddress, canAct, onAct }: Props) {
  const { w, h } = state.header;

  // Precompute intents for the whole grid so hover affordances are cheap.
  const rows = useMemo(() => {
    const out: Array<Array<{ x: number; y: number; intent: Intent }>> = [];
    for (let y = 0; y < h; y++) {
      const row: Array<{ x: number; y: number; intent: Intent }> = [];
      for (let x = 0; x < w; x++) {
        row.push({ x, y, intent: canAct ? moveIntent(state, myPubkeyHex, myAddress, x, y) : null });
      }
      out.push(row);
    }
    return out;
  }, [state, myPubkeyHex, myAddress, canAct, w, h]);

  const isMe = (owner: string) => owner === myPubkeyHex || owner === myAddress;

  return (
    <div className="reef" style={{ gridTemplateColumns: `repeat(${w}, 1fr)` }}>
      {rows.flat().map(({ x, y, intent }) => {
        const cell = state.cells.get(cellKey(x, y));
        const style: React.CSSProperties = {};
        let cls = 'cell';
        if (cell) {
          const hue = ownerHue(cell.owner);
          style.background = `hsl(${hue} 68% 52% / ${vitalityAlpha(cell.vitality)})`;
          if (isMe(cell.owner)) cls += ' mine';
        }
        if (intent) cls += ` act ${intent.kind}`;
        const label = cell
          ? `(${x},${y}) ${isMe(cell.owner) ? 'yours' : 'coral'} · vitality ${cell.vitality}`
          : `(${x},${y}) open water`;
        return (
          <button
            key={cellKey(x, y)}
            className={cls}
            style={style}
            title={intent ? `${label} — ${intent.kind}` : label}
            disabled={!intent}
            onClick={() => intent && onAct(x, y, intent)}
          >
            {cell && isMe(cell.owner) && <span className="pip" />}
          </button>
        );
      })}
    </div>
  );
}
