import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { chebyshev, type Brightness, type ClaimState, type MapClaim } from './lib/trenchEngine';
import { prefersReducedMotion } from './lib/reducedMotion';

/** Map-units-to-pixels scale, per the brief — this is the scale AT ZOOM 1;
 *  every screen-space computation below multiplies by the live `zoom` too. */
export const UNIT_PX = 24;

/** Camera zoom range (designer spec §6 "Global rules"). */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;

/** Pixels of pointer movement before a drag counts as a pan rather than a
 *  click — lets founding-mode placement and claim selection coexist with
 *  panning without every drag-release also firing an accidental click.
 *  Checked against the RAW screen-space delta (not divided by zoom) — the
 *  physical intent threshold is a screen-space quantity regardless of how
 *  zoomed in the camera happens to be. */
const DRAG_THRESHOLD = 5;

/** How close (in local pixels, inset from the map's edge) a claim's screen
 *  position has to be to the border before it counts as "off-screen" for the
 *  distant-lights wayfinding chips below. */
const EDGE_MARGIN_PX = 20;
const MAX_DISTANT_LIGHTS = 4;
const PAN_ANIM_MS = 380;

/** Imperative camera control for the guided descent (designer spec §6): a
 *  tweened pan+zoom to a world point, transform-origin fixed at the map's own
 *  center so the target world point ends up centered on screen. `ms` is
 *  honored as given; reduced-motion callers should pass `0` themselves (App
 *  owns that decision per-beat) — but as a defensive backstop `flyTo` ALSO
 *  collapses to an instant cut if `prefers-reduced-motion` is live, since a
 *  cinematic camera move is exactly the kind of motion that setting bans. */
export interface TrenchMapHandle {
  flyTo(mapX: number, mapY: number, zoom: number, ms: number): void;
}

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
  /** Guided-descent beat 1: the preview marker gets a continuous pulsing
   *  ring (distinct from the one-shot founding-bloom `claim-wave` triple)
   *  to read as "the game is suggesting this spot," not just a live preview. */
  previewSuggested?: boolean;
  /** One-shot ceremony: a light blooms outward from the own pin right after
   *  founding (reef's claim-wave pattern) — App.tsx owns the timer. */
  justFounded?: boolean;
  /** Guided-descent beat 5: a single (non-triple) wave on the own pin the
   *  moment a directed build move is submitted — the "silt-puff" cue that
   *  rides alongside the tut-card's build-flavor copy in place of a spinner. */
  buildPuff?: boolean;
  /** Guided-descent beat 4: distant claim pins twinkle in, staggered, as the
   *  camera zooms out to reveal the abyss. Applies once, on the pins/chips
   *  currently off-screen-or-not at the moment this flips true. */
  revealDistant?: boolean;
  /** Guided-descent beat 7: the expedition target pin brightens once its
   *  move lands (v1 of the mote light-trail per the spec's own risk note). */
  flashClaimId?: string | null;
  /** Guided-descent locks (spec's Locked column, per beat): disables drag-
   *  pan, pin selection, and/or hides the wayfinding chips without touching
   *  the underlying data — a locked map still SHOWS the world, just doesn't
   *  let the player drive it yet. */
  panDisabled?: boolean;
  selectionDisabled?: boolean;
  wayfindingHidden?: boolean;
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

/** The pannable, zoomable trench map — a DOM/absolute-positioned field of
 *  claim pins, 24px per map unit at zoom 1 (see UNIT_PX). Drag anywhere to
 *  look around; click a pin to select it; in founding mode, click open
 *  ground to place a claim. Camera zoom (0.5x-2.5x) is a CSS `scale()` on
 *  the same pan field, transform-origin at its own center — since pin/
 *  preview/tooltip positions are all rendered as children of that scaled
 *  field via `left/top: calc(50% + mapUnit*UNIT_PX)`, the browser's own
 *  transform math keeps their SCREEN positions (and hit targets — pointer
 *  events hit-test through CSS transforms correctly with zero extra code)
 *  correct at any zoom for free. The three things that read `mapX*UNIT_PX`
 *  by hand OUTSIDE that transformed subtree — the founding click's screen-
 *  to-map conversion, drag-pan deltas, and the wayfinding edge-chip math
 *  (those chips live in screen space, not world space, since a wayfinding
 *  arrow must stay a constant on-screen size regardless of zoom) — are the
 *  only three places threading `zoom` through by hand is actually required;
 *  see each one's own comment below for the derivation. */
