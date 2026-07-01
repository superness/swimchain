/**
 * Local Swimchain Provider
 * Uses local WASM loader to avoid Vite path resolution issues
 *
 * NOTE: We do NOT use PackageSwimchainProvider because it tries to load
 * WASM from @swimchain/core which has path issues with Vite.
 * Instead, we load WASM locally and provide our own context.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { initWasm, isWasmLoaded } from "../wasm/loader";

export interface SwimchainContextValue {
  isLoaded: boolean;
  loadError: Error | null;
}

const SwimchainContext = createContext<SwimchainContextValue>({
  isLoaded: false,
  loadError: null,
});

export interface SwimchainProviderProps {
  children: ReactNode;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  fallback?: ReactNode;
}

export function SwimchainProvider({
  children,
  onLoad,
  onError,
  fallback,
}: SwimchainProviderProps): JSX.Element {
  // Check both local and global state to handle HMR correctly
  // @ts-expect-error - Using global for HMR persistence
  const wasAlreadyLoaded = isWasmLoaded() || globalThis.__swimchain_wasm_initialized === true;
  const [isLoaded, setIsLoaded] = useState(wasAlreadyLoaded);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Use refs for callbacks to avoid re-initialization on callback changes
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
  }, [onLoad, onError]);

  useEffect(() => {
    if (isLoaded) {
      onLoadRef.current?.();
      return;
    }

    let cancelled = false;

    initWasm()
      .then(() => {
        if (!cancelled) {
          setIsLoaded(true);
          onLoadRef.current?.();
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          setLoadError(error);
          onErrorRef.current?.(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  const value = useMemo<SwimchainContextValue>(
    () => ({
      isLoaded,
      loadError,
    }),
    [isLoaded, loadError]
  );

  if (!isLoaded && fallback !== undefined) {
    return <>{fallback}</>;
  }

  // Provide only local context - we load WASM ourselves
  return (
    <SwimchainContext.Provider value={value}>
      {children}
    </SwimchainContext.Provider>
  );
}

export function useSwimchain(): SwimchainContextValue {
  return useContext(SwimchainContext);
}

export function useRequireSwimchain(): void {
  const { isLoaded, loadError } = useSwimchain();

  if (loadError) {
    throw loadError;
  }

  if (!isLoaded) {
    throw new Error("Swimchain WASM not loaded yet");
  }
}
