/**
 * Direct Message (DM) Utilities
 *
 * Provides deterministic DM space ID generation and DM-specific helpers.
 * DMs are just private spaces with exactly 2 members.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from './x25519';

/**
 * Generate a deterministic DM space ID from two public keys.
 *
 * The space ID is derived by:
 * 1. Sorting the two public keys lexicographically
 * 2. Hashing: SHA256("dm:v1:" + pk1 + ":" + pk2)
 * 3. Taking the first 16 bytes (matches space ID size)
 *
 * This ensures both parties compute the same space ID.
 */
export function getDMSpaceId(myPk: string, theirPk: string): string {
  // Sort public keys to ensure deterministic ordering
  const sorted = [myPk.toLowerCase(), theirPk.toLowerCase()].sort();

  // Create the preimage
  const preimage = `dm:v1:${sorted[0]}:${sorted[1]}`;

  // Hash with SHA256
  const hash = sha256(new TextEncoder().encode(preimage));

  // Take first 16 bytes (128 bits) for space ID
  return bytesToHex(hash.slice(0, 16));
}

/**
 * Check if a space ID is a DM space between two users.
 */
export function isDMSpace(spaceId: string, pk1: string, pk2: string): boolean {
  const expectedId = getDMSpaceId(pk1, pk2);
  return spaceId.toLowerCase() === expectedId.toLowerCase();
}

/**
 * Generate a default DM space name from two addresses.
 * Format: "Alice <> Bob" using truncated addresses.
 */
export function getDMSpaceName(myPk: string, theirPk: string): string {
  const myShort = truncateAddress(myPk);
  const theirShort = truncateAddress(theirPk);
  return `${myShort} <> ${theirShort}`;
}

/**
 * Truncate an address for display.
 */
function truncateAddress(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

/**
 * DM status states
 */
export type DMStatus =
  | 'none'           // No DM relationship
  | 'pending_sent'   // We sent a request, waiting for response
  | 'pending_received' // They sent a request, we need to respond
  | 'active'         // DM space is active
  | 'declined';      // Request was declined

/**
 * DM relationship info
 */
export interface DMInfo {
  status: DMStatus;
  spaceId: string;
  otherParty: string;
  createdAt?: number;
  requestHash?: string; // For pending requests
}

/**
 * Check if we can initiate a DM with a user.
 * Returns false if there's already a pending request or active DM.
 */
export function canInitiateDM(status: DMStatus): boolean {
  return status === 'none' || status === 'declined';
}

/**
 * Get display text for DM status
 */
export function getDMStatusText(status: DMStatus): string {
  switch (status) {
    case 'none':
      return 'Message';
    case 'pending_sent':
      return 'Request Pending';
    case 'pending_received':
      return 'Accept Request';
    case 'active':
      return 'Open Chat';
    case 'declined':
      return 'Message';
    default:
      return 'Message';
  }
}

/**
 * Get action for DM button based on status
 */
export function getDMAction(status: DMStatus): 'send_request' | 'accept' | 'open' | 'none' {
  switch (status) {
    case 'none':
    case 'declined':
      return 'send_request';
    case 'pending_received':
      return 'accept';
    case 'active':
      return 'open';
    case 'pending_sent':
      return 'none';
    default:
      return 'send_request';
  }
}
