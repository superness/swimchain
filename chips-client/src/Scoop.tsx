/**
 * SCOOP'S — where char is spent, and where the game's oldest joke pays off.
 *
 * The small dog has been at the door since the first frame, asking for one more
 * chip and refusing to explain. The ticker has been telling you for the whole
 * game and it reads as a gag:
 *
 *   > small dog seen guarding empty stool for eleven months; declines to
 *   >   explain; calls it "a business meeting."
 *   > scoop announces retirement from begging, effective after one more chip.
 *   >   sources confirm this is the ninth retirement.
 *   > i've done the math. you can't eat all of them. i've done the math twice.
 *
 * He was never begging. He was waiting for somebody to dig. Nothing had to be
 * invented for this — the setup was already in the shallow game's copy.
 *
 * He sells RULE CHANGES, never numbers: salt already owns "+N% every tick", and
 * a second multiplier would collapse the two currencies into one stat. Prices
 * and effects are policy (lib/chipsConst CHAR_ABILITIES) — the fold only keeps
 * char from going negative.
 */
import { CHAR_ABILITIES, type CharAbility } from './lib/chipsConst';
import { CritterArt } from './Crew';

/** What he says when you arrive, by how far down you are. He is quiet for most
 *  of it — "everything before that is simply him being there, which is worse". */
function greeting(broken: number, owned: number): string {
  if (owned === 0 && broken <= 1) return 'took you long enough.';
  if (broken <= 2) return 'i kept the stool.';
  if (broken <= 3) return 'eleven months. i counted.';
  if (broken <= 4) return "you're further down than anyone. i'm still here.";
  return "i said one more chip. i never said what for.";
}

export function ScoopShop({ char, owned, broken, onBuy, onClose }: {
  char: number;
  /** Ability keys already bought — prestige, so this survives a tip. */
  owned: ReadonlySet<string>;
  broken: number;
  onBuy: (a: CharAbility) => void;
  onClose: () => void;
}) {
  const stock = Object.values(CHAR_ABILITIES);
  const mine = stock.filter((a) => owned.has(a.key));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="scoop-shop"
        role="dialog"
        aria-label="scoop's"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scoop-head">
          <span className="scoop-art" aria-hidden="true"><CritterArt id="scoop" /></span>
          <div className="scoop-who">
            <strong>scoop</strong>
            <em>{greeting(broken, mine.length)}</em>
          </div>
          <div className="scoop-char" title="char. scraped off a bowl you broke.">
            <b>{char}</b>
            <i>{char === 1 ? 'grain' : 'grains'}</i>
          </div>
        </div>

        <p className="scoop-rule">
          he does not sell numbers. salt does numbers.
        </p>

        <ul className="scoop-stock">
          {stock.map((a) => {
            const have = owned.has(a.key);
            const canAfford = char >= a.cost;
            return (
              <li key={a.key} className={have ? 'got' : canAfford ? 'open' : 'dear'}>
                <button
                  type="button"
                  disabled={have || !canAfford}
                  onClick={() => onBuy(a)}
                  title={have ? 'already yours — and it stays yours' : a.blurb}
                >
                  <span className="ab-name">{a.label}</span>
                  <span className="ab-from">{a.from}</span>
                  <span className="ab-blurb">{a.blurb}</span>
                  <span className="ab-cost">
                    {have ? 'yours' : `${a.cost} ${a.cost === 1 ? 'grain' : 'grains'}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="scoop-foot">
          {/* The one thing worth stating outright: this is not a run purchase.
              A player who has just watched a tip take everything needs telling
              that these do not go. */}
          char and what it buys survive the bowl. you paid the descent for these,
          not the run.
        </p>

        <button type="button" className="scoop-done" onClick={onClose}>leave him to it</button>
      </div>
    </div>
  );
}
