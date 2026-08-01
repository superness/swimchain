import { describe, it, expect } from 'vitest';
import { selectIdentityMode } from './identityMode';
const cfg = (nodeAddress) => ({ rpcEndpoint: 'http://127.0.0.1:9736', rpcAuth: 'Basic x', nodeAddress });
describe('selectIdentityMode', () => {
    it('standalone tab → browser (never node, never pending)', () => {
        expect(selectIdentityMode(null, false)).toBe('browser');
        expect(selectIdentityMode(cfg('cs1abc'), false)).toBe('browser'); // not iframed ⇒ browser regardless of config
    });
    it('embedded, no config yet → pending', () => {
        expect(selectIdentityMode(null, true)).toBe('pending');
    });
    it('embedded with a non-empty nodeAddress → node', () => {
        expect(selectIdentityMode(cfg('cs1abc'), true)).toBe('node');
    });
    it('embedded but nodeAddress empty/absent → browser (config arrived, node has no identity to lend)', () => {
        expect(selectIdentityMode(cfg(''), true)).toBe('browser');
        expect(selectIdentityMode(cfg(undefined), true)).toBe('browser');
    });
});
//# sourceMappingURL=identityMode.test.js.map