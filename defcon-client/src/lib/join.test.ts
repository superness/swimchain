import { describe, it, expect } from 'vitest';
import { pickGlobalOffer } from './join';

const base = {
  offer_id: 'aa'.repeat(16),
  sponsor_pubkey: '11'.repeat(32),
  auto_approve: false,
  slots_remaining: 5,
  requirements: { min_pow_difficulty: 8, application_required: true },
};

describe('pickGlobalOffer', () => {
  it('picks the unscoped offer, never the scoped one', () => {
    const scoped = { ...base, offer_id: 'bb'.repeat(16), space_scope: 'cc'.repeat(16) };
    const global = { ...base, space_scope: null };
    expect(pickGlobalOffer([scoped, global], '11'.repeat(32))?.offer_id).toBe('aa'.repeat(16));
    expect(pickGlobalOffer([scoped], '11'.repeat(32))).toBeNull();
  });
});
