/**
 * Swimchain React Provider
 *
 * Handles WASM initialization and provides context to child components.
 */
import { type ReactNode } from "react";
/**
 * Context value for Swimchain provider
 */
export interface SwimchainContextValue {
    /** Whether WASM is loaded and ready */
    isLoaded: boolean;
    /** Error that occurred during loading, if any */
    loadError: Error | null;
}
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
export declare function SwimchainProvider({ children, onLoad, onError, fallback, }: SwimchainProviderProps): JSX.Element;
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
export declare function useSwimchain(): SwimchainContextValue;
/**
 * Hook that throws if WASM is not loaded
 *
 * Use this in components that require WASM to function.
 *
 * @throws Error if WASM is not loaded
 */
export declare function useRequireSwimchain(): void;
//# sourceMappingURL=SwimchainProvider.d.ts.map