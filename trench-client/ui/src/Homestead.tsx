import { useEffect, useMemo, useState } from 'react';
import {
  HB_CAP_PER_DAY,
  TEND_COST,
  INTEGRITY_MAX,
  LIT_MIN,
  DIM_MIN,
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

/** Visual granularity of the heartbeats-this-week meter — a fixed number of
 *  ticks filled proportionally to `hbWeek / meterTarget`. The THRESHOLD each
 *  tick is proportional to (LIT_MIN/DIM_MIN, per brightness) always comes
 *  from the engine constants below; this is purely how many ticks are drawn. */
const METER_SEGMENTS = 10;

/** Health band for an integrity bar's color + whether it earns the
 *  low-integrity danger pulse — thresholds are fractions of INTEGRITY_MAX,
 *  never a raw hardcoded integrity number. */
function healthBand(pct: number): 'good' | 'warn' | 'danger' {
  if (pct >= 0.6) return 'good';
  if (pct >= 0.3) return 'warn';
  return 'danger';
}

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
  /** Lantern telemetry, diegetic labels per spec §4. `neighborsInReach` is
   *  NOT P2P peer count — it's every OTHER accepted claim on the map within
   *  this claim's expedition range (own-owner or not; see App.tsx). `null`
   *  until `ownState` first loads (map-derived, not from the status poll). */
  neighborsInReach: number | null;
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
  /** One-shot ceremony beat (App.tsx owns the timer): the lantern just
   *  crossed a brightness tier. */
  tierShift: boolean;
  /** Structure indices mid-ruin-collapse ceremony (App.tsx owns the timer,
   *  diffed from the folded state — see the ruin toast wired through the
   *  existing notice system). */
  ruinFlashIdx: Set<number>;
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
  /** Chebyshev distance from your own claim to the selected one — `null`
   *  until both headers are known. Shown even when out of range (that's the
   *  point: the player can see exactly how far short they are). */
  selectedDist: number | null;
  expeditionEligible: boolean;
  expeditionReason: string | null;
  onBuild: (kind: StructureKind) => void;
  onTend: (idx: number) => void;
  /** `harvest` is always `ok` on the chain — banking (yield/decay/glow) has
   *  already run by the time any move folds, heartbeat included. Its real
   *  purpose here is a manual "bank now" nudge: it's the one move a player
   *  can take that ISN'T gated by the heartbeat cap, so once HB_CAP_PER_DAY
   *  is spent for the day (or in the gap before the scheduler's next tick),
   *  the player still has a way to settle a big pending glow/decay swing
   *  instead of just watching the live projection and waiting. */
  onHarvest: () => void;
  onExpedition: () => void;
}

/** The HUD rail: lantern status, resources, structures, the build palette,
 *  the glow leaderboard, and the selected-claim/expedition panel. */
