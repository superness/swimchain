# Self-organizing splits — design direction (open, not yet built)

Captured from a 2026-07-12 design discussion, after frequency isolation +
behavioral branching + size fracture shipped and the live sims went up. This is
**direction, not a spec** — it records what we aligned on so a future
brainstorm/spec starts from here.

## Core principle

One measured signal — **insularity / diversity / concentration** — can drive
all three splits, so they stop being separate features and become one idea:

- **Content layer** — behavioral branching (SPEC_13): an insular cluster graduates.
- **Network layer** — frequency isolation: an exclusive node drifts off the main peer mesh.
- **Consensus layer** — stays **dumb: heaviest work wins, full stop.** No special
  attack rule (see "Decided against" below). The splits above *are* the defense.

## What we aligned on

1. **"Segregate, don't rejoin" is a fork-choice decision, not a storage one.**
   The property that stops a drifted set reconciling with base is
   **frequency-scoped fork choice** (a node only compares chains within its own
   frequency; base and a drifted frequency never contest). Storage layout is a
   separate, independent choice.

2. **Storage = overlay / delta, not multiple chains.** Store the shared prefix
   `0..N` once; store each frequency's post-`N` divergence as a delta. The
   drifted set **inherits all prior state** (identities, sponsorship, reputation,
   blocklists) — not a from-genesis fork — and there is no duplicated history on
   disk. Frequency is already *derivable* (`derive_frequency(namespace)`), so no
   new content tagging is needed.

3. **"Shared security" was over-weighted.** Swimchain's real gates are
   **sponsorship (Sybil), per-action Argon2id PoW (spam), decay (relevance), and
   exit/fork (capture)** — not aggregate mining hashpower. Frequency-scoping is
   **compartmentalization** (bulkheads; a breach can't leave its frequency), and
   it is:
   - **self-excluding** — drift triggers on *exclusivity*, and a contested group
     has external interaction, so it won't drift onto a weak fork in the first place;
   - **self-healing** — if an isolated thing later becomes contested/wanted, that
     interest *is* external interaction → concentration drops → hysteresis pulls
     it back to base and its shared weight. The drift signal is also the recovery
     signal.

4. **The defense against capture is EXIT, not a smarter fork choice.** You do not
   need to *win* the work war to be safe — losing it is just the permission to
   walk away with everything intact. The self-organizing splits *are* the exit,
   automated: an attacked community lands in its own clean space (which is what a
   drifting/branching group wanted anyway) with identities + content inherited
   via the shared prefix, and the attacker is left holding an abandoned husk.
   "Capture wins nothing" (THESIS_03) was already the whole answer. Keep the exit
   primitives cheap and lossless; that is the security.

### Decided against (2026-07-12)

- **Diversity-weighted / attack-detecting fork choice.** Considered using the
  insularity signal to detect a 51% attacker and trim/discount their work at the
  consensus layer. **Dropped** — it re-solves an already-solved problem (exit),
  and a consensus change is the riskiest kind (the new rule is itself an attack
  surface: metric gaming, false quarantine of a legitimately popular majority).
  Fork choice stays heaviest-work. Note also the *minority gate is inverted* for
  attack defense (a 51% attacker is a majority, so the community-formation gate
  would protect them) — another reason not to overload behavioral branching for
  this.

## Open questions / risks to spec against

- Frequency-scoped fork choice is still a consensus change (the riskiest kind) —
  scope it tightly. (Diversity-weighted / attack-detecting fork choice is out of
  scope; see "Decided against".)
- Cross-frequency references after `N` (dangling parents/spaces across the split).
- Re-entry rules (join a frequency = prefix + overlay; content made in a
  frequency can't return to base under a permanent fork).
- Root aggregation over branches a builder doesn't hold (merkle commitments).
- Wire this onto the existing, unwired `BranchSubscriptionManager`
  (`src/sync/subscription.rs`) and the `src/fork/` store — check how much
  delta-storage + fork selection already exists before designing new machinery.

## Simulation candidates (real, via swimchain-core → WASM, like the shipped sims)

- **Partition + reconverge** — split two groups, build divergent work, bridge,
  assert convergence to the heavier tip and that orphaned actions re-anchor
  (and which dependency cases don't). Also the harness for testing current behavior first.
- **Frequency-scoped fork choice** — drift at height N, show the two continuations
  never contest; contrast with global fork choice reconciling.
- **Exit under capture** — flood a space; show the legit community drift/branch to
  its own clean frequency/space with identities + content intact while the
  attacker is left with the abandoned husk (the splits *as* the defense — no fork
  choice change).

## Status / next step

Direction agreed; nothing here is specced or built. Recommended order:
(1) build the partition/reconverge test harness against *today's* global
fork choice to ground the discussion in measured behavior; (2) if we commit to
frequency-scoped forks, brainstorm → spec it (fork-choice scoping, overlay store,
reference + re-entry rules). Fork choice otherwise stays heaviest-work; the
defense against capture is exit via the splits, not a consensus rule.
