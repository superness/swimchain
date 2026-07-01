# Accessibility Review: React SDK

## Summary

The React SDK provides a solid foundation for accessible applications, with consuming components (forum-client) demonstrating **good practices** in several areas including semantic HTML, ARIA roles, and keyboard shortcuts. However, the SDK itself is primarily hooks and utilities that don't directly render UI, placing accessibility responsibility on consuming applications. Critical gaps exist in **focus management during state transitions**, **screen reader announcements for async operations**, and **modal accessibility patterns** in the consuming applications.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Perceivable | 17 | 25 | Text alternatives present but color contrast and motion issues |
| Operable | 16 | 25 | Keyboard nav implemented but gaps in focus trapping |
| Understandable | 18 | 25 | Clear language, but error messages lack recovery guidance |
| Robust | 14 | 25 | Semantic HTML good, ARIA incomplete in modals |
| **Total** | **65** | **100** | Functional accessibility with notable gaps |

## WCAG 2.1 Level AA Compliance

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1.1.1 Non-text Content | **Pass** | SVG icons use `aria-hidden="true"`, decorative spinners hidden |
| 1.3.1 Info and Relationships | **Partial** | Tables use proper `scope`; forms have labels, but some implicit associations |
| 1.3.2 Meaningful Sequence | **Pass** | DOM order matches visual order |
| 1.4.1 Use of Color | **Fail** | Heat decay bar relies solely on color (red/yellow/green) |
| 1.4.3 Contrast (Minimum) | **Unknown** | No contrast audit performed; CSS uses custom properties |
| 1.4.4 Resize Text | **Pass** | Uses relative units (rem, %) |
| 1.4.10 Reflow | **Pass** | Responsive layouts, no horizontal scroll |
| 1.4.11 Non-text Contrast | **Partial** | Focus indicators present but may be insufficient |
| 2.1.1 Keyboard | **Partial** | Vim-style shortcuts (j/k/Enter) implemented; standard Tab navigation works |
| 2.1.2 No Keyboard Trap | **Partial** | Modals lack proper focus trapping |
| 2.4.1 Bypass Blocks | **Fail** | No skip links implemented |
| 2.4.3 Focus Order | **Partial** | Generally correct but issues during state transitions |
| 2.4.4 Link Purpose | **Pass** | Links have descriptive text |
| 2.4.6 Headings and Labels | **Pass** | Proper heading hierarchy (h1 > h2 > h3) |
| 2.4.7 Focus Visible | **Partial** | CSS focus styles exist but may not be prominent enough |
| 2.5.3 Label in Name | **Pass** | Button labels match accessible names |
| 3.1.1 Language of Page | **Unknown** | `lang` attribute not verified on consuming apps |
| 3.2.1 On Focus | **Pass** | No unexpected context changes on focus |
| 3.3.1 Error Identification | **Partial** | Errors shown but not always associated with fields |
| 3.3.2 Labels or Instructions | **Pass** | Form fields have labels and hints |
| 4.1.1 Parsing | **Pass** | Valid HTML structure |
| 4.1.2 Name, Role, Value | **Partial** | Progress bars have ARIA; modals lack role="dialog" consistently |

## Accessibility Issues

### Critical (WCAG A Violations)

