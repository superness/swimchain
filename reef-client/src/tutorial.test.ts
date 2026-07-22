/**
 * Tutorial step machine tests (pure logic — no DOM).
 * Run with: npx tsx src/tutorial.test.ts
 */
import {
  initialTutorial,
  advance,
  ack,
  skip,
  dismissStrikeTip,
  visibleCard,
  parseTutorial,
} from './tutorial';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}

const snap = (myCells: number, contestVisible = false) => ({ myCells, contestVisible });

// ── fresh state: plant card shows
{
  const t = initialTutorial();
  check('fresh: step is plant', t.step === 'plant', t);
  check('fresh: plant card visible', visibleCard(t, snap(0)) === 'plant');
}

// ── planting advances plant → grow
{
  const t = advance(initialTutorial(), snap(1));
  check('plant→grow on first cell', t.step === 'grow', t);
  check('grow card visible', visibleCard(t, snap(1)) === 'grow');
}

// ── second cell advances grow → tide
{
  const t = advance(advance(initialTutorial(), snap(1)), snap(2));
  check('grow→tide on second cell', t.step === 'tide', t);
}

// ── chained advancement: 0 → 2 cells in a single call
{
  const t = advance(initialTutorial(), snap(2));
  check('chained: plant→tide in one advance', t.step === 'tide', t);
}

// ── no-change advance returns the same object (App uses identity to skip saves)
{
  const t = initialTutorial();
  check('idle advance is identity', advance(t, snap(0)) === t);
}

// ── ack hides the current card; the step still advances on its event
{
  const t = ack(initialTutorial());
  check('ack on plant keeps step', t.step === 'plant', t);
  check('ack on plant hides card', visibleCard(t, snap(0)) === null);
  const t2 = advance(t, snap(1));
  check('acked plant still advances', t2.step === 'grow', t2);
  check('new step re-shows a card', visibleCard(t2, snap(1)) === 'grow');
}

// ── ack on tide completes the tutorial
{
  const t = ack(advance(initialTutorial(), snap(2)));
  check('ack on tide → done', t.step === 'done', t);
  check('done: no card', visibleCard(t, snap(2)) === null);
}

// ── skip ends everything, including the strike tip
{
  const t = skip(initialTutorial());
  check('skip → done', t.step === 'done', t);
  check('skip: no strike tip ever', visibleCard(t, snap(5, true)) === null);
}

// ── strike tip: appears on the first contest opportunity, exactly once
{
  const done = ack(advance(initialTutorial(), snap(2)));
  check('no strike tip without opportunity', visibleCard(done, snap(2, false)) === null);
  check('strike tip on first opportunity', visibleCard(done, snap(2, true)) === 'strike');
  const seen = dismissStrikeTip(done);
  check('strike tip never returns', visibleCard(seen, snap(2, true)) === null);
}

// ── strike tip mid-tutorial: only when the step card is acked (step card outranks it)
{
  const t = advance(initialTutorial(), snap(1)); // step grow, card showing
  check('step card outranks strike tip', visibleCard(t, snap(1, true)) === 'grow');
  const t2 = ack(t);
  check('acked step lets strike tip show', visibleCard(t2, snap(1, true)) === 'strike');
}

// ── persistence parsing
{
  check('parse null → fresh', parseTutorial(null).step === 'plant');
  const round = parseTutorial(JSON.stringify(ack(advance(initialTutorial(), snap(1)))));
  check('parse roundtrip keeps step+ack', round.step === 'grow' && round.acked === true, round);
  const corrupt = parseTutorial('not json{');
  check('corrupt → done', corrupt.step === 'done', corrupt);
  check('corrupt → strike tip suppressed', corrupt.strikeTipSeen === true, corrupt);
  const badStep = parseTutorial(JSON.stringify({ step: 'zebra' }));
  check('unknown step → done', badStep.step === 'done', badStep);
}

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exitCode = failures ? 1 : 0;
