# User Experience Review: Blocklist Protocol

## Summary

The Blocklist Protocol presents a **mixed user experience** (70/100). The client-side personal blocklist feature (useBlocklist) is well-designed with intuitive controls and polished UI. However, the protocol-level illegal content blocking is almost entirely invisible to users - there's no way to report illegal content through the UI, no visibility into network-wide blocklist status, and error messages when hitting blocklisted content are unhelpful. The feature conflates two distinct user needs: personal content filtering (excellent UX) vs. community safety reporting (poor/missing UX).

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 18 | 30 | Personal blocklist good; protocol-level reporting invisible |
| Discoverability | 12 | 20 | Block button visible; illegal content reporting hidden |
| Efficiency | 19 | 25 | Client blocking instant; PoW for reports shown well |
| Delight & Polish | 21 | 25 | Polished UI components; animations smooth |
| **Total** | **70** | **100** | Strong foundation with critical gaps |

## User Flows Analyzed

### Flow 1: Personal User/Content Blocking (Client-Side)

1. **User encounters unwanted content** - Content visible in feed/thread
2. **Clicks block icon** - Icon is recognizable circle-with-slash (universal block symbol)
3. **Dropdown menu appears** - Options to block item or author
4. **Selection made** - Instant local storage update
5. **Content disappears** - Removed from view immediately

**Friction Points**: None significant - flow is smooth and intuitive
**Positive**:
- O(1) lookup with Set-based blocking
- Instant feedback (no network latency)
- Clear affordances with good iconography
- Escape key support for menus

**Assessment**: Excellent flow - 9/10

---

### Flow 2: Managing Blocked Items

1. **Navigate to Blocklist Manager** - Location not documented
2. **View tabbed interface** - Users/Posts/Spaces/Replies tabs with counts
3. **See blocked items** - Truncated IDs with block dates
4. **Unblock items** - Clear button per item
5. **Clear all** - Confirmation dialog prevents accidents

**Friction Points**:
- Discoverability unclear - where is this manager located in the UI?
- Truncated IDs may not help users identify content
- No preview of what was blocked

**Improvement**: Add content preview or link to original context

**Assessment**: Good but needs discoverability work - 7/10

---

### Flow 3: Reporting Illegal Content

1. **User sees illegal content** - Content visible in UI
2. **Clicks "Report" button** - Opens ReportModal
3. **Selects "Illegal Content" reason** - One of 5 options
4. **Clicks Report** - PoW mining starts
5. **Mining completes** - Attestation submitted
6. **Wait for 2 more attesters** - No visibility or feedback

**Friction Points**:
- **Critical Gap**: No way to track if 3-attester threshold is reached
- **No notification**: User doesn't know if content was actually blocklisted
- **No urgency differentiation**: Illegal content reports look same as "Off Topic"
- **No immediate action**: Content remains visible during review period

**Improvement**:
- Add priority handling for illegal content reports
- Show network-wide report status
- Provide immediate client-side hiding option while network catches up
- Confirm when blocklist threshold reached

**Assessment**: Incomplete flow - 4/10

---

### Flow 4: Attempting to Post Blocklisted Content

1. **User creates content** - Writes post/reply/media
2. **Submits content** - PoW mining (if required) + RPC call
3. **Server rejects** - Generic error message
4. **User sees error** - "Content rejected: matches blocklist"
5. **User confused** - No explanation of why or what to do

**Friction Points**:
- **Critical**: Error message is cryptic and unhelpful
- No guidance on what triggered the block
- No distinction between types of blocked content
- Could falsely imply user created illegal content

**Improvement**:
- Add specific error: "This content's signature matches known harmful material and cannot be uploaded"
- Explain that this is hash-based (not content scanning)
- Provide support/appeal path for false positives

**Assessment**: Poor error handling - 3/10

---

### Flow 5: Counter-Attestation (Defending Content)

1. **Content is flagged** - SpamBadge shows "Flagged" status
2. **User opens Report modal** - Sees existing report count
3. **Clicks "Defend"** - Button visible when content is flagged
4. **PoW mining occurs** - Progress shown
5. **Counter-attestation submitted** - Success message

**Friction Points**:
- "Defend" button only appears after content is flagged
- 5-Anchor threshold for blocklist removal not communicated
- User doesn't know their level (need Anchor status)
- No visibility into counter-attestation progress

**Improvement**: Show required level for removal actions

**Assessment**: Incomplete but functional - 5/10

## UX Issues

### Critical (Blocking)

1. **No protocol-level blocklist reporting UI** - Users can flag content as "Illegal Content" via spam reports, but:
   - No dedicated flow for serious reports
   - No confirmation that blocklist was updated
   - No tracking of attestation accumulation toward threshold

2. **Cryptic rejection error** - "Content rejected: matches blocklist" doesn't explain:
   - Why content was rejected
   - What triggered the match (hash collision vs. actual illegal content)
   - What user can do (nothing? appeal?)

3. **Two blocklists conflated** - Users may confuse:
   - Personal blocklist (client-side, instant)
   - Network blocklist (illegal content, protocol-level)
   - These need clearer differentiation

