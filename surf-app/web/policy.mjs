// Every Phase B dial in one place (decision sheet B1-B6; all client policy).
export const DWELL_SECONDS = 45;          // B2: tuned time before the miner starts
export const DWELL_K = 3;                 // B2: newest items engaged per dwell
export const ENGAGE_LEDGER_HOURS = 24;    // B2: one engage per content per window
export const ENGAGE_DIFFICULTY_BITS = 6;  // node truth: mainnet Engage minimum (mode.rs:274-296)
export const ARGON2 = { memoryMiB: 8, iterations: 1, parallelism: 2 }; // node truth (action_pow.rs:264-274)
export const DEAD_AIR_FADING_DAYS = 2;    // B6
export const DEAD_AIR_DYING_DAYS = 5;     // B6
export const MOOR_CAP = 3;                // B3: measured warm size is the natural cap
// B3 glow: recency (seconds) -> 0..1 brightness, log-scaled against the 7-day half-life.
export function glow(ageSeconds) {
  if (ageSeconds == null) return 0;
  const days = ageSeconds / 86400;
  if (days <= 0.25) return 1;
  if (days >= 7) return 0.06;             // near-black, never fully invisible on the Chart
  return Math.max(0.06, 1 - Math.log2(1 + days) / Math.log2(8));
}
