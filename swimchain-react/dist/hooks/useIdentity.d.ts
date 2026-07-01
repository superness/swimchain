/**
 * React hooks for identity management
 *
 * Provides hooks for keypair generation, address handling, and signatures.
 */
import { Keypair, type AddressValidation } from "@swimchain/core";
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
export declare function useKeypair(): {
    keypair: Keypair | null;
    publicKey: Uint8Array | null;
    address: string | null;
    generate: () => void;
    sign: (message: Uint8Array) => Uint8Array | null;
    clear: () => void;
};
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
export declare function useAddressValidation(address: string): AddressValidation;
/**
 * Hook for encoding a public key to address
 *
 * @param publicKey - 32-byte public key
 * @returns Encoded address or null
 */
export declare function useEncodeAddress(publicKey: Uint8Array | null): string | null;
/**
 * Hook for decoding an address to public key
 *
 * @param address - Address string
 * @returns Public key or null
 */
export declare function useDecodeAddress(address: string | null): Uint8Array | null;
/**
 * Hook for verifying a signature
 *
 * @param publicKey - 32-byte public key
 * @param message - Original message
 * @param signature - 64-byte signature
 * @returns true if signature is valid
 */
export declare function useVerifySignature(publicKey: Uint8Array | null, message: Uint8Array | null, signature: Uint8Array | null): boolean;
/**
 * Hook for checking if an address is valid
 *
 * @param address - Address string
 * @returns true if address is valid
 */
export declare function useIsValidAddress(address: string): boolean;
//# sourceMappingURL=useIdentity.d.ts.map