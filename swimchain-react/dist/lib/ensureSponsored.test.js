import { describe, it, expect } from 'vitest';
import { selectClaimableOffer } from './ensureSponsored';
const base = { offer_id: 'aa'.repeat(16), sponsor_pubkey: '11'.repeat(32),
    slots_remaining: 5, requirements: { min_pow_difficulty: 8, application_required: true } };
describe('selectClaimableOffer defcon options', () => {
    it('default behavior still excludes manual offers', () => {
        expect(selectClaimableOffer([{ ...base, auto_approve: false, space_scope: null }], {}))
            .toBeNull();
    });
    it('allowManualOffers admits a manual offer', () => {
        const o = { ...base, auto_approve: false, space_scope: null };
        expect(selectClaimableOffer([o], { allowManualOffers: true })).toBe(o);
    });
    it('requireExactScope rejects a GLOBAL offer even though scopeOk would accept it', () => {
        const global = { ...base, auto_approve: false, space_scope: null };
        const scoped = { ...base, offer_id: 'bb'.repeat(16), auto_approve: false, space_scope: 'cc'.repeat(16) };
        const picked = selectClaimableOffer([global, scoped], { allowManualOffers: true, requireExactScope: true, spaceIdHex: 'cc'.repeat(16) });
        expect(picked?.offer_id).toBe('bb'.repeat(16));
    });
    it('requireExactScope with no matching scoped offer yields null (never falls back to global)', () => {
        const global = { ...base, auto_approve: false, space_scope: null };
        expect(selectClaimableOffer([global], { allowManualOffers: true, requireExactScope: true, spaceIdHex: 'cc'.repeat(16) })).toBeNull();
    });
});
//# sourceMappingURL=ensureSponsored.test.js.map