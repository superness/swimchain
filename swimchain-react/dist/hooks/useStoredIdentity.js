/**
 * Stored Identity Hook for Swimchain
 *
 * Manages identity persistence in localStorage and provides keypair integration.
 *
 * @packageDocumentation
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Keypair } from '@swimchain/core';
import { useSwimchain } from '../SwimchainProvider';
import { hexToBytes, bytesToHex } from '../lib/utils';
// =========================================================================
// Constants
// =========================================================================
const IDENTITY_STORAGE_KEY = 'swimchain-identity';
// =========================================================================
// Hooks
// =========================================================================
/**
 * Hook to manage stored identity in localStorage
 *
 * @example
 * ```tsx
 * const { identity, saveIdentity, clearIdentity, hasIdentity } = useStoredIdentity();
 *
 * if (!hasIdentity) {
 *   // Show identity creation UI
 * }
 * ```
 */
export function useStoredIdentity() {
    const [identity, setIdentity] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                setIdentity(parsed);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load identity');
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    const saveIdentity = useCallback((newIdentity) => {
        try {
            localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(newIdentity));
            setIdentity(newIdentity);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save identity');
        }
    }, []);
    const clearIdentity = useCallback(() => {
        try {
            localStorage.removeItem(IDENTITY_STORAGE_KEY);
            setIdentity(null);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear identity');
        }
    }, []);
    return {
        identity,
        isLoading,
        error,
        saveIdentity,
        clearIdentity,
        hasIdentity: identity !== null,
    };
}
/**
 * Hook to get a WASM Keypair from stored identity
 *
 * Automatically loads the identity from localStorage and creates
 * a Keypair from its seed, enabling cryptographic operations.
 *
 * @example
 * ```tsx
 * const { keypair, publicKeyHex, address, sign } = useStoredKeypair();
 *
 * if (keypair) {
 *   const signature = sign(messageBytes);
 * }
 * ```
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
        if (!wasmLoaded) {
            return;
        }
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
            // Create keypair from seed
            const newKeypair = Keypair.fromSeed(seedBytes);
            keypairRef.current = newKeypair;
            setKeypair(newKeypair);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create keypair');
            setKeypair(null);
        }
    }, [wasmLoaded, identity?.seed]);
    // Sign function
    const sign = useCallback((message) => {
        if (!keypair) {
            return null;
        }
        return keypair.sign(message);
    }, [keypair]);
    // Derived values
    const publicKey = useMemo(() => keypair?.publicKey() ?? null, [keypair]);
    const publicKeyHex = useMemo(() => (publicKey ? bytesToHex(publicKey) : null), [publicKey]);
    const address = useMemo(() => keypair?.address() ?? null, [keypair]);
    return {
        keypair,
        publicKey,
        publicKeyHex,
        address,
        isLoading: !wasmLoaded || identityLoading,
        error,
        sign,
    };
}
/**
 * Create a new identity with a fresh keypair
 *
 * @returns StoredIdentity ready to be saved
 */
export function createNewIdentity(keypair, displayName) {
    const seedBytes = keypair.seed();
    const publicKeyBytes = keypair.publicKey();
    return {
        seed: bytesToHex(seedBytes),
        publicKey: bytesToHex(publicKeyBytes),
        address: keypair.address(),
        createdAt: Date.now(),
        displayName,
    };
}
/**
 * Load identity directly from localStorage (non-hook version)
 * Useful for RPC authentication setup before React renders
 */
export function loadStoredIdentity() {
    try {
        const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    }
    catch {
        // Ignore errors
    }
    return null;
}
//# sourceMappingURL=useStoredIdentity.js.map