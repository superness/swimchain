/**
 * Direct Message (DM) Utilities
 *
 * Provides deterministic DM space ID generation and DM-specific helpers.
 * DMs are just private spaces with exactly 2 members.
 *
 * @packageDocumentation
 */
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
export declare function getDMSpaceId(myPk: string, theirPk: string): string;
/**
 * Check if a space ID is a DM space between two users.
 */
export declare function isDMSpace(spaceId: string, pk1: string, pk2: string): boolean;
/**
 * Generate a default DM space name from two addresses.
 * Format: "Alice <> Bob" using truncated addresses.
 */
export declare function getDMSpaceName(myPk: string, theirPk: string): string;
/**
 * DM status states
 */
export type DMStatus = 'none' | 'pending_sent' | 'pending_received' | 'active' | 'declined';
/**
 * DM relationship info
 */
export interface DMInfo {
    status: DMStatus;
    spaceId: string;
    otherParty: string;
    createdAt?: number;
    requestHash?: string;
}
/**
 * Check if we can initiate a DM with a user.
 * Returns false if there's already a pending request or active DM.
 */
export declare function canInitiateDM(status: DMStatus): boolean;
/**
 * Get display text for DM status
 */
export declare function getDMStatusText(status: DMStatus): string;
/**
 * Get action for DM button based on status
 */
export declare function getDMAction(status: DMStatus): 'send_request' | 'accept' | 'open' | 'none';
//# sourceMappingURL=dm.d.ts.map