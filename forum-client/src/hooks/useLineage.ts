/**
 * Behavioral-branching lineage hooks (SPEC_13, Phase 2 — Lane B).
 *
 * These hooks build a navigable space *lineage* graph (parents -> children formed
 * by behavioral splits) on top of the flat space list. Everything degrades
 * gracefully:
 *
 *   1. Prefer the get_space_tree RPC (Lane A). If present, use its edges.
 *   2. Else derive edges from the additive lineage fields on list_spaces
 *      (parent_space_id / children), if the node populates them.
 *   3. Else: no lineage is known -> `lineageAvailable` is false and callers fall
 *      back to today's flat list. Nothing errors, nothing is hidden from the user.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRpc, useSpaces } from './useRpc';
import { isMethodNotFoundError, type SpaceTreeNode, type MovedThreadRef } from '../lib/rpc';
import { logger } from '../lib/logger';
import type { Space } from '../types';

/** Pointer for a thread that moved from a parent space into a formed child. */
export interface MovedThreadPointer {
  childSpaceId: string;
  childSpaceName?: string;
}

/** Lineage metadata for a single space, merged from all available sources. */
export interface LineageMeta {
  parentId?: string;
  childIds: string[];
  formedAt?: number;
  foundingMemberCount?: number;
  formationHeight?: number;
  name?: string;
}

export interface SpaceLineageGraph {
  /** Flat list of spaces (same set the flat list shows). */
  spaces: Space[];
  byId: Map<string, Space>;
  /** Spaces with no known parent (top of the tree). */
  roots: Space[];
  /** id -> child spaces that grew out of it (deduped, sorted newest-first). */
  childrenOf: (id: string) => Space[];
  /** id -> parent space, if it grew out of one that we know about. */
  parentOf: (id: string) => Space | undefined;
  /** Full ancestor chain (root-first), excluding the space itself. */
  ancestorsOf: (id: string) => Space[];
  /** True when at least one lineage edge is known (tree RPC or additive fields). */
  lineageAvailable: boolean;
  /** Child spaces sorted by formation time, newest first. */
  recentlyFormed: Space[];
  loading: boolean;
  error: string | null;
}

/** Walk a (possibly nested) get_space_tree node set into a flat metadata map. */
function collectTreeMeta(
  nodes: Array<SpaceTreeNode | string>,
  parentId: string | undefined,
  out: Map<string, LineageMeta>,
): void {
  for (const node of nodes) {
    if (typeof node === 'string') {
      // Bare child id — we only learn the parent edge here.
      const meta = out.get(node) ?? { childIds: [] };
      if (parentId) meta.parentId = parentId;
      out.set(node, meta);
      continue;
    }
    const id = node.space_id;
    if (!id) continue;
    const meta = out.get(id) ?? { childIds: [] };
    if (parentId && !meta.parentId) meta.parentId = parentId;
    if (node.parent_space_id) meta.parentId = node.parent_space_id;
    if (node.formed_at != null) meta.formedAt = node.formed_at;
    if (node.founding_member_count != null) meta.foundingMemberCount = node.founding_member_count;
    if (node.formation_height != null) meta.formationHeight = node.formation_height;
    if (node.name) meta.name = node.name;
    out.set(id, meta);

    const kids = node.children ?? [];
    for (const kid of kids) {
      const kidId = typeof kid === 'string' ? kid : kid.space_id;
      if (kidId && !meta.childIds.includes(kidId)) meta.childIds.push(kidId);
    }
    if (kids.length > 0) collectTreeMeta(kids, id, out);
  }
}

/**
 * Build the lineage graph for the whole known space set.
 */
