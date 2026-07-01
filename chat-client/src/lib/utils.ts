/**
 * Shared utility functions for the chat client
 */

/**
 * Truncate an address for display
 */
export function truncateAddress(address: string, chars: number = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
