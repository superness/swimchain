# User Experience Review: Archiver Client

## Summary

The Archiver Client provides a focused, specialized tool for content preservation with a clear value proposition. The dashboard-centric design communicates urgency effectively through visual hierarchy and color-coded badges. However, the UX suffers from incomplete PoW feedback (mocked mining), lack of onboarding for new users, and missing explanations for Swimchain-specific concepts like "heat" and decay. The core flows are functional but need polish, particularly around error states and the critical identity management gap.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 20 | 30 | Core flows work, but lack explanatory context; Settings requires prior knowledge |
| Discoverability | 14 | 20 | Clear navigation, but no onboarding or feature hints; advanced features hidden |
| Efficiency | 18 | 25 | Reasonable step counts, but PoW feedback is mocked; no batch operations |
| Delight & Polish | 13 | 25 | Basic feedback states exist; animations sparse; edge cases need work |
| **Total** | **65** | **100** | |

---

## User Flows Analyzed

### Flow 1: First-Time User Experience

**Steps:**
1. User opens the Archiver Client
2. WASM loading screen displays with "Initializing content preservation..."
3. Dashboard loads with 5 status cards showing zeros
4. At-Risk list is empty with helpful hint ("Content with heat below 10% will appear here")

**Assessment:**
- Loading screen is branded but provides no progress indicator beyond spinner
- No onboarding walkthrough explaining what an "archiver" does
- User must understand "heat", "decay", and "PoW budget" without context
- Mock spaces (`sp1general`, etc.) are hardcoded - user cannot easily add real spaces

**Friction Points:**
- No explanation of what "heat" means or why content decays
- Settings require navigation away from dashboard to configure target spaces
- New user has no clear call-to-action

**Improvement:** Add a first-run modal or inline tips explaining the decay system and prompting users to configure target spaces.

---

### Flow 2: View and Engage At-Risk Content

**Steps:**
1. User sees at-risk content list sorted by urgency
2. Clicks item header to expand - **Assessment: Good keyboard support (Enter/Space)**
3. Expanded view shows pool progress bar and three engagement buttons (+5s/+15s/+30s)
4. User clicks engagement button
5. Button shows progress bar fill (0% → 100%) - **Assessment: Visual feedback is clear**
6. Checkmark appears on completion
7. Button resets after 2 seconds

**Assessment:**
- Urgency badges (critical/warning) are immediately visible
- Time remaining is helpful ("~2h 30m remaining")
- Pool progress visualization clearly shows contribution toward 60s threshold

**Friction Points:**
- PoW is mocked - user doesn't experience actual mining time (real would be 5-30 seconds)
- No explanation of what "engaging" actually does to content
- No confirmation before spending budget
- Cannot see other contributors or their recent activity

**Improvement:**
- Add tooltip explaining "Engaging adds time to the content's survival pool"
- Show estimated real mining time before clicking
- Add subtle confirmation for 30s engagement (significant budget impact)

---

### Flow 3: Configure Archiver Settings

**Steps:**
1. User clicks "Settings" in nav
2. Scrolls through 4 form sections (Spaces, Thresholds, Budgets, Auto-Engage)
3. Adds space ID by typing and clicking "Add Space"
4. Adjusts threshold sliders (number inputs)
5. Clicks "Save Settings"
6. Sees checkmark confirmation (2 seconds)

**Assessment:**
- Form is well-organized with section headers
- Help text under each input is valuable
- Save confirmation is clear
- Reset to defaults has confirmation dialog (good)

**Friction Points:**
- Space ID format not validated in real-time (bech32m: sp1...)
- No autocomplete for existing spaces from node
- Threshold values as raw percentages require mental conversion
- No preview of what current settings would affect
- "Auto-Engage" toggle does nothing (partial implementation)

**Improvement:**
- Add space ID validation with format hint
- Fetch available spaces from node for autocomplete
- Show "X at-risk items would match this threshold" preview

---

### Flow 4: Browse Archived Content

**Steps:**
1. Navigate to Archived Content page
2. Header shows entry count and storage used - **Good immediate context**
3. Content grouped by space with section headers
4. Click item to expand and view full body
5. Delete button with confirmation dialog

**Assessment:**
- Search works with Enter key
- Clear button appears only when results are filtered (good progressive disclosure)
- Metadata display is comprehensive (author, dates, original heat)

**Friction Points:**
- Search only works on button click or Enter - no live filtering
- Cannot sort by archived date, heat, or space
- No export functionality (users may want to backup archives)
- Group headers use raw space IDs (no human-readable names)
- Long body text has no "show more" truncation

**Improvement:**
- Add sort dropdown (by date archived, by original heat)
- Add export to JSON/markdown option
- Consider virtual scrolling for large archives

---

### Flow 5: Monitor Budget Usage

**Steps:**
1. BudgetMeter visible on Dashboard
2. Shows remaining time in human-readable format ("45m remaining")
3. Progress bar fills as budget is consumed
4. Resets at midnight UTC

