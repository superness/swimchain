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
  /** The tile a move is currently taking root on — animates in place. */
  growingCell: { x: number; y: number } | null;
  onAct: (x: number, y: number, intent: Intent) => void;
}

/** Coral fills more of its tile the healthier it is — vitality is legible as SIZE. */
function vitalityScale(v: number): number {
  const t = Math.max(0, Math.min(1, v / MAX_VITALITY));
  return 0.28 + 0.72 * t; // 28%..100% of the tile
}

export function Reef({ state, myPubkeyHex, myAddress, canAct, growingCell, onAct }: Props) {
  const { w, h } = state.header;
  const myHue = ownerHue(myPubkeyHex);

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
    <div
      className={`reef${growingCell ? ' claiming' : ''}`}
      style={{ gridTemplateColumns: `repeat(${w}, 1fr)` }}
    >
      {/* Whole-board "the reef is working to claim this spot" layer: energy waves
          ripple out from the target tile across the entire grid while the move
          takes hold, with a soft board-wide charge glow. */}
      {growingCell && (
        <div
          className="reef-claim"
          style={
            {
              '--cx': `${((growingCell.x + 0.5) / w) * 100}%`,
              '--cy': `${((growingCell.y + 0.5) / h) * 100}%`,
              '--grow-hue': String(myHue),
            } as React.CSSProperties
          }
        >
          <span className="claim-glow" />
          <span className="claim-wave" />
          <span className="claim-wave w2" />
          <span className="claim-wave w3" />
        </div>
      )}
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
          const settling = state.frontier.has(cellKey(x, y)); // not yet reorg-safe
          let coralCls = 'coral';
          if (mine) coralCls += ' mine';
          if (settling) coralCls += ' settling'; // ownership can still flip as the chain buries this move
          if (cell.vitality <= 2) coralCls += ' fading'; // will recede within ~2 tides
          if (cell.vitality <= 1) coralCls += ' dying'; // recedes NEXT tide
          coral = (
            <span
              className={coralCls}
              style={{ width: size, height: size, background: `hsl(${hue} 70% 52%)` }}
            />
          );
        }

        const growing = !!growingCell && growingCell.x === x && growingCell.y === y;
        if (growing) cls += ' growing';

        const base = growing
          ? `(${x},${y}) taking root…`
          : cell
          ? `(${x},${y}) ${isMe(cell.owner) ? 'yours' : 'coral'} · vitality ${cell.vitality}/${MAX_VITALITY}` +
            (cell.vitality <= 1 ? ' — recedes next tide!' : '') +
            (state.frontier.has(cellKey(x, y)) ? ' · still taking hold…' : '')
          : `(${x},${y}) open water`;
        let note = '';
        if (intent) {
          const price = intent.cost === 0 ? 'free' : `−${intent.cost}`;
          const blocked = intent.affordable
            ? ''
            : intent.limit === 'capacity'
              ? ', no tending left this tide'
              : ', not enough budget';
          note = ` — ${intent.kind} (${price}${blocked})`;
        }
        const title = `${base}${note}`;

        return (
          <button
            key={cellKey(x, y)}
            className={cls}
            title={title}
            disabled={!actionable}
            onClick={() => actionable && intent && onAct(x, y, intent)}
          >
            {coral}
            {growing && (
              <span className="sprout" style={{ ['--grow-hue' as string]: String(myHue) }}>
                <span className="sprout-core" />
                <span className="sprout-ring" />
                <span className="sprout-ring r2" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
