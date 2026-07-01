# User Experience Review: WASM Bindings

## Summary

The WASM Bindings module provides essential client-side cryptographic operations with generally good UX patterns for PoW feedback and identity management. The mining experience is well-designed with progress indicators, time estimates, and educational content. However, critical gaps exist around key backup/export functionality (no UI for this), decay visualization is inconsistent across clients, and there are no accessibility considerations for the WASM initialization flow.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 22 | 30 | Good flow design but missing key backup; identity deletion scary |
| Discoverability | 14 | 20 | PoW well-exposed; decay features scattered; no WASM docs for users |
| Efficiency | 20 | 25 | Batched mining works; setTimeout(0) keeps UI responsive |
| Delight & Polish | 22 | 25 | 3D cube animation, tips, progress bar; minor rough edges |
| **Total** | 78 | 100 | |

## User Flows Analyzed

### Flow: Identity Creation

1. **Generate Identity** - User clicks "Generate Identity" button
   - Assessment: Clear primary CTA, good button styling

2. **Start Mining PoW** - Keypair generated, shows address preview
   - Assessment: Good intermediate state showing address before commitment
   - Issue: Two-step process (generate then mine) adds friction

3. **Mining Progress** - PowProgress component shows stats
   - Assessment: Excellent feedback: attempts, elapsed time, hash rate, progress bar, time estimate, educational tips
   - The 3D rotating cube animation adds delight

4. **Save Identity** - Mining complete, user saves
   - Assessment: Clear success state with stats, prominent save button
   - Issue: No explanation that this is permanent/irreversible

**Friction Points**:
- Two clicks required to start mining (generate + start)
- No warning about identity permanence before save
- No option to export/backup seed during creation

**Improvement**: Combine generate + mine into single action; add seed export/backup prompt immediately after identity creation

### Flow: Identity Import

1. **Toggle Import Section** - Click "Import Identity"
   - Assessment: Discoverable via secondary button, good progressive disclosure

2. **Enter Seed** - Paste 64-char hex seed
   - Assessment: Clear format description, password input type hides seed
   - Issue: No validation feedback as user types (only on submit)

3. **Import** - Submit and navigate
   - Assessment: Good success flow with automatic navigation
   - Issue: No PoW required for imported identities (documented limitation)

**Friction Points**:
- No real-time validation (user must submit to see errors)
- No QR code scanning option
- No file import option (only paste)

**Improvement**: Add real-time hex validation; consider QR/file import

### Flow: View Content Decay (web-gateway)

1. **See Heat Indicator** - Various display modes (bar, numeric, icon, time)
   - Assessment: Rich visualization options, clear state labels (Hot, Stable, Needs engagement, Fading)

2. **Understand State** - Icons communicate urgency
   - Assessment: Good use of emoji (fire, sparkles, wind, snowflake, skull)
   - Issue: No actionable guidance on how to "engage" to save content

**Friction Points**:
- Inconsistent HeatIndicator implementations across clients (mobile vs web)
- No "engage now" CTA when content is fading
- Time estimates ("~2h until decay") lack actionability

**Improvement**: Add engagement CTAs directly in decay warnings; unify HeatIndicator across clients

### Flow: Signing Operations (Background)

1. **Load Stored Keypair** - useStoredKeypair hook
   - Assessment: Automatic, transparent to user

2. **Sign Message** - Called during RPC requests
   - Assessment: User doesn't see this, which is good (no friction)
   - Issue: Errors surface as generic "Failed to sign" without recovery steps

**Friction Points**:
- No user feedback during signing (fine for fast ops)
- Error messages don't guide recovery

**Improvement**: Better error messages with recovery steps

## UX Issues

### Critical (Blocking)

1. **No Key Backup/Export UI** (`Identity.tsx`)
   - The `seed()` method exists in WASM but no UI exposes it
   - Users cannot backup their identity
   - Identity loss is permanent with no recovery
   - Impact: Users lose access forever if they clear browser data
   - Location: Missing from `forum-client/src/pages/Identity.tsx`

2. **Identity Deletion Too Easy**
   - Simple `window.confirm()` for deleting identity
   - No seed display/backup required before deletion
   - Impact: Accidental permanent identity loss
   - Location: `Identity.tsx:94-98`

### Major (Frustrating)

1. **Mining Blocks Main Thread** (documented, partially mitigated)
   - Uses setTimeout batching which helps but still causes micro-freezes
   - Impact: 10k-hash batches cause brief UI stutters
   - Location: `usePow.ts:58,103`
   - Note: Web Worker solution planned but not implemented

2. **No Mining Progress Callbacks from WASM**
   - JavaScript has to catch "exceeded" exceptions to track progress
   - Impact: Progress tracking is a workaround, not designed feature
   - Location: `usePow.ts:96-99`

3. **Inconsistent Decay Visualization**
   - `mobile-client/HeatIndicator.tsx` uses different props than `web-gateway/HeatIndicator.tsx`
   - Mobile uses `decayPercentage (0-100)`, web uses `survivalProbability (0.0-1.0)`
   - Impact: Confusion when maintaining multiple clients
   - Location: Compare lines 21 vs 9 in respective files

4. **BigInt Complexity Leaks to UI**
   - Nonces and timestamps are BigInt in TypeScript
   - Impact: Developers must handle BigInt serialization carefully
   - Note: Documented limitation, but causes friction

### Minor (Polish)