**Assessment:**
- Time formatting is excellent ("1h 30m" not "5400 seconds")
- Visual bar provides at-a-glance status
- ARIA progressbar attributes for accessibility

**Friction Points:**
- No indication of when budget resets (just "Daily")
- No visual warning when budget is nearly exhausted (e.g., turn bar red at 90%)
- When budget exceeded, EngageButton just disables with tooltip - no prominent warning
- No history of past budget usage

**Improvement:**
- Add "Resets in 3h 45m" countdown
- Color-code meter: green → yellow → red
- Show prominent banner when budget is exceeded

---

## UX Issues

### Critical (Blocking)

1. **Mocked PoW Engagement** - The core feature doesn't actually work. Users click buttons, see fake progress, and budget is deducted, but no actual PoW is computed or submitted to the network. This completely undermines the app's value proposition.

2. **Hardcoded Mock Spaces** - Dashboard monitors `['sp1general', 'sp1tech', 'sp1community']` which may not exist. Users cannot monitor their actual spaces without editing Settings, and changes don't immediately reflect on Dashboard due to the hardcoded constant.

### Major (Frustrating)

1. **No Onboarding** - New users are dropped into a dashboard with no explanation of decay, heat, pools, or PoW. The learning curve is steep for Swimchain newcomers.

2. **No Connection Status Visibility** - While `useRpc` tracks `connected`, `connecting`, and `error` states, the Dashboard doesn't display these. Users can't tell if the archiver is actually monitoring or if the node is down.

3. **Settings Not Applied Until Restart** - Changing target spaces in Settings doesn't update the Dashboard's monitoring (hardcoded `MOCK_SPACES`). User must understand to refresh or expects live updates.

4. **Auto-Engage Does Nothing** - The toggle exists and persists, but is never wired to actual auto-engagement logic. This misleads users who enable it expecting automation.

5. **No Archive Trigger** - Content must be manually archived (feature is placeholder). Users expecting automatic preservation will be disappointed.

6. **Confirm Dialog Uses `window.confirm`** - Native `confirm()` is jarring, not styled, and breaks the visual experience. Also blocks the main thread.

### Minor (Polish)

1. **No Empty State for First-Run Settings** - Settings shows "No spaces configured" but doesn't emphasize that this is the first step to using the app.

2. **Search Not Real-Time** - Archive search requires clicking Search button; no debounced live filtering.

3. **Progress Bar Animation** - EngageButton progress jumps discretely rather than smooth animation.

4. **No Keyboard Shortcut** - Power users have no way to quickly refresh or navigate.

5. **Footer Version Hardcoded** - Shows "v0.1.0" which may become stale.

6. **Date Formatting Inconsistent** - Uses `toLocaleDateString()` which varies by browser locale.

7. **No Visual Distinction for Decayed Content** - Items currently decaying ("Decaying now") don't have visual emphasis.

---

## Positive UX Elements

1. **Clear Information Hierarchy** - Dashboard status cards immediately communicate system state with emoji icons and color variants.

2. **Urgency Badges** - Critical/warning/normal badges with color coding make triage intuitive.

3. **Expandable List Pattern** - Consistent expand/collapse interaction across AtRiskList and ArchivedContent.

4. **Human-Readable Time** - Budget meter formats seconds as "1h 30m" not "5400 seconds".

5. **Pool Progress Visualization** - The bar showing progress toward 60s threshold is immediately understandable.

6. **Help Text in Settings** - Each input has explanatory text reducing guesswork.

7. **Keyboard Accessibility** - Expandable items support Enter/Space keydown handlers.

8. **ARIA Roles** - Consistent use of `role="progressbar"`, `role="status"`, `aria-expanded`, etc.

9. **Save Confirmation** - Settings page shows checkmark confirmation briefly after save.

10. **Grouped Archives** - Archived content organized by space improves scanability.

---

## Recommendations

### P0 - Critical

1. **Implement Real PoW Mining** - Integrate `@swimchain/react usePow()` or `hash-wasm` to perform actual Argon2id computation. Show realistic mining time (not 100ms simulation). This is the core value of the app.

2. **Wire Settings to Dashboard** - Remove hardcoded `MOCK_SPACES` and use config from localStorage. Add `useConfig()` hook that provides reactive config state.

3. **Add Connection Status Banner** - Display node connection state in Dashboard header. Show "Disconnected - Retrying..." or "Connected to localhost:3030".

### P1 - High

4. **Add First-Run Onboarding** - Modal or step-by-step guide for new users:
   - Explain what content decay is and why it happens
   - Explain what "heat" represents
   - Guide user to Settings to configure target spaces
   - Explain PoW budget as "computational contribution"

5. **Show Real Mining Time Estimate** - Before clicking EngageButton, tooltip should show "Mining will take ~30 seconds" based on device benchmark.

6. **Implement Auto-Archive** - Wire the archive threshold to ContentMonitor. When content drops below threshold, automatically save to IndexedDB. Show toast notification.

7. **Replace `window.confirm`** - Use custom modal component for delete and reset confirmations.

