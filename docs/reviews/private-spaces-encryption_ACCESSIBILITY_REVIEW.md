# Accessibility Review: Private Spaces Encryption

**Reviewer**: Accessibility Expert
**Date**: 2026-01-12 (Updated)
**Feature**: Private Spaces & Encryption (Section 10)

## Summary

The Private Spaces Encryption feature has a **moderate accessibility foundation** with proper form labels, some ARIA attributes on close buttons, and reasonable keyboard focus states. However, critical gaps exist that significantly impact users with disabilities: **no focus trapping in modals** (users can Tab into obscured background content), **kick button completely invisible to keyboard users** (uses `opacity: 0` until hover), **missing ARIA live regions** for async status updates, **color-only role differentiation**, and **error messages not programmatically linked to inputs**. Screen reader users will struggle with the encrypted content unlock flow and chat message updates. The feature scores **47/100** - substantial remediation needed before WCAG 2.1 AA compliance.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Perceivable | 12 | 25 | Missing text alternatives on 25+ SVG icons, color-only role badges, no live regions |
| Operable | 9 | 25 | No focus trap in modals, kick button inaccessible, no skip links, no Escape handling |
| Understandable | 15 | 25 | Labels present but errors not linked, cryptic 64-char hex addresses required |
| Robust | 11 | 25 | Missing `role="dialog"`, no `aria-modal`, incomplete semantic structure |
| **Total** | **47** | **100** | |

## WCAG 2.1 Level AA Compliance

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1.1.1 Non-text Content | **Fail** | 25+ SVG icons lack `aria-hidden="true"` or alternative text |
| 1.3.1 Info and Relationships | **Fail** | Error messages not linked via `aria-describedby`; role badges lack programmatic relationship |
| 1.3.2 Meaningful Sequence | Pass | Logical DOM order in forms and lists |
| 1.4.1 Use of Color | **Fail** | Admin/Mod/Member roles differentiated solely by background color |
| 1.4.3 Contrast (Minimum) | Partial | Most text passes; hint text at 0.75rem may be borderline |
| 1.4.4 Resize Text | Pass | Uses rem units throughout |
| 2.1.1 Keyboard | **Fail** | Kick button has `opacity: 0` - completely invisible to keyboard users |
| 2.1.2 No Keyboard Trap | **Fail** | Modals don't trap focus; Tab escapes into background content |
| 2.4.1 Bypass Blocks | **Fail** | No skip link to message input in ChatView |
| 2.4.3 Focus Order | Partial | Logical within components but modals break flow |
| 2.4.4 Link Purpose | Partial | "Back" link clear; invite sender shows truncated hex (unclear) |
| 2.4.6 Headings and Labels | Partial | Section headings present; missing landmark roles on sections |
| 2.4.7 Focus Visible | Partial | Custom focus rings exist but not consistent on all elements |
| 3.1.1 Language of Page | N/A | Handled at app level |
| 3.2.2 On Input | Pass | Forms submit on explicit action only |
| 3.3.1 Error Identification | **Fail** | Errors shown but not linked to inputs via `aria-describedby` |
| 3.3.2 Labels or Instructions | Partial | Labels present but "64 hex characters" instruction unclear for non-technical users |
| 4.1.1 Parsing | Pass | Valid React JSX structure |
| 4.1.2 Name, Role, Value | **Fail** | Missing ARIA live regions for status updates; modals lack `role="dialog"` |

---

## Accessibility Issues

### Critical (WCAG A Violations)

#### 1. No Focus Trap in Modals
**Issue**: InviteModal and SpaceSettings modals don't trap keyboard focus. Users can Tab out of the modal into background content that should be inert.

