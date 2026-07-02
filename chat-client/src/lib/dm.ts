/**
 * Direct Message (DM) Utilities
 *
 * DMs are private spaces with exactly 2 members.
 * The space ID is deterministically derived from the two public keys.
 */

import { sha256 } from '@noble/hashes/sha256';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getDMSpaceId(myPk: string, theirPk: string): string {
  const sorted = [myPk.toLowerCase(), theirPk.toLowerCase()].sort();
  const preimage = `dm:v1:${sorted[0]}:${sorted[1]}`;
  const hash = sha256(new TextEncoder().encode(preimage));
  return bytesToHex(hash.slice(0, 16));
}

export function truncateAddress(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

export type DmStatus = 'pending_sent' | 'pending_received' | 'active' | 'declined';

export interface DmEntry {
  otherPk: string;
  spaceId: string;
  status: DmStatus;
  createdAt: number;
  lastActivity?: number;
  unreadCount: number;
}

const DM_LIST_KEY = 'swimchain-dm-list';

export function loadDmList(): DmEntry[] {
  try {
    const stored = localStorage.getItem(DM_LIST_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

export function saveDmList(dms: DmEntry[]): void {
  localStorage.setItem(DM_LIST_KEY, JSON.stringify(dms));
}

export function upsertDmEntry(entry: DmEntry): void {
  const list = loadDmList();
  const idx = list.findIndex(d => d.otherPk.toLowerCase() === entry.otherPk.toLowerCase());
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.push(entry);
  saveDmList(list);
}

export function removeDmEntry(otherPk: string): void {
  saveDmList(loadDmList().filter(d => d.otherPk.toLowerCase() !== otherPk.toLowerCase()));
}

export function markDmRead(spaceId: string): void {
  const list = loadDmList();
  const entry = list.find(d => d.spaceId === spaceId);
  if (entry) { entry.unreadCount = 0; saveDmList(list); }
}

export function sortDmList(dms: DmEntry[]): DmEntry[] {
  return [...dms].sort((a, b) => (b.lastActivity ?? b.createdAt) - (a.lastActivity ?? a.createdAt));
}
