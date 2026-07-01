# User Experience Review: Proof-of-Work Systems

## Summary

The Proof-of-Work system demonstrates **thoughtful UX design** (76/100) with well-implemented mining progress feedback, clear visual indicators, and helpful educational tips during wait times. The experience handles the inherent friction of computational work gracefully through progress bars, stats displays, and cancellation support. However, there are gaps in time estimation accuracy, error messaging specificity, and accessibility for screen reader users. The biggest UX concern is the lack of Swimmer Level difficulty scaling - experienced users face the same friction as newcomers.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 22 | 30 | Good progress feedback, but vague time estimates and generic error messages |
| Discoverability | 16 | 20 | Well-integrated into forms, pre-submission hints present |
| Efficiency | 18 | 25 | No Swimmer Level scaling means unnecessary friction for experienced users |
| Delight & Polish | 20 | 25 | Nice 3D cube animation, educational tips, but no success celebration |
| **Total** | **76** | **100** | Solid foundation, room for polish |

## User Flows Analyzed

### Flow 1: Identity Creation with PoW

1. **Generate Identity** - User clicks "Generate Identity" button (clear CTA)
2. **Preview Address** - User sees generated address and "Start Mining PoW" button
   - Good: Two-step confirmation prevents accidental mining
   - Issue: No explanation of what PoW is before starting
3. **Mining Progress** - `PowProgress` component shows:
   - Attempts count (live updating)
   - Elapsed time (seconds)
   - Hash rate (hashes/sec)
   - Progress bar (probabilistic estimate)
   - Educational tips
   - Cancel button
4. **Mining Complete** - Success message with mining stats
5. **Save Identity** - User must explicitly click "Save Identity"

**Friction Points**:
- Progress bar caps at 95% even if mining takes much longer (misleading)
- No estimated remaining time (only "~10s" style estimate)
- Two-step save flow (complete -> save) could be consolidated

**Improvement**: Show "found in X attempts" as percentage of typical (e.g., "Found in 523,456 attempts - that was 50% faster than average!")

### Flow 2: Creating a Post with Action PoW

1. **Fill Form** - User enters title, body, optional images
2. **Submit** - Click "Create Thread" button
3. **Mining** - `PowProgress` appears inline in form
   - Form fields become disabled
   - Same progress UI as identity
4. **Submission** - "Submitting to network..." indicator
5. **Navigation** - Auto-redirect to new thread

**Friction Points**:
- User cannot continue browsing while mining (form blocks entire page)
- No progress persistence if user navigates away (mining lost)
- Generic "An error occurred" on mining failure

**Improvement**: Background mining with notification when complete, allowing continued browsing

### Flow 3: Reply with Action PoW

1. **Write Reply** - User enters text in reply composer
2. **Submit** - Click "Post Reply" button
3. **Inline Mining** - Progress appears in reply composer area
4. **Auto-submit** - Reply submits when mining completes

**Friction Points**:
- Difficulty shown as hardcoded "8" in `ReplyComposer.tsx:150` regardless of actual testnet/mainnet
- No indication that user can cancel and retry

**Improvement**: Dynamic difficulty display based on actual config

## UX Issues

### Critical (Blocking)

1. **No Swimmer Level Difficulty Scaling**
   - Impact: Experienced users who have contributed significantly face the same PoW wait times as new users
   - Expected behavior: Power users get reduced difficulty as documented
   - Current: `get_adjusted_difficulty()` returns static values
   - User impact: High-value contributors may leave due to unnecessary friction

### Major (Frustrating)

1. **Misleading Progress Bar**
   - Progress bar is capped at 95% (`Math.min((attempts / expectedAttempts) * 100, 95)`)
   - Mining can exceed expected attempts significantly (variance in probabilistic PoW)
   - User sees 95% for potentially minutes, causing anxiety
   - **Fix**: Show "N attempts (avg. ~M)" or indeterminate state after 100%

2. **Generic Error Messages**
   - All mining errors show "An error occurred during mining"
   - No distinction between network errors, timeout, memory issues, or user cancellation
   - **Fix**: Map error types to specific user-friendly messages

3. **No Mining Persistence/Background Support**
   - If user navigates away during mining, all progress is lost
   - User must stay on page for 30-60+ seconds
   - **Fix**: Implement background mining with service worker or move mining to completion queue

4. **Hash Rate Estimate Uses Wrong Value**
   - `PowProgress` uses hardcoded `hashRate = 50000` for SHA-256 identity PoW
   - Action PoW (Argon2id) is ~1-10 H/s, not 50,000
   - Time estimates are wildly inaccurate for Action PoW
   - **Fix**: Pass actual measured hash rate or use action-type-specific defaults

### Minor (Polish)

1. **No Success Celebration**
   - Mining completion shows plain "Mining complete!" text
   - Missing opportunity for positive feedback after long wait
   - **Fix**: Add confetti/animation, share stats ("you mined faster than 60% of users")

2. **Tips Don't Rotate**
   - Single tip selected randomly on mount, never changes
   - User stares at same tip for 60+ seconds
   - **Fix**: Rotate tips every 10-15 seconds

