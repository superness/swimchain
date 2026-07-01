# User Experience Review: Seeding & Availability

## Summary

The Seeding & Availability feature has a **well-designed backend architecture** but suffers from **critical UX gaps**: there is no user interface, no RPC endpoints, and no CLI commands for users to configure or monitor their seeding settings. Users cannot discover this feature, adjust their contribution levels, or see their seeding statistics. The feature is essentially invisible to end users despite being functionally complete in the core logic.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 8 | 30 | No UI/CLI/RPC - users can't interact with the feature |
| Discoverability | 2 | 20 | Feature is invisible - no way to find or learn about it |
| Efficiency | 15 | 25 | Backend is efficient when integrated, but no user access |
| Delight & Polish | 10 | 25 | Statistics/health systems exist but aren't surfaced |
| **Total** | **35** | **100** | Critical UX gaps prevent user engagement |

---

## User Flows Analyzed

### Flow 1: Configuring Seeding Settings

**Expected User Goal**: Adjust bandwidth limits, choose which spaces to seed, enable/disable seeding

**Current State**:
1. User opens settings/preferences - **No seeding settings available**
2. User looks in CLI help - **No seeding commands exist**
3. User searches documentation - **Documentation describes config but no path to change it**
4. User edits config.toml manually - **Requires restart, not discoverable**

**Friction Points**:
- Zero discoverability of the feature
- No runtime configuration possible
- Manual file editing is the only option
- No feedback when changes take effect

**Improvement**:
- Add RPC endpoints: `get_seeding_config`, `set_seeding_config`
- Add CLI: `cs seeding show`, `cs seeding set --bandwidth 20`
- Add UI settings panel with sliders and toggles

---

### Flow 2: Viewing Seeding Statistics

**Expected User Goal**: See how much content I've shared, my contribution to the network

**Current State**:
1. User wants to see upload statistics - **No way to view**
2. `StatisticsSnapshot` exists with rich data - **Not exposed anywhere**
3. `SeedingHealth` indicator exists - **Not displayed in any UI**
4. Achievement tracking works internally - **Users can't see progress**

**Friction Points**:
- Statistics are tracked but completely hidden
- No way to feel rewarded for contributing
- Achievement system exists but is disconnected

**Improvement**:
- Add RPC endpoint: `get_seeding_stats`
- Add dashboard widget showing:
  - Bytes uploaded total / last hour
  - Requests served
  - Health status (Healthy/Degraded/Inactive)
  - Progress toward achievements

---

### Flow 3: Understanding Content Availability

**Expected User Goal**: Know which content is available on the network, see availability status

**Current State**:
1. `PeerAvailabilityMap` tracks peer content - **Internal use only**
2. Gossip announcements work (MSG_AVAILABILITY_ANNOUNCE) - **Users don't see this**
3. Content retrieval uses seeding - **Transparent to user, which is good**

**Friction Points**:
- No indication when your content is being seeded by others
- No way to see content availability health
- Users can't understand why some content loads faster

**Improvement**:
- Add subtle availability indicator on content (e.g., "Highly available" badge)
- Show "N peers have this content" on detail views
- Display "You're helping share this content" when actively seeding

---

### Flow 4: Mobile Configuration

**Expected User Goal**: Control data usage, set WiFi-only mode

**Current State**:
1. `MobileConfig` with WiFi-only default exists - **Cannot be changed by user**
2. Cellular limits configurable in code - **No UI access**
3. Background serving toggleable - **No way to toggle**

**Friction Points**:
- Mobile users can't customize their experience
- Battery-conscious users have no control
- Cellular data concerns can't be addressed

**Improvement**:
- Mobile settings screen with:
  - WiFi-only toggle (clear explanation of what it does)
  - Cellular daily limit slider
  - Background seeding toggle with battery impact warning
  - Cache size limit

---

## UX Issues

### Critical (Blocking)

1. **No user-facing configuration interface** - Users cannot configure seeding at all
   - Impact: Feature is invisible despite being "complete"
   - Fix: Add RPC endpoints + CLI + UI settings panel

2. **No RPC endpoints for seeding** - Clients have no API to work with
   - Impact: Web/mobile apps cannot integrate seeding controls
   - Fix: Implement `get_seeding_config`, `set_seeding_config`, `get_seeding_stats`

3. **Background announcement task is placeholder** - `spawn_availability_announcer()` is TODO
   - Impact: Gossip doesn't actually run, availability system partially broken
   - Fix: Complete implementation at `src/node/tasks.rs:1119-1120`

### Major (Frustrating)

1. **No statistics visibility** - Rich stats tracked but hidden
   - Impact: Users can't see their contribution or feel rewarded
   - Fix: Add stats dashboard, surface `StatisticsSnapshot` data

2. **No health indicator** - `SeedingHealth` enum unused in UI
   - Impact: Users don't know if seeding is working
   - Fix: Add status indicator to node status bar or settings

3. **Silent configuration errors** - Lock poisoning fails silently in manager
   - Impact: Users won't know if their settings failed to apply
   - Fix: Return proper errors, show toasts/notifications

