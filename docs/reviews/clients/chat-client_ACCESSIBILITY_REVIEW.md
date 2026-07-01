# Accessibility Review: Chat-Client

## Summary

The Chat-Client demonstrates **moderate accessibility awareness** with some foundational elements in place (skip links, focus-visible styles, ARIA labels on many buttons), but has significant gaps in keyboard navigation, screen reader support, and WCAG compliance. The heavy reliance on mouse interactions (hover states for actions, mouse-only reaction picker) and the blocking PoW mining modal create substantial barriers for users with motor and visual impairments.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Perceivable | 15 | 25 | Good text alternatives on icons; color-only indicators; contrast concerns in muted text |
| Operable | 12 | 25 | Vim shortcuts exist but undocumented; hover-only actions; modal traps; no standard keyboard nav |
| Understandable | 17 | 25 | Clear language; missing error guidance; unpredictable mining behavior |
| Robust | 14 | 25 | Good semantic HTML in places; missing ARIA roles; incomplete screen reader support |
| **Total** | **58** | **100** | |

## WCAG Compliance

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1.1.1 Non-text Content | Pass | Icons have aria-labels; avatar images have alt="" (decorative) |
| 1.3.1 Info and Relationships | Fail | Message grouping not conveyed semantically; channel categories lack proper ARIA |
| 1.3.2 Meaningful Sequence | Pass | DOM order matches visual order |
| 1.4.1 Use of Color | Fail | Status indicators (online/away) rely solely on color |
| 1.4.3 Contrast (Minimum) | Partial | `--text-muted: #72767d` on `--bg-primary: #36393f` = ~3.48:1 (fails 4.5:1) |
| 1.4.4 Resize Text | Pass | Uses rem units throughout |
| 1.4.10 Reflow | Fail | No mobile responsiveness; fixed layout breaks at smaller viewports |
| 2.1.1 Keyboard | Fail | Message actions require hover; reaction picker mouse-only |
| 2.1.2 No Keyboard Trap | Fail | Mining modal traps focus with no escape mechanism |
| 2.4.1 Bypass Blocks | Partial | Skip link exists in CSS but may not be implemented in main.tsx |
| 2.4.3 Focus Order | Partial | Generally logical but vim navigation doesn't update visual focus |
| 2.4.4 Link Purpose | Pass | Channel links have clear names |
| 2.4.6 Headings and Labels | Partial | `<h2>` used for channel/server names; inconsistent heading hierarchy |
| 2.4.7 Focus Visible | Pass | `:focus-visible` with 2px outline defined globally |
| 3.1.1 Language of Page | Unknown | Need to verify `<html lang="en">` in index.html |
| 3.2.1 On Focus | Pass | No unexpected context changes on focus |
| 3.2.2 On Input | Partial | Enter sends message (no explicit submit button visible by default) |
| 3.3.1 Error Identification | Partial | "Failed to send" shown but no guidance on resolution |
| 3.3.2 Labels or Instructions | Partial | Placeholder text used instead of visible labels |
| 4.1.1 Parsing | Pass | TypeScript/React ensures valid markup |
| 4.1.2 Name, Role, Value | Partial | Buttons have labels; interactive divs lack proper roles |

## Accessibility Issues

### Critical (WCAG A Violations)

1. **Message Actions Require Hover (Mouse-Only)**
   - **File**: `src/components/MessageItem.tsx:227-256`
   - **WCAG**: 2.1.1 Keyboard
   - **Impact**: Keyboard and switch control users cannot access Reply, Edit, Reaction, or More actions
   - **Fix**: Make action toolbar focusable with Tab; show on message focus; add keyboard shortcuts visible in UI

2. **Reaction Picker Not Keyboard Accessible**
   - **File**: `src/components/MessageItem.tsx:259-271`
   - **WCAG**: 2.1.1 Keyboard
   - **Impact**: Users cannot select reactions without mouse
   - **Fix**: Add `role="dialog"` with `aria-modal`, trap focus within picker, allow arrow key navigation

3. **Mining Modal Creates Keyboard Trap**
   - **File**: `src/pages/Chat.tsx:198-212`
   - **WCAG**: 2.1.2 No Keyboard Trap
   - **Impact**: When mining overlay appears, focus is not managed; users cannot interact or cancel
   - **Fix**: Add focusable Cancel button; trap focus in modal; auto-focus the modal on open

