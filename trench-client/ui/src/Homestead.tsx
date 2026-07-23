import { useEffect, useState } from 'react';
import {
  HB_CAP_PER_DAY,
  TEND_COST,
  INTEGRITY_MAX,
  utcDay,
  type ClaimState,
  type MapClaim,
  type Structure,
  type StructureKind,
  type Brightness,
} from './lib/trenchEngine';

/** On-chain quantities are integer half-units; every number shown here is the
 *  WHOLE-unit display value. */
const half = (n: number): string => (n % 2 === 0 ? String(n / 2) : (n / 2).toFixed(1));

const TIER_ICON: Record<Brightness, string> = { LIT: '🏮', DIM: '🕯️', DARK: '🌑' };

const BUILD_INFO: Record<StructureKind, { icon: string; label: string; blurb: string }> = {
  farm: { icon: '🌾', label: 'Kelp farm', blurb: 'yields biomass each day' },
  storehouse: { icon: '📦', label: 'Storehouse', blurb: 'raises both caps' },
  beacon: { icon: '🗼', label: 'Beacon', blurb: 'widens expedition range' },
};

function formatUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export interface HomesteadProps {
  connected: boolean;
  /** The banked ClaimState — source of truth for costs/affordability (what
   *  the node will actually apply when a move lands). */
  ownState: ClaimState;
  /** Live, display-only forward projection of biomass/structures/brightness
   *  (trenchEngine's `project()`) — so the HUD never looks stale between
   *  moves, without ever banking anything itself. */
  viewBiomass: number;
  viewStructures: Structure[];
  viewBrightness: Brightness;
  lanternPulse: boolean;
  busy: boolean;
  sessionStartMs: number;
  costs: Record<StructureKind, number>;
  /** Folded state for every claim the player has loaded this session (their
   *  own claim plus anything visited) — the only claims the glow board can
   *  honestly rank, per the fold isolation rule. */
  loadedStates: Map<string, ClaimState>;
  selectedClaimId: string | null;
  selectedEntry: MapClaim | null;
  selectedState: ClaimState | undefined;
  expeditionEligible: boolean;
  expeditionReason: string | null;
  onBuild: (kind: StructureKind) => void;
  onTend: (idx: number) => void;
  onExpedition: () => void;
}

/** The HUD rail: lantern status, resources, structures, the build palette,
 *  the glow leaderboard, and the selected-claim/expedition panel. */
