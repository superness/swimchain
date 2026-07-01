# User Experience Review: Sponsorship Sybil Resistance

## Summary

The Sponsorship Sybil Resistance feature provides essential identity validation but suffers from complex multi-step flows, poor discoverability for new users, and cryptic identifiers (32-byte hex offer IDs). The CLI-only interface is technically functional but the newcomer onboarding journey requires significant improvement - a new user must somehow discover an offer, understand hex IDs, and navigate a multi-step async approval flow without clear guidance. The feature scores 72/100 overall.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 19 | 30 | Multi-step async flow is confusing; error messages technical |
| Discoverability | 12 | 20 | No `list-offers` command; users must receive offer IDs externally |
| Efficiency | 18 | 25 | 4-step minimum to get sponsored; no batching; async waiting |
| Delight & Polish | 23 | 25 | Good help text; clear status output; JSON support |
| **Total** | 72 | 100 | |

## User Flows Analyzed

### Flow 1: New User Onboarding (Claim Sponsorship)

**Current Flow:**
1. **Receive offer ID out-of-band** - User must somehow get 32-char hex ID from sponsor (Discord, email, etc.)
2. `sw identity create` - Create identity with PoW (works well)
3. `sw sponsor claim <hex-offer-id>` - Submit claim with cryptic ID
4. **Wait** - No notification system; must poll manually
5. `sw sponsor status` - Check if approved
6. **Repeat step 5** until sponsored

**Friction Points:**
- Offer ID is 32-character hex (`0123456789abcdef0123456789abcdef`) - not human-friendly
- No way to discover available offers (`sw sponsor list-offers` missing)
- No notification when claim is approved - user must manually poll
- No estimated wait time communicated
- If rejected, no feedback on why

**Improvement:** Add human-readable offer aliases (e.g., `offer-alice-jan13`), public offer discovery command, and claim status notifications.

### Flow 2: Sponsor Creating and Managing Offers

**Current Flow:**
1. `sw sponsor offer-create --slots 3` - Create offer
2. Copy 32-char hex ID from output
3. Share ID via external channel
4. `sw sponsor offer-view <id>` - Check for pending claims
5. `sw sponsor approve <id> <claimant-address>` - Approve each claim manually

**Friction Points:**
- Must manually check for pending claims (no notifications)
- Must type full claimant address for approval
- No batch approve command (`sw sponsor approve-all <id>`)
- Cannot add a human-readable memo/name to offers

**Improvement:** Add notifications for incoming claims, numbered claim selection, and batch operations.

### Flow 3: Genesis Identity Bootstrap

**Current Flow:**
1. `sw sponsor genesis-status` - Check eligibility
2. `sw sponsor genesis-claim --slot 0` - Claim slot

**Assessment:** This flow is actually well-designed with clear status checks and helpful output messages. The auto-registration on `offer-create` is a nice touch.

**Friction Points:**
- Slot number (0-99) is arbitrary; user doesn't know which slots are taken
- No `sw sponsor genesis-available-slots` command

### Flow 4: Checking Sponsorship Status

**Current Flow:**
1. `sw sponsor status` - View status
2. Optionally `sw sponsor status --json` for structured output

**Assessment:** Clear, informative output. Shows address, level, sponsor, depth, and capabilities. This is one of the better-designed commands.

### Flow 5: Penalty/Restriction Handling

**Current Flow:**
1. User attempts action
2. Receives error "sponsor is under restriction"
3. No way to check penalty duration or reason
4. `sw sponsor status` doesn't show penalty details

**Friction Points:**
- Penalty duration not communicated to user
- Reason for restriction not shown
- No countdown or "available at" time displayed
- Error message `SponsorOnCooldown { available_at: u64 }` shows raw Unix timestamp

**Improvement:** Add `sw sponsor penalty-status` or enhance `sw sponsor status` to show penalty details with human-readable times.

## UX Issues

### Critical (Blocking)

1. **No offer discovery mechanism** - New users have no way to find public sponsorship offers within the system. They must receive offer IDs through external channels (Discord, email, etc.), creating a chicken-and-egg problem for network growth.

2. **Cryptic offer IDs** - 32-character hex strings (`0123456789abcdef0123456789abcdef`) are error-prone to communicate verbally or type manually. One typo = "Offer not found".

3. **No claim status notification** - Claimants have no way to know when their claim is processed. They must manually poll `sw sponsor status`, which is frustrating and doesn't scale.

### Major (Frustrating)

4. **Unix timestamps in error messages** - `SponsorOnCooldown { available_at: 1736784000 }` is meaningless to users. Should show "available in 45 minutes" or "available at 2:30 PM".

5. **No penalty visibility** - Users under restriction can't see why, for how long, or what triggered it. The error `sponsor is under restriction` provides no actionable information.

6. **Claimant address required in full** - `sw sponsor approve abc... cs1qwertyuiopasdfghjklzxcvbnm...` requires typing a long address. Should support numbered selection from pending claims list.

7. **Async flow without status tracking** - The offer/claim/approve flow spans multiple sessions with no persistent state indicator. Users lose track of where they are.

8. **No batch operations** - Sponsors with 10-slot offers must run `approve` 10 times. No `approve-all` or multi-select.

### Minor (Polish)

