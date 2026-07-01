/**
 * Address formatting utilities for Swimchain identities
 *
 * Swimchain uses cs1-prefixed Bech32m addresses (SPEC_01)
 */

/**
 * Validate a Swimchain address
 */
export function isValidAddress(address: string): boolean {
  // Must start with cs1
  if (!address.startsWith('cs1')) {
    return false;
  }

  // Full address is 62 characters
  if (address.length !== 62) {
    return false;
  }

  // Only lowercase alphanumeric (bech32 charset)
  // Excludes 1, b, i, o (ambiguous characters)
  const bech32Charset = /^[023456789acdefghjklmnpqrstuvwxyz]+$/;
  if (!bech32Charset.test(address.slice(3))) {
    return false;
  }

  // TODO: Verify Bech32m checksum
  // For now, basic format check passes

  return true;
}

/**
 * Format address for display
 */
export type AddressFormat = 'full' | 'short' | 'veryShort';

export function formatAddress(address: string, format: AddressFormat = 'short'): string {
  if (!address || address.length < 10) {
    return address;
  }

  switch (format) {
    case 'full':
      return address;
    case 'short':
      // cs1q9x7...2k4m (15 chars)
      return `${address.slice(0, 8)}...${address.slice(-4)}`;
    case 'veryShort':
      // ...2k4m (7 chars)
      return `...${address.slice(-4)}`;
    default:
      return address;
  }
}

/**
 * Parse address from search query
 * Returns the address if query looks like an identity search
 */
export function parseAddressFromQuery(query: string): string | null {
  const trimmed = query.trim().toLowerCase();

  // Full address
  if (trimmed.startsWith('cs1') && trimmed.length >= 20) {
    return trimmed;
  }

  // Partial address (for autocomplete)
  if (trimmed.startsWith('cs1')) {
    return trimmed;
  }

  // author: filter
  const authorMatch = query.match(/(?:author:|from:|by:)(\S+)/i);
  if (authorMatch?.[1]?.startsWith('cs1')) {
    return authorMatch[1];
  }

  return null;
}

/**
 * Generate a deterministic color from an address
 * Used for visual identity indicators
 */
export function addressToColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    const char = address.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Generate HSL color with fixed saturation and lightness for consistency
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

/**
 * Get identicon seed from address
 * For use with identicon libraries
 */
export function addressToSeed(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    const char = address.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Compare addresses (case-insensitive)
 */
export function addressEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Check if address matches partial search
 */
export function addressMatches(address: string, partial: string): boolean {
  const addressLower = address.toLowerCase();
  const partialLower = partial.toLowerCase();

  return addressLower.includes(partialLower);
}
