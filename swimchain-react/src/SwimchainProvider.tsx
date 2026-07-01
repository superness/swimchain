/**
 * Swimchain React Provider
 *
 * Handles WASM initialization and provides context to child components.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { initWasm, isWasmLoaded } from "@swimchain/core";

/**
 * Context value for Swimchain provider
 */
export interface SwimchainContextValue {
  /** Whether WASM is loaded and ready */
  isLoaded: boolean;
  /** Error that occurred during loading, if any */
  loadError: Error | null;
}

const SwimchainContext = createContext<SwimchainContextValue>({
  isLoaded: false,
  loadError: null,
});

/**
 * Props for SwimchainProvider
 */
export interface SwimchainProviderProps {
  /** Child components */
  children: ReactNode;
  /** Called when WASM is loaded successfully */
  onLoad?: () => void;
  /** Called when WASM loading fails */
  onError?: (error: Error) => void;
  /** Loading fallback component */
  fallback?: ReactNode;
}

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
export function SwimchainProvider({
  children,
  onLoad,
  onError,
  fallback,
}: SwimchainProviderProps): JSX.Element {
  const [isLoaded, setIsLoaded] = useState(isWasmLoaded());
  const [loadError, setLoadError] = useState<Error | null>(null);

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

  const value = useMemo<SwimchainContextValue>(
    () => ({
      isLoaded,
      loadError,
    }),
    [isLoaded, loadError]
  );

  // Show fallback while loading
  if (!isLoaded && fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <SwimchainContext.Provider value={value}>
      {children}
    </SwimchainContext.Provider>
  );
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
export function useSwimchain(): SwimchainContextValue {
  return useContext(SwimchainContext);
}

/**
 * Hook that throws if WASM is not loaded
 *
 * Use this in components that require WASM to function.
 *
 * @throws Error if WASM is not loaded
 */
export function useRequireSwimchain(): void {
  const { isLoaded, loadError } = useSwimchain();

  if (loadError) {
    throw loadError;
  }

  if (!isLoaded) {
    throw new Error("Swimchain WASM not loaded yet");
  }
}