export const TrenchMap = forwardRef<TrenchMapHandle, TrenchMapProps>(function TrenchMap(
  {
    claims,
    loadedStates,
    ownClaimId,
    selectedClaimId,
    onSelect,
    foundingMode = false,
    previewPos = null,
    previewOk = false,
    onPickFoundingSpot,
    previewSuggested = false,
    justFounded = false,
    buildPuff = false,
    revealDistant = false,
    flashClaimId = null,
    panDisabled = false,
    selectionDisabled = false,
    wayfindingHidden = false,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [animatingPan, setAnimatingPan] = useState(false);
  const [animMs, setAnimMs] = useState(PAN_ANIM_MS);
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
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (panDisabled) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    lastDragMovedRef.current = false;
    setAnimatingPan(false);
    clearTimeout(panAnimTimerRef.current);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const rawDx = e.clientX - d.startClientX;
    const rawDy = e.clientY - d.startClientY;
    if (Math.abs(rawDx) > DRAG_THRESHOLD || Math.abs(rawDy) > DRAG_THRESHOLD) d.moved = true;
    // A screen-space pointer delta of `rawDx` px must move the camera by
    // `rawDx / zoom` WORLD-scaled px, since the field's own transform is
    // `translate(pan*zoom) scale(zoom)` (see the render below) — panning at
    // 2.5x by the same `pan` delta as at 1x would visually move the map
    // 2.5x further than the pointer actually traveled.
    const z = zoomRef.current;
    setPan({ x: d.panX + rawDx / z, y: d.panY + rawDy / z });
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
    // Inverse of the field's `translate(pan*zoom) scale(zoom)` transform:
    // a screen offset-from-center of `d` corresponds to world-space
    // `d/zoom - pan` (see the render's derivation comment) — at zoom 1 this
    // collapses back to the original `d - pan` math exactly.
    const z = zoomRef.current;
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    const localX = offsetX / z - pan.x;
    const localY = offsetY / z - pan.y;
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
    setAnimMs(PAN_ANIM_MS);
    setAnimatingPan(true);
    setPan({ x: -c.header.x * UNIT_PX, y: -c.header.y * UNIT_PX });
    clearTimeout(panAnimTimerRef.current);
    panAnimTimerRef.current = setTimeout(() => setAnimatingPan(false), PAN_ANIM_MS);
  }, []);
  useEffect(() => () => clearTimeout(panAnimTimerRef.current), []);

  // ── imperative camera control for the guided descent (App.tsx calls this
  //    per the script's Camera column) ────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      flyTo(mapX: number, mapY: number, targetZoom: number, ms: number) {
        const clampedZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom));
        const nextPan = { x: -mapX * UNIT_PX, y: -mapY * UNIT_PX };
        clearTimeout(panAnimTimerRef.current);
        if (ms <= 0 || prefersReducedMotion()) {
          setAnimatingPan(false);
          setPan(nextPan);
          setZoom(clampedZoom);
          return;
        }
        setAnimMs(ms);
        setAnimatingPan(true);
        setPan(nextPan);
        setZoom(clampedZoom);
        panAnimTimerRef.current = setTimeout(() => setAnimatingPan(false), ms);
      },
    }),
    []
  );

  // ── distant-lights wayfinding: claims currently outside the viewport get a
  //    small pulsing edge chip pointing toward them, nearest first, capped at
  //    MAX_DISTANT_LIGHTS. Own claim is never shown (no point pointing you at
  //    yourself). These chips live OUTSIDE the zoomed `.trench-map-field`
  //    (screen-space UI chrome, not world content — an arrow needs to stay a
  //    constant size regardless of zoom), so their screen position must be
  //    computed by hand: `halfW/H + zoom*(pan + mapUnit*UNIT_PX)`, the same
  //    "translate(pan*zoom) scale(zoom)" derivation as flyTo/onStageClick
  //    above, just walked forward instead of inverted. `centerMapX/Y` (what
  //    world point the CAMERA is centered on) is zoom-INDEPENDENT — the
  //    camera's world position is `-pan/UNIT_PX` regardless of how zoomed in
  //    it is, so that one line is unchanged from the pre-zoom version. ──────
  const distantLights = useMemo(() => {
    if (viewSize.width === 0 || viewSize.height === 0) return [];
    const halfW = viewSize.width / 2;
    const halfH = viewSize.height / 2;
    const centerMapX = -pan.x / UNIT_PX;
    const centerMapY = -pan.y / UNIT_PX;
    return accepted
      .filter((c) => c.claimId !== ownClaimId)
      .map((c) => {
        const screenX = halfW + zoom * (pan.x + c.header.x * UNIT_PX);
        const screenY = halfH + zoom * (pan.y + c.header.y * UNIT_PX);
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
  }, [accepted, viewSize, pan, zoom, ownClaimId]);

  const ownEntry = useMemo(() => (ownClaimId ? accepted.find((c) => c.claimId === ownClaimId) ?? null : null), [accepted, ownClaimId]);
  const hoveredEntry = useMemo(
    () => (hoveredClaimId ? accepted.find((c) => c.claimId === hoveredClaimId) ?? null : null),
    [accepted, hoveredClaimId]
  );

  // Beat 4's staggered pin twinkle-in: a fresh 150ms-apart order over every
  // non-own accepted claim, recomputed only when `revealDistant` flips on.
  const twinkleOrder = useMemo(() => {
    if (!revealDistant) return new Map<string, number>();
    const others = accepted.filter((c) => c.claimId !== ownClaimId);
    return new Map(others.map((c, i) => [c.claimId, i]));
  }, [revealDistant, accepted, ownClaimId]);

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
        style={{
          // translate(pan*zoom) scale(zoom), transform-origin at this field's
          // own center (= the container's center, since it's inset:0) — see
          // the component doc comment for the full derivation. At zoom===1
          // this is byte-for-byte the pre-zoom transform.
          transform: `translate(${pan.x * zoom}px, ${pan.y * zoom}px) scale(${zoom})`,
          transitionDuration: animatingPan ? `${animMs}ms` : undefined,
        }}
      >
        <span className="trench-map-origin" aria-hidden="true" />
        {accepted.map((c) => {
          const st = loadedStates.get(c.claimId);
          const isOwn = c.claimId === ownClaimId;
          const isSelected = c.claimId === selectedClaimId;
          const twinkleIdx = twinkleOrder.get(c.claimId);
          return (
            <button
              key={c.claimId}
              type="button"
              className={`claim-pin ${brightnessClass(st?.brightness ?? null)}${isOwn ? ' own' : ''}${
                isSelected ? ' selected' : ''
              }${twinkleIdx !== undefined ? ' twinkle-in' : ''}${flashClaimId === c.claimId ? ' descent-flash-pin' : ''}`}
              style={{
                left: `calc(50% + ${c.header.x * UNIT_PX}px)`,
                top: `calc(50% + ${c.header.y * UNIT_PX}px)`,
                animationDelay: twinkleIdx !== undefined ? `${Math.min(twinkleIdx, 8) * 150}ms` : undefined,
              }}
              disabled={selectionDisabled}
              title={`${c.header.name} (${c.header.x}, ${c.header.y})`}
              onMouseEnter={() => setHoveredClaimId(c.claimId)}
              onMouseLeave={() => setHoveredClaimId((cur) => (cur === c.claimId ? null : cur))}
              onClick={(e) => {
                e.stopPropagation();
                if (lastDragMovedRef.current || selectionDisabled) return;
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
              {isOwn && buildPuff && <span className="claim-wave silt-puff" aria-hidden="true" />}
            </button>
          );
        })}
        {foundingMode && previewPos && (
          <span
            className={`claim-preview${previewOk ? ' ok' : ' bad'}${previewSuggested && previewOk ? ' suggested' : ''}`}
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
      {!wayfindingHidden &&
        distantLights.map(({ c, pos, dist }) => {
          const twinkleIdx = twinkleOrder.get(c.claimId);
          return (
            <button
              key={`wf-${c.claimId}`}
              type="button"
              className={`distant-light${twinkleIdx !== undefined ? ' twinkle-in' : ''}`}
              style={{ left: pos.x, top: pos.y, animationDelay: twinkleIdx !== undefined ? `${Math.min(twinkleIdx, 8) * 150}ms` : undefined }}
              onClick={(e) => {
                e.stopPropagation();
                panToClaim(c);
              }}
              title={`${c.header.name} — ${dist} units away`}
            >
              <span className="distant-light-dot" aria-hidden="true" />
              <span className="distant-light-label">{c.header.name}</span>
            </button>
          );
        })}
      <div className="trench-map-hint fine">
        {foundingMode
          ? 'Drag to look around · click dark ground to place your homestead'
          : 'Drag to look around · click a lantern to visit it'}
      </div>
    </div>
  );
});
