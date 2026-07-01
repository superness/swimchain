# Vision & Spec Alignment Review: Archiver Client

## Summary

The Archiver Client demonstrates **strong alignment with Swimchain's decentralized vision** by empowering users to preserve content through their own local resources (IndexedDB, PoW computation). It correctly implements the core decay formula per SPEC_02 and pool requirements per SPEC_03. However, there are notable spec deviations in threshold constants and a critical gap where actual PoW submission is mocked rather than integrated with the network protocol.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 26 | 30 | Strong local-first, user-empowered design; minor concerns about RPC dependency |
| Spec Compliance | 18 | 25 | Correct formulas, but mocked PoW and some constant deviations |
| Architectural Fit | 21 | 25 | Follows established patterns; singleton services fit context/hook model |
| Future Compatibility | 16 | 20 | Good extensibility; migration concerns for IndexedDB schema |
| **Total** | **81** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

1. **Local-First Architecture**
   - All archives stored in IndexedDB on user's device, not a central server
   - User controls storage budget (1-1000GB configurable)
   - No account registration or cloud dependency
   - Works offline for archive browsing/search

2. **User Empowerment Over Platform**
   - Users choose which spaces to monitor (targetSpaces configuration)
   - Configurable thresholds give users control over engagement strategy
   - Daily PoW budget prevents users from overcommitting resources
   - Users decide what content is worth preserving

3. **Organic Moderation Philosophy**
   - Embraces the decay system rather than fighting it
   - Content preservation requires ongoing PoW investment (no free persistence)
   - Multiple users can contribute to same pool (distributed responsibility)
   - Urgency classification (critical/warning/normal) reflects natural content lifecycle

4. **PoW as Currency**
   - Budget meter visualizes PoW as a finite daily resource
   - Engagement requires genuine computational work
   - No distinction between "paying" and "contributing" (consistent with pool philosophy)

5. **Identity IS Keypair**
   - RPC connection operates with local node (no central auth server)
   - No user accounts or password-based authentication
   - Author addresses displayed in bech32m format (cs1...)

### Vision Concerns

1. **RPC Dependency Creates Soft Centralization** (Minor)
   - Requires connection to localhost:3030 (a specific node)
   - If user's node goes down, monitoring stops
   - No fallback to alternative nodes or P2P discovery
   - *Mitigation*: This is appropriate for a local-first app; the node IS the user's gateway

2. **Mocked PoW Defeats Economic Model** (Moderate)
   - Current implementation simulates PoW rather than computing real Argon2id
   - Budget tracking works, but no actual work is contributed to network
   - Other nodes cannot verify non-existent PoW proofs
   - *Impact*: Undermines "mining IS paying" principle until integrated

3. **Auto-Archive Could Create Hoarding Behavior** (Minor - Future Feature)
   - When auto-archive is implemented, could encourage indiscriminate archiving
   - Users might archive content they don't actually value
   - Consumes local storage without community benefit
   - *Mitigation*: This is a user-local decision; they bear the storage cost

4. **No Content Export/Share Mechanism** (Minor Gap)
   - Archives are trapped in user's IndexedDB
   - No way to restore content to network if it decays globally
   - Could undermine preservation purpose if user can't republish
   - *Future consideration*: Add re-publish from archive feature

---

## Spec Compliance Assessment

### Correct Implementations

| Spec | Implementation | Status |
|------|----------------|--------|
| SPEC_02: Decay Formula | `survival = 0.5^(effective_decay_time / half_life)` | Correct |
| SPEC_02: Half-life | 604,800 seconds (7 days) | Correct |
| SPEC_02: Floor Period | 172,800 seconds (48 hours) | Correct |
| SPEC_02: Decay Threshold | 6.25% (0.0625) | Correct |
| SPEC_03: Pool Required PoW | 60 seconds | Correct |
| SPEC_03: Min Contribution | 1 second minimum implied | Correct |

### Spec Deviations