9. **Inconsistent address formats** - Sometimes `cs1...` bech32m, sometimes hex. Commands accept both but output varies.

10. **No offer expiration warnings** - Sponsors aren't warned when offers are about to expire.

11. **No confirmation prompts** - `sw sponsor offer-cancel` immediately cancels without "Are you sure?"

12. **Missing `--verbose` flag** - Power users can't get additional debugging info.

13. **JSON output not available for all commands** - `sw sponsor claim` and `sw sponsor approve` lack `--json` flag.

## Positive UX Elements

- **Excellent help text** - Commands have clear `--help` output with examples
- **Good status output** - `sw sponsor status` shows comprehensive information in readable format
- **Auto-registration for genesis** - Reduces friction for bootstrap flow
- **JSON output support** - Available on key commands for scripting
- **Clear error categories** - 35+ distinct error types allow precise feedback
- **Sensible defaults** - Offer creation has good defaults (1 slot, 30 days, probationary)
- **After-help examples** - Every subcommand shows usage examples

## Recommendations

### Priority 1 (Critical)

1. **Add `sw sponsor list-offers` command**
   - List all public offers available for claiming
   - Filter by: available slots, offer type, expiration
   - Show human-readable summaries

2. **Implement human-readable offer aliases**
   - Allow `--alias "alice-welcomes-devs"` on offer-create
   - Support claiming by alias: `sw sponsor claim alice-welcomes-devs`
   - Fall back to hex ID for backwards compatibility

3. **Add claim status tracking**
   - `sw sponsor claim-status` shows pending claims and their state
   - Consider webhook/callback URL for notifications
   - At minimum, show last-checked timestamp

### Priority 2 (Major)

4. **Humanize timestamps in errors**
   - Convert Unix timestamps to "in X minutes" or ISO8601
   - Add `penalty_remaining` field showing duration

5. **Add penalty status command**
   ```
   sw sponsor penalty-status
   > Penalty: LostInviteSlots
   > Reason: Sponsored user flagged for spam
   > Started: 2026-01-10
   > Expires: 2026-01-17 (4 days remaining)
   ```

6. **Numbered claim selection**
   ```
   sw sponsor offer-view abc123
   > Pending Claims:
   >   [1] cs1abc... - "I want to join to discuss..."
   >   [2] cs1def... - "Referred by Alice"

   sw sponsor approve abc123 --claim 1
   ```

7. **Add batch approve**
   - `sw sponsor approve abc123 --all`
   - `sw sponsor approve abc123 --claims 1,2,3`

### Priority 3 (Nice-to-have)

8. **Offer expiration warnings**
   - Show warning when offer has <24h remaining
   - Add `--notify-expiring` flag to list command

9. **Confirmation prompts**
   - Add `--yes` flag to skip confirmation
   - Default to confirmation for destructive operations

10. **Consistent address display**
    - Always show bech32m (`cs1...`) in output
    - Accept both hex and bech32m in input

## Swimchain-Specific Feedback

### PoW Experience
- **Assessment: Adequate (6/10)**
- Identity creation PoW is handled internally by `sw identity create`
- Offer claims require PoW but the `nonce: 0` placeholder in code suggests this isn't fully wired up
- No progress indicator for PoW computation (would help for higher difficulties)
- Recommendation: Add `--verbose` flag to show PoW mining progress

### Decay Communication
- **Assessment: Not Applicable**
- Sponsorship records don't decay - they're permanent until revoked
- However, `AcceleratedDecay` penalty type affects content decay
- Penalty status should show if accelerated decay is active

### Identity UX
- **Assessment: Concerning (5/10)**
- No recovery mechanism is mentioned in CLI output
- Users aren't warned about irrecoverable identity loss
- `sw identity create` should emphasize backup importance
- Sponsorship status is tied to identity - losing identity = losing sponsorship chain position

### Sync Status Communication
- **Assessment: Poor (4/10)**
- Known limitation: "No Cross-Node Sponsorship Sync"
- Users on different nodes may see different sponsorship states
- No indication of sync status for sponsorship data
- Recommendation: Add `sw sponsor sync-status` or indicator in `sw sponsor status`

### Offline Capability
- **Assessment: Partial (5/10)**
- CLI commands require node connection
- Offer IDs can be shared offline (they're just hex strings)
- Claims require online node to submit
- No offline signing workflow for sponsors

## Frontend Integration Notes

The forum-client and other web frontends do not appear to have sponsorship UI components. This means:
- Web users have no way to manage sponsorships through the GUI
- CLI is the only interface for the entire sponsorship flow
- This creates a significant gap for non-technical users

**Recommendation:** Add sponsorship management to forum-client:
- "Get Sponsored" onboarding flow for new users
- "Sponsor Others" panel for existing users
- Visual sponsorship tree explorer
- Real-time claim notifications

## Accessibility Notes

(Covered in depth in separate accessibility review)

- CLI-only interface excludes users who rely on GUI accessibility features
- Error messages use technical jargon
- No screen reader optimizations
- Color is not used for status (good for colorblind users)

---

**Review Date:** 2026-01-13
**Reviewer:** UX Review Agent
**Feature Version:** As documented in sponsorship-sybil-resistance_FEATURE_DOC.md
