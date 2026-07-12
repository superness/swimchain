# Handoff: Behavioral Branching Phase 2 — Formation ON with the Full UX

**Status:** Ready to work. Operator decision 2026-07-11 (supersedes the wait-for-observation plan): implement full behavioral branching now, including the user experience. Log-only mode stays available as a config option; the observation report is no longer a gate.

## What exists (post-reconciliation main)

- Detection wired in live block processing with SPEC_13 thresholds (`branch/behavioral.rs`, `router.rs process_behavioral_clustering`); `ClusteringMode::{Full, LogOnly}`; full formation currently default only on regtest; log-only default on testnet (`node/config.rs behavioral_branching_mode()`).
- `CommunityFormation` already carries the lineage payload: `community_id`, `parent_space_id`, `founding_members` (sorted, deterministic), `metrics`, `formation_height`, fractured branch.
- `BehavioralEvent` persistence + `list_behavioral_events` RPC (Phase 1).
- Notification service (`src/notification/` — NotificationType enum per SPEC_09 §7.1, storage, throttle, triggers).
- NO space-rename action exists — space metadata is creation-time only.

## The UX contract (settled)

1. **Continuity** — threads visibly continue in the new space; nothing lost or hidden; parent space keeps a live pointer to the child.
2. **Graduation framing** — notification copy is recognition ("your group earned its own lane"), never eviction. Nobody is removed from the parent; the child is an addition.
3. **Naming** — auto-name at formation; founding members can rename via a normal PoW-costing action.
4. **No opt-out of the split; participation stays free.**
5. **Discoverability is the anti-segregation guarantee** — children appear in listings with visible lineage; the space tree is navigable.

## Lane A — Node + RPC (consensus-adjacent, careful)

1. **Enable formation on testnet:** default `behavioral_branching_mode()` → `Full` for Testnet (keep LogOnly/Disabled as explicit config options; regtest stays Full). Mainnet stays disabled until operator says otherwise.
2. **Lineage persistence + exposure:** persist formation lineage with the space (parent_space_id, formation_height, founding_members count, auto-name). Expose:
   - `get_space_lineage(space_id)` → parent + children (+ formation metadata)
   - children + `formed_at` in existing space-listing RPC responses (additive fields only — don't break clients)
   - `get_space_tree(root?)` → the lineage tree for navigation
3. **Parent-space pointer:** derivable data, not duplicated content — the parent's listing response includes its children so clients can render "this conversation grew into X →" banners. Thread-level: expose which threads moved (the fractured branch's thread roots) via the lineage RPC so the parent view can pin pointers on exactly those threads.
4. **Notifications:** on formation, notify founding members via the existing notification service (new NotificationType::CommunityFormed with space ids + auto-name). Local-node delivery (each node notifies its own user if they're a founding member). Also emit a WS event topic if the event system supports it cheaply.
5. **Auto-naming:** deterministic from chain data (all nodes must derive the same name). Suggested: `<parent-name>/community-<first-8-hex-of-community_id>`. Ugly is fine — rename fixes it.
6. **Space rename action (new protocol surface — design carefully):** a PoW-costing, signed action updating a space's display name; permitted for founding members of a behavioral space (and space creators generally, if that generalization is natural). Must flow through normal action validation/blocks so all nodes converge. If full protocol plumbing is too heavy for one lane, land the wire/validation format and gate the RPC behind it — but say so explicitly in the report.
7. Multi-node determinism test: two regtest nodes process the same cluster → identical space, name, lineage on both.

## Lane B — forum-client UX (the multiverse navigator)

1. **Space tree browser:** replace/augment the flat space list with a lineage tree — parents expandable to children, formation badges ("formed 2d ago"), member counts. Data from `get_space_tree`/lineage fields (coordinate with Lane A's shapes; fall back gracefully when lineage fields are absent).
2. **Lineage breadcrumbs** on space view: `parent / child` path, clickable.
3. **Continuity pointers:** in the parent space, threads that moved render a banner "This conversation grew into its own space →" linking to the child. In the child, a subtle "grew out of <parent>" note.
4. **Formation notification:** surface NotificationType::CommunityFormed with graduation copy: "Your group's conversations earned their own lane: <name>". Include a rename affordance if Lane A ships rename.
5. **Recently formed rail:** a small "new communities" section in space discovery.
6. Copy review: nothing may read as punitive or as removal. The parent space remains fully usable.

## Verification

- Lane A: regtest two-node cluster scenario forms identical spaces + lineage both sides; notifications delivered to founding members; lineage RPCs return parent/children; testnet config defaults to Full.
- Lane B: `tsc -b` + build clean; renders sanely with zero behavioral spaces (empty states); pointer banners appear only on moved threads.
- Standard gates: cargo fmt/clippy/tests per CLAUDE.md on touched code; conventional commits; no foreign WIP in commits (inspect staged files).
