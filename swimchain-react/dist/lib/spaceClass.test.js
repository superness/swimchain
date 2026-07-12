import { describe, it, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { SpaceClass, applyClass, classOf } from './spaceClass';
import { getProfileSpaceId } from './profile';
describe('spaceClass', () => {
    it('applyClass sets byte 0 and keeps 15 hash bytes', () => {
        const h = sha256(new TextEncoder().encode('x'));
        const id = applyClass(SpaceClass.Dm, h);
        expect(id.slice(0, 2)).toBe('03');
        expect(id.length).toBe(32);
        expect(classOf(id)).toBe(SpaceClass.Dm);
    });
    it('getProfileSpaceId carries the profile class byte', () => {
        const id = getProfileSpaceId('deadbeef');
        expect(id.slice(0, 2)).toBe('02');
        expect(classOf(id)).toBe(SpaceClass.Profile);
    });
    it('classOf returns null for unknown byte', () => {
        expect(classOf('00'.repeat(16))).toBeNull();
    });
});
//# sourceMappingURL=spaceClass.test.js.map