/**
 * Teach-by-playing one-time hints (designer spec §5, items 2 and 5) — small,
 * independent, localStorage-gated flags with the SAME defensive shape as
 * CoachCard.tsx's `hasSeenCoach`/`markCoachSeen` (corrupt/absent store =
 * skip, never nag). Deliberately its own module, not part of onboarding.ts:
 * these hints are independent of the Guided Descent's beat machine and fire
 * post-descent too (per the task brief). Keys are the exact literal storage
 * keys the brief names — no shared prefix — so each hint owns one flag.
 */

export function hasSeenHint(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true; // storage-less or corrupt: skip rather than nag every visit
  }
}

export function markHintSeen(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* storage unavailable — the hint may just show again next visit */
  }
}