#### 1. Missing Focus Trap in Modals
**Files**: `InviteModal.tsx:135`, `KeyboardShortcutsModal:186`
**WCAG**: 2.1.2 No Keyboard Trap (inverse - focus escapes when it shouldn't)
**Impact**: Keyboard users can Tab outside modal while it's open, losing context
**Fix**: Implement focus trap using `focus-trap-react` or manual implementation:
```tsx
// Add to modal:
useEffect(() => {
  const firstFocusable = modalRef.current?.querySelector('button, input');
  firstFocusable?.focus();

  const handleTab = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      // Trap focus within modal
    }
  };
  document.addEventListener('keydown', handleTab);
  return () => document.removeEventListener('keydown', handleTab);
}, []);
```

#### 2. Color-Only Information in Decay Visualization
**Files**: (Consuming apps using `useDecay()`)
**WCAG**: 1.4.1 Use of Color
**Impact**: Color-blind users cannot determine content decay state
**Fix**: Add text labels, icons, or patterns alongside color:
```tsx
// Add to decay display:
<div className="decay-indicator">
  <div className="heat-bar" style={{ backgroundColor: heatColor }} />
  <span className="sr-only">{decay?.isDecayed ? 'Expired' : `${Math.round(decay?.currentHeat * 100)}% active`}</span>
  {decay?.isDecayed && <span className="decay-label">Expired</span>}
</div>
```

#### 3. No Skip Links
**WCAG**: 2.4.1 Bypass Blocks
**Impact**: Screen reader users must navigate through header/nav on every page
**Fix**: Add skip link at start of body:
```tsx
<a href="#main-content" className="skip-link">
  Skip to main content
</a>
```

### Major (WCAG AA Violations)

#### 1. Insufficient Focus Indication During PoW Mining
**File**: `PowProgress.tsx`
**WCAG**: 2.4.7 Focus Visible
**Impact**: When mining starts, focus is not managed; users may lose context
**Fix**: Move focus to the progress component and announce state changes:
```tsx
<div
  className="pow-progress"
  role="status"
  aria-live="polite"
  tabIndex={-1}
  ref={progressRef}
>
// And in useEffect: progressRef.current?.focus();
```

#### 2. Missing Error Association with Form Fields
**File**: `InviteModal.tsx:183-186`
**WCAG**: 3.3.1 Error Identification
**Impact**: Screen readers announce error but don't associate it with the field
**Fix**: Use `aria-describedby` and `aria-invalid`:
```tsx
<input
  id="recipient"
  aria-invalid={!!inviteError}
  aria-describedby={inviteError ? "recipient-error" : undefined}
/>
{inviteError && (
  <div id="recipient-error" className="invite-error" role="alert">
    {inviteError}
  </div>
)}
```

#### 3. Incomplete ARIA for Progress States
**File**: `PowProgress.tsx:85-97`
**WCAG**: 4.1.2 Name, Role, Value
**Impact**: Progress bar is accessible but lacks `aria-valuetext` for meaningful context
**Fix**: Add descriptive value text:
```tsx
<div
  role="progressbar"
  aria-valuenow={Math.round(progressPercent)}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuetext={`Mining progress: ${Math.round(progressPercent)}%, ${attempts.toLocaleString()} attempts`}
  aria-label="Mining progress"
>
```

#### 4. Missing `lang` Attribute Verification
**WCAG**: 3.1.1 Language of Page
**Impact**: Screen readers may use incorrect pronunciation
**Fix**: Ensure consuming apps set `<html lang="en">` in index.html

### Minor (Best Practices)

#### 1. Hidden Shortcut Discovery
**File**: `SearchBox.tsx:52`
**Impact**: Keyboard shortcut hint (`<kbd>/</kbd>`) is visually shown but has `aria-hidden`
**Recommendation**: Provide discoverable shortcut help via `?` key (already implemented)

#### 2. Confirmation Dialogs Use `window.confirm()`
**File**: `Identity.tsx:95-98`
**Impact**: Native browser dialogs aren't styleable and may not work well with assistive tech
**Recommendation**: Replace with accessible custom confirmation modal

#### 3. Loading States Lack Time Estimates
**Files**: `Loading.tsx`, various loading states
**Impact**: Users don't know how long to wait
**Recommendation**: Add `aria-busy="true"` to regions being loaded and provide time context

#### 4. Missing Reduced Motion Support
**Files**: CSS animations in `Loading.css`, `PowProgress.css`
**Impact**: Users with vestibular disorders may be affected by spinning animations
**Recommendation**: Add `prefers-reduced-motion` media query:
```css
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
```

## Assistive Technology Compatibility

### Screen Readers
- **VoiceOver (macOS/iOS)**: Good - semantic structure is correct, ARIA roles present
- **NVDA/JAWS (Windows)**: Partial - live regions work but modal focus management is weak
- **TalkBack (Android)**: Unknown - not tested, React Native not supported

### Keyboard Navigation
- **Tab Navigation**: Works correctly for most interactive elements
- **Custom Shortcuts**: Vim-style j/k/Enter implemented via `useKeyboardNavigation`
- **Focus Management**: Issues during state transitions (mining start/complete, modal open/close)
- **Roving Tabindex**: Correctly implemented in `ThreadList` (`tabIndex={isSelected ? 0 : -1}`)

### Voice Control
- **Dragon NaturallySpeaking**: Should work - buttons have accessible names
- **Voice Access (Android)**: Unknown - not tested

### Other Assistive Technologies
- **Switch Access**: Partially compatible - needs better focus indicators
- **Screen Magnification**: Good - relative units used, layouts reflow

## Positive Accessibility Elements

1. **Semantic HTML**: Tables use `<th scope="col">`, forms use `<label>`, landmarks exist
2. **ARIA Live Regions**: Loading states use `role="status"` and `aria-live="polite"`
3. **Decorative Content**: SVG icons correctly use `aria-hidden="true"`
4. **Progress Bar**: `PowProgress` has proper progressbar role with values
5. **Search Form**: Uses `role="search"` with proper label association
6. **Error Boundary**: Uses `role="alert"` for error announcements
7. **Keyboard Shortcuts Modal**: Uses `role="dialog"` and `aria-modal="true"`
8. **Time Elements**: Uses `<time>` with `dateTime` attribute for machine-readable dates

## SDK-Level Recommendations

Since the React SDK (`@swimchain/react`) is primarily hooks and utilities, accessibility is the responsibility of consuming applications. However, the SDK could provide:

### 1. Accessibility Helper Hooks (Priority: High)
Create hooks that help consuming apps implement accessible patterns:
```typescript
// useFocusReturn() - restore focus when modal closes
// useAnnounce() - programmatic screen reader announcements
// useReducedMotion() - detect user motion preferences
```

### 2. Accessible State Patterns (Priority: High)
Provide recommended patterns in documentation for:
- Announcing PoW mining progress
- Handling async operation feedback
- Managing focus during state transitions

### 3. Error Message Standards (Priority: Medium)
Define error message format that includes:
- Error identification
- User-friendly description
- Recovery action (when applicable)

### 4. Component Library with Accessibility (Priority: Medium)
Consider providing optional accessible UI components:
- `<AccessibleProgress />` for PoW mining
- `<AccessibleModal />` with focus trap
- `<AccessibleAlert />` for error/success messages

## Consuming Application Recommendations

### Immediate Actions
1. Add focus trap to `InviteModal` and all other modals
2. Add skip link to main layout
3. Add `aria-invalid` and `aria-describedby` to form validation
4. Add `prefers-reduced-motion` support to animations

### Short-term Actions
1. Audit color contrast throughout the application
2. Add text alternatives to color-coded decay indicators
3. Implement proper focus management during state transitions
4. Add `lang` attribute to HTML root

### Long-term Actions
1. Conduct screen reader testing with NVDA, VoiceOver, TalkBack
2. Perform accessibility audit with axe-core or similar tool
3. Add automated accessibility tests using jest-axe
4. Document accessibility patterns for contributors

## Testing Recommendations

### Automated Testing
```typescript
// Add to test suite:
import { axe } from 'jest-axe';

test('PowProgress has no accessibility violations', async () => {
  const { container } = render(<PowProgress attempts={100} elapsedMs={5000} difficulty={8} onCancel={() => {}} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Manual Testing Checklist
- [ ] Navigate entire app using only keyboard (Tab, Enter, Escape, Arrow keys)
- [ ] Test with VoiceOver/NVDA and listen to all announcements
- [ ] Test with 200% zoom - ensure no content is cut off
- [ ] Test with high contrast mode enabled
- [ ] Test with reduced motion preference enabled
- [ ] Test with screen magnification at 300%

---

**Review Date**: 2026-01-12
**SDK Version**: @swimchain/react (current main branch)
**Consuming App Reviewed**: forum-client
**Reviewer**: Claude Accessibility Review Agent