1. **No Loading State for WASM Initialization**
   - `useSwimchain().isLoaded` exists but initialization feels instant
   - Impact: Could cause race conditions on slow devices
   - Location: `SwimchainProvider.tsx`

2. **Mining Time Estimates Differ Between Components**
   - `PowProgress.tsx:14` uses 50,000 hash/sec
   - WASM `estimateMiningTime()` uses 500,000 hash/sec
   - Impact: Inconsistent time expectations
   - Location: `PowProgress.tsx:14` vs `pow.rs:425-429`

3. **Address Truncation Not Standardized**
   - `truncateAddress()` shows 6...4 chars (`cs1abc...defg`)
   - Could be more user-friendly with configurable truncation
   - Location: `AddressDisplay.tsx:28-31`

4. **No Haptic Feedback on Mobile**
   - Mining completion doesn't trigger vibration
   - Impact: Missed delight opportunity on mobile

5. **Memory Cleanup Warning Not Enforced**
   - `.free()` requirement documented but easy to forget
   - Impact: Potential memory leaks in client code
   - Location: Throughout hooks like `useStoredKeypair.ts:80`

## Positive UX Elements

1. **Mining Tips System** (`PowProgress.tsx:21-30`)
   - Educational content during mining wait
   - Explains why PoW exists ("defending the network")
   - Reduces perceived wait time

2. **Progress Bar with Probabilistic Estimate** (`PowProgress.tsx:52-53`)
   - Uses expected 2^difficulty attempts for progress
   - Caps at 95% to avoid premature "almost done" feeling

3. **Address Display with Copy** (`AddressDisplay.tsx:82-93`)
   - One-click copy to clipboard
   - Tooltip with full address
   - Accessible aria-label

4. **Clean State Machine for Mining** (`usePow.ts:10`)
   - Clear states: idle, initializing, mining, complete, cancelled, error
   - Each state has appropriate UI treatment

5. **Identity Card Design** (`IdentityCard.tsx`)
   - Visual avatar from address characters
   - Shows PoW difficulty achieved
   - "Verified Identity" badge adds trust

6. **Heat State Labels** (`web-gateway/HeatIndicator.tsx:31-39`)
   - Human-readable: "Hot", "Stable", "Needs engagement", "Fading"
   - Actionable language ("needs engagement")

7. **Protected Content Indicator** (`HeatIndicator.tsx:96,105`)
   - Lock icon for content within 48-hour floor
   - Explains protection status

## Recommendations

### Priority 1: Identity Safety

1. **Add Key Export/Backup UI**
   - Add "Export Seed" button to Identity page
   - Show seed with confirmation checkboxes ("I've saved this", etc.)
   - Consider encrypted backup file option
   - Reference: `Identity.tsx` line ~260

2. **Enhance Identity Deletion Flow**
   - Require typing address or "DELETE" to confirm
   - Show seed one final time with copy button
   - Add 24-hour cooldown option

### Priority 2: Mining Experience

3. **Implement Web Worker Mining**
   - Move mining to dedicated worker thread
   - True non-blocking with progress messages
   - Already planned per feature doc

4. **Add Progress Callback to WASM**
   - Native progress events instead of catching exceptions
   - Would enable smoother progress updates

### Priority 3: Decay Communication

5. **Unify HeatIndicator Props**
   - Standardize on 0.0-1.0 probability across all clients
   - Create shared component in swimchain-react

6. **Add Engagement CTAs**
   - When content is "Fading", show "Engage to Save" button
   - Direct path from decay warning to action

### Priority 4: Developer Experience

7. **Add TypeScript Symbol.dispose**
   - Implement `[Symbol.dispose]` on WASM objects
   - Enables `using` keyword for automatic cleanup
   - Mentioned in feature doc as planned

8. **Standardize Hash Rate Constant**
   - Use single source of truth for hash rate estimate
   - Share between WASM and JS components

## Swimchain-Specific Feedback

### PoW Experience

**Assessment**: Good (8/10)

Strengths:
- Clear progress feedback during mining
- Educational tips reduce frustration
- Cancel option available
- Stats shown after completion

Weaknesses:
- No Web Worker yet (blocks main thread)
- Difficulty 20 takes ~20s on average, borderline too long
- No device calibration for accurate estimates

Recommendation: Implement Web Worker; consider reducing default difficulty to 18 for faster onboarding

### Decay Communication

**Assessment**: Adequate (6/10)

Strengths:
- Visual heat indicators implemented
- Multiple display modes (bar, icon, numeric, time)
- Clear state labels

Weaknesses:
- Inconsistent across clients
- No actionable CTAs when content at risk
- `WasmDecayState.description()` method exists but rarely used in UI

Recommendation: Create design system for decay; use description() method more; add engagement prompts

### Identity UX

**Assessment**: Needs Work (5/10)

Strengths:
- Import functionality exists
- Address display is clean
- PoW validation provides trust signal

Critical Weaknesses:
- **No backup/export UI** - this is the biggest UX gap
- Easy to accidentally delete identity
- No recovery whatsoever
- No warning about permanence during creation

Recommendation: This is the highest priority UX fix - users MUST be able to backup their identity before it becomes their only access to content and reputation

---

*UX Review completed by User Experience Reviewer*
*Review Date: 2026-01-13*
*Reviewed Files: forum-client/src/pages/Identity.tsx, forum-client/src/hooks/usePow.ts, forum-client/src/components/PowProgress.tsx, web-gateway/src/components/HeatIndicator.tsx, mobile-client/src/components/HeatIndicator.tsx, swimchain-wasm feature doc*
