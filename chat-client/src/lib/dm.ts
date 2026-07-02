/**
 * DM (direct message) helpers and local conversation registry.
 *
 * DM conversations are modeled as tiny private spaces between two identities.
 * The conversation list is kept in localStorage; message content lives on the
 * node like any other space content.
 */

import { hexToBytes, bytesToHex } from '@swimchain/frontend';

const DM_LIST_KEY = 'swimchain-chat-dms';

export type DmStatus = 'pending_sent' | 'pending_received' | 'active';

export interface DmEntry {
  /** The other participant's public key (hex) */
  otherPk: string;
  /** Deterministic DM space id (hex) */
  spaceId: string;
  status: DmStatus;
  createdAt: number;
  lastActivity?: number;
  unreadCount: number;
}

/**
 * Derive a deterministic, order-independent DM space id (16 bytes, hex)
 * from the two participants' public keys.
 */
export function getDMSpaceId(pkA: string, pkB: string): string {
  const a = hexToBytes(pkA);
  const b = hexToBytes(pkB);
  const len = Math.min(a.length, b.length, 16);
  const out = new Uint8Array(16);
  for (let i = 0; i < len; i++) {
    out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return bytesToHex(out);
}

/** Truncate an address/public key for display */
export function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

/** Load the DM conversation list from localStorage */
export function loadDmList(): DmEntry[] {
  try {
    const stored = localStorage.getItem(DM_LIST_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as DmEntry[]) : [];
  } catch {
    return [];
  }
}

function saveDmList(entries: DmEntry[]): void {
  try {
    localStorage.setItem(DM_LIST_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage errors (private mode, quota)
  }
}

/** Insert or update a DM entry (keyed by the other participant's pk) */
export function upsertDmEntry(entry: DmEntry): void {
  const list = loadDmList();
  const idx = list.findIndex(e => e.otherPk === entry.otherPk);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...entry };
  } else {
    list.push(entry);
  }
  saveDmList(list);
}

/** Remove a DM entry by the other participant's pk */
export function removeDmEntry(otherPk: string): void {
  saveDmList(loadDmList().filter(e => e.otherPk !== otherPk));
}

/** Mark a DM conversation as read */
export function markDmRead(spaceId: string): void {
  const list = loadDmList();
  let changed = false;
  for (const entry of list) {
    if (entry.spaceId === spaceId && entry.unreadCount !== 0) {
      entry.unreadCount = 0;
      changed = true;
    }
  }
  if (changed) saveDmList(list);
}
