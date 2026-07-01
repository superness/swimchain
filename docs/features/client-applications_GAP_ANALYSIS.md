# Gap Analysis Report: Client Applications

**Section**: 23. Client Applications
**Analysis Date**: 2026-01-12
**Comparison**: MASTER_FEATURES.md vs Actual Implementation

---

## Summary

| Metric | Count |
|--------|-------|
| Documented features | 54 |
| Implemented features | 47 |
| Undocumented features | 8 |
| Documented but missing/incomplete | 7 |
| **Gap Score** | **28%** (higher = more gaps) |

---

## Undocumented Features (HIGH PRIORITY)

| Feature | Location | Impact |
|---------|----------|--------|
| Replace-In-Mempool (RIM) | `forum-client/src/lib/action-pow.ts:346-434` | Allows replacing pending actions before block formation (~30s). Critical for edit UX but not mentioned in MASTER_FEATURES.md |
| Pool PoW Target computation | `forum-client/src/lib/action-pow.ts:302-326` | Function `computePoolPowTarget()` for engagement pool contributions - undocumented |
| Media Encryption APIs | `forum-client/src/lib/encryption.ts` | `encryptMedia()`, `decryptMedia()`, `encryptPrivateMedia()`, `decryptPrivateMedia()` - fully implemented but not listed in feature tables |
| Space Name Encryption | `forum-client/src/lib/encryption.ts` | `encryptSpaceName()`, `decryptSpaceName()` for private spaces - not documented |
| ContentMonitor.estimateTimeUntilDecay() | `archiver-client/src/services/ContentMonitor.ts` | Uses `HALF_LIFE * log2(heat/threshold)` formula - implementation detail not documented |
| DM Space ID Generation Algorithm | `forum-client/src/lib/dm.ts` | Deterministic ID via `SHA256("dm:v1:" + sorted(pk1, pk2))` - algorithm not documented |
| IRC WebSocket Proxy Requirement | `bridge-client/src/adapters/IrcAdapter.ts:1-17` | IRC requires WebSocket proxy (browser can't do raw TCP) - critical limitation not documented |
| Debug Dashboard Proxy Protocol | `debug-dashboard/proxy.js` | 123-line Node.js proxy for authenticated RPC - not documented in MASTER_FEATURES.md |

---

## Documented but Missing/Incomplete

| Documented Feature | Status | Location | Details |
|-------------------|--------|----------|---------|
| AutoEngageEngine actual PoW integration | Incomplete | `archiver-client/src/services/AutoEngageEngine.ts:141` | Contains TODO: "Call @swimchain/react usePow() or similar API" - currently simulates engagement |
| Key Rotation for Private Spaces | Planned | MASTER_FEATURES.md §10 | Listed as "Planned" - no implementation exists |
| Feed Client Saved Posts | Placeholder | `feed-client/src/pages/` | "Coming Soon" placeholder - not implemented |
| Feed Client Profile Page | Placeholder | `feed-client/src/pages/` | "Coming Soon" placeholder - not implemented |
| Feed Client Compose Page | Placeholder | `feed-client/src/pages/` | "Coming Soon" placeholder - not implemented |
| Analytics engagementsLast24h | Hardcoded | `analytics-client/` | Field exists in interface but always returns 0 |
| Debug Dashboard Network Visualizer | Minimal | `debug-dashboard/index.html` | Basic HTML + JS, not full "Network Visualizer" component as described |

---

## Outdated Documentation

| Doc Section | Issue | Correct Info |
|------------|-------|-------------|
| MASTER_FEATURES.md §23 "Debug Dashboard" | Lists "Network Visualizer, Node List, Message Log, Content Debug, Peer Connections" as separate components | Actually a single-file HTML dashboard (`index.html` + `proxy.js`) with embedded functionality |
| MASTER_FEATURES.md §23 "IRC Integration" | Lists as "Complete" | Requires WebSocket proxy (proxyUrl config), not direct browser IRC |
| MASTER_FEATURES.md §23 "Search Client Result Display" | Listed as simple "Result Display" | Actually has 4 result types: ThreadResult, SpaceResult, ReplyResult, UserResult |
| MASTER_FEATURES.md §23 feature tables | All show "Complete" status | Several features are placeholders or partially implemented |

---

## Documentation Quality Issues

### Inconsistent Terminology

| Location | Issue |
|----------|-------|
| "Space" vs "Server" | Chat client uses "Server" terminology (Discord-like) while documentation uses "Space" |
| "Channel" vs "Thread" | Chat client uses "Channel" while forum uses "Thread" for similar concepts |
| "Heat" vs "Survival Probability" | Documentation uses both interchangeably without clear distinction |

### Missing Implementation Details

| Area | What's Missing |
|------|----------------|
| Action PoW Challenge Format | 82-byte format well-documented in code but not in MASTER_FEATURES.md |
| X25519 Birational Map | Ed25519→X25519 conversion formula `u = (1+y)/(1-y) mod p` not documented |
| Echo Prevention Algorithm | Bridge client echo tracking TTL and deduplication not documented |
| Rate Limiting Sliding Window | Bridge client uses 1-hour sliding window, not documented |

### Wrong/Missing File Paths

| Documented Path | Actual Path |
|----------------|-------------|
| Not specified | `debug-dashboard/proxy.js` (123 lines) |
| Not specified | `debug-dashboard/index.html` (26,933 lines) |
| "services/" not listed | `archiver-client/src/services/AutoEngageEngine.ts` |
| "services/" not listed | `bridge-client/src/services/BridgeEngine.ts` |
| "adapters/" not listed | `bridge-client/src/adapters/MatrixAdapter.ts` |
| "adapters/" not listed | `bridge-client/src/adapters/IrcAdapter.ts` |

---

## Recommended Additions

### High Priority

1. **Document RIM (Replace-In-Mempool) System**
   - Critical for edit functionality
   - Users need to understand 30-second window
   - `computeActionHash()` API should be documented in RPC API section

2. **Add IRC WebSocket Proxy Requirement**
   - Document that browser clients cannot connect directly to IRC
   - Provide proxy setup instructions or reference implementation
   - Update status from "Complete" to "Complete (requires proxy)"

3. **Document Debug Dashboard Architecture**
   - Explain single-file HTML + proxy architecture
   - Document `/api/nodes` and `/api/rpc/:nodeName` endpoints
   - Clarify node discovery via `-testnet` directory scanning

4. **Fix AutoEngageEngine Documentation**
   - Mark `engage()` as "Simulated" until real PoW integration
   - Document the TODO status clearly

### Medium Priority

5. **Add Media Encryption API Documentation**
   - `encryptMedia()`, `decryptMedia()` for passphrase encryption
   - `encryptPrivateMedia()`, `decryptPrivateMedia()` for space key encryption
   - Document format: `salt(16) + iv(12) + ciphertext` vs `iv(12) + ciphertext`

6. **Document DM Space ID Algorithm**
   - Formula: `SHA256("dm:v1:" + lexicographic_sort(pk1, pk2))` first 16 bytes
   - Explain deterministic generation enables both parties to compute same ID

7. **Add Pool PoW Target Documentation**
   - Formula: `SHA256(content_hash || pool_id || prev_block_hash)`
   - Explain use in engagement pool contributions

8. **Document Feed Client Placeholder Status**
   - Update feature table to show "Planned" for Saved, Profile, Compose
   - Remove or clarify "Complete" status for incomplete features

### Low Priority

9. **Standardize Space/Server Terminology**
   - Choose consistent terminology across forum-client and chat-client
   - Update documentation to match code or vice versa

10. **Add Action PoW Challenge Format Specification**
    - Document 82-byte canonical format in MASTER_FEATURES.md
    - Include byte offsets and field descriptions

---

## Recommended Removals

| Item | Reason |
|------|--------|
| "Complete" status for Feed Client features | Saved, Profile, Compose are placeholders |
| "Network Visualizer" as separate Debug Dashboard feature | It's part of single-file HTML, not a component |
| Implicit IRC browser support | Must clarify proxy requirement |

---

## Cross-Reference Issues

| Issue | Affected Sections |
|-------|------------------|
| Private Space encryption documented in both §10 and §23 | Consolidate or clearly cross-reference |
| Action PoW documented in §2, §23, and §15 | Ensure consistency across all three |
| WASM bindings mentioned but `swimchain-wasm` not fully documented | Add §16 reference from client docs |

---

## Feature Verification Summary

### Forum Client (`forum-client/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Thread Creation | Complete | Complete | PoW + encryption working |
| Thread Viewing | Complete | Complete | Nested replies, decay display |
| Space Navigation | Complete | Complete | SpaceTree, SpaceList |
| Media Upload | Complete | Complete | ImageGallery, encryption |
| Action PoW | Complete | Complete | Argon2id, progress UI |
| Content Encryption | Complete | Complete | Passphrase + space key |
| Private Spaces | Complete | Complete | X25519 key exchange |
| DM System | Complete | Complete | Deterministic space IDs |
| User Profiles | Complete | Complete | Profile page, posts |
| User Blocking | Complete | Complete | Client-side blocklist |
| Blocklist Manager | Complete | Complete | BlocklistManager component |
| Search | Complete | Partial | Client-side only, redirects to forum |
| Settings | Complete | Complete | Preferences storage |
| Debug Panel | Complete | Complete | DebugPanel component |
| Node Status Bar | Complete | Complete | NodeStatusBar component |
| **RIM Support** | Missing | Complete | computeActionHash() |
| **Media Encryption** | Missing | Complete | encrypt/decryptMedia() |

### Chat Client (`chat-client/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Channel Messaging | Complete | Complete | Real-time display |
| Server Navigation | Complete | Complete | ServerList component |
| Server List | Complete | Complete | Discord-style sidebar |
| Channel Sidebar | Complete | Complete | ChannelSidebar component |
| Chat Area | Complete | Complete | ChatArea component |
| Message Input | Complete | Complete | ChatMessageInput with PoW |
| Identity Display | Complete | Complete | IdentityCard |
| Action PoW | Complete | Complete | useActionPow hook |
| Typing Indicators | Missing | Complete | TypingContext |
| Presence Tracking | Missing | Complete | PresenceContext |

### Search Client (`search-client/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Text Search | Complete | Complete | parseQuery() with operators |
| Space Search | Complete | Complete | space: filter |
| Result Display | Complete | Complete | 4 result types |
| Wave Loader | Complete | Complete | WaveLoader component |

### Feed Client (`feed-client/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Feed Display | Complete | Complete | FeedList, FeedCard |
| Follow System | Complete | Complete | useFeed hook |
| Engagement | Complete | Complete | Basic reactions |
| Saved Posts | Complete | **Placeholder** | "Coming Soon" |
| User Profile | Complete | **Placeholder** | "Coming Soon" |
| Compose | Complete | **Placeholder** | "Coming Soon" |

### Analytics Client (`analytics-client/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Network Stats | Complete | Complete | NetworkHealth |
| Space Stats | Complete | Partial | engagementsLast24h = 0 |
| RPC Integration | Complete | Complete | useMetrics hook |

### Archiver Client (`archiver-client/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Content Monitoring | Complete | Complete | ContentMonitor service |
| Survival Prediction | Complete | Complete | estimateTimeUntilDecay() |
| Auto-Engage Engine | Complete | **Simulated** | TODO: integrate real PoW |
| Local Archive | Complete | Complete | IndexedDB storage |
| Budget Management | Complete | Complete | BudgetState |
| Dashboard | Complete | Complete | Dashboard page |

### Bridge Client (`bridge-client/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Matrix Integration | Complete | Complete | MatrixAdapter |
| IRC Integration | Complete | **Requires Proxy** | IrcAdapter via WebSocket |
| Echo Prevention | Complete | Complete | EchoTracker |
| Rate Limiting | Complete | Complete | HourlyRateLimiter |
| Activity Log | Complete | Complete | activityLog array |
| Dashboard | Complete | Complete | Dashboard page |

### Debug Dashboard (`debug-dashboard/`)

| Feature | Doc Status | Impl Status | Notes |
|---------|------------|-------------|-------|
| Network Visualizer | Complete | Partial | Embedded in HTML |
| Node List | Complete | Complete | Via /api/nodes |
| Message Log | Complete | Complete | In HTML |
| Content Debug | Complete | Complete | checkContentAllNodes() |
| Peer Connections | Complete | Partial | Basic visualization |

---

## Conclusion

The documentation for Client Applications in MASTER_FEATURES.md covers the major features but has several gaps:

1. **Undocumented advanced features**: RIM, Pool PoW, Media Encryption APIs
2. **Incomplete implementations marked as Complete**: Feed client placeholders, AutoEngageEngine PoW
3. **Missing technical requirements**: IRC proxy, Debug Dashboard architecture
4. **Terminology inconsistencies**: Space vs Server, Channel vs Thread

The overall gap score of **28%** indicates moderate documentation debt. Priority should be given to documenting the RIM system (critical for edit UX), clarifying the IRC proxy requirement, and updating status markers for placeholder features.

---

*Analysis generated by comparing MASTER_FEATURES.md §23 against actual source code in `*-client/` directories.*
