# Light-launch readiness — 2026-07-14 evening assessment

Asked: are we ready for a light launch? Should we scale users, droplets, or
nodes-per-droplet? Assessed the same evening the fleet survived a chain-
poisoning incident (see FINDINGS.md addendum below and the deep-fork memory) —
which turned this from a checklist into a live-fire answer.

## Verdict

**Not yet — the app layer is close, the consensus layer needs one hardening
pass first.** Tonight a two-droplet accident (a solo block formed during a
deploy restart) deleted 66 blocks from every node on the network, silently,
while every app kept looking healthy. That failure class is now guarded, but
the conditions that produced it are still in place. With the short list below
done, a 5–10-user friendly launch is reasonable; without it, the first
unattended restart can partition or poison the chain again.

## What tonight proved works

- **Recovery**: intact chain located (qa2 backup), genesis restored, all three
  droplets wiped + redeployed, full fleet re-converged at height 72 in ~2
  minutes of sync. The playbook is now tooled (`examples/chain_diag.rs`,
  network.magic wipe) and documented.
- **Initial sync at full speed** (20-block locator batches) once the height
  index is healthy — the earlier "stalls at height 7" was the poisoned index,
  not the responder.
- **The app funnel**: one-click game onboarding (41–75 s to sponsored), invite
  links, DMs, private spaces, node-backed prefs/follows/saves/hide — all
  verified end-to-end this week, and the sponsorship offer store rode through
  tonight's recovery untouched (12 auto-approve slots live).
- **Fleet capacity**: droplets loaf — load 0.2–0.5, <50% RAM, <50% disk.

## Launch blockers (ordered, all small-to-medium)

1. **Solo-block formation guard.** The root enabler: a node that restarts
   isolated (or wiped) forms blocks alone as soon as its bot/faucet acts, and
   that stub then fights the real chain. A node should not form blocks until
   it has synced with at least one peer (or a grace period expires). Small
   node-side change, removes the incident class at its source.
2. **Genesis goes COLD — done 2026-07-14 late.** (Replaces an earlier
   "relocate genesis to an always-on droplet" recommendation, retracted: a
   root key belongs offline, not on the network's most exposed host. The
   services the genesis node happened to provide were the real dependency,
   and they all moved: game/newcomer sponsorship → the faucet identity on the
   bot droplet; chain serving → the droplets; the operator's QA node →
   should use a bespoke dev identity, faucet-sponsored.) All six open
   genesis offers were sign-cancelled (tombstones verified on the seed) and
   the genesis node is shut down. The key comes up only for deliberate,
   brief root-sponsor ceremonies.
3. **Non-destructive rollback.** (Replaces an earlier "chain snapshot"
   recommendation, retracted — backing up a chain is a non-concept; the
   network's replicas ARE the durability, and Bitcoin-style nodes never
   delete block data on reorg.) Our `rollback_block_at_height` DELETES the
   rolled-back blocks, which is what turned tonight's wrong fork-choice into
   data destruction (genesis: 80 root blocks → 16). Rolled-back blocks must
   be kept (unindexed orphans), making any reorg — even a wrong one — locally
   reversible. With this landed, an incident like tonight's is an index
   repair, not a hunt for a surviving replica. Until node count grows, the
   fleet is a same-binary monoculture, so this is the property that stands in
   for replica diversity.
4. **The reorg-apply loop.** A node that decides to reorg and can't complete
   it retries forever (6,823 iterations in 7 minutes tonight). With deep
   displacement now disabled the trigger is rarer, but partitioned nodes
   still can't rejoin without a manual wipe — either fix the loop + real
   chain weight (`cumulative_pow` is per-block, not cumulative — SPEC_05
   work), or document wipe-to-rejoin as the recovery and add it to node UX.
5. **Auth lockout friction.** The per-IP 10-failures/5-min lockout hit us
   three times tonight from one stale cookie; NATed real users would share
   one IP. Loosen for public read methods or key the limiter per-credential.
6. **Phone stays off until a guarded APK ships** — its in-process node still
   carries the stub chain and predates the guard. (Fleet nodes are guarded,
   so it can no longer poison them, but it can't heal itself either.)

## Scaling answers

- **More users now?** No — cap at ~5–10 friendly testers after blockers 1–3
  land (1 and 3 are same-day work; 2 is an afternoon with the deploy tooling).
  The funnel itself is ready for them.
- **More droplets?** Not for capacity — the three existing ones are near
  idle. Add exactly **one**, as the always-on genesis/sponsor host (blocker
  2). Beyond that, droplets add gossip surface without user value at this
  scale.
- **More nodes per droplet?** No. A node costs ~400–500 MB RAM (the 1 GB
  droplets fit one comfortably; the 2 GB seed could host a second as a
  standby genesis if wanted), but extra nodes multiply WHO_HAS chatter and
  solo-fork surface while serving zero additional users. Scale nodes with
  actual users, not ahead of them.
- **What actually limits user scale today:** the single seed node behind
  swimchain.io/rpc (all web traffic proxies to one box), the lockout limiter,
  and the client-fix distribution gap (feed/forum/chat fixes only reach users
  via desktop/mobile releases, which don't exist as a channel yet).

## Suggested sequence

1. Solo-block guard + nightly snapshots (day 1)
2. Genesis relocation to a new always-on droplet (day 1–2)
3. Guarded APK build; phone rejoins (day 2)
4. Friendly launch: ~10 invites via the working invite-link funnel (day 3+)
5. Watch a week (the QA tooling + chain_diag make drift visible); then widen
   and revisit the proxy/lockout limits before any public push
