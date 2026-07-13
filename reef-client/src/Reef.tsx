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

/** Vitality → 0.35–1.0 opacity, so fading coral visibly recedes. */
function vitalityAlpha(v: number): number {
  const t = Math.max(0, Math.min(1, v / MAX_VITALITY));
  return 0.35 + 0.65 * t;
}

export function Reef({ state, myPubkeyHex, myAddress, canAct, onAct }: Props) {
  const { w, h } = state.header;

  // Precompute intents for the whole grid so hover affordances are cheap.
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
        const style: React.CSSProperties = {};
        let cls = 'cell';
        if (cell) {
          const hue = ownerHue(cell.owner);
          style.background = `hsl(${hue} 68% 52% / ${vitalityAlpha(cell.vitality)})`;
          if (isMe(cell.owner)) cls += ' mine';
        }
        // Actionable only if affordable; unaffordable-but-legal cells hint faintly.
        const actionable = !!intent && intent.affordable;
        if (intent) cls += ` ${intent.kind}` + (actionable ? ' act' : ' broke');
        const base = cell
          ? `(${x},${y}) ${isMe(cell.owner) ? 'yours' : 'coral'} · vitality ${cell.vitality}`
          : `(${x},${y}) open water`;
        const title = intent
          ? `${base} — ${intent.kind} (−${intent.cost}${intent.affordable ? '' : ', not enough budget'})`
          : base;
        return (
          <button
            key={cellKey(x, y)}
            className={cls}
            style={style}
            title={title}
            disabled={!actionable}
            onClick={() => actionable && intent && onAct(x, y, intent)}
          >
            {cell && isMe(cell.owner) && <span className="pip" />}
          </button>
        );
      })}
    </div>
  );
}