export function useSpaceLineageGraph(): SpaceLineageGraph {
  const { spaces, loading, error } = useSpaces();
  const { rpc, connected, authReady } = useRpc();

  // Metadata overlaid from get_space_tree (when the node exposes it).
  const [treeMeta, setTreeMeta] = useState<Map<string, LineageMeta> | null>(null);

  useEffect(() => {
    if (!rpc || !connected || !authReady) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await rpc.getSpaceTree();
        if (cancelled) return;
        const map = new Map<string, LineageMeta>();
        collectTreeMeta(res?.tree ?? [], undefined, map);
        setTreeMeta(map);
        logger.info('[Lineage] get_space_tree overlay loaded', { nodes: map.size });
      } catch (err) {
        if (cancelled) return;
        if (isMethodNotFoundError(err)) {
          // Expected on nodes that predate behavioral branching. Fall back to
          // additive fields (or the flat list). Not an error the user sees.
          logger.info('[Lineage] get_space_tree not available; using additive fields / flat list');
        } else {
          logger.warn('[Lineage] get_space_tree failed; falling back', err);
        }
        setTreeMeta(null);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, authReady]);

  return useMemo<SpaceLineageGraph>(() => {
    const byId = new Map<string, Space>();
    for (const s of spaces) byId.set(s.id, s);

    // Merge lineage metadata: additive fields on each space, then tree overlay.
    const parentById = new Map<string, string>();
    const childrenById = new Map<string, Set<string>>();
    const metaById = new Map<string, LineageMeta>();

    const ensureMeta = (id: string): LineageMeta => {
      let m = metaById.get(id);
      if (!m) { m = { childIds: [] }; metaById.set(id, m); }
      return m;
    };
    const addChild = (parent: string, child: string) => {
      if (parent === child) return;
      let set = childrenById.get(parent);
      if (!set) { set = new Set(); childrenById.set(parent, set); }
      set.add(child);
    };

    // 1. Additive fields carried on each Space (from list_spaces).
    for (const s of spaces) {
      const m = ensureMeta(s.id);
      if (s.parentId) { m.parentId = s.parentId; parentById.set(s.id, s.parentId); }
      if (s.formedAt != null) m.formedAt = s.formedAt;
      if (s.foundingMemberCount != null) m.foundingMemberCount = s.foundingMemberCount;
      if (s.formationHeight != null) m.formationHeight = s.formationHeight;
      for (const c of s.childIds ?? []) { m.childIds.push(c); addChild(s.id, c); }
    }

    // 2. Tree RPC overlay (authoritative where present).
    if (treeMeta) {
      for (const [id, tm] of treeMeta) {
        const m = ensureMeta(id);
        if (tm.parentId) { m.parentId = tm.parentId; parentById.set(id, tm.parentId); }
        if (tm.formedAt != null) m.formedAt = tm.formedAt;
        if (tm.foundingMemberCount != null) m.foundingMemberCount = tm.foundingMemberCount;
        if (tm.formationHeight != null) m.formationHeight = tm.formationHeight;
        for (const c of tm.childIds) { addChild(id, c); }
        if (tm.parentId) addChild(tm.parentId, id);
      }
    }

    // Reverse-link: every known parent edge implies a child edge.
    for (const [child, parent] of parentById) addChild(parent, child);

    // Enrich Space objects with the merged lineage so downstream consumers
    // (breadcrumbs, badges) can read formedAt / member counts uniformly.
    const enrich = (s: Space): Space => {
      const m = metaById.get(s.id);
      if (!m) return s;
      return {
        ...s,
        parentId: m.parentId ?? s.parentId,
        formedAt: m.formedAt ?? s.formedAt,
        foundingMemberCount: m.foundingMemberCount ?? s.foundingMemberCount,
        formationHeight: m.formationHeight ?? s.formationHeight,
        childIds: Array.from(childrenById.get(s.id) ?? s.childIds ?? []),
      };
    };

    const enrichedById = new Map<string, Space>();
    for (const s of spaces) enrichedById.set(s.id, enrich(s));

    const childrenOf = (id: string): Space[] => {
      const ids = childrenById.get(id);
      if (!ids) return [];
      return Array.from(ids)
        .map((cid) => enrichedById.get(cid))
        .filter((s): s is Space => !!s)
        .sort((a, b) => (b.formedAt ?? b.createdAt ?? 0) - (a.formedAt ?? a.createdAt ?? 0));
    };

    const parentOf = (id: string): Space | undefined => {
      const pid = parentById.get(id);
      return pid ? enrichedById.get(pid) : undefined;
    };

    const ancestorsOf = (id: string): Space[] => {
      const chain: Space[] = [];
      const seen = new Set<string>([id]);
      let cur = parentById.get(id);
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const s = enrichedById.get(cur);
        if (s) chain.unshift(s);
        cur = parentById.get(cur);
      }
      return chain;
    };

    // Roots: spaces whose parent is unknown to us (either no parent, or a parent
    // we haven't synced). Presenting orphaned children as roots keeps them
    // visible rather than hiding them under a missing parent.
    const roots = Array.from(enrichedById.values())
      .filter((s) => {
        const pid = parentById.get(s.id);
        return !pid || !enrichedById.has(pid);
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.name.localeCompare(b.name));

    const lineageAvailable = parentById.size > 0 || childrenById.size > 0;

    // Communities that grew out of a parent, newest formation first.
    const recentlyFormed = Array.from(enrichedById.values())
      .filter((s) => parentById.has(s.id))
      .sort((a, b) => (b.formedAt ?? b.createdAt ?? 0) - (a.formedAt ?? a.createdAt ?? 0));

    return {
      spaces: Array.from(enrichedById.values()),
      byId: enrichedById,
      roots,
      childrenOf,
      parentOf,
      ancestorsOf,
      lineageAvailable,
      recentlyFormed,
      loading,
      error,
    };
  }, [spaces, treeMeta, loading, error]);
}

