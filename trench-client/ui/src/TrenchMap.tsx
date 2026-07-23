import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chebyshev, type Brightness, type ClaimState, type MapClaim } from './lib/trenchEngine';

/** Map-units-to-pixels scale, per the brief. */
export const UNIT_PX = 24;

/** Pixels of pointer movement before a drag counts as a pan rather than a
 *  click — lets founding-mode placement and claim selection coexist with
 *  panning without every drag-release also firing an accidental click. */
const DRAG_THRESHOLD = 5;

/** How close (in local pixels, inset from the map's edge) a claim's screen
 *  position has to be to the border before it counts as "off-screen" for the
 *  distant-lights wayfinding chips below. */
const EDGE_MARGIN_PX = 20;
const MAX_DISTANT_LIGHTS = 4;
const PAN_ANIM_MS = 380;

export interface TrenchMapProps {
  /** All claims in the shared space (accepted + rejected); only accepted ones
   *  are rendered — the fold isolation rule means this is display/driver
   *  input only, never a source of anyone's balance. */
  claims: MapClaim[];
  /** Folded state for whichever claims have actually been loaded (own claim,
   *  plus anything the player has selected/visited this session) — brightness
   *  renders from here where present, else a neutral "unknown" pin. */
  loadedStates: Map<string, ClaimState>;
  ownClaimId: string | null;
  selectedClaimId: string | null;
  onSelect: (claimId: string) => void;
  /** Founding mode: clicking open ground reports a candidate (x,y); the
   *  parent (App.tsx) owns CLAIM_MIN_SPACING enforcement — this component
   *  only renders the preview and its App-computed validity. In founding
   *  mode the map also centers its initial view on the centroid of whatever
   *  claims already exist, once, on first mount with claims present — so a
   *  new player sees the world's lights immediately instead of blank water. */
  foundingMode?: boolean;
  previewPos?: { x: number; y: number } | null;
  previewOk?: boolean;
  onPickFoundingSpot?: (x: number, y: number) => void;
  /** One-shot ceremony: a light blooms outward from the own pin right after
   *  founding (reef's claim-wave pattern) — App.tsx owns the timer. */
  justFounded?: boolean;
}

function brightnessClass(b: Brightness | null): string {
  return b ? `b-${b}` : 'b-neutral';
}

function brightnessWord(b: Brightness | null): string {
  return b ?? 'unknown';
}

/** Clamps a direction vector (from the viewport center toward an off-screen
 *  claim) onto the inset border of the container, so the returned point
 *  always lands ON the edge nearest the claim regardless of angle — the
 *  standard "off-screen indicator" technique (classic RTS/minimap arrows). */
function edgePosition(dx: number, dy: number, halfW: number, halfH: number, margin: number): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: halfW, y: margin };
  const tx = dx !== 0 ? (halfW - margin) / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? (halfH - margin) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: halfW + dx * t, y: halfH + dy * t };
}

/** The pannable trench map — a DOM/absolute-positioned field of claim pins,
 *  24px per map unit (see UNIT_PX). Drag anywhere to look around; click a
 *  pin to select it; in founding mode, click open ground to place a claim. */
