/**
 * SwimChain Client Utilities
 *
 * Helper functions for hex/bytes conversion, hashing, etc.
 */

import { createSHA256 } from 'hash-wasm';

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2);
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
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hasher = await createSHA256();
  hasher.update(data);
  return hasher.digest('binary');
}

/**
 * Compute SHA-256 hash of a string
 */
export async function sha256String(str: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(str));
}

/**
 * Compute SHA-256 hash and return as hex
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  return bytesToHex(await sha256(data));
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Current timestamp in Unix seconds
 */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Format a Unix timestamp for display
 */
export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

/**
 * Calculate time ago in human-readable form
 */
export function timeAgo(ts: number): string {
  const seconds = nowSeconds() - ts;
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Truncate an address for display (cs1abc...xyz)
 */
export function truncateAddress(address: string, startLen = 8, endLen = 6): string {
  if (address.length <= startLen + endLen + 3) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    const randomBuffer = nodeCrypto.randomBytes(length);
    bytes.set(new Uint8Array(randomBuffer));
  }
  return bytes;
}