export function Homestead(props: HomesteadProps) {
  const {
    connected,
    neighborsInReach,
    ownState,
    viewBiomass,
    viewStructures,
    viewBrightness,
    lanternPulse,
    tierShift,
    ruinFlashIdx,
    busy,
    sessionStartMs,
    costs,
    loadedStates,
    selectedClaimId,
    selectedEntry,
    selectedState,
    selectedDist,
    expeditionEligible,
    expeditionReason,
    onBuild,
    onTend,
    onHarvest,
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

  // Heartbeats-landed-over-the-trailing-7-days sum (the same window
  // `brightnessOn` sums in the engine — see trenchEngine.ts), toward
  // whichever tier threshold is next. Never a hardcoded number: DIM_MIN /
  // LIT_MIN are the engine's own constants.
  const hbWeek = useMemo(() => {
    const day = utcDay(now);
    let sum = 0;
    for (let d = day - 6; d <= day; d++) sum += ownState.heartbeatDays.get(d) ?? 0;
    return sum;
  }, [ownState.heartbeatDays, now]);
  const meterTarget = viewBrightness === 'DARK' ? DIM_MIN : LIT_MIN;
  const meterNextTier = viewBrightness === 'DARK' ? 'DIM' : viewBrightness === 'DIM' ? 'LIT' : null;
  const filledSegments = Math.max(0, Math.min(METER_SEGMENTS, Math.round((hbWeek / meterTarget) * METER_SEGMENTS)));

  const leaderboard = Array.from(loadedStates.values())
    .map((s) => ({ claimId: s.claimId, name: s.header.name, glow: s.glow, isOwn: s.claimId === ownState.claimId }))
    .sort((a, b) => b.glow - a.glow);

  return (
    <>
      <div
        className={`lantern-panel b-${viewBrightness}${lanternPulse ? ' pulsing' : ''}${tierShift ? ' tier-shift' : ''}`}
      >
        <div className="lantern-icon" aria-hidden="true">
          <span className="lf-glow" />
          <span className="lf-flame" />
        </div>
        <div className="lantern-body">
          <div className="lantern-tier">{viewBrightness}</div>
          <div className="fine" title={`burning ${formatUptime(now - sessionStartMs)}`}>
            beats {hbToday}/{HB_CAP_PER_DAY} today
          </div>
          {neighborsInReach !== null && (
            <div className="fine">{neighborsInReach} neighbors in reach</div>
          )}
          <div className="hb-meter" title={`${hbWeek} of ${meterTarget} beats this week`}>
            <div className="hb-meter-segments">
              {Array.from({ length: METER_SEGMENTS }, (_, i) => (
                <span key={i} className={`hb-seg${i < filledSegments ? ' filled' : ''}`} />
              ))}
            </div>
            <span className="fine hb-meter-label">
              {hbWeek} of {meterTarget} beats this week{meterNextTier ? ` — next: ${meterNextTier}` : ' — steady and LIT'}
            </span>
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
        <button className="link harvest-btn" disabled={!connected || busy} onClick={onHarvest} title="Bank your growth now.">
          Harvest
        </button>
      </div>

      <div className="structures">
        <div className="panel-title fine">Structures</div>
        {viewStructures.length === 0 ? (
          <p className="fine muted">Nothing built yet.</p>
        ) : (
          viewStructures.map((s, i) => {
            const pct = s.integrity / INTEGRITY_MAX;
            const band = healthBand(pct);
            return (
              <div key={i} className={`structure-row${s.ruined ? ' ruined' : ''}${ruinFlashIdx.has(i) ? ' ruin-collapsing' : ''}`}>
                <span className="struct-icon" aria-hidden="true">
                  {BUILD_INFO[s.kind].icon}
                </span>
                <span className="struct-name">{BUILD_INFO[s.kind].label}</span>
                {s.ruined ? (
                  <span className="badge ruin">ruin</span>
                ) : (
                  <div className={`integrity-bar band-${band}`} title={`${half(s.integrity)}/${half(INTEGRITY_MAX)} integrity`}>
                    <div className="integrity-fill" style={{ width: `${pct * 100}%` }} />
                  </div>
                )}
                <button className="link" disabled={busy || s.ruined || viewBiomass < TEND_COST} onClick={() => onTend(i)}>
                  tend {half(TEND_COST)}
                </button>
              </div>
            );
          })
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
          <p className="fine">Counts claims your light has reached.</p>
        </div>
      )}

      {selectedClaimId && (
        <div className="selected-panel">
          <div className="panel-title fine">{selectedEntry?.header.name || 'that claim'}</div>
          {selectedState ? (
            <p className="fine">
              owner{' '}
              {selectedClaimId === ownState.claimId ? (
                <strong>you</strong>
              ) : (
                <code title={selectedState.owner}>{selectedState.owner.slice(0, 12)}…</code>
              )}{' '}
              · lantern {TIER_ICON[selectedState.brightness]} {selectedState.brightness} · glow{' '}
              {selectedState.glow}
              {selectedDist !== null && <> · {selectedDist} units away</>}
            </p>
          ) : (
            <p className="fine muted">your light reaches for it…</p>
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
