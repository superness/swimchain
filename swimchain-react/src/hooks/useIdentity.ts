/**
 * React hooks for identity management
 *
 * Provides hooks for keypair generation, address handling, and signatures.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Keypair,
  encodeAddress,
  decodeAddress,
  verifySignature,
  isValidAddress,
  type AddressValidation,
} from "@swimchain/core";
import { useSwimchain } from "../SwimchainProvider";

/**
 * Hook for managing a keypair
 *
 * @returns Keypair management functions and state
 *
 * @example
 * ```tsx
 * function IdentityManager() {
 *   const { keypair, address, generate, sign } = useKeypair();
 *
 *   return (
 *     <div>
 *       <button onClick={generate}>Generate New Identity</button>
 *       {address && <p>Address: {address}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useKeypair(): {
  keypair: Keypair | null;
  publicKey: Uint8Array | null;
  address: string | null;
  generate: () => void;
  sign: (message: Uint8Array) => Uint8Array | null;
  clear: () => void;
} {
  const { isLoaded } = useSwimchain();
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const keypairRef = useRef<Keypair | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      keypairRef.current?.free();
    };
  }, []);

  const generate = useCallback(() => {
    if (!isLoaded) return;

    // Free previous keypair
    keypairRef.current?.free();

    const newKeypair = new Keypair();
    keypairRef.current = newKeypair;
    setKeypair(newKeypair);
  }, [isLoaded]);

  const sign = useCallback(
    (message: Uint8Array): Uint8Array | null => {
      if (!keypair) return null;
      return keypair.sign(message);
    },
    [keypair]
  );

  const clear = useCallback(() => {
    keypairRef.current?.free();
    keypairRef.current = null;
    setKeypair(null);
  }, []);

  const publicKey = useMemo(() => keypair?.publicKey() ?? null, [keypair]);
  const address = useMemo(() => keypair?.address() ?? null, [keypair]);

  return {
    keypair,
    publicKey,
    address,
    generate,
    sign,
    clear,
  };
}

/**
 * Hook for validating an address
 *
 * @param address - Address string to validate
 * @returns Validation result
 *
 * @example
 * ```tsx
 * function AddressInput() {
 *   const [input, setInput] = useState('');
 *   const validation = useAddressValidation(input);
 *
 *   return (
 *     <div>
 *       <input value={input} onChange={e => setInput(e.target.value)} />
 *       {!validation.valid && <span className="error">{validation.error}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAddressValidation(address: string): AddressValidation {
  const { isLoaded } = useSwimchain();

  return useMemo((): AddressValidation => {
    if (!isLoaded) {
      return { valid: false, error: "WASM not loaded" };
    }

    if (!address) {
      return { valid: false, error: "Address required" };
    }

    try {
      const publicKey = decodeAddress(address);
      return { valid: true, publicKey };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isLoaded, address]);
}

/**
 * Hook for encoding a public key to address
 *
 * @param publicKey - 32-byte public key
 * @returns Encoded address or null
 */
export function useEncodeAddress(publicKey: Uint8Array | null): string | null {
  const { isLoaded } = useSwimchain();

  return useMemo(() => {
    if (!isLoaded || !publicKey) return null;
    try {
      return encodeAddress(publicKey);
    } catch {
      return null;
    }
  }, [isLoaded, publicKey]);
}

/**
 * Hook for decoding an address to public key
 *
 * @param address - Address string
 * @returns Public key or null
 */
export function useDecodeAddress(address: string | null): Uint8Array | null {
  const { isLoaded } = useSwimchain();

  return useMemo(() => {
    if (!isLoaded || !address) return null;
    try {
      return decodeAddress(address);
    } catch {
      return null;
    }
  }, [isLoaded, address]);
}

/**
 * Hook for verifying a signature
 *
 * @param publicKey - 32-byte public key
 * @param message - Original message
 * @param signature - 64-byte signature
 * @returns true if signature is valid
 */
export function useVerifySignature(
  publicKey: Uint8Array | null,
  message: Uint8Array | null,
  signature: Uint8Array | null
): boolean {
  const { isLoaded } = useSwimchain();

  return useMemo(() => {
    if (!isLoaded || !publicKey || !message || !signature) return false;
    return verifySignature(publicKey, message, signature);
  }, [isLoaded, publicKey, message, signature]);
}

/**
 * Hook for checking if an address is valid
 *
 * @param address - Address string
 * @returns true if address is valid
 */
export function useIsValidAddress(address: string): boolean {
  const { isLoaded } = useSwimchain();

  return useMemo(() => {
    if (!isLoaded || !address) return false;
    return isValidAddress(address);
  }, [isLoaded, address]);
}
