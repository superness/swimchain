/**
 * community_formed notification surface (SPEC_09 §7.1, Phase 2 — Lane B).
 *
 * Surfaces notification_type "community_formed" notices with graduation
 * framing. The list_notifications / mark_notification_read RPCs are optional;
 * this hook feature-detects and returns an empty list rather than surfacing an
 * error, so discovery renders normally on nodes without the notification RPC.
 *
 * Dismissing a notice marks it read on the node (mark_notification_read) and
 * also remembers the dismissal locally, so it doesn't nag even if the
 * mark-read call fails.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRpc } from './useRpc';
import {
  isMethodNotFoundError,
  type NotificationInfo,
  type CommunityFormedContext,
} from '../lib/rpc';
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

/** A community_formed notification, normalized for the UI. */
export interface CommunityFormedNotice {
  /** Notification id (32-hex). */
  id: string;
  message?: string;
  createdAtMs?: number;
  read: boolean;
  /** Parent space id (sp1) — the community view routes through it. */
  parentSpaceId: string;
  /** Community id (64-hex). */
  communityId: string;
  /** The community's own sp1 space id (not navigable directly). */
  communitySpaceId?: string;
  /** Auto-generated community name. */
  autoName?: string;
  foundingMemberCount?: number;
}

function toNotice(n: NotificationInfo): CommunityFormedNotice | null {
  const ctx = (n.context ?? {}) as Partial<CommunityFormedContext>;
  if (!n.id || !ctx.community_id || !ctx.parent_space_id) return null;
  return {
    id: n.id,
    message: n.message,
    createdAtMs: n.created_at_ms,
    read: Boolean(n.read),
    parentSpaceId: ctx.parent_space_id,
    communityId: ctx.community_id,
    communitySpaceId: ctx.community_space_id,
    autoName: ctx.auto_name,
    foundingMemberCount: ctx.founding_member_count,
  };
}

export interface CommunityNotificationsState {
  notifications: CommunityFormedNotice[];
  /** True if the node exposes a notification RPC at all. */
  available: boolean;
  loading: boolean;
  dismiss: (id: string) => void;
  refetch: () => void;
}

export function useCommunityNotifications(): CommunityNotificationsState {
  const { rpc, connected, authReady } = useRpc();
  const [notifications, setNotifications] = useState<CommunityFormedNotice[]>([]);
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
          .filter((n) => n.notification_type === 'community_formed')
          .map(toNotice)
          .filter((n): n is CommunityFormedNotice => n !== null)
          // Graduation banners only surface unread notices; read ones live on
          // in whatever general notification history ships later.
          .filter((n) => !n.read);
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
    // Local dismissal is immediate and survives even if mark-read fails.
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
    // Best-effort server-side mark-read so other clients agree.
    rpc?.markNotificationRead({ notificationId: id }).catch((err) => {
      if (!isMethodNotFoundError(err)) {
        logger.warn('[Notifications] mark_notification_read failed', err);
      }
    });
  }, [rpc]);

  return {
    notifications: notifications.filter((n) => !dismissed.has(n.id)),
    available,
    loading,
    dismiss,
    refetch,
  };
}
