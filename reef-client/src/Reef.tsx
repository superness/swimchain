import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cellKey,
  intentAt,
  ownerHue,
  MAX_VITALITY,
  type Cell,
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
  /** Pulse every plantable tile (tutorial step 1: "click any open square"). */
  highlightSeeds: boolean;
}

/** Coral fills more of its tile the healthier it is — vitality is legible as SIZE. */
function vitalityScale(v: number): number {
  const t = Math.max(0, Math.min(1, v / MAX_VITALITY));
  return 0.28 + 0.72 * t; // 28%..100% of the tile
}

export function Reef({ state, myPubkeyHex, myAddress, canAct, growingCell, onAct, highlightSeeds }: Props) {
  const { w, h } = state.header;
  const myHue = ownerHue(myPubkeyHex);

  // Smooth the "coral receded" transition: the fold just drops a dead cell, so
  // without this it would blink out of existence between polls. We diff each
  // update against the previous cells and keep a short-lived "ghost" of any
  // coral that vanished, so it can evaporate (float up + dissolve) in place.
  const prevCells = useRef<Map<string, Cell>>(new Map());
  const [ghosts, setGhosts] = useState<Map<string, { hue: number; size: number }>>(new Map());
  useEffect(() => {
    const prev = prevCells.current;
    const vanished: Array<[string, { hue: number; size: number }]> = [];
    for (const [k, c] of prev) {
      if (!state.cells.has(k)) {
        vanished.push([k, { hue: ownerHue(c.owner), size: vitalityScale(c.vitality) }]);
      }
    }
    prevCells.current = new Map(state.cells);
    if (vanished.length === 0) return;
    setGhosts((g) => {
      const next = new Map(g);
      for (const [k, v] of vanished) next.set(k, v);
      return next;
    });
    const keys = vanished.map(([k]) => k);
    const t = setTimeout(() => {
      setGhosts((g) => {
        const next = new Map(g);
        for (const k of keys) next.delete(k);
        return next;
      });
    }, 750); // must match the evaporate animation duration
    return () => clearTimeout(t);
  }, [state.cells]);

  // Ceremony: when the tide turns (epoch advances), sweep the board so the decay
  // that comes with it reads as the tide claiming the weak coral, not a glitch.
  const prevEpoch = useRef<number | null>(null);
  const [tideTurn, setTideTurn] = useState(false);
  useEffect(() => {
    const prev = prevEpoch.current;
    prevEpoch.current = state.epoch;
    if (prev === null || state.epoch <= prev) return; // no ceremony on load or idle
    setTideTurn(true);
    const t = setTimeout(() => setTideTurn(false), 1600); // matches the sweep animation
    return () => clearTimeout(t);
  }, [state.epoch]);

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
      className={`reef${growingCell ? ' claiming' : ''}${tideTurn ? ' tide-turning' : ''}`}
      style={{ gridTemplateColumns: `repeat(${w}, 1fr)` }}
    >
      {/* Tide ceremony: a wave sweeps the whole board and a caption rises when the
          epoch advances — the reef's heartbeat (decay + regen + scoring). */}
      {tideTurn && (
        <div className="tide" aria-hidden="true">
          <span className="tide-wash" />
          <span className="tide-caption">🌊 The tide turns</span>
        </div>
      )}
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
        if (highlightSeeds && intent?.kind === 'seed' && actionable) cls += ' tut-pulse';

        // Coral rendered as an inner tile scaled by vitality, so fading coral shrinks.
        // A live cell blooms in on first mount; a receded one leaves a ghost that
        // evaporates (see the ghosts diff above).
        const ghost = !cell ? ghosts.get(cellKey(x, y)) : undefined;
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
        } else if (ghost) {
          const s = `${Math.round(ghost.size * 100)}%`;
          coral = (
            <span
              className="coral ghost"
              style={{ width: s, height: s, background: `hsl(${ghost.hue} 70% 52%)` }}
            />
          );
        }

        const growing = !!growingCell && growingCell.x === x && growingCell.y === y;
        if (growing) cls += ' growing';

        const base = growing
          ? `(${x},${y}) taking root…`
          : cell
          ? `(${x},${y}) ${isMe(cell.owner) ? 'yours' : 'coral'} · vitality ${cell.vitality}/${MAX_VITALITY}` +
            (cell.vitality <= 1 ? ' — recedes next tide!' : '')
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
