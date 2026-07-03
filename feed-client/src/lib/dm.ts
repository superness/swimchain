/**
 * Direct Message (DM) utilities
 *
 * Deterministic DM space ID generation, matching forum-client/src/lib/dm.ts.
 * DMs are private spaces with exactly 2 members; both parties derive the
 * same space ID from the pair of public keys.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from './x25519';

/**
 * Generate a deterministic DM space ID from two public keys.
 *
 * 1. Sort the two public keys lexicographically
 * 2. Hash: SHA256("dm:v1:" + pk1 + ":" + pk2)
 * 3. Take the first 16 bytes (matches space ID size)
 */
export function getDMSpaceId(myPk: string, theirPk: string): string {
  const sorted = [myPk.toLowerCase(), theirPk.toLowerCase()].sort();
  const preimage = `dm:v1:${sorted[0]}:${sorted[1]}`;
  const hash = sha256(new TextEncoder().encode(preimage));
  return bytesToHex(hash.slice(0, 16));
}

/** Truncate a key/address for display */
export function truncateKey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

/**
 * Generate a default DM space name from two public keys.
 * Format: "abc123...def0 <> 456789...fedc"
 */
export function getDMSpaceName(myPk: string, theirPk: string): string {
  return `${truncateKey(myPk)} <> ${truncateKey(theirPk)}`;
}