3. **No "Learn More" Link**
   - Tips mention PoW concepts but no way to learn more
   - **Fix**: Add link to documentation or explainer page

4. **Cancel Button Not Prominent**
   - Cancel is styled as secondary button at bottom
   - User may not notice they can stop mining
   - **Fix**: Make cancellation more visible, perhaps with keyboard shortcut (Esc)

5. **Difficulty Display Inconsistent**
   - `NewThread.tsx` hardcodes difficulty=12, `ReplyComposer.tsx` hardcodes difficulty=8
   - Should derive from actual config for accuracy
   - **Fix**: Pass actual difficulty from mining hook

## Positive UX Elements

- **3D Cube Animation**: Engaging visual during wait time (`PowProgress.css`)
- **Real-time Stats**: Live-updating attempts, elapsed time, hash rate
- **Educational Tips**: Context about why PoW exists ("prevents spam without moderators")
- **Cancellation Support**: All mining operations can be cancelled cleanly
- **Progress Bar with ARIA**: Proper `role="progressbar"` and `aria-valuenow`
- **Pre-submission Hints**: Forms show "~30 seconds" / "~60 seconds" estimates before starting
- **Disabled State Handling**: Forms properly disable during mining, preventing double-submission
- **Import Identity Option**: Allows advanced users to restore without re-mining

## Recommendations

### Priority 1 (High Impact)

1. **Implement Swimmer Level Scaling** (matches Spec deviation)
   - Reduce PoW friction for engaged users
   - This is the #1 UX improvement possible

2. **Fix Time Estimates for Action PoW**
   - Currently wildly inaccurate (assumes 50,000 H/s, actual is ~1-10 H/s)
   - Show realistic "~2-5 minutes" for mainnet posts

3. **Improve Progress Bar Beyond 100%**
   - After expected attempts exceeded, show "Still searching..." with pulsing animation
   - Display actual attempts vs expected: "1,234,567 / ~1,048,576 expected"

### Priority 2 (Medium Impact)

4. **Add Background Mining Support**
   - Allow users to browse while mining completes
   - Show notification when ready to submit
   - Major improvement to perceived wait time

5. **Specific Error Messages**
   - `ChallengeExpired`: "Mining took too long. Please try again."
   - `MemoryError`: "Your device may not have enough memory for PoW."
   - `Cancelled`: "Mining cancelled." (already implemented)

6. **Rotate Educational Tips**
   - Change tip every 10 seconds
   - Add "Did you know?" variety

### Priority 3 (Polish)

7. **Add Success Celebration**
   - Simple animation or emoji burst on mining completion
   - Show comparative stats ("50% faster than average!")

8. **Keyboard Shortcut for Cancel**
   - Escape key should cancel mining
   - Common user expectation

9. **Mining History Page**
   - Show past mining times for user's reference
   - Help set expectations for future mining

## Swimchain-Specific Feedback

### PoW Experience Assessment: 7/10

**Strengths**:
- Clear visual feedback during mining
- Appropriate cancellation handling
- Educational context provided

**Weaknesses**:
- No Swimmer Level scaling (critical spec deviation)
- Inaccurate time estimates for Action PoW
- No background mining capability

**Recommendation**: The PoW experience is above average for blockchain applications, but the lack of Swimmer Level scaling undermines the core value proposition of "give bandwidth, get compute reduction."

### Decay Communication: N/A

PoW systems don't directly involve decay. However, PoW affects content creation which eventually decays. No issues here.

### Identity UX Assessment: 8/10

**Strengths**:
- Two-step flow (generate -> mine -> save) prevents accidents
- Address preview before committing
- Import option for advanced users
- Clear warning about identity deletion being permanent

**Weaknesses**:
- No seed phrase backup prompt before mining
- "Your identity is stored locally" warning appears after save, not before
- No recovery option (expected, but not well-communicated before creation)

**Recommendation**: Add prominent "Back up your seed before proceeding" step between generate and mine. This is critical UX for irrecoverable identity systems.

---

## Summary Table

| Category | Finding | Severity | Effort |
|----------|---------|----------|--------|
| Core | Swimmer Level scaling not implemented | Critical | High |
| Accuracy | Time estimates wrong for Argon2id | Major | Low |
| Progress | Progress bar misleading after 95% | Major | Low |
| Errors | Generic error messages | Major | Medium |
| Workflow | No background mining | Major | High |
| Polish | Tips don't rotate | Minor | Low |
| Polish | No success celebration | Minor | Low |
| Accessibility | Progress bar has good ARIA | Positive | - |
| Animation | 3D cube engaging | Positive | - |
| Education | Tips explain PoW purpose | Positive | - |

---

*Generated: 2026-01-12*
*Reviewer: UX Perspective*
*Source Files: forum-client/src/components/PowProgress.tsx, forum-client/src/hooks/useActionPow.ts, forum-client/src/pages/Identity.tsx, forum-client/src/pages/NewThread.tsx, forum-client/src/components/ReplyComposer.tsx*
