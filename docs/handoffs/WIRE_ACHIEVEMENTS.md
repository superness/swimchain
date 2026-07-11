# Handoff: Wire the Achievement System (award live, show on profiles)

**Status:** Ready to work. Decision made by the operator 2026-07-11: achievements stay, get awarded for real, and become visible on profiles.
**Background:** The full achievement system exists and passes tests, but **no live node path ever constructs it** — `AchievementService::new` appears only in tests (`src/achievement/service.rs:195`). Nothing awards badges, nothing exposes them. See `docs/VISION_PARITY_AUDIT.md` for the full audit this came from.

## What exists today

- `src/achievement/types.rs:61-72` — 12 achievement variants (FirstStroke, FirstServe, WeekSwimmer, MonthSwimmer, Centurion, BandwidthBaron, TerabyteClub, AlwaysOn, AnchorDrop, LaneOpener, KeeperOfTheFlame, EfficientSwimmer), each with a unique badge emoji, `#[repr(u8)]` stable wire format.
- `src/achievement/storage.rs` — `AchievementStore` (sled-backed).
- `src/achievement/service.rs` — `AchievementService` (award/query logic).
- `src/achievement/tracker.rs`, `triggers.rs` — milestone tracking plumbing.
- Caveats found in code comments: `AlwaysOn` is a placeholder needing daily uptime tracking; `EfficientSwimmer` is provisional; `AnchorDrop`/`LaneOpener` doc comments reference the removed level system ("reaching Anchor level", "requires Resident+") and need re-specification.

## Scope of work

1. **Instantiate the service in the live node.** Construct `AchievementService` in `node/manager.rs` alongside the other stores (pattern: see how `DecayIntegration` and sponsorship stores are built there, ~lines 511-826) and share it with the RPC layer and router.
2. **Award on real events.** Wire triggers into the paths that already exist:
   - FirstStroke → first accepted `submit_post` for an identity (`rpc/methods.rs` post path)
   - FirstServe / BandwidthBaron / TerabyteClub → content-serve path in the router / seeding manager (`src/seeding/`)
   - WeekSwimmer / MonthSwimmer / Centurion → hosting-streak tracking (needs a daily uptime/serve record; check what `tracker.rs` expects)
   - LaneOpener → space-creation path (re-spec: no level gate anymore, first space created)
   - KeeperOfTheFlame → engagement-action path (100+ distinct posts engaged)
   - AnchorDrop → needs re-specification (referenced the removed level ladder) — propose one based on hosting volume or drop the variant
   - AlwaysOn / EfficientSwimmer → defer if daily-uptime tracking is too big; document deferral
3. **Expose over RPC.** Add `get_achievements(identity)` (and include achievements in whatever profile RPC exists — see `get_user_profile`/profile methods in `rpc/methods.rs`). Register in the method allowlist (`rpc/server.rs` — beware: there are known phantom-allowlist entries; add BOTH handler and allowlist entry).
4. **Profile visibility in one client** as proof: forum-client or feed-client profile view renders the badge row. (Frontend fleet context: `docs/STATE_OF_SWIMCHAIN.md`; forum and feed are the most complete clients.)

## Constraints

- Achievements are recognition ONLY. No protocol privileges (no PoW discounts, no decay extension, no rate-limit changes). This principle is settled — the old swimmer-level privilege system was deliberately removed (legacy commit `a2e6934f` "Remove level system - PoW-only gating").
- Non-transferable, permanent, no tokens. Keep it that way.
- Awards should be deterministic from local data; don't invent a new gossip layer for this. If cross-node visibility is wanted, expose via profile RPC and let clients query.

## Acceptance criteria

- `cargo test --all-targets` passes; new unit tests for each wired trigger.
- On a regtest node: create identity → post → `get_achievements` returns FirstStroke.
- Serve content to a peer (two-node regtest) → FirstServe appears.
- One client profile page displays earned badges from the RPC.
- `cargo clippy` clean per CLAUDE.md flags; conventional commit(s).
