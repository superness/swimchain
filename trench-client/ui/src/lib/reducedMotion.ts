/** Shared `prefers-reduced-motion` probe (App.tsx had a private copy of this
 *  exact function; the guided-descent work needs the same check from
 *  TrenchMap.tsx and onboarding.ts too, so it's hoisted here rather than
 *  tripled). Never throws — `matchMedia` is guarded the same way App.tsx's
 *  original copy guarded it. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
