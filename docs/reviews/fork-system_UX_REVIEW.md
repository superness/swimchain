# User Experience Review: Fork System

## Summary
The Fork System provides the essential "exit mechanism" for community sovereignty but suffers from significant UX gaps that could confuse or frustrate users. The CLI experience is functional but missing critical guardrails, the mobile UI has good visual design but limited functionality, and the web clients (forum-client, chat-client) lack fork features entirely. The critical promise of content migration is displayed but not actually implemented, creating a trust-destroying expectation gap.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 18 | 30 | Core flows work but poor guidance, misleading content count, no confirmation |
| Discoverability | 12 | 20 | CLI-only creation, no web UI, mobile has indicator only |
| Efficiency | 17 | 25 | 64-char hex IDs, no name-based switching, missing shortcuts |
| Delight & Polish | 15 | 25 | Mobile component polished, CLI utilitarian, no progress feedback |
| **Total** | **62** | **100** | Needs significant UX investment before mainstream use |

## User Flows Analyzed

### Flow 1: Creating a Fork (CLI)

1. **`sw fork create --name "community-v2"`** - Clear command
2. **Identity validation** - Good: checks identity exists
3. **"Creating fork..."** - Minimal progress feedback
4. **Success output** - Shows fork ID, name, inherited count, next step
5. **User tries to switch** - Must copy 64-character hex ID

**Friction Points**:
- **Critical**: "Inherited content: ~12345" is misleading - content NOT migrated
- **Major**: Must copy 64-char hex ID to switch - no name-based switching
- **Major**: No confirmation for permanent action
- **Minor**: No progress indicator for potentially long operation

**Improvements**:
- Change output: "Estimated content to migrate: ~{count} (note: migration not yet active)"
- Support `sw fork switch community-v2` by name
- Add confirmation: "Create fork 'community-v2' from main at height 12345? [y/N]"
- Add `--dry-run` to preview without committing

### Flow 2: Switching Forks (CLI)

1. **`sw fork switch my-fork`** - Error: must use fork ID, not name
2. **`sw fork list`** - Get hex ID
3. **`sw fork switch abc123...`** - Must paste 64 chars
4. **"Switched to fork"** - No warning about consequences

**Friction Points**:
- **Major**: Cannot switch by name - only 64-char hex ID or "main"
- **Major**: No warning about sync implications (re-sync required)
- **Major**: No confirmation dialog
- **Minor**: No post-switch status showing sync progress

**Improvements**:
- Support name-based switching with fuzzy matching
- Add warning: "Switching forks requires re-sync. Continue? [y/N]"
- Show sync status after switch or direct to `sw node sync-status`

### Flow 3: Understanding Fork Status (Mobile)

1. **ForkIndicator shows fork ID** - Good visual design
2. **Warning for minority forks** - Helpful yellow badge
3. **Stats show participants, last block** - Useful context
4. **User wants to switch** - Cannot do from mobile

**Friction Points**:
- Fork ID truncated but not useful for copy/action
- No tap handler to see full details
- Cannot switch forks from mobile
- "Minority fork" warning lacks actionable guidance

**Improvements**:
- Make indicator tappable to show fork details modal
- Add fork switcher in settings screen
- Provide "Return to main chain" action for minority fork warning
- Explain what "minority fork" means

### Flow 4: Excluding Bad Actors

1. **`sw fork create --exclude cs1badactor...`** - Works
2. **Silent handling of invalid IDs** - Accepts malformed input
3. **No preview of impact** - Unknown what gets excluded
4. **Locked after creation** - Cannot modify exclusion list

**Friction Points**:
- Invalid identity format silently ignored
- No preview of what content/users affected
- Cannot modify exclusions post-creation
- Must know exact public keys

**Improvements**:
- Validate identity format, show error for invalid
- Add `--exclude-preview` to show impact before creation
- Add `sw fork update --add-exclude/--remove-exclude`
- Support `--exclude-from-blocklist` option

### Flow 5: Viewing Fork Information

1. **`sw fork info abc123...`** - Standard pattern
2. **Output shows raw data** - Unix timestamp, hex keys
3. **Missing useful context** - No content count, compatibility

**Friction Points**:
- Timestamp shown as Unix epoch (1700000000)
- Creator shown as 64-char hex
- No human-readable dates
- No indication of fork health/activity

**Improvements**:
- Format: "Created: Jan 11, 2026 at 3:45 PM"
- Show creator with truncated ID or name if available
- Add content count and peer count
- Show last activity time

## UX Issues

### Critical (Blocking)

1. **Misleading inherited content count**: Output shows "Inherited content: ~123450" but content migration is NOT implemented. Users expect their content follows them to the fork - this is a fundamental expectation violation that destroys trust in the feature.

2. **No fork UI in web clients**: Forum-client and chat-client, the primary user interfaces, have zero fork functionality. Users cannot create, switch, or even see which fork they're viewing. This makes the feature invisible to most users.

