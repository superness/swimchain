/**
 * Local Swimchain Provider
 * Uses local WASM loader to avoid Vite path resolution issues
 *
 * NOTE: We do NOT use PackageSwimchainProvider because it tries to load
 * WASM from @swimchain/core which has path issues with Vite.
 * Instead, we load WASM locally and provide our own context.
 */
import { type ReactNode } from "react";
export interface SwimchainContextValue {
    isLoaded: boolean;
    loadError: Error | null;
}
export interface SwimchainProviderProps {
    children: ReactNode;
    onLoad?: () => void;
    onError?: (error: Error) => void;
    fallback?: ReactNode;
}
export declare function SwimchainProvider({ children, onLoad, onError, fallback, }: SwimchainProviderProps): JSX.Element;
export declare function useSwimchain(): SwimchainContextValue;
export declare function useRequireSwimchain(): void;
//# sourceMappingURL=SwimchainProvider.d.ts.map