/** Per-space lineage: parent, children, and threads that moved into children. */
export interface SpaceLineage {
  parent?: Space;
  ancestors: Space[];
  children: Space[];
  /** Map of thread root id -> the child space it moved into (parent-side). */
  movedThreads: Map<string, MovedThreadPointer>;
  lineageAvailable: boolean;
  loading: boolean;
}

function normalizeThreadId(id: string): string {
  return id.startsWith('sha256:') ? id.slice(7) : id;
}

/**
 * Lineage for a single space: parent + children (from the shared graph) plus the
 * set of threads that moved out of this space into a formed child (from the
 * optional get_space_lineage RPC). When that RPC is absent, movedThreads is
 * empty and continuity banners simply don't render.
 */
export function useSpaceLineage(spaceId: string | undefined): SpaceLineage {
  const graph = useSpaceLineageGraph();
  const { rpc, connected, authReady } = useRpc();
  const [moved, setMoved] = useState<MovedThreadRef[] | null>(null);
  const [movedLoading, setMovedLoading] = useState(false);

  useEffect(() => {
    if (!rpc || !connected || !authReady || !spaceId) return;
    let cancelled = false;
    setMovedLoading(true);

    (async () => {
      try {
        const res = await rpc.getSpaceLineage(spaceId);
        if (cancelled) return;
        setMoved(res?.moved_threads ?? []);
      } catch (err) {
        if (cancelled) return;
        if (!isMethodNotFoundError(err)) {
          logger.warn('[Lineage] get_space_lineage failed; continuity pointers hidden', err);
        }
        setMoved(null);
      } finally {
        if (!cancelled) setMovedLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, authReady, spaceId]);

  return useMemo<SpaceLineage>(() => {
    const movedThreads = new Map<string, MovedThreadPointer>();
    for (const m of moved ?? []) {
      if (!m?.thread_id || !m?.child_space_id) continue;
      const ptr: MovedThreadPointer = {
        childSpaceId: m.child_space_id,
        childSpaceName: m.child_space_name ?? graph.byId.get(m.child_space_id)?.name,
      };
      movedThreads.set(m.thread_id, ptr);
      movedThreads.set(normalizeThreadId(m.thread_id), ptr);
    }

    return {
      parent: spaceId ? graph.parentOf(spaceId) : undefined,
      ancestors: spaceId ? graph.ancestorsOf(spaceId) : [],
      children: spaceId ? graph.childrenOf(spaceId) : [],
      movedThreads,
      lineageAvailable: graph.lineageAvailable,
      loading: graph.loading || movedLoading,
    };
  }, [graph, spaceId, moved, movedLoading]);
}