4. **Status Indicators Use Color Alone**
   - **File**: `src/components/ChannelSidebar.tsx:271` (user-status), `ServerList.tsx` (notification ping)
   - **WCAG**: 1.4.1 Use of Color
   - **Impact**: Color-blind users cannot distinguish online/away/offline status
   - **Fix**: Add icon shapes or text labels alongside color (e.g., filled circle for online, hollow for away)

### Major (WCAG AA Violations)

5. **Muted Text Fails Contrast Requirements**
   - **File**: `src/styles/globals.css:33`
   - **WCAG**: 1.4.3 Contrast (Minimum)
   - **Impact**: `#72767d` on `#36393f` = ~3.48:1 contrast ratio (requires 4.5:1)
   - **Fix**: Lighten muted text to `#8e9297` or `#96989d` for 4.5:1 compliance

6. **Vim Shortcuts Undiscoverable and Undocumented**
   - **File**: `src/hooks/useChatNavigation.ts`
   - **WCAG**: 3.3.2 Labels or Instructions
   - **Impact**: j/k/e/E/r shortcuts exist but users have no way to discover them
   - **Fix**: Add keyboard shortcut help dialog (? key); include shortcuts in settings page

7. **Message Grouping Not Semantically Conveyed**
   - **File**: `src/components/ChatArea.tsx:160-178`
   - **WCAG**: 1.3.1 Info and Relationships
   - **Impact**: Screen readers cannot understand message grouping structure
   - **Fix**: Use `<article>` for message groups with `aria-labelledby` pointing to author; add `role="list"` for messages

8. **Category Collapse State Not Announced**
   - **File**: `src/components/ChannelSidebar.tsx:144-148`
   - **WCAG**: 4.1.2 Name, Role, Value
   - **Impact**: Has `aria-expanded` but lacks `aria-controls` linking to collapsible content
   - **Fix**: Add `aria-controls="category-{name}"` and `id="category-{name}"` to content region

9. **No Mobile/Responsive Layout**
   - **File**: `src/pages/Chat.css:5-9` (fixed flex layout)
   - **WCAG**: 1.4.10 Reflow
   - **Impact**: Three-column layout unusable below 1000px viewport width
   - **Fix**: Implement collapsible sidebars; single-column view for mobile

### Minor (Best Practices)

10. **Textarea Uses Placeholder Instead of Visible Label**
    - **File**: `src/components/ChatMessageInput.tsx:78-88`
    - **Issue**: Placeholder disappears on input; no persistent label
    - **Fix**: Add visually hidden but accessible label, or show channel name as label above input

11. **Loading States Lack ARIA Live Regions**
    - **File**: `src/components/ChatArea.tsx:143-147`
    - **Issue**: "Loading messages..." not announced to screen readers
    - **Fix**: Add `aria-live="polite"` to loading/status messages

12. **Reaction Buttons Missing Accessible Names**
    - **File**: `src/components/MessageItem.tsx:204-211`
    - **Issue**: Reaction badges show emoji + count but no accessible description
    - **Fix**: Add `aria-label="Heart reaction, 5 people reacted, click to toggle"`

13. **Avatar Images Should Be Decorative**
    - **File**: `src/components/MessageItem.tsx:166`
    - **Issue**: `alt=""` is correct, but initials `<span>` should have `aria-hidden="true"`
    - **Fix**: Add `aria-hidden="true"` to initials span since author name is in header

14. **Search Input Lacks Form Context**
    - **File**: `src/components/ChatArea.tsx:126`
    - **Issue**: Search input has no associated `<label>` or `<form>` element
    - **Fix**: Wrap in `<form role="search">` with `<label class="visually-hidden">`

15. **Timestamp Formatting Not Accessible**
    - **File**: `src/components/MessageItem.tsx:62-87`
    - **Issue**: "Today at 3:45 PM" is readable but lacks `<time datetime="...">` for programmatic access
    - **Fix**: Wrap in `<time datetime="2026-01-12T15:45:00">` element

## Assistive Technology Compatibility

### Screen Readers

