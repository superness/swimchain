/**
 * Hook that bridges stored identity (localStorage) with WASM Keypair
 *
 * The `useKeypair` hook from @swimchain/react creates fresh in-memory keypairs.
 * This hook loads the stored identity's seed from localStorage and creates
 * a Keypair from it, enabling PoW mining and signing with the persisted identity.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { WasmKeypair } from '../wasm/loader';
import { useSwimchain } from '../providers/SwimchainProvider';
import { useStoredIdentity } from './useStoredIdentity';
/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
/**
 * Hook to get a WASM Keypair from the stored identity
 *
 * This automatically loads the identity from localStorage and creates
 * a Keypair from its seed, enabling cryptographic operations.
 */
export function useStoredKeypair() {
    const { isLoaded: wasmLoaded } = useSwimchain();
    const { identity, isLoading: identityLoading } = useStoredIdentity();
    const [keypair, setKeypair] = useState(null);
    const [error, setError] = useState(null);
    const keypairRef = useRef(null);
    // Cleanup keypair on unmount
    useEffect(() => {
        return () => {
            keypairRef.current?.free();
        };
    }, []);
    // Create keypair when identity is available
    useEffect(() => {
        // Can't create keypair without WASM
        if (!wasmLoaded) {
            return;
        }
        // No identity stored
        if (!identity?.seed) {
            setKeypair(null);
            setError(null);
            return;
        }
        try {
            // Free previous keypair
            keypairRef.current?.free();
            // Convert hex seed to bytes
            const seedBytes = hexToBytes(identity.seed);
            if (seedBytes.length !== 32) {
                throw new Error(`Invalid seed length: ${seedBytes.length} (expected 32)`);
            }
            // Create keypair from seed using WASM
            const newKeypair = WasmKeypair.fromSeed(seedBytes);
            keypairRef.current = newKeypair;
            setKeypair(newKeypair);
            setError(null);
            console.log('[useStoredKeypair] Created keypair from stored identity');
        }
        catch (err) {
            console.error('[useStoredKeypair] Failed to create keypair:', err);
            setError(err instanceof Error ? err.message : 'Failed to create keypair');
            setKeypair(null);
        }
    }, [wasmLoaded, identity?.seed]);
    // Sign function
    const sign = useCallback((message) => {
        if (!keypair) {
            console.warn('[useStoredKeypair] Cannot sign - no keypair');
            return null;
        }
        return keypair.sign(message);
    }, [keypair]);
    // Derived values
    const publicKey = useMemo(() => keypair?.publicKey() ?? null, [keypair]);
    const address = useMemo(() => keypair?.address() ?? null, [keypair]);
    return {
        keypair,
        publicKey,
        address,
        isLoading: !wasmLoaded || identityLoading,
        error,
        sign,
    };
}
//# sourceMappingURL=useStoredKeypair.js.map