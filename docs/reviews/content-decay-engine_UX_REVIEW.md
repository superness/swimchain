# User Experience Review: Content Decay Engine

## Summary
The Content Decay Engine provides a novel organic moderation UX that communicates content health through visual "heat" indicators. While the core concept is well-implemented with good visual feedback, the experience suffers from **discoverability gaps** (users may not understand decay mechanics), **friction in engagement** (PoW mining for reactions), and **missing decay prediction tools** that would help users understand when content will expire. The mobile implementation shows stronger UX patterns than web.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 21 | 30 | Core flows work but decay mechanics not clearly explained |
| Discoverability | 13 | 20 | Heat indicators present but meaning unclear to new users |
| Efficiency | 17 | 25 | PoW mining creates friction; multi-step reaction flow |
| Delight & Polish | 24 | 25 | Good animations, visual feedback, and mobile experience |
| **Total** | **75** | **100** | |

## User Flows Analyzed

### Flow 1: Understanding Content Health
1. User sees content with heat indicator (colored dot/bar)
2. Indicator shows survival probability percentage
3. Labels show "Hot", "Stable", "Needs engagement", "Fading", "Decayed"
4. Time remaining until decay shown in some views

**Friction Points**:
- No onboarding explains what heat/decay means
- Multiple display modes (bar, icon, numeric, time) inconsistent across clients
- Web-gateway uses icon emojis (🔥, ✨, 💨, ❄️, 💀) but forum-client doesn't show decay at all
- Users cannot predict when their content will expire

**Improvement**: Add first-time user tooltip explaining decay; show "X days until decay" prominently; add decay prediction API with UX hookups

### Flow 2: Reacting to Extend Content Life
1. User clicks "React" button to open emoji picker
2. User selects emoji from 8 options
3. PoW mining begins (can take 10-30+ seconds)
4. User sees spinning icon with "Reacting..." text
5. On success, reaction count updates

**Friction Points**:
- **Major**: 10+ second PoW mining for each reaction is significant friction
- No progress indicator during reaction mining (just spinner)
- No cancel button during reaction PoW (unlike identity creation)
- User doesn't understand reaction resets decay timer
- Self-engagement prevention not explained before attempting
- Rate limiting not communicated proactively

**Improvement**:
- Show mini PoW progress during reactions
- Add clear "This extends content life by X hours" messaging
- Allow background reaction mining with notification
- Pre-check self-engagement to prevent wasted PoW

### Flow 3: Viewing Decayed Content
1. User navigates to thread that has decayed
2. System shows "Thread Not Found" or "Content Unavailable"
3. Message: "The thread you're looking for doesn't exist or has decayed"
4. User offered "Back to Space" button

**Friction Points**:
- **Critical**: "doesn't exist or has decayed" is ambiguous
- No tombstone visualization (thread structure should show decayed parent)
- No "this content was decayed X days ago" information
- Cannot see what the content was about
- Replies to decayed content may orphan user's replies

**Improvement**: Show clear "This content decayed on [date]" with tombstone placeholder; preserve thread context; show "Kept alive by" attribution before decay

### Flow 4: Creating Content with Decay Protection
1. User composes post
2. Post created with 48-hour protection
3. No indication of protection period or decay timeline
4. User doesn't know when engagement will start mattering

**Friction Points**:
- **Major**: No UI indicates 48-hour protection period
- No projected decay timeline shown after posting
- No notification as content approaches decay threshold
- User cannot extend protection with preservation PoW (undocumented)

**Improvement**: Show "Protected for 48h" badge; add decay timeline visualization; implement decay warning notifications

### Flow 5: Mining PoW for Identity (Related Flow)
1. User clicks "Generate Identity"
2. Full-screen PowProgress component shows:
   - Animated 3D spinner (web) / circular progress (mobile)
   - Attempts count, elapsed time, hash rate
   - Progress bar with percentage
   - Estimated time remaining
   - Educational "Mining Tips"
   - Cancel button
3. Success celebration with stats

**Friction Points**:
- Difficulty 20 can take 30+ seconds on slow devices
- No battery impact warning (mobile does show this)
- Web lacks "Continue Browsing" option that mobile has
- Tips rotate randomly rather than progressively educating

**Positive Elements**: Excellent progress feedback, educational content, ability to cancel

## UX Issues

### Critical (Blocking)
1. **Decayed content shows generic error** - Users cannot distinguish "never existed" from "has decayed", causing confusion about what happened to bookmarked content
2. **No decay indicator in forum-client ThreadView** - The main content viewing component shows NO decay state, hiding the core mechanic from users

