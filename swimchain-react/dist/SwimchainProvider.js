import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
/**
 * Swimchain React Provider
 *
 * Handles WASM initialization and provides context to child components.
 */
import { createContext, useContext, useEffect, useState, useMemo, } from "react";
import { initWasm, isWasmLoaded } from "@swimchain/core";
const SwimchainContext = createContext({
    isLoaded: false,
    loadError: null,
});
/**
 * Provider component for Swimchain
 *
 * Wraps your app to provide WASM initialization and context.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <SwimchainProvider
 *       fallback={<div>Loading...</div>}
 *       onError={(err) => console.error(err)}
 *     >
 *       <MyApp />
 *     </SwimchainProvider>
 *   );
 * }
 * ```
 */
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
    // Show fallback while loading
    if (!isLoaded && fallback !== undefined) {
        return _jsx(_Fragment, { children: fallback });
    }
    return (_jsx(SwimchainContext.Provider, { value: value, children: children }));
}
/**
 * Hook to access Swimchain context
 *
 * @returns Context value with loading state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isLoaded, loadError } = useSwimchain();
 *
 *   if (loadError) return <div>Error: {loadError.message}</div>;
 *   if (!isLoaded) return <div>Loading...</div>;
 *
 *   return <div>Ready!</div>;
 * }
 * ```
 */
export function useSwimchain() {
    return useContext(SwimchainContext);
}
/**
 * Hook that throws if WASM is not loaded
 *
 * Use this in components that require WASM to function.
 *
 * @throws Error if WASM is not loaded
 */
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