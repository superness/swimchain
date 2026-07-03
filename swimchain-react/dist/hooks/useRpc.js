import { jsx as _jsx } from "react/jsx-runtime";
/**
 * React hooks for Swimchain RPC integration
 *
 * Provides RpcProvider context and connection management hooks.
 *
 * @packageDocumentation
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, } from 'react';
import { SwimchainRpc, LOCAL_TESTNET, TESTNET_SEED_SF, } from '../lib/rpc';
const RpcContext = createContext(null);
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
export function RpcProvider({ children, config, useRemoteSeed = false, signatureAuth, autoConnect = true, retryInterval = 5000, }) {
    const [rpc, setRpc] = useState(null);
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState(null);
    const [nodeInfo, setNodeInfo] = useState(null);
    const retryIntervalRef = useRef(null);
    const authRef = useRef(signatureAuth ?? null);
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (retryIntervalRef.current) {
                clearInterval(retryIntervalRef.current);
            }
        };
    }, []);
    const connect = useCallback(async (cfg) => {
        setConnecting(true);
        setError(null);
        try {
            const client = new SwimchainRpc(cfg);
            // Apply signature auth if available
            if (authRef.current) {
                client.setSignatureAuth(authRef.current);
            }
            const success = await client.connect();
            if (success) {
                const info = client.getNodeInfo();
                setRpc(client);
                setConnected(true);
                setNodeInfo(info
                    ? {
                        version: info.version,
                        network: info.network,
                        peerCount: info.peer_count,
                    }
                    : null);
                return true;
            }
            else {
                setError('Failed to connect to node');
                return false;
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            return false;
        }
        finally {
            setConnecting(false);
        }
    }, []);
    const disconnect = useCallback(() => {
        if (retryIntervalRef.current) {
            clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
        }
        setRpc(null);
        setConnected(false);
        setNodeInfo(null);
    }, []);
    const setAuth = useCallback((auth) => {
        authRef.current = auth;
        if (rpc) {
            rpc.setSignatureAuth(auth);
        }
    }, [rpc]);
    // Auto-connect effect
    useEffect(() => {
        if (!autoConnect)
            return;
        const effectiveConfig = config ?? (useRemoteSeed ? TESTNET_SEED_SF : LOCAL_TESTNET);
        const doConnect = async () => {
            const success = await connect(effectiveConfig);
            if (!success && retryInterval > 0) {
                // Start retry loop
                retryIntervalRef.current = setInterval(async () => {
                    const retrySuccess = await connect(effectiveConfig);
                    if (retrySuccess && retryIntervalRef.current) {
                        clearInterval(retryIntervalRef.current);
                        retryIntervalRef.current = null;
                    }
                }, retryInterval);
            }
        };
        doConnect();
        return () => {
            if (retryIntervalRef.current) {
                clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = null;
            }
        };
    }, [autoConnect, config, useRemoteSeed, connect, retryInterval]);
    // Update auth when signatureAuth prop changes
    useEffect(() => {
        if (signatureAuth !== undefined) {
            setAuth(signatureAuth ?? null);
        }
    }, [signatureAuth, setAuth]);
    return (_jsx(RpcContext.Provider, { value: {
            rpc,
            connected,
            connecting,
            error,
            nodeInfo,
            connect,
            disconnect,
            setAuth,
        }, children: children }));
}
// =========================================================================
// Hooks
// =========================================================================
/**
 * Hook to access RPC context
 *
 * @throws Error if used outside RpcProvider
 */
export function useRpc() {
    const context = useContext(RpcContext);
    if (!context) {
        throw new Error('useRpc must be used within RpcProvider');
    }
    return context;
}
/**
 * Hook to fetch sync status
 */
export function useSyncStatus(pollIntervalMs = 10000) {
    const { rpc, connected } = useRpc();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const refetch = useCallback(async () => {
        if (!rpc || !connected) {
            setStatus(null);
            setLoading(false);
            return;
        }
        try {
            const syncStatus = await rpc.getSyncStatus();
            setStatus(syncStatus);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch status');
        }
        finally {
            setLoading(false);
        }
    }, [rpc, connected]);
    useEffect(() => {
        refetch();
        if (pollIntervalMs > 0 && connected) {
            const interval = setInterval(refetch, pollIntervalMs);
            return () => clearInterval(interval);
        }
        return undefined;
    }, [refetch, pollIntervalMs, connected]);
    return { status, loading, error, refetch };
}
/**
 * Hook to fetch peer list
 */
export function usePeers() {
    const { rpc, connected } = useRpc();
    const [peers, setPeers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const refetch = useCallback(async () => {
        if (!rpc || !connected) {
            setPeers([]);
            setLoading(false);
            return;
        }
        try {
            const result = await rpc.getPeers();
            setPeers(result);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch peers');
        }
        finally {
            setLoading(false);
        }
    }, [rpc, connected]);
    useEffect(() => {
        refetch();
    }, [refetch]);
    return { peers, loading, error, refetch };
}
//# sourceMappingURL=useRpc.js.map