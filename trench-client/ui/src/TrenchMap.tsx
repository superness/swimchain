import { useRef, useState } from 'react';
import type { Brightness, ClaimState, MapClaim } from './lib/trenchEngine';

/** Map-units-to-pixels scale, per the brief. */
export const UNIT_PX = 24;

/** Pixels of pointer movement before a drag counts as a pan rather than a
 *  click — lets founding-mode placement and claim selection coexist with
 *  panning without every drag-release also firing an accidental click. */
const DRAG_THRESHOLD = 5;

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
   *  only renders the preview and its App-computed validity. */
  foundingMode?: boolean;
  previewPos?: { x: number; y: number } | null;
  previewOk?: boolean;
  onPickFoundingSpot?: (x: number, y: number) => void;
}

function brightnessClass(b: Brightness | null): string {
  return b ? `b-${b}` : 'b-neutral';
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
}: TrenchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
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
    dragRef.current = null;
  };

  const onStageClick = (e: React.MouseEvent) => {
    if (!foundingMode || !onPickFoundingSpot || !containerRef.current) return;
    // A pan that ends under the pointer still fires a click — ignore it so
    // looking around never accidentally drops a claim.
    if (dragRef.current?.moved) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left - rect.width / 2 - pan.x;
    const localY = e.clientY - rect.top - rect.height / 2 - pan.y;
    onPickFoundingSpot(Math.round(localX / UNIT_PX), Math.round(localY / UNIT_PX));
  };

  const accepted = claims.filter((c) => c.accepted);

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
      <div className="trench-map-field" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
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
              onClick={(e) => {
                e.stopPropagation();
                if (dragRef.current?.moved) return;
                onSelect(c.claimId);
              }}
            >
              <span className="claim-dot" />
              <span className="claim-label">{c.header.name}</span>
              {isOwn && <span className="claim-ring" aria-hidden="true" />}
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
      </div>
      <div className="trench-map-hint fine">
        {foundingMode
          ? 'Drag to look around · click dark ground to place your homestead'
          : 'Drag to look around · click a lantern to visit it'}
      </div>
    </div>
  );
}
