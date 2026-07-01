# Accessibility Review: Seeding & Availability

## Summary

The Seeding & Availability feature currently has **no user interface**, making traditional WCAG compliance assessment largely theoretical. The feature exists entirely as backend Rust code with no RPC endpoints, CLI commands, or UI components. While the error messages and status enums are well-designed for future accessibility, the complete absence of user-facing interfaces means users with disabilities (or any users) cannot interact with the feature at all. This review evaluates both the current state and provides guidance for when UI is implemented.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Perceivable | 12 | 25 | Error messages are clear text; no UI exists to evaluate |
| Operable | 8 | 25 | No UI = no keyboard access; backend is non-blocking |
| Understandable | 18 | 25 | Well-structured errors and status messages |
| Robust | 10 | 25 | No ARIA, no semantic HTML; Rust API is well-typed |
| **Total** | **48** | **100** | Score reflects lack of any user interface |

---

## WCAG Compliance

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1.1.1 Non-text Content | N/A | No images or non-text content exists |
| 1.3.1 Info and Relationships | N/A | No UI to assess; backend uses typed enums |
| 1.3.2 Meaningful Sequence | N/A | No content to evaluate |
| 1.3.3 Sensory Characteristics | N/A | No UI instructions exist |
| 1.4.1 Use of Color | **Concern** | `SeedingHealth` (Healthy/Degraded/Inactive) likely to use color when surfaced |
| 1.4.3 Contrast (Minimum) | N/A | No UI colors defined |
| 1.4.4 Resize Text | N/A | No text to resize |
| 2.1.1 Keyboard | **Fail** | No UI = no keyboard access possible |
| 2.1.2 No Keyboard Trap | N/A | No interactive elements |
| 2.4.3 Focus Order | N/A | No focusable elements |
| 2.4.4 Link Purpose | N/A | No links exist |
| 2.4.6 Headings and Labels | N/A | No UI structure |
| 3.1.1 Language of Page | N/A | No page content |
| 3.3.1 Error Identification | **Pass** | `ConfigError` provides specific, text-based error messages |
| 3.3.3 Error Suggestion | **Pass** | Error messages include valid ranges (e.g., "must be 1-100 Mbps") |
| 4.1.1 Parsing | N/A | No HTML to parse |
| 4.1.2 Name, Role, Value | N/A | No UI controls |

---

## Accessibility Issues

### Critical (WCAG A Violations)

1. **Issue**: No user interface exists at all
   **WCAG**: 2.1.1 Keyboard (among others)
   **Impact**: All users are excluded - keyboard users, screen reader users, and sighted users alike
   **Fix**: Implement RPC endpoints and UI components before this feature can be evaluated for accessibility

### Major (WCAG AA Concerns - Future UI)

1. **Issue**: `SeedingHealth` status will likely rely on color coding
   **WCAG**: 1.4.1 Use of Color
   **Impact**: Color-blind users may not distinguish Healthy (green), Degraded (yellow), Inactive (red)
   **Fix**: When implementing health status display:
   - Add icons alongside colors (checkmark, warning, X)
   - Include text labels ("Healthy", "Degraded", "Inactive")
   - Ensure 4.5:1 contrast ratio for text on colored backgrounds

