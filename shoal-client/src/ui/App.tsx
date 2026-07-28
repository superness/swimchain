/**
 * The window — the sea, and nothing else on top of it.
 *
 * DISPLAY SIDE. This is the only file in the render path that reads a clock or
 * touches the DOM; `render.ts` and `seaPaint.ts` are both pure in the time
 * they are handed, which is what lets the projection be tested in node.
 *
 * THE DIEGETIC RULE (spec 1.1) IS WHY THERE IS NO CHROME HERE. Not a title,
 * not a legend, not a swimmer's name, not a size readout — the whole surface
 * is water and fish. Spec 2.8 says size is worn on the body and IS the
 * scoreboard, so a number in the corner would be a second, worse scoreboard
 * competing with the one the game is actually about.
 *
 * Two developer affordances survive, both wordless:
 *   - a dim dot in the bottom-right corner, and F1, toggle Task 1's
 *     diagnostics panel. Tasks 5-7 still need it, and it is the only way to
 *     see whether the sidecar is alive, so it stays reachable — just not
 *     visible enough to be part of the game.
 *   - `1` and `2` switch which sea is being folded (see demoSea.ts).
 *
 * WHAT DRIVES THE WORLD: `demoSea.ts`, which writes swim vectors into a log
 * and folds it through `advance`. Task 5 replaces the scripted writers with
 * the player's own input and Task 7 with a second real client; the seam is
 * one `Sea` object, and nothing below it knows the difference.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Diagnostics } from './Diagnostics';
import { harnessSea, livelySea, type Sea } from './demoSea';
import { paintFrame, type Swimmer } from './seaPaint';
import { fitScale, followCamera, type Camera, type Viewport } from './render';
import { WORLD_H, WORLD_W } from '../lib/shoalConst';

type SceneKind = 'lively' | 'harness';

/** How long a swept swimmer is drawn dazed. Spec 2.9's "a few seconds". */
const DAZED_MS = 2_500;

export function App() {
  const [showDiag, setShowDiag] = useState(false);
  const [scene, setScene] = useState<SceneKind>('lively');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1' || e.key === '`') { e.preventDefault(); setShowDiag((v) => !v); }
      else if (e.key === '1') setScene('lively');
      else if (e.key === '2') setScene('harness');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startWall = Date.now();
    const sea: Sea = scene === 'harness' ? harnessSea(startWall) : livelySea(startWall);

    let cam: Camera | null = null;
    let raf = 0;
    let alive = true;

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);

      // The window, in CSS pixels; the backing store, in device pixels. Both
      // are re-read every frame so a resize needs no listener and can never
      // leave the projection on a stale viewport.
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 1;
      const cssH = canvas.clientHeight || 1;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const view: Viewport = { w: cssW, h: cssH };

      const wall = Date.now();
      const state = sea.step(wall);
      const atMs = sea.seaMs(wall);

      const swimmers: Swimmer[] = [];
      for (const f of state.fish.values()) {
        swimmers.push({
          id: f.id,
          size: f.size,
          vec: f.vec,
          self: f.id === sea.selfId,
          scattered: state.lastTaken.includes(f.id) && atMs - state.lastSweepMs < DAZED_MS,
        });
      }

      // Follow the player. Before their first vector arrives — and in the
      // harness scenario for its first fold — there is nobody to follow, so
      // the camera sits on the middle of the water rather than at the origin,
      // which would open on empty black.
      const me = state.fish.get(sea.selfId);
      const tx = me ? me.x : WORLD_W / 2;
      const ty = me ? me.y : WORLD_H / 2;
      if (cam === null) cam = { x: tx, y: ty, scale: fitScale(view) };
      cam = followCamera(cam, tx, ty, view);

      paintFrame(ctx, { view, cam, atMs, swimmers });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [scene]);

  return (
    <div style={S.page}>
      <canvas ref={canvasRef} style={S.canvas} />
      {showDiag && (
        <div style={S.diagOverlay}>
          <Diagnostics />
        </div>
      )}
      <button
        style={S.dot}
        aria-label="diagnostics"
        onClick={() => setShowDiag((v) => !v)}
      />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { position: 'fixed', inset: 0, background: '#01060a', overflow: 'hidden' },
  canvas: { display: 'block', width: '100%', height: '100%' },
  diagOverlay: { position: 'absolute', inset: 0, overflow: 'auto', background: 'rgba(3, 15, 22, 0.94)' },
  // Wordless, dim, and out of the way: a developer can find it, a player will
  // never read it as part of the game.
  dot: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 9,
    height: 9,
    padding: 0,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(150, 200, 220, 0.22)',
    cursor: 'pointer',
  },
};
