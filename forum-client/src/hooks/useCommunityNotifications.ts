/**
 * CommunityFormed notification surface (SPEC_09 §7.1, Phase 2 — Lane B).
 *
 * Surfaces NotificationType::CommunityFormed notices with graduation framing.
 * The list_notifications RPC is owned by Lane A and may not exist yet; this hook
 * feature-detects and returns an empty list rather than surfacing an error, so
 * discovery renders normally on nodes without the notification RPC.
 *
 * Dismissals are remembered locally (localStorage) so a graduation banner does
 * not nag after the user has seen it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRpc } from './useRpc';
import { isMethodNotFoundError, type CommunityNotification } from '../lib/rpc';
import { logger } from '../lib/logger';

const DISMISS_KEY = 'swimchain-community-notifications-dismissed';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore corrupt cache */ }
  return new Set();
}

function saveDismissed(ids: Set<string>): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* storage full / unavailable — non-fatal */ }
}

/** Case-insensitive match for the CommunityFormed notification type. */
function isCommunityFormed(raw: Record<string, unknown>): boolean {
  const t = (raw.type ?? raw.notification_type ?? raw.kind ?? '') as string;
  const norm = String(t).toLowerCase().replace(/[_\s-]/g, '');
  return norm === 'communityformed';
}

/** Normalize a loosely-typed notification record into CommunityNotification. */
function normalize(raw: Record<string, unknown>): CommunityNotification | null {
  const community_id = (raw.community_id ?? raw.space_id ?? raw.communityId ?? '') as string;
  if (!community_id) return null;
  const id = (raw.id ?? raw.notification_id ?? community_id) as string;
  return {
    id: String(id),
    community_id: String(community_id),
    parent_space_id: (raw.parent_space_id ?? raw.parentSpaceId ?? null) as string | null,
    name: (raw.name ?? raw.community_name ?? raw.communityName ?? null) as string | null,
    parent_name: (raw.parent_name ?? raw.parentName ?? null) as string | null,
    created_at: (raw.created_at ?? raw.timestamp ?? raw.createdAt ?? null) as number | null,
    read: Boolean(raw.read ?? false),
  };
}

export interface CommunityNotificationsState {
  notifications: CommunityNotification[];
  /** True if the node exposes a notification RPC at all. */
  available: boolean;
  loading: boolean;
  dismiss: (id: string) => void;
  refetch: () => void;
}

export function useCommunityNotifications(): CommunityNotificationsState {
  const { rpc, connected, authReady } = useRpc();
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!rpc || !connected || !authReady) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await rpc.listNotifications({ limit: 50 });
        if (cancelled) return;
        const list = (res?.notifications ?? [])
          .filter(isCommunityFormed)
          .map(normalize)
          .filter((n): n is CommunityNotification => !!n);
        setNotifications(list);
        setAvailable(true);
      } catch (err) {
        if (cancelled) return;
        if (isMethodNotFoundError(err)) {
          logger.info('[Notifications] list_notifications not available; surface hidden');
        } else {
          logger.warn('[Notifications] list_notifications failed', err);
        }
        setNotifications([]);
        setAvailable(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, authReady, nonce]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  return {
    notifications: notifications.filter((n) => !dismissed.has(n.id)),
    available,
    loading,
    dismiss,
    refetch,
  };
}
