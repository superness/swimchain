# Swimchain Client Documentation

> Generated: 2026-02-17 | 6 feature domains | 7 clients | 112 screenshots | 2,024 lines of documentation

This is the master index for cross-client feature documentation. Each feature domain has its own directory with a detailed README and screenshots for every client.

---

## Clients

| Client | Port | Purpose | Identity | Sponsorship | Content | Moderation | Navigation | Private Spaces |
|--------|:----:|---------|:--------:|:-----------:|:-------:|:----------:|:----------:|:--------------:|
| **forum-client** | 5173 | Threaded discussion forum | Full | Full | Full | Full | Full | Full |
| **chat-client** | 5175 | Discord-style messaging | Full | None | Full | Full | Partial | Full |
| **feed-client** | 5179 | Twitter/TikTok-style feed | Full | Full | Full | Full | Full | Partial |
| **search-client** | 5174 | Search interface | Partial | Badge only | Results | Partial | Full | Badge only |
| **analytics-client** | 5178 | Metrics dashboard | Managed | Analytics | Metrics | Page | Full | None |
| **archiver-client** | 5177 | Content preservation | Managed | None | Auto-engage | Filtering | Full | None |
| **bridge-client** | 5176 | IRC/Matrix bridge | Sync | None | Bridging | Filtering | Full | Key mgmt |

---

## Feature Documentation

### [Identity](identity/README.md)
Ed25519 keypair management, address display, backup/export, display names, profile pages.
- **344 lines** | **21 screenshots**
- Covers: identity creation, address display, backup/export, display name, profile, public key, deletion, seed import, route guards, IdentityProvider

### [Sponsorship](sponsorship/README.md)
Sponsorship offers, claims, approval workflows, status display, analytics.
- **339 lines** | **14 screenshots**
- Covers: sponsorship page, offer creation, claiming (with PoW), approval/rejection, cancellation, status display, unsponsored banners, analytics dashboard

### [Content](content/README.md)
Threads, posts, replies, decay indicators, media galleries, reactions, search, encrypted content.
- **312 lines** | **11 screenshots**
- Covers: thread/post view, reply system, decay indicator, media gallery, encrypted content, content search, post creation, reactions, blocklist filtering, spam reports

### [Moderation](moderation/README.md)
Block buttons, blocklist management, spam reporting, spam badges, content filtering.
- **301 lines** | **19 screenshots**
- Covers: useBlocklist hook, BlockButton, BlocklistManager, ReportModal, SpamBadge, counter-attestation, content filtering, channel/server blocking

### [Navigation & Layout](navigation/README.md)
Main layouts, node status bars, toast systems, error boundaries, loading screens, responsive design, keyboard shortcuts.
- **323 lines** | **27 screenshots**
- Covers: MainLayout, NodeStatusBar, Toast, ErrorBoundary, LoadingScreen, responsive design, routes, RequireIdentity, DebugPanel, keyboard shortcuts

### [Private Spaces](private-spaces/README.md)
End-to-end encrypted spaces, invite system, X25519 key exchange, DMs, passphrase encryption.
- **405 lines** | **20 screenshots**
- Covers: private space creation, listing, encrypted messaging, invite system, key exchange, key storage, passphrase encryption, DMs, space admin, media encryption

---

## Architecture

All clients are React/Vite/TypeScript applications that communicate with a local Swimchain node via JSON-RPC over HTTP.

```
┌──────────────┐     HTTP/JSON-RPC     ┌──────────────────┐
│  Client App  │ ◄──────────────────► │  Swimchain Node  │
│  (React/TS)  │     port = P2P + 1    │  (Rust binary)   │
└──────────────┘                       └──────────────────┘
       │                                        │
       ▼                                        ▼
  localStorage                           Sled database
  IndexedDB                              P2P network
  (keys, blocklist,                      (TCP framing,
   preferences)                           mDNS/DHT)
```

### Shared Infrastructure
- **swimchain-react/** — Shared hooks (`useRpc`, `useStoredIdentity`, `useContent`) and providers
- **swimchain-wasm/** — WASM bindings for Ed25519, SHA-256, Bech32m (used by browser clients)
- **@noble/curves** + **@noble/hashes** — Client-side cryptography (Ed25519, X25519, Argon2id)

### Network Modes
| Mode | PoW | Data Dir | Magic Bytes |
|------|-----|----------|-------------|
| Mainnet | 100% | (none) | SWIM |
| Testnet | 10% | `-testnet` | TEST |
| Regtest | 0.1% | `-regtest` | REGT |

---

## Regenerating Screenshots

Screenshots are captured via browser automation:

```bash
# Single screenshot
node scripts/browser-control.js screenshot \
  --url="http://localhost:PORT/PAGE" \
  --output="docs/clients/FEATURE/CLIENT.png"

# All screenshots (requires all dev servers running)
for client in forum-client chat-client feed-client search-client analytics-client archiver-client bridge-client; do
  for feature in identity sponsorship content moderation navigation private-spaces; do
    node scripts/browser-control.js screenshot \
      --url="http://localhost:$(cat $client/vite.config.ts | grep port | head -1 | grep -o '[0-9]*')/$feature" \
      --output="docs/clients/$feature/$client.png"
  done
done
```

---

## Related Documents

- [Cross-Client Audit](../CROSS_CLIENT_AUDIT.md) — Feature audit with pass/fail matrix and fix history
- [Not Implemented Sweep](../NOT_IMPLEMENTED_SWEEP.md) — Stub and mock data inventory
- [Architecture Concerns](../ARCHITECTURE_CONCERNS.md) — Known architectural issues
- [Master Features](../MASTER_FEATURES.md) — Feature roadmap