4. **Achievement system disconnected** - Stats ready but achievements not wired
   - Impact: Missing gamification opportunity, reduced engagement
   - Fix: Wire statistics to achievement unlocking system

### Minor (Polish)

1. **Mode naming inconsistency** - `FullSpace` vs documented `AllFollowed`/`Everything`
   - Impact: Confusion between docs and UI (when UI exists)
   - Fix: Standardize naming, add mode aliases

2. **Missing seeding mode descriptions** - Enum variants lack user-facing text
   - Impact: Users won't understand mode differences
   - Fix: Add `description()` method to `SeedingMode`

3. **No bandwidth unit conversion help** - Users think in MB/s, config uses Mbps
   - Impact: Users may misconfigure bandwidth
   - Fix: Show both units in UI, or use more intuitive units

4. **No seeding impact preview** - Can't see what content would be affected by changes
   - Impact: Users make blind decisions
   - Fix: Add "Preview changes" showing affected content count

---

## Positive UX Elements

- **Sensible defaults**: 10 Mbps, 50 GB storage, 7-day duration are reasonable
- **Voluntary by design**: Users opt-in, respecting autonomy
- **Mobile-first consideration**: WiFi-only default protects mobile data
- **Privacy-preserving**: Hash-based requests prevent content enumeration
- **Clean validation errors**: `ConfigError` provides clear, specific messages
- **Health status levels**: Healthy/Degraded/Inactive provides appropriate granularity
- **Lock-free rate limiting**: Won't block UI threads
- **Comprehensive statistics**: When surfaced, will be highly informative

---

## Recommendations

### Priority 1: Enable User Access (Critical)

1. **Implement RPC endpoints** (estimated effort: medium)
   ```
   get_seeding_config -> SeedingConfig
   set_seeding_config(SeedingConfig) -> Result<()>
   get_seeding_stats -> StatisticsSnapshot
   ```

2. **Add CLI commands** (estimated effort: low)
   ```
   cs seeding show          # Display current config + stats
   cs seeding enable        # Enable seeding
   cs seeding disable       # Disable seeding
   cs seeding set --bandwidth 20 --storage 100
   ```

3. **Create Settings UI panel** (estimated effort: medium)
   - Toggle: Enable seeding
   - Slider: Bandwidth limit (1-100 Mbps)
   - Slider: Storage limit (1-1000 GB)
   - Multi-select: Spaces to seed
   - Toggle: Seed own content
   - Toggle: Seed viewed content
   - Slider: Seeding duration (1 hour - 1 year)

### Priority 2: Surface Statistics (High)

4. **Add seeding stats widget** (estimated effort: low)
   - Total uploaded (human-readable: "1.2 GB shared")
   - Requests served count
   - Health status with icon (green/yellow/red)
   - Time seeding ("Active for 3 days")

5. **Add achievement progress** (estimated effort: low)
   - Progress bars toward "Bandwidth Baron", "Terabyte Club"
   - Celebration animation on unlock

### Priority 3: Mobile Experience (Medium)

6. **Mobile settings screen** (estimated effort: medium)
   - WiFi-only toggle with explanation
   - Cellular limit with usage indicator
   - Background seeding toggle
   - Cache size with storage used indicator

### Priority 4: Content Feedback (Low)

7. **Content availability indicators** (estimated effort: low)
   - "Seeded by N peers" badge
   - "You're sharing this" indicator
   - Availability health on content detail

---

## Swimchain-Specific Feedback

### PoW Experience
- **Not applicable to seeding**: Seeding configuration doesn't require PoW
- **Consideration**: Content *retrieval* may involve PoW challenges from seeders in future

### Decay Communication
- **Not directly integrated**: Seeding is separate from decay
- **Opportunity**: Show "Help prevent decay by seeding this content" messaging
- **Potential**: Link seeding duration to content decay curves for informed decisions

### Identity UX
- **Current user tracking works**: `SeedingManager` correctly tracks `current_user` for "own content" mode
- **No recovery concern**: Seeding config doesn't require identity recovery
- **Improvement**: Show "You're contributing as [identity]" in seeding UI

### Sync Status Communication
- **Missing integration**: No indication of sync status in seeding context
- **Risk**: Users may not understand that seeding requires synced content
- **Fix**: Disable seeding controls until initial sync complete, with explanation

### Offline Capability Indication
- **Not addressed**: No UI shows seeding status when offline
- **Fix**: Show "Seeding paused - offline" when network unavailable
- **Mobile-specific**: "Seeding paused - cellular" when WiFi-only enabled

---

## Conclusion

The Seeding & Availability feature demonstrates solid engineering fundamentals with a lock-free rate limiter, comprehensive statistics, and mobile-aware design. However, **the UX score of 35/100 reflects a critical gap**: none of this functionality is accessible to users.

The immediate priority should be implementing RPC endpoints and basic UI controls. Without these, the feature exists only for developer-level node operators who can edit configuration files manually. This severely limits Swimchain's ability to grow its content distribution network organically through community participation.

The good news: the backend is ready. Exposing it to users is primarily an integration task rather than a design task.

---

*Review completed: 2026-01-13*
*Reviewer: UX Expert Agent*
*Feature Version: Complete (Phase 3 - Milestone 3.5)*