export function TrenchMap({
  claims,
  loadedStates,
  ownClaimId,
  selectedClaimId,
  onSelect,
  foundingMode = false,
  previewPos = null,
  previewOk = false,
  onPickFoundingSpot,
  justFounded = false,
}: TrenchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [animatingPan, setAnimatingPan] = useState(false);
  const panAnimTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [hoveredClaimId, setHoveredClaimId] = useState<string | null>(null);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  // The browser's synthetic `click` event ALWAYS fires after `pointerup` —
  // so if `endDrag` (bound to pointerup/leave/cancel) nulls `dragRef` first,
  // every click handler that later checks `dragRef.current?.moved` sees
  // `null` and the pan-suppression guard never fires (a drag-release always
  // looked like a fresh, undragged click). Stash the flag here BEFORE
  // nulling `dragRef`, so it survives past pointerup for the click handlers
  // below to consult; the next pointerdown resets it for the new gesture.
  const lastDragMovedRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    lastDragMovedRef.current = false;
    setAnimatingPan(false);
    clearTimeout(panAnimTimerRef.current);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) d.moved = true;
    setPan({ x: d.panX + dx, y: d.panY + dy });
  };
  const endDrag = () => {
    lastDragMovedRef.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
  };

  const onStageClick = (e: React.MouseEvent) => {
    if (!foundingMode || !onPickFoundingSpot || !containerRef.current) return;
    // A pan that ends under the pointer still fires a click — ignore it so
    // looking around never accidentally drops a claim (see lastDragMovedRef's
    // comment above for why this can't just read dragRef here).
    if (lastDragMovedRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left - rect.width / 2 - pan.x;
    const localY = e.clientY - rect.top - rect.height / 2 - pan.y;
    onPickFoundingSpot(Math.round(localX / UNIT_PX), Math.round(localY / UNIT_PX));
  };

  // ── viewport size, for the wayfinding edge math below ───────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      const r = el.getBoundingClientRect();
      setViewSize({ width: r.width, height: r.height });
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const accepted = useMemo(() => claims.filter((c) => c.accepted), [claims]);

  // ── founding mode: center the initial view on the centroid of whatever
  //    claims already exist, once, so a new player sees the lights right
  //    away instead of blank water at (0,0). ──────────────────────────────
  const centeredOnceRef = useRef(false);
  useEffect(() => {
    if (!foundingMode || centeredOnceRef.current || accepted.length === 0) return;
    centeredOnceRef.current = true;
    const cx = accepted.reduce((s, c) => s + c.header.x, 0) / accepted.length;
    const cy = accepted.reduce((s, c) => s + c.header.y, 0) / accepted.length;
    setPan({ x: -cx * UNIT_PX, y: -cy * UNIT_PX });
  }, [foundingMode, accepted]);

  const panToClaim = useCallback((c: MapClaim) => {
    setAnimatingPan(true);
    setPan({ x: -c.header.x * UNIT_PX, y: -c.header.y * UNIT_PX });
    clearTimeout(panAnimTimerRef.current);
    panAnimTimerRef.current = setTimeout(() => setAnimatingPan(false), PAN_ANIM_MS);
  }, []);
  useEffect(() => () => clearTimeout(panAnimTimerRef.current), []);

  // ── distant-lights wayfinding: claims currently outside the viewport get a
  //    small pulsing edge chip pointing toward them, nearest first, capped at
  //    MAX_DISTANT_LIGHTS. Own claim is never shown (no point pointing you at
  //    yourself). ─────────────────────────────────────────────────────────
  const distantLights = useMemo(() => {
    if (viewSize.width === 0 || viewSize.height === 0) return [];
    const halfW = viewSize.width / 2;
    const halfH = viewSize.height / 2;
    const centerMapX = -pan.x / UNIT_PX;
    const centerMapY = -pan.y / UNIT_PX;
    return accepted
      .filter((c) => c.claimId !== ownClaimId)
      .map((c) => {
        const screenX = halfW + c.header.x * UNIT_PX + pan.x;
        const screenY = halfH + c.header.y * UNIT_PX + pan.y;
        const visible =
          screenX > EDGE_MARGIN_PX &&
          screenX < viewSize.width - EDGE_MARGIN_PX &&
          screenY > EDGE_MARGIN_PX &&
          screenY < viewSize.height - EDGE_MARGIN_PX;
        return { c, visible, dist: chebyshev(centerMapX, centerMapY, c.header.x, c.header.y), dx: screenX - halfW, dy: screenY - halfH };
      })
      .filter((e) => !e.visible)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, MAX_DISTANT_LIGHTS)
      .map((e) => ({ ...e, pos: edgePosition(e.dx, e.dy, halfW, halfH, EDGE_MARGIN_PX) }));
  }, [accepted, viewSize, pan, ownClaimId]);

  const ownEntry = useMemo(() => (ownClaimId ? accepted.find((c) => c.claimId === ownClaimId) ?? null : null), [accepted, ownClaimId]);
  const hoveredEntry = useMemo(
    () => (hoveredClaimId ? accepted.find((c) => c.claimId === hoveredClaimId) ?? null : null),
    [accepted, hoveredClaimId]
  );

  return (
    <div
      ref={containerRef}
      className={`trench-map${foundingMode ? ' founding' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      onClick={onStageClick}
    >
      <div className="map-parallax" aria-hidden="true">
        <div className="mote-layer layer-1" style={{ transform: `translate(${pan.x * 0.03}px, ${pan.y * 0.03}px)` }} />
        <div className="mote-layer layer-2" style={{ transform: `translate(${pan.x * 0.07}px, ${pan.y * 0.07}px)` }} />
        <div className="mote-layer layer-3" style={{ transform: `translate(${pan.x * 0.12}px, ${pan.y * 0.12}px)` }} />
      </div>
      <div
        className={`trench-map-field${animatingPan ? ' animated' : ''}`}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        <span className="trench-map-origin" aria-hidden="true" />
        {accepted.map((c) => {
          const st = loadedStates.get(c.claimId);
          const isOwn = c.claimId === ownClaimId;
          const isSelected = c.claimId === selectedClaimId;
          return (
            <button
              key={c.claimId}
              type="button"
              className={`claim-pin ${brightnessClass(st?.brightness ?? null)}${isOwn ? ' own' : ''}${
                isSelected ? ' selected' : ''
              }`}
              style={{
                left: `calc(50% + ${c.header.x * UNIT_PX}px)`,
                top: `calc(50% + ${c.header.y * UNIT_PX}px)`,
              }}
              title={`${c.header.name} (${c.header.x}, ${c.header.y})`}
              onMouseEnter={() => setHoveredClaimId(c.claimId)}
              onMouseLeave={() => setHoveredClaimId((cur) => (cur === c.claimId ? null : cur))}
              onClick={(e) => {
                e.stopPropagation();
                if (lastDragMovedRef.current) return;
                onSelect(c.claimId);
              }}
            >
              <span className="claim-dot" />
              <span className="claim-label">{c.header.name}</span>
              {isOwn && <span className="claim-ring" aria-hidden="true" />}
              {isOwn && justFounded && (
                <>
                  <span className="claim-wave" aria-hidden="true" />
                  <span className="claim-wave w2" aria-hidden="true" />
                  <span className="claim-wave w3" aria-hidden="true" />
                </>
              )}
            </button>
          );
        })}
        {foundingMode && previewPos && (
          <span
            className={`claim-preview${previewOk ? ' ok' : ' bad'}`}
            style={{
              left: `calc(50% + ${previewPos.x * UNIT_PX}px)`,
              top: `calc(50% + ${previewPos.y * UNIT_PX}px)`,
            }}
            aria-hidden="true"
          />
        )}
        {hoveredEntry && (
          <div
            className="claim-tooltip"
            style={{
              left: `calc(50% + ${hoveredEntry.header.x * UNIT_PX}px)`,
              top: `calc(50% + ${hoveredEntry.header.y * UNIT_PX}px)`,
            }}
            aria-hidden="true"
          >
            <div className="claim-tooltip-name">{hoveredEntry.header.name}</div>
            <div className="claim-tooltip-meta">
              {brightnessWord(loadedStates.get(hoveredEntry.claimId)?.brightness ?? null)}
              {ownEntry && ownEntry.claimId !== hoveredEntry.claimId && (
                <> · {chebyshev(ownEntry.header.x, ownEntry.header.y, hoveredEntry.header.x, hoveredEntry.header.y)} units away</>
              )}
            </div>
          </div>
        )}
      </div>
      {distantLights.map(({ c, pos, dist }) => (
        <button
          key={`wf-${c.claimId}`}
          type="button"
          className="distant-light"
          style={{ left: pos.x, top: pos.y }}
          onClick={(e) => {
            e.stopPropagation();
            panToClaim(c);
          }}
          title={`${c.header.name} — ${dist} units away`}
        >
          <span className="distant-light-dot" aria-hidden="true" />
          <span className="distant-light-label">{c.header.name}</span>
        </button>
      ))}
      <div className="trench-map-hint fine">
        {foundingMode
          ? 'Drag to look around · click dark ground to place your homestead'
          : 'Drag to look around · click a lantern to visit it'}
      </div>
    </div>
  );
}
