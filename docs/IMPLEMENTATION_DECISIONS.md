# Implementation Decisions

**Decided**: 2026-01-14
**Status**: Ready for automation

## Decisions Made

| Item | Decision | Choice |
|------|----------|--------|
| C-CLIENT-1 | Key Encryption Library | **Argon2id** (consistent with identity PoW) |
| C-ARCHIVER-1 | PoW Library for Clients | **@swimchain/react** (own package) |
| H-RPC-1 | Rate Limiting Crate | **governor** (async-native) |
| H-RPC-2 | Real-Time Events | **WebSocket** (bidirectional) |
| H-BLOCKLIST-3 | Merkle Tree Strategy | **Incremental updates** (better perf) |
| M-FORUM-1 | List Virtualization | **react-window** (lightweight) |
| M-IDENTITY-2 | Password Strength | **Skip** (minimum length only) |
| M-DHT-3 | mDNS Library | **mdns** crate |

## Implementation Notes

### Argon2id for localStorage Encryption (C-CLIENT-1)
- Use existing Argon2id from `@swimchain/react` WASM bindings
- Derive encryption key from user passphrase
- Encrypt seed before localStorage, decrypt on load
- Migration: prompt existing users to set passphrase on next load

### @swimchain/react for Client PoW (C-ARCHIVER-1)
- Package already exists in `swimchain-react/`
- Ensure it's published/available to client apps
- Replace mock `setTimeout` with actual `usePow()` hook

### Governor for Rate Limiting (H-RPC-1)
- Add `governor = "0.6"` to Cargo.toml
- Create rate limiter per method category (read: 100/min, write: 20/min)
- Add auth failure tracking (10 failures = 5-min lockout)

### WebSocket for Real-Time Events (H-RPC-2)
- Add `tokio-tungstenite` for WebSocket support
- Create `/ws` endpoint alongside existing HTTP
- Event types: content_new, content_engaged, sync_status, peer_connected

### Incremental Merkle Updates (H-BLOCKLIST-3)
- Track dirty paths from leaf to root
- Only recompute affected branch on update
- Batch multiple updates within same tick

### react-window for Virtualization (M-FORUM-1) ✅ IMPLEMENTED
- Added `react-window@^2.2.5` and `@types/react-window@^1.8.8` to forum-client
- Used react-window v2 `List` component with `rowComponent`/`rowProps` API
- Created `ThreadRowRenderer` component for virtualized row rendering
- Hybrid strategy: native rendering <50 items, virtualized ≥50 items
- Converted table layout to CSS Grid for virtualization compatibility
- Added ResizeObserver for dynamic container height measurement
- Fixed 80px row height with 5-row overscan buffer

### Skip Password Strength (M-IDENTITY-2)
- Just enforce minimum length (8 characters)
- No external library needed

### mdns Crate for LAN Discovery (M-DHT-3) ✅ IMPLEMENTED
- Added `mdns = "3.0"` to Cargo.toml
- Created `src/discovery/mdns.rs` module with MdnsDiscovery service
- Service name: `_swimchain._tcp.local`
- Integrated as Layer 1 in discovery stack via DiscoveryManager
- Note: Discovery only (mdns crate doesn't support advertising)
