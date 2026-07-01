# User Experience Review: Synchronization

**Reviewer**: UX Expert
**Date**: 2026-01-13
**Feature Document**: `docs/features/synchronization_FEATURE_DOC.md`

---

## Summary

The Synchronization feature demonstrates **good foundational UX** with thoughtful progress event broadcasting and state tracking. However, the user experience varies significantly across platforms - the mobile client shows excellent data-aware sync communication while desktop/web UIs lack detailed sync progress visualization. Key friction points include: no visual progress bar during initial sync, technical error messages unsuitable for end users, and missing ETA/time estimates during long sync operations.

---

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 21 | 30 | Good state machine, but error messages too technical |
| Discoverability | 14 | 20 | CLI well-documented, UI sync status buried in debug panel |
| Efficiency | 18 | 25 | Header-first is efficient, but no checkpoint resume |
| Delight & Polish | 16 | 25 | Mobile cellular budget is excellent; desktop lacks polish |
| **Total** | **69** | **100** | |

---

## User Flows Analyzed

### Flow 1: New User Initial Sync

**Steps**:
1. User starts node for first time
2. Node begins syncing from genesis
3. User waits for sync to complete
4. User can start using the application

**UX Assessment**:
| Step | Rating | Notes |
|------|--------|-------|
| 1. Start node | OK | CLI `sw node start` is clear |
| 2. Sync begins | POOR | No prominent visual indication of sync starting |
| 3. Wait for sync | POOR | No progress bar, no ETA, no time remaining |
| 4. Use application | OK | Continuous sync takes over transparently |

**Friction Points**:
- Initial sync could take significant time with no visual feedback
- Users don't know if sync is progressing or stuck
- `SyncProgressEvent::Progress(p)` emits `percentage()` but UI doesn't display it prominently
- No estimated time remaining shown despite `eta_secs()` being available in `SyncProgress`

**Improvement**:
- Add prominent sync progress bar in desktop/web UI during initial sync
- Show "Syncing: X% - ~Y minutes remaining" in status bar
- Consider modal/overlay for initial sync with progress visualization

---

### Flow 2: Checking Sync Status (CLI)

**Steps**:
1. User runs `sw sync status`
2. System displays current sync state
3. User understands their node's status

**UX Assessment**:
| Step | Rating | Notes |
|------|--------|-------|
| 1. Run command | GOOD | Clear command name, `--json` option available |
| 2. Display status | GOOD | Well-formatted output with clear sections |
| 3. Understanding | GOOD | Shows peers, height, storage usage |

**Positive Elements**:
- Helpful hint: "Node not running. Start with: sw node start"
- Storage usage shown as percentage and bytes
- JSON output for scripting/automation

**Friction Points**:
- `best_known_height` always shows 0 (not implemented)
- Sync percentage not shown in human-readable output
- Mempool stats shown but may confuse non-technical users

**Improvement**:
- Add sync progress percentage to CLI output when syncing
- Remove or clearly label unimplemented fields

---

### Flow 3: Sync Error Recovery

**Steps**:
1. Sync encounters error (e.g., bad peer data)
2. Error is communicated to user
3. User takes corrective action

**UX Assessment**:
| Step | Rating | Notes |
|------|--------|-------|
| 1. Error occurs | - | Backend handles well |
| 2. Communication | POOR | Error messages are too technical |
| 3. Recovery | POOR | No clear guidance on what user should do |

**Friction Points**:
- Error messages like `V-SYNC-01: Invalid chain linkage at height 100` are developer-focused
- `SyncError` doesn't include user-friendly descriptions or recovery actions
- No distinction between "wait and retry" vs "needs user action" errors

**Example Technical Error**:
```
V-SYNC-06: Response for unregistered request from peer [0xabc123...]
```

**What User Needs**:
```
Sync paused: Received unexpected data from a peer. The node will automatically
retry with a different peer. No action needed.
```

**Improvement**:
- Add `user_message()` method to `SyncError` for friendly descriptions
- Include recovery guidance: "No action needed" vs "Check network connection"
- Log technical details but show friendly message in UI

---

### Flow 4: Mobile Sync with Cellular Data

**Steps**:
1. User opens app on cellular connection
2. App shows data budget status
3. App limits sync to stay within budget
4. User can see when budget is approaching/exceeded

