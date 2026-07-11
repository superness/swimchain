# Handoff: Wire mDNS Local Peer Discovery into Node Startup

**Status:** Ready to work. Decision (operator, 2026-07-11): turn mDNS on.
**Background:** `src/discovery/mdns.rs` is a complete mDNS discovery module, but it is only reachable through `DiscoveryManager` — **which the node never instantiates**. The live discovery stack today is: cached peers (`node/manager.rs:1115`), seed nodes (`manager.rs:1125-1191`), DHT (`node/tasks.rs:2474` `spawn_dht_peer_discovery`), and peer exchange (`tasks.rs:1094-1258`). mDNS should join them so two nodes on the same LAN find each other with zero configuration.

## Scope of work

1. Instantiate mDNS discovery during node startup — follow the pattern of `spawn_dht_peer_discovery` in `node/tasks.rs` (spawned task, feeding discovered peers into the same peer-candidate path DHT/PXP use). Decide whether `DiscoveryManager` is the right wrapper or whether the mDNS module should be driven directly like DHT is; prefer whichever leaves ONE discovery pattern, not two.
2. Network-mode hygiene: advertise/browse with the network mode in the service name (mainnet/testnet/regtest must not cross-connect on a LAN — they're already isolated by magic bytes, but don't waste dials). Check what `mdns.rs` already encodes.
3. Config flag: `mdns_enabled` in `node/config.rs`, default ON for all modes (LAN discovery is harmless and matches the vision's six-layer stack). Respect it at spawn.
4. Clean up `src/discovery/mod.rs` stale comments (it calls DHT "future" — DHT is live; make comments match reality).

## Acceptance criteria

- Two regtest nodes on one machine/LAN with no seeds configured and empty peer caches connect to each other via mDNS within ~10s.
- Nodes of different network modes on the same LAN do NOT dial each other.
- Flag off → no mDNS sockets opened.
- `cargo test --all-targets` + clippy clean; conventional commit (`feat(discovery): ...`).
