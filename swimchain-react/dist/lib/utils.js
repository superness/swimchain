/**
 * Shared utility functions for Swimchain React SDK
 *
 * @packageDocumentation
 */
/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex) {
    if (hex.length % 2 !== 0) {
        throw new Error('Hex string must have even length');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}
/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
//# sourceMappingURL=utils.js.map