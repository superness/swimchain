# Client Accessibility Guide

This document describes the accessibility features and requirements for Swimchain client implementations. The Forum Client reference implementation serves as a model for WCAG 2.1 AA compliance.

## WCAG 2.1 AA Compliance

Swimchain clients must meet WCAG 2.1 Level AA success criteria. Key areas include:

### 1. Perceivable

#### 1.1 Text Alternatives
- All images have descriptive `alt` attributes
- Icon buttons use `aria-label` for screen reader text
- Decorative elements use `aria-hidden="true"`

#### 1.2 Time-based Media
- PoW mining progress includes text status updates
- Decay animations have text alternatives

#### 1.3 Adaptable
- Semantic HTML structure (`<header>`, `<nav>`, `<main>`, `<footer>`)
- Logical heading hierarchy (h1 → h2 → h3)
- ARIA landmarks for major sections

#### 1.4 Distinguishable
- Color contrast meets 4.5:1 ratio for normal text
- Color contrast meets 3:1 ratio for large text
- Focus indicators are visible on all interactive elements
- No information conveyed by color alone

### 2. Operable

#### 2.1 Keyboard Accessible
- All functionality available via keyboard
- No keyboard traps
- Vim-style navigation (j/k/Enter)
- Standard shortcuts (/, ?, Backspace)

#### 2.2 Enough Time
- Mining progress is cancelable
- No time limits on user input
- Decay is informational, not action-gated

#### 2.3 Seizures
- No flashing content above 3Hz
- Mining animation uses smooth transitions

#### 2.4 Navigable
- Skip link to main content
- Descriptive page titles
- Focus management on route changes
- Logical tab order

#### 2.5 Input Modalities
- Minimum 44x44px touch targets
- Pointer gestures have keyboard alternatives

### 3. Understandable

#### 3.1 Readable
- Language specified (`<html lang="en">`)
- No abbreviations without expansion

#### 3.2 Predictable
- Consistent navigation
- No unexpected context changes
- Form submission requires explicit action

#### 3.3 Input Assistance
- Error messages are specific
- Required fields are marked
- Instructions provided before complex actions

### 4. Robust

#### 4.1 Compatible
- Valid HTML5
- ARIA used correctly
- Works with screen readers

## Keyboard Navigation

### Global Shortcuts

| Key | Action | Notes |
|-----|--------|-------|
| `Tab` | Move to next focusable element | Standard browser behavior |
| `Shift+Tab` | Move to previous focusable element | Standard browser behavior |
| `Enter` | Activate focused button/link | Standard browser behavior |
| `Escape` | Close modal/dropdown | Standard pattern |

### Application Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `j` | Move selection down | Thread/reply lists |
| `k` | Move selection up | Thread/reply lists |
| `Enter` | Open selected item | When item is selected |
| `n` | Focus new thread form | Anywhere outside forms |
| `r` | Focus reply form | Thread view |
| `e` | Quick engage (+5s) | Thread/reply selected |
| `E` | Standard engage (+15s) | Thread/reply selected |
| `/` | Focus search | Anywhere outside forms |
| `?` | Show shortcuts modal | Anywhere |
| `Backspace` | Go back | Anywhere outside forms |

### Focus Management

Keyboard shortcuts are disabled when:
- Focus is in an `<input>` element
- Focus is in a `<textarea>` element
- Focus is in a `contenteditable` element
- A modal is open (except `Escape`)

## Screen Reader Support

### ARIA Roles

```html
<!-- Main layout structure -->
<header role="banner">...</header>
<nav role="navigation" aria-label="Space navigation">...</nav>
<main role="main" id="main-content">...</main>
<footer role="status" aria-live="polite">...</footer>

<!-- Heat indicator -->
<div role="meter" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100" aria-label="Heat: 75%">
```

### Live Regions

Dynamic content updates use `aria-live`:

```html
<!-- Mining progress -->
<div role="status" aria-live="polite">
  Mining: 50,000 attempts, 5.2 seconds elapsed
</div>

<!-- Sync status -->
<footer role="status" aria-live="polite">
  Synced • 8 peers • 245/500 MB
</footer>
```

### Labels and Descriptions

All interactive elements have accessible names:

```html
<!-- Button with icon -->
<button aria-label="Contribute 5 seconds">+5s Quick</button>

<!-- Form field -->
<label for="post-title">Title</label>
<input id="post-title" type="text" required />

<!-- Address display -->
<span aria-label="Address: sw1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2">
  sw1qw5...4ev2
</span>
```

## Color Contrast

### Color Palette

| Token | Value | Use | Contrast Ratio |
|-------|-------|-----|----------------|
| `--color-text-primary` | #f0f0f0 | Body text on dark | 15:1 |
| `--color-text-secondary` | #b0b0b0 | Secondary text | 8:1 |
| `--color-text-tertiary` | #808080 | Hints/disabled | 5:1 |
| `--color-accent-primary` | #00d4ff | Links/buttons | 4.6:1 |
| `--color-focus` | #00d4ff | Focus rings | 4.6:1 |

### Heat State Colors

| State | Color | Meaning |
|-------|-------|---------|
| Full | #4caf50 (green) | 80-100% heat |
| Warm | #8bc34a (lime) | 60-79% heat |
| Cooling | #ffeb3b (yellow) | 20-59% heat |
| Fading | #ff9800 (orange) | 5-19% heat |
| Decayed | #f44336 (red) | <5% heat |

Heat states are also indicated by:
- Progress bar fill
- Numeric percentage
- Opacity changes (with `decayStyle: 'opacity'`)

## Testing Procedures

### Automated Testing

```typescript
// Using axe-core in tests
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('page has no accessibility violations', async () => {
  const { container } = render(<MyPage />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Manual Testing Checklist

1. **Keyboard Navigation**
   - [ ] All interactive elements are focusable
   - [ ] Focus order is logical
   - [ ] Focus is visible
   - [ ] No keyboard traps
   - [ ] Shortcuts work correctly

2. **Screen Reader**
   - [ ] Page title is announced
   - [ ] Headings create logical outline
   - [ ] Form labels are associated
   - [ ] Live regions update appropriately
   - [ ] Images have alt text

3. **Visual**
   - [ ] Color contrast meets requirements
   - [ ] Text resizes up to 200%
   - [ ] Layout works at 320px width
   - [ ] Focus indicators are visible

4. **Interaction**
   - [ ] Touch targets are 44x44px minimum
   - [ ] Errors are clearly indicated
   - [ ] Success states are communicated
   - [ ] Loading states are announced

### Screen Reader Testing

Test with at least one of:
- NVDA (Windows, free)
- VoiceOver (macOS, built-in)
- JAWS (Windows, commercial)

### Browser Extensions

- [axe DevTools](https://www.deque.com/axe/) - Automated testing
- [WAVE](https://wave.webaim.org/) - Visual feedback
- [Color Contrast Analyzer](https://developer.paciellogroup.com/resources/contrastanalyser/) - Contrast checking

## Known Limitations

1. **Deep Threading Indentation**: Very deep reply threads (>10 levels) may have reduced visual indentation on mobile devices to maintain readability.

2. **Mining Progress Animation**: The 3D cube animation is decorative and hidden from screen readers. Text updates provide status information.

3. **Keyboard Navigation in Forms**: Application shortcuts (j/k/etc.) are disabled when inside form fields to allow normal text input.

4. **Color-Only Heat States**: While heat is also indicated by percentages, the color gradient provides additional context that may be harder to perceive for users with color vision deficiency. The `decayStyle: 'numeric'` preference mitigates this.

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [Inclusive Components](https://inclusive-components.design/)