**WCAG**: 2.1.2 No Keyboard Trap (inverse violation - focus should be trapped but isn't)

**Impact**: Screen reader and keyboard users lose context, may interact with hidden content, and cannot properly dismiss the modal. This blocks task completion for keyboard-only users.

**Location**: `InviteModal.tsx:134-215`, `SpaceSettings.tsx:132-271`

**Evidence**: Modal uses `onClick={onClose}` on overlay but no keyboard handling:
```tsx
// SpaceSettings.tsx:134
<div className="modal-overlay" onClick={onClose}>
  // No Escape key handler
  // No focus trap implementation
```

**Fix**:
```tsx
// Add focus trap using inert attribute or focus-trap library
useEffect(() => {
  if (isOpen) {
    // Set background as inert
    document.querySelector('#app-root')?.setAttribute('inert', '');

    // Focus first interactive element
    const firstFocusable = modalRef.current?.querySelector('input, button');
    (firstFocusable as HTMLElement)?.focus();

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.querySelector('#app-root')?.removeAttribute('inert');
      document.removeEventListener('keydown', handleEscape);
    };
  }
}, [isOpen, onClose]);
```

---

#### 2. Kick Button Completely Inaccessible to Keyboard Users
**Issue**: The kick button in SpaceSettings has `opacity: 0` until parent row is hovered. Keyboard-only users cannot see or know the button exists.

**WCAG**: 2.1.1 Keyboard

**Impact**: Admins using keyboard navigation cannot kick members - a core admin function is completely blocked.

**Location**: `SpaceSettings.css:144-152`

**Evidence**:
```css
.kick-button {
  color: var(--error-text, #dc2626);
  opacity: 0;  /* COMPLETELY INVISIBLE */
  transition: opacity 0.15s ease;
}

.member-row:hover .kick-button {
  opacity: 1;  /* Only visible on MOUSE hover */
}
```

**Fix**:
```css
.kick-button {
  color: var(--error-text, #dc2626);
  opacity: 0.4; /* Visible but subtle */
  transition: opacity 0.15s ease;
}

.member-row:hover .kick-button,
.member-row:focus-within .kick-button, /* Keyboard focus */
.kick-button:focus-visible {
  opacity: 1;
}
```

---

#### 3. SVG Icons Missing Accessibility Attributes
**Issue**: 25+ SVG icons throughout the components lack `aria-hidden="true"`, causing screen readers to announce meaningless content or SVG path data.

**WCAG**: 1.1.1 Non-text Content

**Impact**: Screen readers announce "graphic" or path data for every icon, creating noise and confusion.

**Location**: All component files - examples:
- `PrivateSpaceList.tsx:215-218` (envelope icon)
- `PrivateSpaceList.tsx:261-264` (lock icon)
- `InviteModal.tsx:145-148` (close icon)
- `SpaceSettings.tsx:144-147` (close icon)
- `ChatView.tsx:169-171` (back arrow)
- `EncryptedContent.tsx:129-132` (lock icon)

**Fix**:
```tsx
// For decorative icons (next to text that conveys meaning)
<svg aria-hidden="true" width="16" height="16">...</svg>

// For icon-only buttons, use aria-label on button instead
<button aria-label="Close modal">
  <svg aria-hidden="true">...</svg>
</button>
```

---

#### 4. Error Messages Not Programmatically Linked to Inputs
**Issue**: Error messages like "Invalid recipient address" are displayed visually but not associated with their inputs via `aria-describedby`.

**WCAG**: 3.3.1 Error Identification, 1.3.1 Info and Relationships

**Impact**: Screen reader users hear the error but don't know which input it relates to.

**Location**:
- `InviteModal.tsx:183-187`
- `CreatePrivateSpace.tsx:184-188`
- `EncryptedContent.tsx:177`

**Evidence**:
```tsx
// InviteModal.tsx - error not linked to input
<input id="recipient" ... />
{inviteError && (
  <div className="invite-error">
    {inviteError}  // No id, no aria link
  </div>
)}
```

**Fix**:
```tsx
<input
  id="recipient"
  aria-describedby={inviteError ? "recipient-error" : "recipient-hint"}
  aria-invalid={!!inviteError}
/>
<small id="recipient-hint" className="form-hint">
  The recipient's public key in hex format
</small>
{inviteError && (
  <div id="recipient-error" role="alert" className="invite-error">
    {inviteError}
  </div>
)}
```

---

### Major (WCAG AA Violations)

#### 1. Color-Only Role Differentiation
**Issue**: Member role badges (Admin, Moderator, Member) are distinguished primarily by background color (yellow, purple, gray).

**WCAG**: 1.4.1 Use of Color

**Impact**: 8% of males with color blindness cannot distinguish roles. Admins may not be identifiable.

**Location**: `SpaceSettings.css:119-142`, `SpaceSettings.tsx:190-192`

**Evidence**:
```css
.member-role-badge.admin {
  background: var(--warning-bg, #fef3c7);  /* Yellow only */
  color: var(--warning-text, #b45309);
}
.member-role-badge.moderator {
  background: var(--primary-light, #e0e7ff);  /* Purple only */
}
.member-role-badge.member {
  background: var(--surface-3, #e5e7eb);  /* Gray only */
}
```

**Fix**: The role text is present (good), but add icons for visual reinforcement:
```tsx
<span className={`member-role-badge ${member.role}`}>
  {member.role === 'admin' && <CrownIcon aria-hidden="true" />}
  {member.role === 'moderator' && <ShieldIcon aria-hidden="true" />}
  {member.role}
</span>
```

---

#### 2. No ARIA Live Regions for Status Updates
**Issue**: Async operations (accepting invites, sending DMs, encryption status) update visual UI but screen readers are not notified.

**WCAG**: 4.1.2 Name, Role, Value

**Impact**: Blind users don't know when invites are accepted, messages sent, or content decrypted.

**Location**:
- `PrivateSpaceList.tsx` - invite accept/decline
- `InviteModal.tsx` - invite sent success/error
- `ChatView.tsx` - message sending
- `EncryptedContent.tsx` - decryption status

**Fix**:
```tsx
// Add status announcement region
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  className="sr-only"
>
  {success && 'Invite sent successfully'}
  {processingInvite && 'Accepting invite...'}
  {error && `Error: ${error}`}
</div>
```

---

#### 3. Modal Containers Missing Dialog Role
**Issue**: Modal overlays don't use `role="dialog"` or `aria-modal="true"`, so screen readers don't announce modal context.

**WCAG**: 4.1.2 Name, Role, Value

**Impact**: Screen readers treat modals as regular page content; users don't know they're in a dialog.

**Location**: `InviteModal.tsx:136`, `SpaceSettings.tsx:135`

**Fix**:
```tsx
<div
  className="modal-content invite-modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="invite-modal-title"
  onClick={e => e.stopPropagation()}
>
  <header className="modal-header">
    <h2 id="invite-modal-title">Invite to {spaceName}</h2>
```

---

#### 4. Missing Skip Navigation in Chat View
**Issue**: ChatView has header, optional sidebar, message list, and composer. No skip link to jump to message input.

**WCAG**: 2.4.1 Bypass Blocks

**Impact**: Screen reader users must tab through all header buttons and every message to reach the composer.

**Location**: `ChatView.tsx:163-341`

**Fix**:
```tsx
// Add at top of component
<a href="#message-composer" className="skip-link sr-only focus:not-sr-only">
  Skip to message input
</a>
// ... header, messages ...
<input id="message-composer" className="composer-input" ... />
```

---

#### 5. Members List Missing Landmark
**Issue**: The members section in SpaceSettings and ChatView sidebar lacks `role="region"` or `<section>` with label.

**WCAG**: 1.3.1 Info and Relationships

**Impact**: Screen reader users cannot quickly navigate to members section using landmarks.

**Location**: `SpaceSettings.tsx:164-216`, `ChatView.tsx:217-241`

**Fix**:
```tsx
<section aria-labelledby="members-heading">
  <h3 id="members-heading">Members ({members.length})</h3>
  <ul className="members-list">...</ul>
</section>
```

---

### Minor (Best Practices)

#### 1. Encrypted Content State Not Announced
**Issue**: When content decrypts successfully, no announcement is made to screen readers.

**Location**: `EncryptedContent.tsx`

**Fix**:
```tsx
<div
  className={`encrypted-content ${isLocked ? 'locked' : 'unlocked'}`}
  role="region"
  aria-label={isLocked ? 'Encrypted content - enter passphrase to unlock' : 'Decrypted content'}
>
```

---

#### 2. Truncated Addresses Not Expandable
**Issue**: Hex addresses shown as `a1b2c3...d4e5` with no way to view or copy full address.

**Impact**: Low vision users or those using zoom can't access full address.

**Location**: `SpaceSettings.tsx:188`, `ChatView.tsx:230-231`

**Fix**: Add tooltip or expandable detail on click/focus.

---

#### 3. Time Formatting Not Machine-Readable
**Issue**: Timestamps like "2h ago" lack `<time>` element with `datetime` attribute.

**Location**: `ChatView.tsx:283-285`, `PrivateSpaceList.tsx:228-230`

**Fix**:
```tsx
<time dateTime={new Date(timestamp).toISOString()}>
  {formatTime(timestamp)}
</time>
```

---

#### 4. Passphrase Input Missing Autocomplete Attribute
**Issue**: Passphrase inputs lack `autocomplete` attribute, confusing password managers.

**Location**: `EncryptedContent.tsx:141-149`

**Fix**: Add `autocomplete="off"` for security-sensitive passphrase fields.

---

#### 5. Loading States Not Descriptive
**Issue**: Generic "Loading..." doesn't indicate what's loading.

**Location**: `PrivateSpaceList.tsx:203-206`, `ChatView.tsx:246-249`

**Fix**: "Loading members...", "Loading messages...", etc.

---

## Assistive Technology Compatibility

### Screen Readers
| Aspect | Status | Notes |
|--------|--------|-------|
| VoiceOver (macOS/iOS) | Partial | Forms labeled; async updates silent; modal context missing |
| NVDA (Windows) | Partial | Same issues; role badges may read color name |
| JAWS | Partial | Modals not announced as dialogs; decorative icons cause verbosity |
| TalkBack (Android) | Unknown | Testing needed |

**Key Issues**:
- Modals announced as generic content, not dialogs
- Status changes (success/error) not announced
- SVG icons cause "graphic" announcements

### Keyboard Navigation
| Aspect | Status | Notes |
|--------|--------|-------|
| Tab order | Partial | Logical within components; breaks at modal boundaries |
| Enter/Space activation | Pass | Buttons activate correctly |
| Escape to close modals | **Fail** | No Escape key handler implemented |
| Focus trap | **Fail** | Focus escapes modals into background |
| Kick button | **Fail** | Invisible until hover (`opacity: 0`) |

### Voice Control
| Aspect | Status | Notes |
|--------|--------|-------|
| "Click [button text]" | Partial | Works for labeled buttons; icon-only buttons fail |
| Visible labels | Partial | Some buttons only have aria-label |

---

## Recommendations

### Priority 0 (Critical - Fix Immediately)

1. **Add focus trap to modals** - S effort
   - Use `inert` attribute on background or `focus-trap-react` library
   - Add Escape key handler
   - Files: `InviteModal.tsx`, `SpaceSettings.tsx`

2. **Make kick button keyboard accessible** - XS effort
   - Remove `opacity: 0`, use `opacity: 0.4` or similar
   - Add `:focus-within` and `:focus-visible` selectors
   - Files: `SpaceSettings.css`

3. **Add `aria-hidden="true"` to decorative SVGs** - S effort
   - Audit all 25+ SVG icons
   - Add attribute to each decorative icon
   - Files: All component files

### Priority 1 (High - Fix Soon)

4. **Link error messages to inputs** - S effort
   - Add `aria-describedby` pointing to error
   - Add `aria-invalid` when error present
   - Add `role="alert"` to error containers
   - Files: All form components

5. **Add `role="dialog"` to modals** - S effort
   - Add `role="dialog"` and `aria-modal="true"`
   - Add `aria-labelledby` pointing to title
   - Files: `InviteModal.tsx`, `SpaceSettings.tsx`

6. **Add ARIA live regions for status** - S effort
   - Create reusable status announcement component
   - Add to all async operations
   - Files: Create new component, integrate everywhere

### Priority 2 (Medium - Plan for Next Sprint)

7. **Add icons to role badges** - S effort
   - Crown for Admin, Shield for Moderator
   - Ensures color is not sole differentiator

8. **Add skip link in ChatView** - S effort
   - "Skip to message input" at top of page

9. **Add region landmarks to sections** - S effort
   - Members section, chat area

### Priority 3 (Backlog)

10. Use `<time>` elements with `datetime` attribute
11. Add `autocomplete="off"` to passphrase inputs
12. Make truncated addresses expandable
13. Add accessibility linting to CI (axe-core)

---

## Testing Checklist

### Manual Testing Required
- [ ] Tab through InviteModal - verify focus stays within modal
- [ ] Tab through SpaceSettings - verify kick button receives focus
- [ ] Press Escape in modal - verify modal closes
- [ ] Test with VoiceOver (macOS) - verify all actions announced
- [ ] Test with NVDA (Windows) - verify form errors announced
- [ ] Test with keyboard only - complete full invite flow without mouse
- [ ] Test with color blindness simulator - verify roles distinguishable
- [ ] Test at 200% zoom - verify no content clipping

### Automated Testing
```javascript
// Add to test suite
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

test('InviteModal has no accessibility violations', async () => {
  const { container } = render(<InviteModal isOpen={true} onClose={() => {}} spaceId="test" />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

*This accessibility review identifies 4 Critical, 5 Major, and 5 Minor issues. Priority should be given to focus trapping in modals and keyboard accessibility of the kick button, as these completely block task completion for some users. Overall score: **47/100** - significant remediation needed before WCAG 2.1 AA compliance.*

*Reviewed by: Accessibility Expert*
*Date: 2026-01-12*
*Components analyzed: PrivateSpaceList, InviteModal, EncryptedContent, CreatePrivateSpace, SpaceSettings, StartDMButton, ChatView*
