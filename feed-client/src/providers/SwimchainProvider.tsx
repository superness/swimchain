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
