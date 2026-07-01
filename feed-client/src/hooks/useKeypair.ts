/**
 * Local useKeypair hook using local WASM
 * Replaces @swimchain/react's useKeypair to avoid WASM loading issues
 */

import { useState, useCallback } from 'react';
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

  const generate = useCallback(() => {
    if (!isLoaded) {
      console.error('[useKeypair] WASM not loaded');
      return;
    }

    try {
      // Free old keypair if exists
      keypair?.free();

      // Generate new keypair
      const newKeypair = new WasmKeypair();
      const newAddress = encode_address(newKeypair.publicKey());

      setKeypair(newKeypair);
      setAddress(newAddress);
    } catch (err) {
      console.error('[useKeypair] Failed to generate keypair:', err);
    }
  }, [isLoaded, keypair]);

  const clear = useCallback(() => {
    keypair?.free();
    setKeypair(null);
    setAddress(null);
  }, [keypair]);

  return {
    keypair,
    address,
    generate,
    clear,
  };
}
