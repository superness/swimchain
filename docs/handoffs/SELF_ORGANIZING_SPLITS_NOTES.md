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
- **Consensus layer** — *proposed*: diversity-weighted fork choice as a social-layer 51% defense.

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

4. **51% defense via the same signal — with a real caveat.** An attack in a
   social chain is *behavior*: to out-produce the legit chain an attacker must be
   concentrated/insular/sudden. That is detectable. BUT the current **minority
   gate is inverted** for this — a 51% attacker is the *majority* and would be
   protected. An attack-mode rule must key on **diversity + age + sponsorship
   lineage, NOT size** (real popularity = many distinct, aged, varied-lineage
   engagers; an attack = few actors, many hats, narrow sponsor lineage), and it
   must act at the **fork-choice layer** (weight work by diversity so a
   heavy-but-insular chain loses to a lighter-but-diverse one). Floor stays
   sponsorship: diversity-weighting raises the bar, doesn't replace the Sybil gate.

5. **Diversity of genuine engagement = unfakeable proof of demand = what earns
   shared security.** The measurement that proves the network wants something and
   the measurement that protects it are the same. An attacker can only buy
   security by buying diverse sponsored participation — at which point they've
   joined, not attacked.

## Open questions / risks to spec against

- Consensus change (diversity-weighted / frequency-scoped fork choice) is the
  riskiest kind — the new rule is itself an attack surface (metric gaming, false
  quarantine of a legitimately popular majority).
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
- **51%-as-quarantine** — diversity-weighted fork choice: a concentrated attacker's
  heavy-but-insular chain self-isolates instead of overwriting a diverse community.
- **Sponsorship-lineage diversity** — visualize lineage as the discriminator
  between an attacker-majority and a legitimately popular majority.

## Status / next step

Direction agreed; nothing here is specced or built. Recommended order:
(1) build the partition/reconverge test harness against *today's* global
fork choice to ground the discussion in measured behavior; (2) if we commit to
frequency-scoped forks, brainstorm → spec it (fork-choice scoping, overlay store,
reference + re-entry rules); (3) the diversity-weighted consensus / 51% idea is a
separate, larger consensus spec — threat-model it against `THREAT_MODEL.md` first.
