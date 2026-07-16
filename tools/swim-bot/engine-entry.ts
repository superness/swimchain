/**
 * Bundle entry: re-export the PRODUCTION reef engine for the bot.
 *
 * The bot must never carry its own copy of the fold rules — the hand-written
 * "mirror fold" drifted from the engine (block-height vs move-count epochs)
 * and the bot spent hours confidently playing a board that didn't exist
 * (2,284 rejected-invalid moves). Build with:
 *
 *   cd reef-client && npx esbuild ../tools/swim-bot/engine-entry.ts --bundle \
 *     --platform=node --format=esm --outfile=../tools/swim-bot/reefEngine.bundle.mjs
 *
 * (scripts/deploy-reef-bot.sh does this and ships both files.)
 */
export {
  foldReef,
  cellKey,
  myBudget,
  myTendsLeft,
  GRID_W,
  GRID_H,
  MAX_VITALITY,
  COST_GROW,
  COST_CONTEST,
  TEND_CAP,
  EPOCH_MOVES,
} from '../../reef-client/src/lib/reefEngine';
