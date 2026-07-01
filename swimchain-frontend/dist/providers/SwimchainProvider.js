import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
/**
 * Local Swimchain Provider
 * Uses local WASM loader to avoid Vite path resolution issues
 *
 * NOTE: We do NOT use PackageSwimchainProvider because it tries to load
 * WASM from @swimchain/core which has path issues with Vite.
 * Instead, we load WASM locally and provide our own context.
 */
import { createContext, useContext, useEffect, useState, useMemo, } from "react";
import { initWasm, isWasmLoaded } from "../wasm/loader";
const SwimchainContext = createContext({
    isLoaded: false,
    loadError: null,
});
export function SwimchainProvider({ children, onLoad, onError, fallback, }) {
    const [isLoaded, setIsLoaded] = useState(isWasmLoaded());
    const [loadError, setLoadError] = useState(null);
    useEffect(() => {
        if (isLoaded) {
            onLoad?.();
            return;
        }
        let cancelled = false;
        initWasm()
            .then(() => {
            if (!cancelled) {
                setIsLoaded(true);
                onLoad?.();
            }
        })
            .catch((err) => {
            if (!cancelled) {
                const error = err instanceof Error ? err : new Error(String(err));
                setLoadError(error);
                onError?.(error);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [isLoaded, onLoad, onError]);
    const value = useMemo(() => ({
        isLoaded,
        loadError,
    }), [isLoaded, loadError]);
    if (!isLoaded && fallback !== undefined) {
        return _jsx(_Fragment, { children: fallback });
    }
    // Provide only local context - we load WASM ourselves
    return (_jsx(SwimchainContext.Provider, { value: value, children: children }));
}
export function useSwimchain() {
    return useContext(SwimchainContext);
}
export function useRequireSwimchain() {
    const { isLoaded, loadError } = useSwimchain();
    if (loadError) {
        throw loadError;
    }
    if (!isLoaded) {
        throw new Error("Swimchain WASM not loaded yet");
    }
}
//# sourceMappingURL=SwimchainProvider.js.map