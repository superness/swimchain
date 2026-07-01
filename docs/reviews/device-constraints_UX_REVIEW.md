# User Experience Review: Device Constraints

## Summary

The Device Constraints feature demonstrates **solid UX fundamentals** with clear user-facing concepts (contribution modes, battery thresholds) and thoughtful behaviors like hysteresis to prevent pause/resume flickering. However, the feature suffers from technical terminology exposure, limited feedback mechanisms, and missing UI guidance that could confuse non-technical users about what each mode means and when to use it.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 22 | 30 | Clear concepts but technical terminology; missing real-time feedback |
| Discoverability | 14 | 20 | CLI documented but no UI integration shown; mode differences unclear |
| Efficiency | 20 | 25 | Quick APIs but polling-only status; no push notifications |
| Delight & Polish | 17 | 25 | Hysteresis is thoughtful; missing animations/transitions/progress |
| **Total** | **73** | **100** | Good foundation needing UX polish |

## User Flows Analyzed

### Flow 1: First-Time Mobile User Setup

**Expected Journey**:
1. User installs app on mobile device
2. App detects mobile platform, shows constraint configuration
3. User selects contribution level
4. System applies appropriate defaults
5. User sees their status and contribution impact

**Current Experience**:
1. User installs app - **OK**
2. App uses conservative defaults (wifi_only, 500MB cap, 20% battery) - **Good**
3. User must discover `cs device-mode` or `cs device-settings` - **Friction**
4. User sees modes: "Swimmer", "ActiveSwimmer", "DedicatedSwimmer", "AnchorMode" - **Confusing naming**
5. No guidance on which mode fits their situation - **Missing**