### Major (Frustrating)

4. **No blocklist transparency** - Users cannot:
   - See network-wide blocklist statistics
   - Know if their report contributed to a block
   - Verify content was actually removed from network

5. **Missing identity warning** - Inline text "Create an identity to report content" is too subtle for critical safety functionality

6. **No urgency in illegal content reporting** - Same UI flow for "Off Topic" and "CSAM/Terrorism"

7. **Blocklist Manager discoverability** - No documented path to access the management UI

### Minor (Polish)

8. **Truncated IDs in Blocklist Manager** - Hard to identify what was blocked without context

9. **No animation on block action** - Content disappears instantly without visual confirmation

10. **Mining progress indeterminate** - Progress bar animates but doesn't show actual progress percentage

11. **Success icon is plain checkmark** - Could be more visually satisfying

## Positive UX Elements

### Personal Blocklist
- **Intuitive iconography**: Circle-with-slash is universally understood
- **Instant feedback**: No network latency for personal blocks
- **Tabbed interface**: Clean organization by content type
- **Count badges**: Shows blocked item counts at a glance
- **Confirmation for destructive actions**: "Clear All" requires confirm

### Report Modal
- **Clear reason categories**: 5 distinct options with descriptions
- **PoW progress shown**: Attempts counter and elapsed time visible
- **Escape key support**: Standard modal dismissal
- **Success confirmation**: Clear feedback on submission
- **Existing report count**: Shows current attestation state

### Code Quality for UX
- **Accessible aria labels**: Block button has proper aria-label and aria-expanded
- **Click outside to close**: Standard modal behavior
- **Disabled states**: Clear button disabling when action unavailable
- **Error boundary**: Graceful error display with styled error box

## Recommendations

### Priority 1: Critical UX Fixes

1. **Improve blocklist rejection error message**
   - Current: `"Content rejected: matches blocklist"`
   - Better: `"This content cannot be uploaded. It matches the signature of known harmful material. If you believe this is an error, contact support at [link]."`
   - Include error code for support reference

2. **Create dedicated illegal content reporting flow**
   - Add prominent "Report Illegal Content" option (not buried in spam reasons)
   - Show clear warning about seriousness
   - Provide confirmation when 3-attester threshold reached
   - Send notification when content is network-blocklisted

3. **Differentiate blocklist types in UI**
   - Personal blocklist: "Hidden Content" or "Muted"
   - Network blocklist: "Blocked Content" or "Network Blocked"
   - Use different icons/colors for each

### Priority 2: Major UX Improvements

4. **Add blocklist status visibility**
   - Create "Network Safety" dashboard showing:
     - Total blocklisted entries
     - Recent additions
     - User's contribution to reports
   - Show sync status with network

5. **Improve Blocklist Manager discoverability**
   - Add to settings/profile menu
   - Include breadcrumb navigation
   - Add search within blocked items

6. **Show level requirements for counter-attestation**
   - Display "Anchor status required to remove from blocklist"
   - Link to level progression documentation

### Priority 3: Polish & Delight

7. **Add block animation**
   - Fade out blocked content
   - Show "Content hidden" toast notification

8. **Improve mining progress**
   - Show estimated time remaining
   - Add difficulty indicator
   - Consider determinate progress where possible

9. **Enhance Blocklist Manager item display**
   - Show content preview where safe
   - Link to original context if still accessible
   - Add bulk selection for unblocking

## Swimchain-Specific Feedback

### PoW Experience
**Rating: Good (7/10)**
- Mining progress is visible with attempts and elapsed time
- Indeterminate progress bar provides activity feedback
- No time estimate (could add based on difficulty)
- Consider: Show PoW difficulty for transparency

### Decay Communication
**Rating: Not Applicable**
- Blocklist doesn't directly interact with decay
- When content is flagged for accelerated decay, this is communicated: "It is currently flagged for accelerated decay"
- Good integration with spam/flag status

### Identity UX
**Rating: Needs Improvement (5/10)**
- Subtle warning when no identity: small text, low contrast
- Should be more prominent for safety-critical actions
- Consider: Inline identity creation flow for reporting
- No explanation of irreversibility in blocklist context

### Offline Capability
**Rating: Not Addressed**
- Personal blocklist uses localStorage (works offline)
- Protocol-level blocking requires network
- No indication of what works offline vs. requires connection
- Consider: Cache blocklist hashes locally for offline rejection

## Conclusion

The Blocklist Protocol has a well-polished client-side personal blocking feature that demonstrates good UX patterns. However, the protocol-level illegal content blocking - the feature's core safety purpose - lacks user-facing visibility and controls. Users can report content but have no insight into whether their reports contribute to network-wide action, and error messages when encountering blocked content are confusing rather than helpful.

**Key Metric**: The 3-attester threshold for adding content and 5-Anchor threshold for removal are never communicated to users, making the governance mechanism invisible.

**Overall Score: 70/100** - Strong foundation with critical gaps in the core safety functionality UX.
