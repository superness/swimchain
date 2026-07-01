/**
 * Identity context provider - manages identity state globally
 * Redirects to identity creation if no valid identity exists
 */
import { type ReactNode } from 'react';
import type { StoredIdentity } from '../types';
interface IdentityContextValue {
    identity: StoredIdentity | null;
    isLoading: boolean;
    hasValidIdentity: boolean;
    setIdentity: (identity: StoredIdentity) => void;
    clearIdentity: () => void;
}
export declare function useIdentityContext(): IdentityContextValue;
interface IdentityProviderProps {
    children: ReactNode;
}
export declare function IdentityProvider({ children }: IdentityProviderProps): JSX.Element;
export {};
//# sourceMappingURL=IdentityProvider.d.ts.map