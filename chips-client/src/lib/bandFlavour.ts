/**
 * WHAT LIVES IN EACH BAND — the writing, kept apart from the rules.
 *
 * A band has two names and they are not the same thing: the STRATUM is where you
 * are (lib/tunnelDepth's DEEP_BANDS — The Floor, The Dirt, The Lava) and the BOSS
 * is what you are hitting. "Chipping away at The Floor" is a location; "chipping
 * away at the chip from 1974" is a fight. The design named all five and the
 * implementation only ever used the strata, so every deep fight read like a
 * geology report.
 *
 * The design also gave each boss a bespoke CONDITION — hold four fryers at x32,
 * beat its worth inside a window, shoo them all while still banking. Those are
 * superseded: every band is a healthbar now, which is what made five bosses
 * affordable at all. What survives is the identity, which is the half that was
 * actually worth keeping.
 *
 * PURE DATA. Policy, retunable, no rules here.
 */

export interface BandFlavour {
  /** What you are hitting. */
  boss: string;
  /** On arrival — one line, said once, no explanation of the mechanic. */
  arrive: string;
  /** When it gives. */
  gives: string;
  /**
   * Scoop's line, or null for silence.
   *
   * HE SAYS NOTHING UNTIL THE LAVA (design doc 5). Everything before that is
   * simply him being there, a little further down each band, which is worse than
   * being spoken to. The whole game has been seeding this — eleven months on a
   * stool, nine retirements, "i've done the math twice" — and spending it early
   * would waste the only long con the writing has.
   */
  scoop: string | null;
}

/**
 * Indexed by BAND, so index 0 is the porcelain. The porcelain has its own screen
 * (Porcelain.tsx) and does not read from here, but it keeps the array honest —
 * an off-by-one in this table would otherwise be invisible until someone reached
 * The Other Side.
 */
export const BAND_FLAVOUR: BandFlavour[] = [
  {
    boss: 'the porcelain',
    arrive: 'it is smooth, and it is cold, and it goes on in every direction.',
    gives: 'there is a surface underneath. it is not porcelain.',
    scoop: null,
  },
  {
    boss: 'the table',
    arrive: 'four legs, above you. you have been eating off the underside of this your whole life.',
    gives: 'the table gives. it was only ever holding the bowl up.',
    scoop: null,
  },
  {
    boss: 'the chip from 1974',
    arrive: 'it has been here longer than the table. it is not soggy. nobody knows why.',
    gives: 'it goes quietly, which is somehow worse.',
    scoop: null,
  },
  {
    boss: "the rat's family",
    arrive: 'the cheese rat is here. so is everyone he has ever mentioned.',
    gives: 'they let you through. the rat looks embarrassed about all of it.',
    scoop: null,
  },
  {
    boss: 'the first fryer',
    arrive: 'the original. it has been on since before the shop. nothing here is not burning.',
    // The one line he has been saving. He has asked for one more chip since the
    // first frame of the shallow game and never once said what for.
    gives: 'it goes out. the first thing that ever cooked a chip goes out.',
    scoop: 'i said one more chip. i never said what for.',
  },
  {
    boss: 'the other side',
    arrive: 'there is nothing in the way. that is the part that should worry you.',
    gives: 'you come up through the bottom of a bowl. it is not the one you left.',
    scoop: 'told you. eleven months.',
  },
];

/** Flavour for a band, with a safe fallback for anything past the descent. */
export function flavourFor(band: number): BandFlavour {
  return BAND_FLAVOUR[band] ?? {
    boss: 'the dark',
    arrive: 'there is more of it than there was.',
    gives: 'it gives.',
    scoop: null,
  };
}
