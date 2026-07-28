/**
 * THE SOUS CHEF'S RULE — when bought automation cashes a chip.
 *
 * This was one inline `isGolden(chips[i])` inside a React effect in App.tsx,
 * which is to say it was untestable and it was wrong. `isGolden` is FIVE
 * crackles and never moves (it is the queso angel's threshold). The Long Fry
 * raises the player's ceiling to SIX. So the moment both jars were owned, the
 * Sous Chef cashed out at x32 immediately before the x64 could land — a 2M
 * automation silently vetoing a 1.2B upgrade.
 *
 * He cashes at THE CEILING, not at golden. The distinction is the whole
 * feature: the ceiling is where a chip genuinely stops improving, which is
 * the only honest moment for automation to act. Below it the player still has
 * a decision to make, and taking it from them is not a service.
 *
 * Pure and ceiling-parameterised so both states are tested at once — the bug
 * above is invisible to any test that only ever runs at the default ceiling.
 */

/** A chip, as far as this rule cares. */
export interface DippableChip {
  crackles: number;
  pot: number;
}

/**
 * Does the Sous Chef take this fryer's chip right now?
 *
 * `ceiling` is the player's top of the ladder (cooking.ts MAX_CRACKLES, or
 * LONG_FRY_CRACKLES when they own The Long Fry). An empty pot is left alone —
 * there is nothing to bank and `dip()` would no-op anyway.
 *
 * Deliberately NOT a party to the other stand-down rules: a rat on the fryer
 * and an armed vendor are the app's business (they concern the whole rack and
 * the whole screen, not this chip), and folding them in here would make a
 * pure rule depend on live state again.
 */
export function sousTakes(chip: DippableChip | undefined, ceiling: number): boolean {
  if (!chip) return false;
  if (chip.pot <= 0) return false;
  return chip.crackles >= ceiling;
}
