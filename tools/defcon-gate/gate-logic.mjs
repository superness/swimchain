export function codeMatches(applicationText, gateCode) {
  // Empty/undefined never matches
  if (!applicationText || !gateCode) {
    return false;
  }
  // Trim and case-insensitive comparison
  return applicationText.trim().toUpperCase() === gateCode.toUpperCase();
}

export function hourlyCount(approvedAtMs, nowMs) {
  // Entries within the trailing 3_600_000 ms
  const hourAgoMs = nowMs - 3_600_000;
  return approvedAtMs.filter(ms => ms > hourAgoMs).length;
}

export function gateDecision({ applicationText, gateCode, nowMs, endAtMs, totalApproved, approvedAtMs, totalCap, hourlyCap }) {
  // Decision order (critical): ended → bad code → total cap → hourly cap → approve

  // 1. Check if ended (must be first; after end, keeper signs nothing at all)
  if (nowMs > endAtMs) {
    return { action: 'skip', reason: 'ended' };
  }

  // 2. Check if code matches (reject if bad)
  if (!codeMatches(applicationText, gateCode)) {
    return { action: 'reject', reason: 'bad-code' };
  }

  // 3. Check total cap
  if (totalApproved >= totalCap) {
    return { action: 'skip', reason: 'total-cap' };
  }

  // 4. Check hourly cap
  if (hourlyCount(approvedAtMs, nowMs) >= hourlyCap) {
    return { action: 'skip', reason: 'hourly-cap' };
  }

  // 5. Approve
  return { action: 'approve', reason: 'ok' };
}

export function offerPlan({ myOffers, tierScopeHex, nowSec, endAtSec, totalApproved, totalCap }) {
  // needNew iff:
  // - no offer has slots_remaining > 0 && expires_at > nowSec
  // - and not ended
  // - and cap not reached

  // Check if ended
  if (nowSec > endAtSec) {
    return { needNew: false, reason: 'ended' };
  }

  // Check if cap reached
  if (totalApproved >= totalCap) {
    return { needNew: false, reason: 'total-cap' };
  }

  // Check if there's a live offer
  const hasLiveOffer = myOffers.some(offer => offer.slots_remaining > 0 && offer.expires_at > nowSec);

  if (hasLiveOffer) {
    return { needNew: false, reason: 'has-live-offer' };
  }

  return { needNew: true, reason: 'no-live-offers' };
}