| Spec | Expected | Actual | Severity | Notes |
|------|----------|--------|----------|-------|
| SPEC_03 §7: Pool Window | 10 minutes (600,000ms) | Not tracked | Medium | Client doesn't track pool expiry; relies on node |
| SPEC_03 §4: Argon2id PoW | Real Argon2id computation | Mocked simulation | **High** | Critical gap - no actual PoW computed |
| SPEC_03 §6.4: Action Difficulty | 16 bits for ENGAGE | Configurable seconds | Medium | Client uses time-based budget, not difficulty bits |
| Wire Protocol: POOL_CONTRIBUTE | 0x47 message | RPC abstraction | Low | Uses RPC, not raw wire protocol (acceptable) |
| Client Config: Archive Threshold | Not specified | 5% default | Info | Client-defined constant, reasonable |
| Client Config: Engage Threshold | Not specified | 10% default | Info | Client-defined constant, reasonable |

### Detailed Deviation Analysis

#### 1. Mocked PoW (High Severity)

**Location**: `AutoEngageEngine.engage()` (src/services/AutoEngageEngine.ts:317)

**Expected per SPEC_03 §4**:
```
- Compute Argon2id hash with 64 MiB memory, 3 iterations, parallelism 4
- Find nonce where hash meets difficulty target
- Create PoolContribution with: contributor, pow_nonce, pow_work, pow_target, signature
- Submit via POOL_CONTRIBUTE (0x47) message
```

**Actual Implementation**:
```typescript
// Simulated mining progress (not real PoW)
for (let i = 0; i <= 100; i += 10) {
  await delay(seconds * 10); // Fake delay
  this.updateProgress(i);
}
```

**Impact**: No proof is generated or submitted. Network nodes cannot verify engagement. Pool completion cannot occur via this client.

**Recommendation**: Integrate `@swimchain/react usePow()` hook when available, or import `hash-wasm` Argon2id and compute real proofs.

#### 2. Pool Window Not Tracked (Medium Severity)

**Spec**: Pools expire after 10 minutes if not completed.

**Client Behavior**: Displays pool progress (currentSeconds/60) but doesn't show time remaining in window or warn about imminent expiry.

**Impact**: User could contribute to pool moments before it expires, wasting PoW.

**Recommendation**: Add `poolWindowRemaining` field to `PoolStatus` display; warn when <2 minutes remain.

#### 3. Difficulty vs. Time Mismatch (Medium Severity)

**Spec**: ENGAGE action should use 16-bit difficulty.

**Client Model**: Uses time-based engagement (+5s, +15s, +30s) which translates to pool contribution, not difficulty.

**Analysis**: This is actually correct design! Pool contributions are measured in PoW seconds, not difficulty bits. The 16-bit difficulty determines how hard each hash is, while the total seconds determines the pool contribution. The client's time-based model is appropriate.

**Status**: Not a deviation after analysis - client model is correct.

---

## Architectural Fit Assessment

### Fits Well

1. **Provider Hierarchy Pattern**
   - `ErrorBoundary → SwimchainProvider → RpcProvider → App`
   - Matches pattern established in forum-client and other Swimchain clients
   - WASM initialization wrapped properly

2. **Singleton Service Pattern**
   - `getArchiveStorage()`, `getContentMonitor()`, `getAutoEngageEngine()`
   - Appropriate for cross-component state that shouldn't remount
   - Integrates with React hooks via subscription pattern

3. **Hook Composition**
   - Custom hooks (`useContentMonitor`, `useArchiveStorage`) compose well
   - Return standard `{ data, loading, error, refresh }` pattern
   - Consistent with React best practices

4. **RPC Abstraction Layer**
   - Clean separation between `lib/rpc.ts` and hooks
   - Typed responses with proper error handling
   - Could be swapped for different transport

5. **Component-Scoped Styling**
   - Each component has corresponding `.css` file
   - No global style conflicts
   - WCAG 2.1 AA compliance documented

### Concerns

1. **Singleton vs. Context Tension**
   - Services are singletons (module-level)
   - But also accessed via hooks (component-level)
   - `BudgetMeter` polls singleton directly (1-second interval)
   - Could cause stale state if multiple instances exist

2. **Missing Service Initialization Hook**
   - `AutoEngageEngine` should receive RPC client like `ContentMonitor` does
   - Currently doesn't have a clean way to connect to network

3. **IndexedDB Schema Version**
   - Schema is version 1 with no migration path
   - Adding fields later could break existing user archives
   - Should plan for `onupgradeneeded` migration logic

