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

  // Last move's from/to squares — highlighted so a player returning to the
  // board (or one who can't read SAN) can instantly see what just happened,
  // without decoding "Nf3". chess.js history carries verbose move objects.
  const lastMove = useMemo(() => {
    const hist = chess.history({ verbose: true });
    const m = hist[hist.length - 1];
    return m ? { from: m.from as string, to: m.to as string, san: m.san } : null;
  }, [chess]);

  const legalTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [selected, chess]);

  // The checked king's square, so danger is visible ON the board, not only in
  // the HUD text.
  const checkSq = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === 'k' && p.color === chess.turn()) return (FILES[f] + (8 - r)) as Square;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess]);

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
      {rowOrder.map((rank, rowIdx) => (
        <div className="board-row" key={rank}>
          {colOrder.map((file, colIdx) => {
            const sq = (file + rank) as Square;
            const cell = board[8 - rank][FILES.indexOf(file)];
            const dark = (8 - rank + FILES.indexOf(file)) % 2 === 1;
            const isSel = selected === sq;
            const isTarget = legalTargets.has(sq);
            const isLastFrom = lastMove?.from === sq;
            const isLastTo = lastMove?.to === sq;
            const isCheck = checkSq === sq;
            return (
              <div
                key={sq}
                className={`sq ${dark ? 'dark' : 'light'}${isSel ? ' sel' : ''}${isTarget ? ' target' : ''}${isTarget && cell ? ' capture' : ''}${isLastFrom ? ' last-from' : ''}${isLastTo ? ' last-to' : ''}${isCheck ? ' check' : ''}${canMove ? ' active' : ''}`}
                onClick={() => handleClick(sq)}
                title={isLastTo ? `last move: ${lastMove?.san}` : undefined}
              >
                {cell && <span className="piece">{GLYPH[cell.color + cell.type]}</span>}
                {isTarget && !cell && <span className="dot" />}
                {isLastTo && <span className="last-badge" aria-hidden="true" />}
                {colIdx === 0 && <span className="coord rank" aria-hidden="true">{rank}</span>}
                {rowIdx === 7 && <span className="coord file" aria-hidden="true">{file}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
