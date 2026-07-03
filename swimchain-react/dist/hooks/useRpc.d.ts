/**
 * React hooks for Swimchain RPC integration
 *
 * Provides RpcProvider context and connection management hooks.
 *
 * @packageDocumentation
 */
import { type ReactNode } from 'react';
import { SwimchainRpc, RpcConfig, type SignatureAuth, type SyncStatus } from '../lib/rpc';
export interface RpcContextValue {
    /** The RPC client instance */
    rpc: SwimchainRpc | null;
    /** Whether connected to the node */
    connected: boolean;
    /** Whether currently connecting */
    connecting: boolean;
    /** Connection error message */
    error: string | null;
    /** Node information after connection */
    nodeInfo: {
        version: string;
        network: string;
        peerCount: number;
    } | null;
    /** Connect to a node */
    connect: (config: RpcConfig) => Promise<boolean>;
    /** Disconnect from node */
    disconnect: () => void;
    /** Set signature authentication */
    setAuth: (auth: SignatureAuth | null) => void;
}
export interface RpcProviderProps {
    children: ReactNode;
    /** Initial RPC config (default: LOCAL_TESTNET) */
    config?: RpcConfig;
    /** Use remote seed instead of local node */
    useRemoteSeed?: boolean;
    /** Signature auth to use (can also be set later via setAuth) */
    signatureAuth?: SignatureAuth;
    /** Auto-connect on mount */
    autoConnect?: boolean;
    /** Retry interval in ms (default: 5000) */
    retryInterval?: number;
}
/**
 * RPC Provider component
 *
 * @example
 * ```tsx
 * <RpcProvider autoConnect>
 *   <App />
 * </RpcProvider>
 * ```
 */
export declare function RpcProvider({ children, config, useRemoteSeed, signatureAuth, autoConnect, retryInterval, }: RpcProviderProps): import("react").JSX.Element;
/**
 * Hook to access RPC context
 *
 * @throws Error if used outside RpcProvider
 */
export declare function useRpc(): RpcContextValue;
/**
 * Hook to fetch sync status
 */
export declare function useSyncStatus(pollIntervalMs?: number): {
    status: SyncStatus | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
};
/**
 * Hook to fetch peer list
 */
export declare function usePeers(): {
    peers: Array<{
        peer_id: string;
        address: string;
        direction: string;
    }>;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
};
//# sourceMappingURL=useRpc.d.ts.map