8. **Add Budget Warning States** - When budget is low (<10% remaining), show warning. When exhausted, show prominent banner "Daily budget exceeded - resets in X hours".

### P2 - Medium

9. **Add Space Validation** - Validate bech32m format on input with inline error message.

10. **Fetch Spaces from Node** - In Settings, offer dropdown of available spaces from `GET /spaces`.

11. **Add Sort/Filter for Archives** - Dropdown to sort by date, heat, or alphabetically.

12. **Live Search** - Debounce search input for real-time filtering without requiring button click.

13. **Add Export Option** - Export archived content as JSON or markdown for backup.

14. **Improve Pool Status Display** - Show contributor list or at least "last contribution: 2m ago".

### P3 - Low

15. **Add Loading Progress** - WASM loading screen could show percentage if possible.

16. **Keyboard Shortcuts** - `R` to refresh, `/` to focus search.

17. **Smooth Animations** - CSS transitions for progress bars and expand/collapse.

18. **Locale-Aware Formatting** - Use Intl.DateTimeFormat for consistent date display.

19. **Dark Mode Support** - Add theme toggle in Settings.

---

## Swimchain-Specific Feedback

### PoW Experience
**Current State:** Completely mocked. Progress bar fills instantly (100ms per second of "mining"), budget is deducted, but no actual computation occurs.

**Assessment:** This critically undermines the "mining is paying" principle. Users are not actually contributing CPU cycles. The fake feedback could mislead users into thinking they're helping preserve content when they're not.

**Recommendation:**
- Implement real Argon2id PoW via `hash-wasm`
- Show honest time estimates ("This will take ~30 seconds")
- Consider allowing PoW to run in Web Worker to keep UI responsive
- Add "Cancel" option during mining

### Decay Communication
**Current State:** Heat percentage and time remaining are displayed. Urgency badges (critical/warning) provide triage.

**Assessment:** Good foundation, but no explanation of what these values mean. "3.2% heat" is meaningless without context. "~4h remaining" doesn't explain what happens at 0.

**Recommendation:**
- Add info tooltip: "Heat represents survival probability. Content below 6.25% is removed from the network."
- Add visual indicator (pulsing animation?) for content actively decaying
- Consider a decay timeline visualization showing projected survival curve

### Identity UX
**Current State:** No identity management in the Archiver Client. It operates as a "read-only observer + local contributor" without on-chain identity.

**Assessment:** This is actually appropriate for the archiver use case - it doesn't need identity to monitor or locally archive. However, if real PoW engagement requires identity (to sign contributions), this would be a blocker.

**Recommendation:**
- Clarify whether PoW contribution requires identity
- If yes, add identity import/create flow similar to other Swimchain clients
- If no, document that archiver operates in "anonymous helper" mode

### Sync Status Communication
**Current State:** No sync status displayed. `useRpc` has `connected` state but UI doesn't show it.

**Assessment:** Users cannot tell if the archiver is successfully monitoring or if the node is syncing/offline.

**Recommendation:**
- Add status pill in header: "Connected" (green), "Connecting..." (yellow), "Offline" (red)
- Show sync percentage if node is still syncing: "Node syncing: 87%"
- Consider showing peer count: "3 peers"

### Offline Capability Indication
**Current State:** IndexedDB archives persist offline. No indication to user about offline capabilities.

**Assessment:** The local-first architecture is a strength but users don't know their archives are safe offline.

**Recommendation:**
- Add subtle indicator: "Archives stored locally"
- If offline, show banner: "Offline - Viewing local archives only. Monitoring paused."
- Consider service worker for true offline mode

---

## User Journey Summary

| Stage | Current Experience | Ideal Experience |
|-------|-------------------|------------------|
| **Discover** | User finds app, no explanation | Landing page or first-run modal explains value |
| **Setup** | Must navigate to Settings, enter space IDs manually | Guided setup: connect to node, select spaces from list |
| **Monitor** | Dashboard shows at-risk content, urgency clear | Same, plus connection status and sync indicator |
| **Engage** | Click button, fake progress, budget deducted | Real PoW with honest time, confirmation for large contributions |
| **Archive** | Manual only (auto is placeholder) | Auto-archive at threshold with notification |
| **Browse** | Search and expand archives | Same, plus sort/filter and export |
| **Configure** | Settings page with help text | Same, plus validation and space autocomplete |

---

## Conclusion

The Archiver Client has a solid foundation with good information architecture and clear visual hierarchy. The urgency-based design effectively communicates which content needs attention. However, the mocked PoW implementation is a critical gap that must be addressed before the app delivers real value. Adding onboarding, connection status, and wiring the settings to the dashboard would significantly improve the first-run experience. The 65/100 score reflects a functional but incomplete UX that needs work on its core value proposition (PoW) and user education.

**Next Steps:**
1. Implement real PoW mining (P0)
2. Add connection status display (P0)
3. Wire settings to dashboard monitoring (P0)
4. Add first-run onboarding (P1)
5. Implement auto-archive trigger (P1)
