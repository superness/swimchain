/**
 * Local useKeypair hook using local WASM
 * Replaces @swimchain/react's useKeypair to avoid WASM loading issues
 */
import { useState, useCallback } from 'react';
import { WasmKeypair, encode_address } from '../wasm/loader';
import { useSwimchain } from '../providers/SwimchainProvider';
export function useKeypair() {
    const { isLoaded } = useSwimchain();
    const [keypair, setKeypair] = useState(null);
    const [address, setAddress] = useState(null);
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
        }
        catch (err) {
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
//# sourceMappingURL=useKeypair.js.map