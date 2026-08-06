/**
 * DEV-ONLY HARNESS — the bowl reveal, standing alone, with a synthetic
 * late-game state chosen to make the offer column as TALL as it can get:
 * every jar owned (19 to lose), THE CRACK owned (so the keep-picker renders
 * all 19 jars), a boss fight in progress, bands broken. This is the state in
 * which the 2026-08-06 report happened — "tip the bowl" pushed off the bottom
 * of the screen when a keep was selected — and reaching it in the real game
 * takes tens of hours, so reproducing and verifying on a device goes through
 * here instead.
 *
 * NOT part of the shipped bundle: `vite build` bundles only index.html, so
 * this page exists only under `npm run dev` at /bowl-harness.html. It never
 * touches the host seam — no RPC, no space, no identity.
 */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './styles.css';
import { BowlReveal } from './Bowl';
import { UPGRADES } from './lib/chipsConst';
import type { ChipsState } from './lib/chipsEngine';

const OWNED = [
  'season1', 'season2', 'season3', 'season4', 'season5', 'airtight', 'cellar',
  'bowl1', 'bowl2', 'bowl3', 'fryer2', 'fryer3', 'fryer4', 'autodip',
  'overcook', 'doubledip1', 'doubledip2', 'detector', 'detector2',
];

const state: ChipsState = {
  crumbs: 1_234_567, lifetimeChips: 26_772_165, oldSalt: 41, tips: 3,
  broken: 3, declined: new Set(), deepest: 5, char: 12,
  paidToBosses: 9_000_000, bossDamage: 23_900_000_000, bossHpFrozen: 80_300_000_000,
  charOwned: new Set(['crack', 'ember', 'salt-sense']),
  bowls: 1, crispest: 12, owned: new Set(OWNED),
  bowlCap: 5_000_000_000, seasoningNum: 6, seasoningDen: 1, fryers: 4,
  goldenBits: 14, airtight: true, sogBonus: 2, doubleDipMod: 2,
  dipIndex: 7, lastConfirmedAt: 0, lastBankAt: 0, unverifiedBanks: 0, moves: [],
};

const keepable = OWNED.map((k) => ({ key: k, label: UPGRADES[k].label }));

function Harness() {
  const [note, setNote] = useState('untouched');
  return (
    <>
      <BowlReveal
        state={state} crumbs={1_234_567} layerLabel="Fondue" depth="the Fondue"
        keepable={keepable}
        onTip={(keep) => setNote(`TIPPED keep=${keep ?? 'nothing'}`)}
        onClose={() => setNote('CLOSED')}
      />
      {/* Callback witness: a screenshot of this line is proof the tap landed. */}
      <div
        id="harness-note"
        style={{ position: 'fixed', top: 2, left: 2, zIndex: 999, color: '#4f4', font: '12px monospace' }}
      >{note}</div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