export function Homestead(props: HomesteadProps) {
  const {
    connected,
    ownState,
    viewBiomass,
    viewStructures,
    viewBrightness,
    lanternPulse,
    busy,
    sessionStartMs,
    costs,
    loadedStates,
    selectedClaimId,
    selectedEntry,
    selectedState,
    expeditionEligible,
    expeditionReason,
    onBuild,
    onTend,
    onExpedition,
  } = props;

  // Ticks the uptime display and the heartbeat-cap readout once a second —
  // purely a display timer, never touches fold state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const hbToday = ownState.heartbeatDays.get(utcDay(now)) ?? 0;

  const leaderboard = Array.from(loadedStates.values())
    .map((s) => ({ claimId: s.claimId, name: s.header.name, glow: s.glow, isOwn: s.claimId === ownState.claimId }))
    .sort((a, b) => b.glow - a.glow);

  return (
    <>
      <div className={`lantern-panel${lanternPulse ? ' pulsing' : ''}`}>
        <div className="lantern-icon" aria-hidden="true">
          {TIER_ICON[viewBrightness]}
        </div>
        <div className="lantern-body">
          <div className="lantern-tier">{viewBrightness}</div>
          <div className="fine">
            <span className={`dot ${connected ? 'ok' : 'bad'}`} /> {connected ? 'node connected' : 'no node'} ·{' '}
            heartbeats {hbToday}/{HB_CAP_PER_DAY} today · up {formatUptime(now - sessionStartMs)} this session
          </div>
        </div>
      </div>

      <div className="resources">
        <div className="resource">
          <span className="fine">salvage</span>
          <div className="res-bar">
            <div
              className="res-fill salvage"
              style={{ width: `${Math.min(100, (ownState.salvage / ownState.capSalvage) * 100)}%` }}
            />
          </div>
          <span className="fine">
            <strong>{half(ownState.salvage)}</strong>/{half(ownState.capSalvage)}
          </span>
        </div>
        <div className="resource">
          <span className="fine">biomass</span>
          <div className="res-bar">
            <div
              className="res-fill biomass"
              style={{ width: `${Math.min(100, (viewBiomass / ownState.capBiomass) * 100)}%` }}
            />
          </div>
          <span className="fine">
            <strong>{half(viewBiomass)}</strong>/{half(ownState.capBiomass)}
          </span>
        </div>
      </div>

      <div className="structures">
        <div className="panel-title fine">Structures</div>
        {viewStructures.length === 0 ? (
          <p className="fine muted">Nothing built yet — the palette below is a start.</p>
        ) : (
          viewStructures.map((s, i) => (
            <div key={i} className={`structure-row${s.ruined ? ' ruined' : ''}`}>
              <span className="struct-icon" aria-hidden="true">
                {BUILD_INFO[s.kind].icon}
              </span>
              <span className="struct-name">{BUILD_INFO[s.kind].label}</span>
              {s.ruined ? (
                <span className="badge ruin">ruin</span>
              ) : (
                <div className="integrity-bar" title={`${s.integrity}/${INTEGRITY_MAX} integrity`}>
                  <div className="integrity-fill" style={{ width: `${(s.integrity / INTEGRITY_MAX) * 100}%` }} />
                </div>
              )}
              <button className="link" disabled={busy || s.ruined || viewBiomass < TEND_COST} onClick={() => onTend(i)}>
                tend {half(TEND_COST)}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="build-palette">
        <div className="panel-title fine">Build</div>
        <div className="build-cards">
          {(['farm', 'storehouse', 'beacon'] as const).map((kind) => {
            const cost = costs[kind];
            const affordable = ownState.salvage >= cost;
            return (
              <button key={kind} className="build-card" disabled={busy || !affordable} onClick={() => onBuild(kind)}>
                <span className="build-icon" aria-hidden="true">
                  {BUILD_INFO[kind].icon}
                </span>
                <span className="build-label">{BUILD_INFO[kind].label}</span>
                <span className="hp-chip">{half(cost)} salvage</span>
                <span className="fine build-blurb">{BUILD_INFO[kind].blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {leaderboard.length > 0 && (
        <div className="glow-board">
          <div className="panel-title fine">Glow</div>
          {leaderboard.map((row, i) => (
            <div key={row.claimId} className={`row${row.isOwn ? ' me' : ''}`}>
              <span className="rank">{i + 1}</span>
              <span className="glow-name">{row.name || 'unnamed'}</span>
              {row.isOwn && <span className="you">you</span>}
              <span className="pts">{row.glow}</span>
            </div>
          ))}
          <p className="fine">Only claims you've loaded (your own, plus any you've visited) count here.</p>
        </div>
      )}

      {selectedClaimId && selectedClaimId !== ownState.claimId && (
        <div className="selected-panel">
          <div className="panel-title fine">{selectedEntry?.header.name || 'that claim'}</div>
          {selectedState ? (
            <p className="fine">
              owner <code title={selectedState.owner}>{selectedState.owner.slice(0, 12)}…</code> · lantern{' '}
              {TIER_ICON[selectedState.brightness]} {selectedState.brightness} · glow {selectedState.glow}
            </p>
          ) : (
            <p className="fine muted">your node is fetching this claim…</p>
          )}
          <button className="btn primary" disabled={busy || !expeditionEligible} onClick={onExpedition}>
            🌊 Send expedition
          </button>
          {expeditionReason && <p className="fine muted">{expeditionReason}</p>}
        </div>
      )}
    </>
  );
}
