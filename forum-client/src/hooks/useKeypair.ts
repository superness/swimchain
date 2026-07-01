/**
 * Local useKeypair hook using local WASM
 * Replaces @swimchain/react's useKeypair to avoid WASM loading issues
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { WasmKeypair, encode_address } from '../wasm/loader';
import { useSwimchain } from '../providers/SwimchainProvider';

export interface UseKeypairResult {
  keypair: WasmKeypair | null;
  address: string | null;
  generate: () => void;
  clear: () => void;
}

export function useKeypair(): UseKeypairResult {
  const { isLoaded } = useSwimchain();
  const [keypair, setKeypair] = useState<WasmKeypair | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  // Use ref for cleanup to avoid stale closure issues
  const keypairRef = useRef<WasmKeypair | null>(null);

  // Cleanup keypair on unmount
  useEffect(() => {
    return () => {
      keypairRef.current?.free();
    };
  }, []);

  const generate = useCallback(() => {
    if (!isLoaded) {
      console.error('[useKeypair] WASM not loaded');
      return;
    }

    try {
      // Free old keypair using ref (avoids stale closure)
      keypairRef.current?.free();

      // Generate new keypair
      const newKeypair = new WasmKeypair();
      const newAddress = encode_address(newKeypair.publicKey());

      keypairRef.current = newKeypair;
      setKeypair(newKeypair);
      setAddress(newAddress);
    } catch (err) {
      console.error('[useKeypair] Failed to generate keypair:', err);
    }
  }, [isLoaded]);

  const clear = useCallback(() => {
    keypairRef.current?.free();
    keypairRef.current = null;
    setKeypair(null);
    setAddress(null);
  }, []);

  return {
    keypair,
    address,
    generate,
    clear,
  };
}