**Friction Points**:
- No onboarding wizard for constraint setup
- Mode names use unfamiliar terminology (what's a "Swimmer" in this context?)
- No comparison of modes showing battery/data impact tradeoffs
- No "recommended for you" based on device type

**Improvement**: Add an onboarding flow that:
- Explains what network contribution means
- Shows battery/data impact estimates per mode
- Recommends a mode based on device capabilities
- Uses plain language: "Help when plugged in" vs "ActiveSwimmer"

### Flow 2: Checking Why Contribution Stopped

**Expected Journey**:
1. User notices they're not contributing
2. User checks status
3. User sees clear explanation
4. User takes corrective action or waits

**Current Experience**:
1. User might not notice contribution stopped - **No proactive notification**
2. User runs `cs device-status` - **Requires CLI knowledge**
3. Status shows: "Battery: 18% (not charging)" - **OK technical display**
4. `block_reason()` returns "Battery low (18%)" - **Good**
5. No indication of what battery level is needed to resume (25% with hysteresis) - **Missing**

**Friction Points**:
- No push notification when contribution pauses
- CLI-only access to status
- Hysteresis behavior not explained (why doesn't it resume at 21%?)
- No estimate of when contribution might resume

**Improvement**:
- Add status bar indicator in UI (always visible)
- Show "Will resume at 25% or when charging" message
- Push notification: "Swimchain paused to save battery (18%)"

### Flow 3: Adjusting Daily Bandwidth Cap

**Expected Journey**:
1. User wants to increase/decrease data usage
2. User finds setting
3. User adjusts value
4. User confirms understanding of impact

**Current Experience**:
1. User runs `cs device-settings` - **Requires CLI knowledge**
2. Shows current settings including `daily_bandwidth_cap: 500MB` - **Good**
3. User runs `cs device-settings --cap 1000000000` - **Technical: bytes not human units**
4. No confirmation of what this means in practice - **Missing context**

**Friction Points**:
- Must specify bytes, not "1GB" or "500MB"
- No slider or visual representation
- No explanation of typical usage ("Average user serves 200MB/day")
- No warning if cap is unusually low or high

**Improvement**:
- Accept human-readable input: `--cap 1GB`
- Show comparison: "Your new cap of 1GB is 2x the default"
- Provide usage context: "Last 7 days you averaged 180MB/day"

### Flow 4: Understanding Efficiency Score

**Expected Journey**:
1. User sees efficiency score
2. User understands what it means
3. User knows how to improve it
4. User achieves "Efficient Swimmer" badge

**Current Experience**:
1. CLI shows: "Efficiency Score: 2.50 (Good)" - **Opaque metric**
2. No explanation of formula or what influences it - **Missing**
3. No tips to improve score - **Missing**
4. Achievement at 2.0 threshold not communicated - **Missing motivation**

**Friction Points**:
- Score of "2.50" is meaningless without context
- "Good" rating doesn't explain "good at what?"
- No breakdown: "You served 500MB using 200mAh battery"
- Achievement threshold hidden from user

**Improvement**:
- Show breakdown: "Served 500MB / Used 200mAh + 100MB data = 2.5 efficiency"
- Add progress toward "Efficient Swimmer" badge: "2.5/2.0 - Qualified!"
- Provide tips: "Connect to WiFi to improve efficiency"

### Flow 5: Thermal Throttling Experience

**Expected Journey**:
1. Device gets hot during use
2. Swimchain reduces contribution
3. User understands why
4. Normal operation resumes when cool

**Current Experience**:
1. Device thermal state changes to "Serious" - **User may not realize**
2. Contribution pauses (if `thermal_pause=true`) - **Silent**
3. CLI shows "Thermal: Serious" - **Technical term**
4. No indication of when it might resume - **Missing**

**Friction Points**:
- No notification when thermal throttling activates
- "Serious" thermal state is alarming language
- No cooling tips provided
- User might think app is broken

**Improvement**:
- Notification: "Paused to let your device cool down"
- Softer language: "Device is warm" instead of "Serious"
- Add tip: "Try moving to a cooler area or closing other apps"
- Show temperature trend (if available)

## UX Issues

### Critical (Blocking)

1. **No Real-Time Status Feedback** - Users have no passive way to know contribution status changed. Must actively poll via CLI. This means users may not know their node stopped contributing for hours.
   - Impact: Users think they're contributing when they're not
   - Fix: Implement status change callbacks and UI status indicator

2. **CLI-Only Interface** - All status and configuration is CLI-based. Mobile users (the primary target) typically expect GUI controls.
   - Impact: Feature is effectively hidden from non-technical users
   - Fix: Expose in app UI with visual controls (sliders, toggles)

### Major (Frustrating)

1. **Technical Terminology in User-Facing Elements**
   - "ActiveSwimmer" → "Help when on WiFi"
   - "DedicatedSwimmer" → "Always help (uses data)"
   - "AnchorMode" → "Maximum contribution"
   - "ThermalState::Serious" → "Device is warm"
   - Impact: Users don't understand what modes do
   - Fix: Add plain-language descriptions; keep technical names internal

2. **Hysteresis Behavior Unexplained** - Pauses at 19% but doesn't resume until 25%. User at 22% wondering why contribution is still paused.
   - Impact: Confusion, perceived bug
   - Fix: Show "Will resume at 25%" explicitly in status

3. **Bandwidth Cap Input in Bytes** - `--cap 1000000000` instead of `--cap 1GB`
   - Impact: Error-prone, inaccessible to most users
   - Fix: Parse human-readable units (KB, MB, GB)

4. **No Mode Selection Guidance** - Four modes presented without recommendation or use-case guidance
   - Impact: Analysis paralysis, suboptimal choices
   - Fix: Add "Recommended" tag based on device type/battery

### Minor (Polish)

1. **Efficiency Score Opacity** - "2.50 (Good)" provides rating but not understanding
   - Impact: Metric feels arbitrary
   - Fix: Show formula breakdown on demand

2. **No Progress Indicators** - Bandwidth usage shown as fraction but no visual bar
   - Impact: Harder to glance-read status
   - Fix: Add ASCII/visual progress bar in CLI, proper bar in UI

3. **Missing Achievement Progress** - Efficiency score doesn't show proximity to "Efficient Swimmer" badge
   - Impact: Missed gamification opportunity
   - Fix: Show "2.5/2.0 - Badge earned!" or progress toward 2.0

4. **No Historical View** - Can't see yesterday's contribution or efficiency trend
   - Impact: No sense of progress over time
   - Fix: Add `cs device-history` or trend in status

5. **No Presets in CLI** - Must manually set all values rather than `--preset minimal`
   - Impact: More typing, harder to discover optimal configurations
   - Fix: Add `cs device-settings --preset minimal|maximum`

## Positive UX Elements

- **Hysteresis Implementation**: Prevents annoying pause/resume cycling. Technical excellence even if unexplained to users.
- **Conservative Defaults**: New users protected by wifi_only, reasonable caps, and safe battery thresholds.
- **Clear Block Reasons**: `block_reason()` provides prioritized, human-readable explanations.
- **Critical Always Pauses**: Safety-first design - Critical thermal state ignores user settings.
- **Charging Bypass**: Plugging in immediately enables contribution - responsive to user action.
- **Midnight UTC Reset**: Predictable daily cap reset rather than rolling 24-hour window.
- **Preset Configurations**: `minimal()`, `default()`, `maximum()` factory methods reduce configuration burden.
- **Mode Behavior Methods**: `allows_background()`, `has_daily_cap()` cleanly express mode differences.
- **Graceful Degradation**: Battery unavailable doesn't block contribution; assumes best case.

## Recommendations

### Priority 1: Real-Time Status Communication
- Implement `ConstraintStatusObserver` trait for push-based status updates
- Fire callbacks on: pause, resume, cap reached, mode change
- Enable UI to subscribe and show status bar indicator
- **Why**: Users need passive awareness of contribution state

### Priority 2: User-Friendly Terminology
- Add `display_name()` method to ContributionMode returning plain language
- Update CLI output to use friendly names with technical names in parentheses
- Example: "Always help (AnchorMode)"
- **Why**: Current terminology alienates non-technical users

### Priority 3: Visual Status in UI
- Design status indicator showing: mode, contribution state, battery, bandwidth
- Traffic light colors: Green (contributing), Yellow (paused-temporary), Red (blocked)
- Single-tap to see details, long-press to adjust settings
- **Why**: Mobile users expect visual, not CLI, interaction

### Priority 4: Guided Mode Selection
- Add `recommend_mode()` based on device type, battery capacity, typical usage
- Show comparison table in settings: Mode | Battery Impact | Data Use | Background
- Mark recommended mode with "(Suggested for your device)"
- **Why**: Users shouldn't need to understand implementation to choose well

### Priority 5: Human-Readable Input
- Parse bandwidth input: "500MB", "1.5GB", "unlimited"
- Parse battery as percentage: "20%"
- Validate with helpful errors: "Cap must be at least 100MB"
- **Why**: Bytes are developer units, not user units

### Priority 6: Progress Visualization
- Add ASCII progress bar to CLI: `Bandwidth: [████████░░] 423/500 MB`
- Show efficiency breakdown on request
- Add achievement progress: "Efficient Swimmer: 2.5/2.0 ✓"
- **Why**: Visual progress is more satisfying than raw numbers

## Swimchain-Specific Feedback

### PoW Experience
- **Not directly applicable** to Device Constraints (no PoW mining in this feature)
- However, **efficiency tracking** could benefit from PoW-style progress feedback
- Recommendation: Show "Efficiency calculating..." while accumulating metrics

### Decay Communication
- **Not directly applicable** - Device Constraints don't interact with content decay
- However, **bandwidth cap depletion** is analogous to decay
- Recommendation: Show "bandwidth health" visual similar to content decay indicators

### Identity UX
- **Minimal intersection** - Device settings are per-device, not per-identity
- However, **settings don't sync across devices** (documented as future work)
- Recommendation: Warn users that settings are device-local during setup

### Sync Status Communication
- **Critical gap** - No visibility into whether constraints are affecting sync
- User may not realize low bandwidth cap is limiting content availability
- Recommendation: Add "Sync limited by bandwidth cap" message when relevant

### Offline Capability
- **Well handled** - Efficiency tracking continues offline (per future work notes)
- Settings persist via Sled (offline-capable)
- Constraint checking is purely local (no network required)
- Recommendation: Show "Settings saved locally" confirmation

## Mobile-Specific UX Considerations

| Consideration | Current State | Recommendation |
|---------------|---------------|----------------|
| Battery indicator | CLI text only | Native battery icon integration |
| Network badge | CLI text only | Show WiFi/cellular icon with status |
| Notification on pause | Not implemented | System notification with action |
| Quick settings tile | Not implemented | Android tile / iOS widget for mode |
| Haptic feedback | Not implemented | Vibrate on significant state changes |
| Accessibility | Not audited | Screen reader support for status |

## Conclusion

The Device Constraints feature has **solid technical foundations** with thoughtful behaviors like hysteresis and conservative defaults. However, the **user-facing layer is underdeveloped** - relying on CLI access, technical terminology, and polling-based status. To achieve its goal of making Swimchain a "good citizen" on mobile devices, the feature needs:

1. Real-time status feedback (push, not poll)
2. Plain-language terminology throughout
3. Visual UI integration (not just CLI)
4. Guided configuration based on device/user context

The feature scores **73/100** - functional and safe, but not yet delightful. With the recommended improvements, this could become a differentiating feature that builds user trust and encourages sustained participation.

---

*Review conducted from User Experience perspective. Scored against usability (30), discoverability (20), efficiency (25), and delight (25) criteria.*
