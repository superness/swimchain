# Network-layer isolation — decision log (explored, then REMOVED)

## Conclusion (2026-07-12)

**Frequency isolation was built, then removed.** The whole idea — isolating
single-purpose actors away from the main chain at the network layer — was reasoned
through end to end and **abandoned in favor of keeping one shared chain**. The
frequency feature (module, config, peer filtering, on-chain `FrequencyDrift`
action, RPCs, sim page) was torn out; `behavioral` branching, `fracture`, and the
`forkchoice` partition/reconverge sim stay.

**Why it was dropped, in order of realization:**
1. **It didn't isolate anything real.** On one shared chain a node must sync the
   whole chain regardless of which peers it dials, and it already only *hosts* what
   it views (consent/view-to-host). So "discovery-only frequency" is cosmetic peer
   selection and "branch-selective sync to host less" is redundant.
2. **The only real burden is action *processing*** — every node validates/aggregates
   every action, including a bespoke app's non-social firehose. But that's a
   *scaling* problem (bites only at large scale), not a today problem, and its real
   fix is a careful sharding/app-lane design (commitment-anchored lanes whose work
   is excluded from main fork choice), solved when measured — not speculatively.
3. **Genuine isolation requires a separate chain (overlay), which is a weak,
   cheaply-51%-able chain.** That 51% vulnerability *only exists if you separate*.
   Keeping everyone on the shared chain eliminates it. And a node that's already
   hosting/processing is a *valuable* participant you want in the shared pool, not
   isolated out of it.
4. **The "spam" is the point.** Universal action processing *is* the shared
   validation that makes the chain trustless and secure — it's the backbone, not a
   cost to optimize away.

Net: **one shared chain, one heaviest-work fork choice for everyone.** No frequency,
no overlay, no per-group forks. Revisit processing-scale as its own sharding project
if/when the numbers demand it.

---

The reasoning below is retained as the decision record.

## Core principle (explored)

One measured signal — **insularity / diversity / concentration** — could in
principle drive multiple splits:

- **Content layer** — behavioral branching (SPEC_13): an insular cluster graduates. **KEPT.**
- **Network layer** — frequency isolation: an exclusive node drifts off the main peer mesh. **REMOVED.**
- **Consensus layer** — stays **dumb: heaviest work wins, full stop.** No special attack rule.

## Where this landed (2026-07-12)

**"Don't rejoin" was dropped.** It was solving a problem that doesn't exist: the
integration test (`tests/frequency_partition_reconverge.rs`) shows reconciliation
is **safe** — heavier work wins and the loser's actions re-anchor via the mempool,
nothing destroyed. Once reconciliation isn't harmful, there's no reason to prevent
it. The segregation we actually wanted lives at the **discovery + storage** layer
(don't *hold/serve* what you don't care about), not the **consensus** layer.

- **Keep:** frequency isolation as **discovery-only** (shipped) + later
  **branch-selective sync** (a node only stores/serves its namespace's branches).
  Lightweight optimizations over **one shared chain**.
- **Drop:** frequency-scoped fork choice and overlay/permanent-fork storage (see
  "Decided against"). Fork choice stays global and simple — which keeps shared
  security and one canonical history.
- **Boundary:** genuine *permanent* separation (a sovereign chain) is already a
  thing — a different network magic (mainnet vs testnet), a deliberate hard split.
  Frequency stays "isolate my peering + storage within the one network," nothing
  more; don't overload it into a fork mechanism.

## What we aligned on

1. **"Shared security" was over-weighted.** Swimchain's real gates are
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

2. **The defense against capture is EXIT, not a smarter fork choice.** You do not
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

- **Frequency-scoped fork choice + overlay/permanent-fork storage ("don't rejoin").**
  Considered making drifted frequencies never reconcile with base (scoped fork
  choice) and storing them as a shared-prefix + delta. **Dropped** — the
  partition/reconverge test shows reconciliation is *safe* (loser's actions
  re-anchor, nothing destroyed), so the motivation evaporated; and it would have
  meant a consensus change plus weakly-secured sub-forks. Segregation instead
  lives at discovery + branch-selective sync over one shared chain. Truly
  permanent separation is a *different network magic*, not a frequency feature.

## Open questions / next work

- **Branch-selective sync** — wire the existing, unwired `BranchSubscriptionManager`
  (`src/sync/subscription.rs`) into the syncer so a node only stores/serves the
  branches (namespaces) it cares about. This is the storage-layer segregation we
  kept; frequency can drive the subscription policy. No consensus change.

## Simulation candidates (real, via swimchain-core → WASM, like the shipped sims)

- **Partition + reconverge** — ✅ BUILT: `tests/frequency_partition_reconverge.rs`
  (real router) + live sim at `/sim/forkchoice`. Heavier tip wins, loser's actions
  re-anchor. This is what retired the "don't rejoin" idea.
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