4. **No Shared Component Library**
   - `StatusCard`, `ErrorBoundary`, `LoadingScreen` could be in `@swimchain/react`
   - Currently duplicated from other clients
   - Should extract to shared library

---

## Future Compatibility Assessment

### Extensibility

| Aspect | Assessment |
|--------|------------|
| Adding new urgency levels | Easy - UrgencyLevel is a union type |
| Adding new engagement tiers | Easy - EngageButton accepts `seconds` prop |
| Supporting multiple nodes | Medium - RpcProvider would need configuration |
| Adding auto-archive | Medium - Logic exists, needs trigger integration |
| Mobile support | Medium - Tauri integration exists; React Native would need port |
| Multi-user archives | Hard - IndexedDB is per-origin, no sync |

### Breaking Change Risks

1. **IndexedDB Schema Changes**
   - Adding indexes or stores requires migration
   - Changing `ArchiveEntry` shape breaks existing data
   - *Recommendation*: Add version migration handler now

2. **PoW Integration**
   - When real PoW is added, budget semantics may change
   - Current "seconds" might map differently to actual difficulty
   - *Recommendation*: Abstract budget units behind interface

3. **RPC Endpoint Changes**
   - If node API changes, RPC client breaks
   - No versioning in current RPC calls
   - *Recommendation*: Add version negotiation or pinning

4. **Pool Protocol Changes**
   - If POOL_CONTRIBUTE message format changes, client breaks
   - Currently abstracted through RPC (good)
   - *Recommendation*: Ensure RPC layer handles versioning

### Planned Future Features Support

| Feature | Compatibility |
|---------|--------------|
| SPEC_03 §10.2: Mobile PoW | Argon2id params would need `parallelism=2` mode |
| SPEC_02: Adaptive Decay | Client decay calculation may need server sync |
| Multi-space subscription | ContentMonitor already supports space arrays |
| Offline-first mode | IndexedDB already supports; RPC needs queue |

---

## Recommendations

### Priority 1: Critical (Blocks Core Vision)

1. **Implement Real PoW Computation**
   - Integrate `@swimchain/react usePow()` or direct `hash-wasm` Argon2id
   - Generate actual PoolContribution proofs
   - Submit to node via RPC
   - Without this, the app cannot contribute to network health

### Priority 2: High (Spec Compliance)

2. **Add Pool Window Tracking**
   - Display time remaining in pool window
   - Warn user when pool is about to expire
   - Prevent PoW contribution to expiring pools

3. **Connect Auto-Engage to ContentMonitor**
   - Wire `AutoEngageEngine` into polling cycle when enabled
   - Respect priority calculation already implemented
   - Currently UI toggle has no effect

### Priority 3: Medium (Architectural Improvement)

4. **Add IndexedDB Schema Migrations**
   - Implement `onupgradeneeded` handler in `ArchiveStorage`
   - Version schema (currently v1)
   - Plan for future schema evolution

5. **Replace Singleton Polling with Events**
   - `BudgetMeter` 1-second polling is wasteful
   - Use event subscription pattern like `ContentMonitor`
   - Update only when budget actually changes

### Priority 4: Low (Future-Proofing)

6. **Add Re-Publish from Archive**
   - Allow users to restore decayed content
   - Would require PoW and signing with user's key
   - Supports preservation mission end-to-end

7. **Extract Shared Components**
   - Move `StatusCard`, `ErrorBoundary`, `LoadingScreen` to `@swimchain/react`
   - Reduce duplication across clients

---

## Conclusion

The Archiver Client demonstrates a strong understanding of Swimchain's vision. Its local-first architecture, user-controlled budgets, and embrace of the decay lifecycle align well with decentralization principles. The decay formula implementation is correct, and the pool mechanics are properly modeled.

The critical gap is the **mocked PoW computation**, which prevents the client from actually contributing to content preservation on the network. Once real Argon2id proofs are integrated, this client will become a valuable tool for users who want to actively participate in organic content moderation.

**Overall Vision Alignment: Strong** (with PoW integration needed)
**Overall Spec Compliance: Moderate** (correct formulas, missing integration)