**UX Assessment**:
| Step | Rating | Notes |
|------|--------|-------|
| 1. Open app | GOOD | Immediate status indication |
| 2. Budget display | EXCELLENT | Clear progress bar with MB used/total |
| 3. Budget enforcement | EXCELLENT | Automatic pause at limit |
| 4. Warnings | EXCELLENT | "Approaching daily limit" at 80% |

**Positive Elements**:
- Visual progress bar for cellular budget (`SyncStatus.tsx`)
- Color coding: green/warning/error for budget states
- "Sync paused - budget exceeded" message
- Connection type clearly shown (WiFi vs Cellular)
- "Last sync: X ago" timestamp

**This is a model for how desktop/web should handle sync feedback.**

---

### Flow 5: Branch Subscription Management

**Steps**:
1. User subscribes to branches/spaces
2. Storage budget is consumed
3. User hits storage limit
4. LRU eviction occurs automatically

**UX Assessment**:
| Step | Rating | Notes |
|------|--------|-------|
| 1. Subscribe | UNKNOWN | No UI for explicit subscription |
| 2. Budget tracking | OK | `current_storage_bytes` tracked internally |
| 3. Hit limit | POOR | No user notification before eviction |
| 4. Eviction | POOR | Silent LRU eviction with no UI feedback |

**Friction Points**:
- User has no visibility into storage budget vs usage
- LRU eviction happens silently - user may wonder why content disappeared
- No UI to see which branches are subscribed
- No ability to "pin" important branches from eviction

**Improvement**:
- Add storage budget visualization similar to mobile cellular budget
- Notify user before LRU eviction: "Storage full - unsubscribing from least-used spaces"
- Allow users to view and manage subscriptions
- Add "pin" functionality for critical content

---

## UX Issues

### Critical (Blocking)

1. **No initial sync progress UI**
   - Users starting a new node have no idea how long initial sync will take
   - No progress bar, ETA, or visual feedback
   - May appear frozen/broken to non-technical users
   - *Impact*: Users may kill the process thinking it's stuck

### Major (Frustrating)

1. **Technical error messages exposed to users**
   - `V-SYNC-01`, `V-SYNC-06` codes meaningless to users
   - No actionable guidance in error messages
   - *Impact*: Users can't self-help; increases support burden

2. **Silent branch eviction**
   - Content disappears without warning
   - No history of what was evicted or why
   - *Impact*: User confusion, possible data loss perception

3. **Desktop/Web UI lacks sync status prominence**
   - Sync state buried in Debug Panel (`DebugPanel.tsx`)
   - NodeStatusBar shows peers/network but not sync progress
   - *Impact*: Users unaware of sync state without digging

4. **No checkpoint resume for initial sync**
   - If sync is interrupted, starts from beginning
   - No "resuming from X%" feedback
   - *Impact*: Wasted time and bandwidth on retry

### Minor (Polish)

1. **Inconsistent sync state names**
   - Code: `SyncingHeaders`, `SyncingBlocks`
   - DebugPanel: `syncing`, `synced`, `behind`
   - CLI: human-readable but different again
   - *Impact*: Confusion when cross-referencing

2. **Missing peer quality indicators**
   - Peer list shows ID/address/direction
   - No indication of peer health, latency, or sync contribution
   - *Impact*: Hard to diagnose slow sync

3. **No offline mode indicator in desktop UI**
   - Mobile shows "Offline" clearly
   - Desktop NodeStatusBar only shows "Connecting..." with 0 peers
   - *Impact*: Ambiguous state

4. **Documentation links in UI**
   - NodeStatusBar opens `https://docs.swimchain.io`
   - No sync-specific help available
   - *Impact*: Users can't get contextual help

---

## Positive UX Elements

### Mobile Cellular Budget (Exemplary)
- Progress bar visualization
- Color-coded warnings (green → yellow → red)
- Automatic budget enforcement
- Clear "Approaching daily limit" messaging
- Shows last sync timestamp

### CLI Help System
- Good `--long_about` descriptions
- Example commands in `after_help`
- Consistent `--json` option for automation
- Helpful "Start with: sw node start" hints

### Debug Panel
- Auto-refresh toggle (user control)
- Peer list with expandable details
- Connection troubleshooting tips when 0 peers
- Network-specific seed server hints