3. **Identity flow broken for CLI create**: The CLI command doesn't pass `secret_key` to RPC, which requires it. Users cannot create forks via CLI without debugging the RPC layer directly.

### Major (Frustrating)

1. **64-character hex IDs everywhere**: Fork IDs like `a1b2c3d4...` (64 chars) are hostile to users. No name-based lookup, no short IDs, no prefix matching.

2. **No confirmation for destructive actions**: Switching forks loses sync state. Creating forks is permanent. No confirmations or "are you sure" prompts protect users from mistakes.

3. **No sync status communication**: Switching forks requires re-sync but users receive no warning, progress indicator, or time estimate.

4. **Selective filters broken**: `content_mode: "selective"` via RPC sets all filters to `None`, same as "all". Feature is documented but non-functional.

5. **No fork comparison**: Users deciding between forks cannot compare content counts, activity levels, or peer counts to inform their choice.

### Minor (Polish)

1. **Unix timestamps**: Raw epoch integers instead of human-readable dates

2. **No color coding**: CLI output is monochrome; could use green for main chain, yellow for minority forks

3. **Inconsistent JSON output**: Different formats between commands

4. **No `--quiet` flag**: Cannot suppress decorative output for scripting

5. **Missing documentation links**: Output could link to docs

6. **Fork list shows full IDs**: Visually overwhelming, should truncate by default

## Positive UX Elements

- **Mobile ForkIndicator is well-designed**: Visual hierarchy, warning states, compact mode implemented thoughtfully
- **CLI help text is comprehensive**: Long descriptions explain vision ("escape captured chains")
- **"main" alias works**: `sw fork switch main` instead of 64 zeros
- **JSON output support**: `--json` flag enables scripting and integration
- **Consistent subcommand structure**: `sw fork {create|list|switch|info|active}` follows conventions
- **Multiple `--exclude` flags**: Intuitive for excluding multiple identities
- **Next-step suggestions**: After creating, CLI suggests switch command
- **Graceful error messages**: Most errors explain what went wrong

## Recommendations

### P0 - Must Fix

1. **Fix misleading content count**: Either implement content migration OR change output to: "Estimated eligible content: ~{count} (note: content migration not yet implemented)"

2. **Add fork UI to forum-client**: At minimum: fork indicator in header showing current fork, fork list in settings. Creation can remain CLI-only initially.

3. **Fix CLI identity flow**: Auto-load identity from stored config or add `--identity-file` flag with clear error message.

4. **Support name-based switching**: `sw fork switch community-v2` should work. Names are stored and unique per node.

### P1 - Should Fix

5. **Add confirmation prompts**: Fork creation and switching need confirmation with consequence explanation.

6. **Add short fork IDs**: Display first 8 characters with full ID on demand. Allow lookup by unique prefix.

7. **Show human-readable timestamps**: "Created: Jan 11, 2026" not "timestamp: 1700000000"

8. **Add sync warning for switch**: "Switching requires re-sync. Estimated time: 5 min for 1,234 blocks. Continue? [y/N]"

### P2 - Nice to Have

9. **Fork comparison command**: `sw fork compare <id1> <id2>` showing content, peers, activity

10. **Expose selective filters**: Add RPC parameters for space/time/identity filters

11. **Add `--dry-run`**: Preview fork creation without committing

12. **Add color output**: Green for main chain, yellow for minority forks

13. **Add excluded indicator**: Show "[content hidden - author excluded]" placeholder

## Swimchain-Specific Feedback

### PoW Experience
- **Rating: N/A (Good)** - Fork creation doesn't require user PoW. However, `pow_multiplier` effects not communicated. When switching to fork with 1.5x multiplier, should show "This fork has 50% harder PoW requirements."

### Decay Communication
- **Rating: Poor** - `decay_multiplier` is accepted but never explained. Users setting `decay_multiplier: 2.0` don't understand content decays 2x faster. Need: "Content decay: 2x faster (content needs more engagement to persist)"

### Identity UX
- **Rating: Needs Work** - The vision promise (keys work across forks) is true but not communicated. When switching, should confirm: "Your identity works on this fork." Also need: "Check if you're excluded: sw fork check-exclusion"

### Sync Status Communication
- **Rating: Missing** - Fork switch requires re-sync but NO warning given. Users will be surprised when node becomes unresponsive or shows old data.

### Offline Capability
- **Rating: Not Addressed** - Can you browse previously-synced fork while offline? Can you queue fork creation for when online? Edge cases undocumented.

## Conclusion

The Fork System implements the critical "exit as power" vision but the UX does not support mainstream users. Technical users can navigate the CLI with difficulty, but the average user is blocked by: (1) missing web UI, (2) misleading content count, (3) hostile 64-char IDs, and (4) no confirmation dialogs.

Priority fixes: misleading content count, forum-client indicator, name-based switching, confirmation prompts. With these fixes, score would rise to ~78/100. Full content migration implementation would push it to ~85/100.

---

*UX Review completed 2026-01-12*
