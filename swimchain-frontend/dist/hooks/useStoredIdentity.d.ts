/**
 * Hook for managing stored identity in localStorage
 */
import type { StoredIdentity } from '../types';
interface UseStoredIdentityResult {
    identity: StoredIdentity | null;
    setIdentity: (identity: StoredIdentity) => void;
    clearIdentity: () => void;
    isLoading: boolean;
}
export declare function useStoredIdentity(): UseStoredIdentityResult;
export {};
//# sourceMappingURL=useStoredIdentity.d.ts.map