2. **Issue**: Bandwidth slider will need accessible labeling
   **WCAG**: 4.1.2 Name, Role, Value
   **Impact**: Screen reader users won't understand slider purpose or current value
   **Fix**: When implementing bandwidth slider:
   - Use `aria-label="Bandwidth limit in megabits per second"`
   - Use `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
   - Announce value changes with `aria-valuetext="10 megabits per second"`

3. **Issue**: Mobile-specific settings need clear mode indication
   **WCAG**: 1.3.1 Info and Relationships
   **Impact**: Users may not understand when WiFi-only mode is active
   **Fix**: Use clear status indicators with both visual and programmatic indication

### Minor (Best Practices - Future Implementation)

1. **Issue**: `SeedingMode` enum lacks user-facing descriptions
   **Impact**: UI will need to duplicate mode explanations
   **Fix**: Add `description()` method to `SeedingMode`:
   ```rust
   pub fn description(&self) -> &'static str {
       match self {
           Disabled => "Not sharing any content with the network",
           OwnContent => "Only sharing content you created",
           ViewedContent => "Sharing content you've created or viewed recently",
           FullSpace => "Sharing all content in selected spaces",
       }
   }
   ```

2. **Issue**: Mbps vs MB/s unit confusion
   **Impact**: Technical users may understand Mbps, but general users expect MB/s
   **Fix**: Display both units or use more intuitive byte-based measurements

3. **Issue**: Duration uses hours (1-8760) without human-readable conversion
   **Impact**: Users cannot easily translate 168 hours to "7 days"
   **Fix**: Add helper that converts to "X days" or "X weeks" format

4. **Issue**: Statistics summary lacks screen reader optimization
   **Impact**: `format_bytes()` output like "1.50 GB" may read as "one point five zero G B"
   **Fix**: Add `aria-label` with expanded text: "one and a half gigabytes"

---

## Assistive Technology Compatibility

### Screen Readers

**Current State**: Not testable - no UI exists

**Recommendations for Implementation**:
- Use semantic HTML: `<section>` for settings groups, `<fieldset>` for related toggles
- Provide `aria-live="polite"` region for status updates (health changes, bandwidth usage)
- Ensure form controls have associated `<label>` elements
- Use `role="status"` for seeding statistics that update in real-time

### Keyboard Navigation

**Current State**: Not testable - no UI exists

**Recommendations for Implementation**:
- Ensure all controls (toggles, sliders, dropdowns) are keyboard-operable
- Follow logical tab order: Enable toggle -> Mode selection -> Bandwidth -> Storage -> Duration
- Provide keyboard shortcuts for common actions (e.g., `S` to toggle seeding on/off in settings)
- Implement focus management when opening/closing settings panels

### Voice Control

**Current State**: Not testable - no UI exists

**Recommendations for Implementation**:
- Use descriptive, unique labels for each control
- Avoid generic labels like "Toggle" - use "Enable seeding toggle"
- Ensure visible labels match accessible names for voice activation

### Motor Impairments

**Recommendations for Implementation**:
- Make slider targets large enough (minimum 44x44px touch targets)
- Provide numeric input alternative to sliders for precise control
- Avoid time-based interactions that require quick responses
- Support reduced motion preferences for any animations

---

## Positive Accessibility Elements

1. **Clear Error Messages**: `ConfigError` provides specific, actionable messages:
   - "bandwidth must be 1-100 Mbps, got 150" - tells exactly what's wrong and valid range
   - No cryptic error codes or technical jargon

2. **Well-Typed Status Enums**: `SeedingHealth` and `SeedingMode` use semantic names that translate well to UI:
   - "Healthy", "Degraded", "Inactive" are clear status terms
   - Easy to provide accessible descriptions

3. **Sensible Defaults**: Default configuration (10 Mbps, WiFi-only) reduces cognitive load:
   - Users don't need to understand complex settings immediately
   - Safe defaults protect users from unexpected data usage

4. **No Time-Limited Interactions**: Backend operations are async and don't require user response within time limits:
   - Rate limiting is transparent to users
   - No "session timeout" concerns

5. **Statistics Summary Function**: `StatisticsSnapshot::summary()` provides human-readable text:
   - "1.50 GB uploaded" instead of raw bytes
   - Good foundation for screen reader announcements

---

## Recommendations

### Priority 1: Create Accessible UI Foundation (Critical)

1. **Implement Settings Panel with Proper Structure**
   ```html
   <section aria-labelledby="seeding-heading">
     <h2 id="seeding-heading">Content Sharing Settings</h2>
     <fieldset>
       <legend>Sharing Mode</legend>
       <!-- Toggle and mode selection -->
     </fieldset>
   </section>
   ```

2. **Add Live Region for Statistics**
   ```html
   <div role="status" aria-live="polite" aria-atomic="true">
     You've shared 1.5 GB of content with 42 requests served.
   </div>
   ```

### Priority 2: Ensure Color Independence (Major)

3. **Health Status Display**
   - Add icon + text alongside color:
     - Healthy: Green + checkmark + "Healthy"
     - Degraded: Yellow/Orange + warning icon + "Degraded"
     - Inactive: Gray + dash icon + "Inactive"

4. **Ensure Sufficient Contrast**
   - Text on colored health badges must have 4.5:1 contrast
   - Use darker backgrounds or white text as needed

### Priority 3: Accessible Controls (Major)

5. **Bandwidth Slider**
   ```html
   <label for="bandwidth">Upload speed limit</label>
   <input
     type="range"
     id="bandwidth"
     min="1"
     max="100"
     aria-valuetext="10 megabits per second"
   />
   <output for="bandwidth">10 Mbps (1.25 MB/s)</output>
   ```

6. **Duration Control**
   ```html
   <label for="duration">Share viewed content for</label>
   <select id="duration">
     <option value="24">1 day</option>
     <option value="168" selected>1 week</option>
     <option value="720">1 month</option>
   </select>
   ```

### Priority 4: Mobile Accessibility (Medium)

7. **Touch Targets**
   - All toggle buttons minimum 44x44px
   - Adequate spacing between controls
   - Support for system-level accessibility settings (reduced motion, increased contrast)

8. **Network Status Announcement**
   ```html
   <div role="alert" aria-live="assertive">
     Content sharing paused - WiFi not available
   </div>
   ```

---

## Existing Project Patterns (Reference)

The existing Settings page (`forum-client/src/pages/Settings.tsx`) demonstrates some accessibility patterns:

**Good Patterns to Follow**:
- Labels associated with form controls via `htmlFor`/`id`
- Description text in `.setting-description` class
- Focus-visible styles on toggle switches (`:focus-visible + .toggle-slider`)
- Keyboard shortcut documentation with `<kbd>` elements

**Patterns Needing Improvement**:
- Some buttons lack `aria-label` (e.g., "Show"/"Hide" buttons)
- Toggle switch visibility relies on `opacity: 0` input which may confuse some screen readers
- Color-only distinction for some states
- Missing `role="status"` for dynamic content

---

## Swimchain-Specific Accessibility Considerations

### PoW Progress Indication
- When PoW is required for seeding operations, use accessible progress indicators
- Screen readers should announce "Computing proof of work, please wait" and completion

### Decay Communication
- If linking seeding to content decay, explain in plain language: "Share this content to help it stay available longer"

### Identity Display
- "Contributing as [identity]" should be announced to screen readers on page load
- Truncated addresses need full version in `aria-label`

---

## Conclusion

The Seeding & Availability feature scores **48/100** on accessibility, reflecting the complete absence of any user interface. The backend code demonstrates good practices for error messages and status types that will translate well to an accessible UI, but without RPC endpoints and frontend components, users cannot interact with the feature at all.

**The primary accessibility barrier is not WCAG compliance - it's that the feature is completely inaccessible to all users, regardless of ability.**

Once UI is implemented, follow these guidelines:
1. Build on existing Settings page patterns with improvements noted above
2. Ensure health status is not color-dependent
3. Provide accessible form controls with proper labeling
4. Use live regions for dynamic statistics updates

---

*Review completed: 2026-01-13*
*Reviewer: Accessibility Expert Agent*
*Feature Version: Complete (Phase 3 - Milestone 3.5)*
*Standard: WCAG 2.1 Level AA*