### Major (Frustrating)
1. **PoW mining for reactions has no progress indicator** - Only shows "Reacting..." spinner, unlike the excellent PowProgress component used for identity
2. **No explanation of decay mechanics in UI** - Users must read documentation to understand the half-life model
3. **48-hour protection period invisible** - New content creators don't know they have a grace period
4. **Self-engagement error only after PoW mining** - Users waste computational effort trying to react to own content
5. **Missing decay prediction** - No "will decay in X days" information to prompt engagement
6. **No "Kept alive by" attribution display** - Feature documented but not visible in UI

### Minor (Polish)
1. **Inconsistent heat indicator implementations** - Web-gateway uses emoji icons (🔥), mobile uses colored dots, forum-client omits entirely
2. **Decay threshold labels vary** - "Fading" vs "Stale" used in different clients
3. **Missing confirmation for reactions** - No haptic/visual celebration on successful reaction
4. **No decay notifications** - Users aren't notified when their content approaches threshold
5. **Time format inconsistency** - Some places show "~2d", others "48 hours", others Unix timestamps

## Positive UX Elements

### Heat Indicator Design (web-gateway, mobile)
- **Visual hierarchy**: Hot 🔥 → Stable ✨ → Cooling 💨 → Fading ❄️ → Decayed 💀
- **Multiple display modes**: bar, numeric, icon, time-remaining
- **Color progression**: Red → Orange → Yellow → Blue → Gray
- **Protected state indicator**: 🔒 lock icon clearly shows content is safe
- **Pulse animation**: Hot content pulses to draw attention

### Mining Progress UX (PowProgress component)
- **Comprehensive stats**: Attempts, elapsed time, hash rate
- **Progress estimation**: Progress bar with percentage
- **Time estimate**: "Estimated time: ~Xs"
- **Educational tips**: Rotating facts about PoW and Swimchain
- **Cancel option**: User can abort if taking too long
- **Mobile excellence**: Battery estimate, "Continue Browsing" option

### Reaction System
- **Familiar emoji reactions**: Heart, thumbs, fire, laugh - recognizable patterns
- **Swimchain-native emoji**: 🏊 swimmer adds brand identity
- **Compact mode**: Inline chip display for high-density views
- **Accessible**: ARIA labels, keyboard navigation, role="menu"

### Error Messaging
- **Clear error types**: ContentNotFound, ContentDecayed, SelfEngagement, InvalidPow
- **Actionable messages**: "Please create an identity first", "Check ID, content may have decayed"
- **Deprecated feature handling**: Pool methods return clear "use submit_engagement" guidance

## Recommendations

### Priority 1: Critical UX Fixes
1. **Add decay state to ThreadView** - Show survival probability and time remaining on all content
2. **Distinguish decayed vs. missing content** - Show "This content decayed on [date]" not "Thread Not Found"
3. **Add PoW progress for reactions** - Reuse PowProgress component at smaller scale

### Priority 2: Education & Discoverability
4. **Onboarding tooltip for decay** - First-time users see "Content in Swimchain naturally decays unless the community engages with it"
5. **48-hour protection badge** - Show "Protected" badge on new content with countdown
6. **Pre-flight validation** - Check self-engagement before starting PoW mining

### Priority 3: Predictions & Notifications
7. **Decay prediction API** - Add `get_decay_prediction(content_id)` returning estimated decay date
8. **Decay timeline visualization** - Show projected decay date based on current engagement rate
9. **Push notifications** - "Your post '[title]' will decay in 24 hours - engage to preserve"

### Priority 4: Attribution & Delight
10. **Show "Kept alive by" list** - Display users who extended content life through engagement
11. **Reaction success celebration** - Brief animation/confetti when reaction successfully extends life
12. **Consistent heat indicators** - Standardize implementation across all clients

## Swimchain-Specific Feedback

### PoW Experience: 7/10
**Positive**: Excellent progress feedback during identity mining, educational tips, cancel option, time estimates.
**Needs Work**: Reaction PoW has no progress indicator, no "background mining" option on web, no battery warning on web.

### Decay Communication: 5/10
**Positive**: Heat indicators with clear color coding exist in some clients, protected state shown.
**Needs Work**: Forum-client main view has NO decay indicator, mechanics not explained to users, no decay predictions, decayed content shows generic error.

### Identity UX: 8/10
**Positive**: Clear flow from generate → mine → save, import option exists, local-only storage explained.
**Needs Work**:
- **Critical missing warning**: No "This identity cannot be recovered if you lose it" message
- No seed export/backup option in web client (mobile has it)
- "Are you sure you want to delete your identity?" should emphasize permanence
- Recovery documentation needed: "Write down your seed somewhere safe"

---

*Reviewed: 2026-01-12*
*Reviewer: UX Review Agent*
*Source: Feature documentation + client implementations analysis*
