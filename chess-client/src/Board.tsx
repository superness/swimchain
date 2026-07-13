import { useMemo, useState } from 'react';
import type { Chess, Square } from 'chess.js';

const GLYPH: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

interface BoardProps {
  chess: Chess;
  /** Board orientation — the side shown at the bottom. */
  orientation: 'w' | 'b';
  /** Whether the local player may move right now. */
  canMove: boolean;
  onMove: (san: string) => void;
}

export function Board({ chess, orientation, canMove, onMove }: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const board = chess.board(); // [rank8..rank1][fileA..fileH]

  const legalTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [selected, chess]);

  const rowOrder = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const colOrder = orientation === 'w' ? FILES : [...FILES].reverse();

  function handleClick(sq: Square) {
    if (!canMove) return;
    const piece = chess.get(sq);
    if (selected) {
      if (legalTargets.has(sq)) {
        const candidates = chess.moves({ square: selected, verbose: true }).filter((m) => m.to === sq);
        // On promotion there are 4 candidates (q/r/b/n) — default to queen.
        const mv = candidates.find((m) => m.promotion === 'q') ?? candidates[0];
        if (mv) {
          onMove(mv.san);
          setSelected(null);
          return;
        }
      }
      if (piece && piece.color === chess.turn()) {
        setSelected(sq);
        return;
      }
      setSelected(null);
    } else if (piece && piece.color === chess.turn()) {
      setSelected(sq);
    }
  }

  return (
    <div className="board">
      {rowOrder.map((rank) => (
        <div className="board-row" key={rank}>
          {colOrder.map((file) => {
            const sq = (file + rank) as Square;
            const cell = board[8 - rank][FILES.indexOf(file)];
            const dark = (8 - rank + FILES.indexOf(file)) % 2 === 1;
            const isSel = selected === sq;
            const isTarget = legalTargets.has(sq);
            return (
              <div
                key={sq}
                className={`sq ${dark ? 'dark' : 'light'}${isSel ? ' sel' : ''}${isTarget ? ' target' : ''}${canMove ? ' active' : ''}`}
                onClick={() => handleClick(sq)}
              >
                {cell && <span className="piece">{GLYPH[cell.color + cell.type]}</span>}
                {isTarget && !cell && <span className="dot" />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