**Assessment: Partial Support**

- **Positives**:
  - Most buttons have `aria-label` attributes
  - Semantic `<nav>` used for server list with `aria-label="Servers"`
  - `<h2>` headings for channel/server names

- **Issues**:
  - Message list lacks `role="log"` or `role="feed"` for dynamic content
  - No announcements when new messages arrive
  - Mining progress not announced ("Mining proof of work..." is visual only)
  - Hover-revealed content invisible to screen readers until focused

### Keyboard Navigation

**Assessment: Poor**

- **Available**:
  - Tab navigates between major regions (sidebar, channels, chat area)
  - Enter sends messages
  - Vim shortcuts (j/k/Enter/Escape/e/E/r) for power users

- **Missing**:
  - Cannot access message actions via Tab
  - Cannot navigate within message list via arrow keys
  - No keyboard shortcut for reply picker
  - Mining modal has no keyboard escape route

### Voice Control

**Assessment: Partial Support**

- **Works**:
  - "Click Send", "Click Settings" - buttons have visible text or labels

- **Fails**:
  - Server icons show only on hover (title tooltip) - voice users say "Click [nothing]"
  - Reaction emoji buttons have no spoken name

### Motor/Switch Access

**Assessment: Poor**

- **Issues**:
  - Hover-dependent interactions require precise mouse control
  - 15-second PoW mining blocks all interaction
  - Small touch targets on some icon buttons (24x24px, needs 44x44px minimum)

## Recommendations

### Priority 1: Critical Keyboard Access

1. **Make message actions keyboard accessible**
   ```tsx
   // MessageItem.tsx - show actions on focus, not just hover
   const [showActions, setShowActions] = useState(false);

   <div
     className="message-item"
     tabIndex={0}
     onFocus={() => setShowActions(true)}
     onBlur={() => setShowActions(false)}
     onKeyDown={(e) => {
       if (e.key === 'r') handleReply();
       if (e.key === 'e') handleReaction();
     }}
   >
   ```

2. **Add Cancel button to mining modal**
   ```tsx
   // Chat.tsx - mining modal
   <div className="mining-modal" role="dialog" aria-modal="true" aria-labelledby="mining-title">
     <h3 id="mining-title">Mining proof of work...</h3>
     ...
     <button onClick={handleCancelMining} className="btn btn-secondary">
       Cancel
     </button>
   </div>
   ```

### Priority 2: Screen Reader Improvements

3. **Add live region for messages**
   ```tsx
   // ChatArea.tsx
   <div
     className="messages-list"
     role="log"
     aria-live="polite"
     aria-label="Message history"
   >
   ```

4. **Announce mining status**
   ```tsx
   // Chat.tsx
   <div aria-live="assertive" className="visually-hidden">
     {mining && `Mining in progress. ${miningProgress?.attempts} attempts.`}
   </div>
   ```

### Priority 3: Color and Contrast

5. **Fix muted text contrast**
   ```css
   /* globals.css - increase from #72767d to #96989d */
   --text-muted: #96989d; /* 4.5:1 contrast on #36393f */
   ```

6. **Add non-color status indicators**
   ```tsx
   // ChannelSidebar.tsx - user area
   <span className="user-status online" aria-label="Online">
     <span className="visually-hidden">Online</span>
   </span>
   ```

### Priority 4: Documentation and Discoverability

7. **Add keyboard shortcuts help**
   - Create `/shortcuts` or modal accessible via `?` key
   - Document: j/k navigation, e/E reactions, r reply, / focus input, Escape close

8. **Implement skip link in main.tsx**
   ```tsx
   // main.tsx
   <a href="#main-chat" className="skip-link">Skip to chat</a>
   ...
   <main id="main-chat">
   ```

## Summary

The Chat-Client needs significant accessibility improvements before it can be considered usable by people with disabilities. The most critical issues are:

1. **Keyboard access to message actions** - Currently impossible without mouse
2. **Mining modal focus management** - Traps users with no escape
3. **Screen reader message announcements** - Dynamic content not accessible
4. **Color contrast** - Muted text fails WCAG AA

With these fixes, the score could improve from 58/100 to approximately 80/100, making the application reasonably accessible while maintaining its Discord-like UX.
