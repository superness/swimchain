# Accessibility Review: Content Decay Engine

## Summary

The Content Decay Engine presents moderate accessibility challenges as a novel UI paradigm that relies heavily on visual metaphors (heat indicators, decay states, engagement pools) to communicate time-sensitive content status. While some components demonstrate strong WCAG compliance (forum-client's EngagementPool), critical gaps exist in mobile clients (missing accessibilityLabel attributes) and the chat-client (hover-only interactions). The decay lifecycle concept requires clear communication of transient states to users with assistive technologies.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Perceivable | 16 | 25 | Heat indicators use color-only differentiation; emoji badges lack text alternatives |
| Operable | 17 | 25 | Critical hover-only interactions in chat; no keyboard arrow navigation in pickers |
| Understandable | 19 | 25 | Decay concept not explained; generic error messages for decayed content |
| Robust | 18 | 25 | Inconsistent ARIA usage across clients; mobile missing accessibility props |
| **Total** | **70** | **100** | |

## WCAG 2.1 Level AA Compliance

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1.1.1 Non-text Content | **Fail** | Mobile HeatIndicator, HeatBadge missing text alternatives |
| 1.3.1 Info and Relationships | **Partial** | EngagementPool uses proper semantics; MessageItem lacks structure |
| 1.3.3 Sensory Characteristics | **Fail** | Heat levels communicated via color/emoji only |
| 1.4.1 Use of Color | **Fail** | Heat status (🔥→❄️→💀) relies on color without text backup |
| 1.4.3 Contrast (Minimum) | **Pass** | CSS variables provide adequate contrast ratios |
| 1.4.11 Non-text Contrast | **Partial** | Heat indicator colors may fade below 3:1 at low heat levels |
| 2.1.1 Keyboard | **Fail** | Chat MessageItem actions only appear on hover |
| 2.1.2 No Keyboard Trap | **Pass** | No keyboard traps identified |
| 2.4.3 Focus Order | **Partial** | Focus order logical within components but emoji pickers lack focus management |
| 2.4.4 Link Purpose | **Pass** | Links have clear purposes in context |
| 2.4.7 Focus Visible | **Partial** | Global `:focus-visible` styles exist but not all components use them |
| 3.1.1 Language of Page | **Pass** | HTML lang attribute set appropriately |
| 3.3.1 Error Identification | **Fail** | "Thread Not Found" doesn't distinguish deleted vs decayed content |
| 3.3.2 Labels or Instructions | **Partial** | Reaction buttons labeled; decay mechanics not explained |
| 4.1.1 Parsing | **Pass** | Valid HTML structure |
| 4.1.2 Name, Role, Value | **Fail** | Mobile components missing accessibilityLabel/accessibilityRole |

## Accessibility Issues

### Critical (WCAG A Violations)

#### 1. Mobile Heat Indicators Missing Text Alternatives (1.1.1)
**Component**: `mobile-client/src/components/HeatIndicator.tsx`
**WCAG**: 1.1.1 Non-text Content
**Impact**: Screen reader users cannot perceive content heat status - a core feature of the platform
**Evidence**:
```tsx
// Line 65-74: No accessibilityLabel on Animated.View
<Animated.View
  style={[styles.container, sizeStyle, { backgroundColor: heatColor }, animatedStyle, style]}
/>
```
**Fix**: Add `accessibilityLabel={`Content heat level: ${heatLevel}, ${decayPercentage}% remaining`}` and `accessibilityRole="image"` to the View component.

#### 2. Chat Actions Only Accessible via Hover (2.1.1)
**Component**: `chat-client/src/components/MessageItem.tsx`
**WCAG**: 2.1.1 Keyboard
**Impact**: Keyboard-only users cannot access reaction, reply, or edit actions
**Evidence**:
```tsx
// Lines 153-157: Actions controlled by mouse hover state
onMouseEnter={() => setShowActions(true)}
onMouseLeave={() => {
  setShowActions(false);
  setShowReactionPicker(false);
}}
```
**Fix**: Add `onFocus`/`onBlur` handlers alongside mouse events; make the message item focusable with `tabIndex={0}` to reveal actions on focus.

#### 3. Color-Only Heat Status Communication (1.4.1)
**Component**: All heat indicators across clients
**WCAG**: 1.4.1 Use of Color
**Impact**: Color-blind users cannot distinguish heat levels
**Evidence**: Heat states (🔥 Full → ✨ Warm → 💨 Cooling → ❄️ Fading → 💀 Decayed) use emoji that rely on color understanding. The backing color (`--heat-full`, `--heat-fading`, etc.) has no text equivalent.
**Fix**: Add visible text labels (e.g., "Hot", "Warm", "Cool", "Cold", "Expired") alongside emoji indicators, or provide a visible percentage.

#### 4. Reaction Picker Lacks Keyboard Navigation (2.1.1)
**Component**: `forum-client/src/components/ContentStatus.tsx`
**WCAG**: 2.1.1 Keyboard
**Impact**: Keyboard users can tab to emoji options but cannot use arrow keys for efficient navigation
**Evidence**:
```tsx
// Line 106-116: role="menu" used but no keyboard handler for arrow navigation
<div className="emoji-picker" role="menu" aria-label="Choose an emoji">
  {EMOJI_OPTIONS.map(({ emoji, type }) => (
    <button ... onClick={() => handleEmojiClick(emoji)} aria-label={`React with ${type}`}>
```
**Fix**: Implement arrow key navigation within the menu using `onKeyDown` handler; manage focus with `roving tabindex` pattern.

### Major (WCAG AA Violations)

#### 5. Decayed Content Shows Generic Error (3.3.1)
**Component**: Thread views across clients
**WCAG**: 3.3.1 Error Identification
**Impact**: Users cannot distinguish between deleted content, decayed content, and network errors
**Evidence**: Per UX review, decayed content shows "Thread Not Found" or "doesn't exist or has decayed" without specifying the actual cause.
**Fix**: Display specific messages: "This content has decayed and is no longer available" with optional decay date, distinct from "Content not found" errors.

#### 6. Emoji Picker Focus Management Missing
**Component**: `forum-client/src/components/ContentStatus.tsx`, `chat-client/src/components/MessageItem.tsx`
**WCAG**: 2.4.3 Focus Order
**Impact**: When emoji picker opens, focus is not moved to first option; when closed, focus not restored
**Evidence**: Picker appears via `{showPicker && ...}` conditional render but no focus management code exists.
**Fix**: Use `useEffect` to focus first emoji option when picker opens; restore focus to trigger button on close.

#### 7. Mining Progress Not Announced (4.1.3)
**Component**: `forum-client/src/components/ContentStatus.tsx`
**WCAG**: 4.1.3 Status Messages (AA)
**Impact**: Screen reader users see "Reacting..." but don't receive progress updates during 10+ second PoW mining
**Evidence**:
```tsx
// Line 99-102: Static text "Reacting..." with spinner animation
<span className={`reaction-icon ${isReacting ? 'reacting' : ''}`}>
  {isReacting ? '⏳' : '😀'}
</span>
<span>{isReacting ? 'Reacting...' : 'React'}</span>
```
**Fix**: Use `aria-live="polite"` region with progress percentage updates during mining, similar to the existing `PowProgress` component which has proper live regions.

#### 8. Heat Opacity May Reduce Contrast (1.4.11)
**Component**: `chat-client/src/components/MessageBubble.tsx`
**WCAG**: 1.4.11 Non-text Contrast
**Impact**: Low-heat content uses reduced opacity (e.g., `heat-5` = 50%) which may reduce text contrast below 4.5:1
**Evidence**: Heat-based opacity classes apply to message containers, potentially affecting text readability at low heat levels.
**Fix**: Ensure text contrast remains above 4.5:1 even at lowest opacity; consider alternative visual treatments that don't affect text contrast.

### Minor (Best Practices)

#### 9. Title Attribute Used Instead of ARIA Label
**Component**: `chat-client/src/components/HeatIndicator.tsx` (web version)
**Issue**: Uses `title={...}` attribute which is not reliably announced by screen readers
**Fix**: Replace with `aria-label` or visible text.

#### 10. Grouped Message Timestamps Not Accessible
**Component**: `chat-client/src/components/MessageItem.tsx`
**Issue**: Timestamp for grouped messages only visible on hover (CSS opacity:0 → opacity:1)
**Evidence**: Line 162: `<span className="hover-timestamp">` with CSS hiding
**Fix**: Make timestamp accessible to screen readers via `aria-label` on message or `sr-only` class.

#### 11. Pool Badge Uses Title Instead of Label
**Component**: `forum-client/src/components/EngagementPool.tsx`
**Issue**: `EngagementPoolBadge` uses `title` attribute for status information
**Evidence**: Line 126-127: `title={...}` on span element
**Fix**: Add `aria-label` with same content for screen reader support.

#### 12. Contributing Progress Bar Missing ARIA
**Component**: `forum-client/src/components/EngagementPool.tsx`
**Issue**: The contribution mining progress bar (lines 103-111) lacks `role="progressbar"` and ARIA value attributes
**Fix**: Add `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.

## Assistive Technology Compatibility

### Screen Readers
- **Forum-client EngagementPool**: Good - proper ARIA roles, labels, and live regions
- **Forum-client ContentStatus**: Partial - has labels but lacks keyboard navigation
- **Chat-client MessageItem**: Poor - hover-only actions, reaction picker buttons missing labels
- **Mobile-client HeatIndicator**: Fail - completely missing accessibility props

### Keyboard Navigation
- **Emoji pickers**: Tab works but arrow key navigation not implemented
- **Chat actions**: Fail - not keyboard accessible at all (hover-only)
- **Pool contribution buttons**: Pass - standard button accessibility

### Voice Control
- **Reaction buttons**: Pass - clear labels enable voice activation
- **Heat indicators**: Fail - no actionable elements to target

### Screen Magnification
- **Heat indicators**: Pass - scale appropriately
- **Emoji pickers**: Partial - may overflow viewport on high zoom

## Component-by-Component Analysis

| Component | Path | ARIA | Keyboard | Color | Screen Reader |
|-----------|------|------|----------|-------|---------------|
| ContentStatus | forum-client | Partial | Partial | N/A | Good |
| EngagementPool | forum-client | Full | Full | Pass | Good |
| MessageItem | chat-client | Minimal | **Fail** | Pass | **Fail** |
| HeatIndicator | mobile-client | **None** | N/A | Pass | **Fail** |
| HeatBadge | mobile-client | **None** | N/A | Fail | **Fail** |
| HeatBar | mobile-client | **None** | N/A | Pass | Partial |

## Positive Accessibility Patterns

1. **EngagementPool** (forum-client) - Exemplary implementation:
   - `role="group"` with `aria-labelledby`
   - `role="progressbar"` with full ARIA values
   - `aria-label` on all action buttons
   - `visually-hidden` class for descriptive labels

2. **PowProgress** (forum-client, swimchain-frontend) - Good live region usage:
   - `role="status"` with `aria-live="polite"`
   - Updates announced during mining

3. **Global styles** - Consistent focus indicators:
   - `:focus-visible` with 2px outline
   - Skip link support in multiple clients

4. **ErrorBoundary** - Proper error announcement:
   - `role="alert"` for error states
   - Focusable retry buttons

## Recommendations

### Priority 1: Critical Fixes (WCAG A)
1. **Add accessibilityLabel/accessibilityRole to all mobile heat components** - Affects all mobile users with assistive technology
2. **Make chat message actions keyboard accessible** - Add focus/blur handlers alongside hover
3. **Add text alternatives for heat status** - Visible labels or accessible descriptions alongside emoji

### Priority 2: Major Improvements (WCAG AA)
4. **Implement emoji picker keyboard navigation** - Arrow keys, Escape to close, focus management
5. **Distinguish decayed content errors** - Specific error messages for decay vs not found
6. **Add live region for reaction mining progress** - Use PowProgress pattern

### Priority 3: Enhancements
7. **Create reusable AccessibleHeatIndicator component** - Standardize heat accessibility across all clients
8. **Add decay onboarding/explanation** - Help text or modal explaining the decay mechanic
9. **Audit heat opacity for contrast** - Ensure low-heat content maintains readable contrast

## Implementation Pattern Recommendations

### Accessible Heat Indicator Pattern (React)
```tsx
interface AccessibleHeatIndicatorProps {
  heatLevel: 'full' | 'warm' | 'cooling' | 'fading' | 'decayed';
  percentage: number;
}

const HEAT_LABELS = {
  full: 'Hot',
  warm: 'Warm',
  cooling: 'Cooling',
  fading: 'Cold',
  decayed: 'Expired'
};

function AccessibleHeatIndicator({ heatLevel, percentage }: Props) {
  return (
    <span
      role="img"
      aria-label={`${HEAT_LABELS[heatLevel]}: ${percentage}% heat remaining`}
    >
      <span aria-hidden="true">{HEAT_EMOJIS[heatLevel]}</span>
      <span className="sr-only">{HEAT_LABELS[heatLevel]}</span>
    </span>
  );
}
```

### Accessible Mobile Heat Indicator Pattern (React Native)
```tsx
<View
  accessibilityLabel={`Content heat: ${heatLevel}, ${decayPercentage}% remaining`}
  accessibilityRole="image"
  style={[styles.indicator, { backgroundColor: heatColor }]}
/>
```

## Testing Recommendations

### Manual Testing Checklist
- [ ] Navigate all decay-related UI with keyboard only (Tab, Enter, Escape, Arrow keys)
- [ ] Test with VoiceOver (iOS) / TalkBack (Android) on mobile clients
- [ ] Test with NVDA/JAWS on web clients
- [ ] Verify 4.5:1 contrast at all heat levels
- [ ] Test emoji picker focus management

### Automated Testing
- Add axe-core to forum-client, chat-client CI pipelines
- Add React Native Accessibility Inspector checks to mobile CI
- Create visual regression tests for heat indicator contrast

---

*Review Date: 2026-01-12*
*Reviewer: Accessibility Expert Perspective*
*Standard: WCAG 2.1 Level AA*
*Files Analyzed: 12 components across forum-client, chat-client, mobile-client*