### Progress Event System
- Comprehensive `SyncProgressEvent` enum
- `percentage()`, `download_rate()`, `eta_secs()` computed
- Broadcast channel for multiple listeners
- Events for each phase transition

### Error Types
- Every sync error maps to validation rule
- Structured data in errors (heights, hashes, ranges)
- Test coverage for error messages

---

## Recommendations

### Priority 1: Initial Sync Progress UI

Add a prominent sync progress display during initial sync:

```
┌─────────────────────────────────────────────────┐
│  Syncing with network...                        │
│  ████████████████░░░░░░░░░░  62%                │
│                                                 │
│  Downloading blocks: 6,234 / 10,000             │
│  Speed: 1.2 MB/s                                │
│  Time remaining: ~12 minutes                    │
│                                                 │
│  Phase: Downloading Blocks (3 of 4)             │
└─────────────────────────────────────────────────┘
```

Implementation: Use existing `SyncProgress.percentage()`, `download_rate()`, and `eta_secs()` - just need UI component.

### Priority 2: User-Friendly Error Messages

Add a `user_message()` method or display mapping for sync errors:

| Error Code | User Message |
|------------|--------------|
| V-SYNC-01 | "Found a corrupted block - trying different peer" |
| V-SYNC-02 | "Block failed security check - skipping peer" |
| V-SYNC-06 | "Received unexpected data - will retry automatically" |
| NoPeersAvailable | "Can't find network peers. Check your internet connection." |
| PeerTimeout | "A peer stopped responding. Trying another peer..." |

### Priority 3: Storage Budget UI

Mirror the mobile cellular budget component for desktop storage:

```
Storage Budget
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Used: 450 MB / 500 MB (90%)
████████████████████████░░░░░

⚠️ Approaching limit - old content may be removed
```

### Priority 4: Sync State Prominence

Move sync status from Debug Panel to main NodeStatusBar:

Current:
```
● Running | Peers: 5 | Network: testnet | RPC: :9001
```

Proposed:
```
● Running | ↓ Syncing 82% | Peers: 5 | Network: testnet
```

### Priority 5: Branch Eviction Notifications

When LRU eviction occurs:
```
Storage full - Unsubscribed from 3 inactive spaces to make room:
• /gaming/retro (unused for 14 days)
• /music/vinyl (unused for 21 days)
• /tech/legacy (unused for 30 days)

Tip: Pin important spaces in Settings to prevent removal.
```

---

## Swimchain-Specific Feedback

### PoW Experience
- **Not directly relevant to sync** - PoW applies to content creation, not sync
- Sync uses PoW *validation* (V-SYNC-02) which is transparent to users
- Good that sync validates PoW without requiring user to mine anything

### Decay Communication
- **Good**: `identify_relevant_blocks()` filters by `DECAY_FLOOR_SECS`
- **Missing**: No UI explanation of why old content isn't synced
- **Recommendation**: Add tooltip: "Content older than 48 hours naturally decays and isn't downloaded"

### Identity UX
- **Good**: Sync operates independently of identity
- **No identity-related friction** in sync flows
- NodeStatusBar shows node ID appropriately truncated

### Sync Status Communication

| Aspect | Assessment |
|--------|------------|
| Current state | Adequate (via RPC/CLI) |
| Progress percentage | Available but not prominent |
| ETA/time remaining | Computed but not displayed |
| Error explanation | Too technical |
| Recovery guidance | Missing |
| Storage budget | Not visible to user |
| Offline indication | Varies by platform |

---

## Summary of Action Items

| # | Issue | Severity | Effort | Impact |
|---|-------|----------|--------|--------|
| 1 | Add sync progress bar to desktop/web UI | Critical | Medium | High |
| 2 | User-friendly error messages | Major | Low | High |
| 3 | Storage budget visualization | Major | Medium | Medium |
| 4 | Move sync status to NodeStatusBar | Major | Low | Medium |
| 5 | Branch eviction notifications | Major | Medium | Medium |
| 6 | Checkpoint resume feedback | Minor | Low | Low |
| 7 | Consistent state naming | Minor | Low | Low |
| 8 | Peer quality indicators | Minor | Medium | Low |

---

**Overall UX Score: 69/100**

The synchronization feature has a solid technical foundation with excellent mobile UX patterns that should be ported to desktop/web. The main gaps are in user-facing progress visualization and error communication. With the recommended improvements, this could easily reach 85-90/100.
