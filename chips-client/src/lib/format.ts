/** Display formatting only. Nothing here is ever parsed back or folded. */

/** Compact counts for chalk-written numbers: 940, 12.4k, 3.1M, 5.0B. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a < 1000) return String(Math.trunc(n));
  const units: [number, string][] = [
    [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k'],
  ];
  for (const [div, suffix] of units) {
    if (a >= div) {
      const v = n / div;
      return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}${suffix}`;
    }
  }
  return String(Math.trunc(n));
}

/** "3 hours ago" style, for how long a bowl has been sitting out. */
export function sinceLabel(ms: number): string {
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
