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

// ============================================================================
// Bech32m encode/decode (BIP-350) — minimal, dependency-free implementation.
// Swimchain addresses: HRP "cs", data = [version(0), 32-byte payload] (SPEC_01)
// ============================================================================

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) {
        chk ^= GEN[i]!;
      }
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(
  data: number[],
  fromBits: number,
  toBits: number,
  pad: boolean
): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || (acc << (toBits - bits)) & maxv) {
    return null;
  }
  return out;
}

/** Decode a bech32m string. Returns null on any error. */
function bech32mDecode(str: string): { hrp: string; data: number[] } | null {
  const lower = str.toLowerCase();
  if (str !== lower && str !== str.toUpperCase()) return null;
  const pos = lower.lastIndexOf('1');
  if (pos < 1 || pos + 7 > lower.length) return null;
  const hrp = lower.slice(0, pos);
  const data: number[] = [];
  for (const c of lower.slice(pos + 1)) {
    const idx = BECH32_CHARSET.indexOf(c);
    if (idx === -1) return null;
    data.push(idx);
  }
  if (bech32Polymod([...bech32HrpExpand(hrp), ...data]) !== BECH32M_CONST) {
    return null;
  }
  return { hrp, data: data.slice(0, -6) };
}

/** Encode data (5-bit groups) as bech32m. */
function bech32mEncode(hrp: string, data: number[]): string {
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >>> (5 * (5 - i))) & 31);
  }
  return `${hrp}1${[...data, ...checksum].map(d => BECH32_CHARSET[d]).join('')}`;
}

/**
 * Decode a cs1 identity address to a 64-char hex public key / identity ID.
 * Returns null if the address is invalid.
 */
export function addressToHex(address: string): string | null {
  const decoded = bech32mDecode(address);
  if (!decoded || decoded.hrp !== 'cs') return null;
  const bytes = convertBits(decoded.data, 5, 8, false);
  // [version(0), 32-byte payload]
  if (!bytes || bytes.length !== 33 || bytes[0] !== 0) return null;
  return bytes
    .slice(1)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encode a 64-char hex public key / identity ID as a cs1 address.
 * Returns null if the hex is invalid.
 */
export function hexToAddress(hex: string): string | null {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const bytes: number[] = [0]; // version byte
  for (let i = 0; i < 64; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  const data = convertBits(bytes, 8, 5, true);
  if (!data) return null;
  return bech32mEncode('cs', data);
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
