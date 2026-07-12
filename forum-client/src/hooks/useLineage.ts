/**
 * Behavioral-branching lineage hooks (SPEC_13, Phase 2 — Lane B).
 *
 * Model (final Lane A shapes): communities are NOT top-level spaces. A
 * community's threads physically live in its parent space; the community
 * renders as the parent's thread list filtered to the community's
 * moved_threads, at /spaces/:parentId/community/:communityId. These hooks
 * build the navigable lineage view on top of the flat space list:
 *
 *   1. Prefer the get_space_tree RPC for the full (possibly nested) tree.
 *   2. Else derive one level from the additive `children` field on list_spaces.
 *   3. Else: no lineage is known -> `lineageAvailable` is false and callers
 *      fall back to today's flat list. Nothing errors, nothing is hidden.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRpc, useSpaces } from './useRpc';
import { isMethodNotFoundError, type SpaceTreeNode, type SpaceChildInfo } from '../lib/rpc';
import { logger } from '../lib/logger';
import type { Space, CommunitySummary } from '../types';

/** Route to a community's view (parent threads filtered to the community). */
export function communityPath(parentSpaceId: string, communityId: string): string {
  return `/spaces/${parentSpaceId}/community/${communityId}`;
}

/** Pointer for a thread whose conversation grew into a formed community. */
export interface MovedThreadPointer {
  communityId: string;
  /** Space whose thread list the community filters (the thread's home). */
  parentSpaceId: string;
  communityName?: string;
}

/** A node in the client-side lineage tree (space or community). */
export interface LineageTreeNodeVM {
  /** This node's own sp1 space id (community space ids are NOT navigable). */
  spaceId: string;
  name: string;
  /** Set (64-hex) when this node is a community; null for plain spaces. */
  communityId: string | null;
  /** Enclosing node's space id (null for roots). Community links route here. */
  parentSpaceId: string | null;
  formedAt: number | null;
  foundingMemberCount: number | null;
  /** Post count for plain spaces (from list_spaces); undefined for communities. */
  postCount?: number;
  children: LineageTreeNodeVM[];
}

/** A recently-formed community plus its parent's display name. */
export interface RecentCommunity extends CommunitySummary {
  parentName?: string;
}

export interface SpaceLineageGraph {
  /** Flat list of spaces (same set the flat list shows). */
  spaces: Space[];
  byId: Map<string, Space>;
  /** Lineage tree roots (plain spaces, communities nested beneath). */
  roots: LineageTreeNodeVM[];
  /** True when at least one community is known (tree RPC or list_spaces children). */
  lineageAvailable: boolean;
  /** Communities sorted by formation time, newest first. */
  recentlyFormed: RecentCommunity[];
  loading: boolean;
  error: string | null;
}

/** Convert a get_space_tree node (recursive) into the client VM. */
function toTreeVM(
  node: SpaceTreeNode,
  parentSpaceId: string | null,
  postCountById: Map<string, number>,
): LineageTreeNodeVM {
  return {
    spaceId: node.space_id,
    name: node.name,
    communityId: node.community_id ?? null,
    parentSpaceId,
    formedAt: node.formed_at ?? null,
    foundingMemberCount: node.founding_member_count ?? null,
    postCount: node.community_id ? undefined : postCountById.get(node.space_id),
    children: (node.children ?? []).map((c) => toTreeVM(c, node.space_id, postCountById)),
  };
}

/**
 * Build the lineage graph for the whole known space set.
 */
export function useSpaceLineageGraph(): SpaceLineageGraph {
  const { spaces, loading, error } = useSpaces();
  const { rpc, connected, authReady } = useRpc();

  // Tree from get_space_tree (when the node exposes it); null = unavailable.
  const [treeRoots, setTreeRoots] = useState<SpaceTreeNode[] | null>(null);

  useEffect(() => {
    if (!rpc || !connected || !authReady) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await rpc.getSpaceTree();
        if (cancelled) return;
        setTreeRoots(res?.roots ?? []);
        logger.info('[Lineage] get_space_tree loaded', { roots: res?.roots?.length ?? 0 });
      } catch (err) {
        if (cancelled) return;
        if (isMethodNotFoundError(err)) {
          // Expected on nodes that predate behavioral branching. Fall back to
          // list_spaces children (or the flat list). Not an error the user sees.
          logger.info('[Lineage] get_space_tree not available; using list_spaces children');
        } else {
          logger.warn('[Lineage] get_space_tree failed; falling back', err);
        }
        setTreeRoots(null);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, authReady]);

  return useMemo<SpaceLineageGraph>(() => {
    const byId = new Map<string, Space>();
    const postCountById = new Map<string, number>();
    for (const s of spaces) {
      byId.set(s.id, s);
      postCountById.set(s.id, s.postCount);
    }

    // Build the tree: prefer get_space_tree (full, possibly nested); else one
    // level derived from list_spaces `children`.
    let roots: LineageTreeNodeVM[];
    if (treeRoots && treeRoots.length > 0) {
      // Only show roots the flat list also shows (list_spaces filters app
      // spaces client-side; the tree must not resurface them).
      roots = treeRoots
        .filter((r) => byId.has(r.space_id))
        .map((r) => toTreeVM(r, null, postCountById));
    } else {
      roots = spaces.map((s) => ({
        spaceId: s.id,
        name: s.name,
        communityId: null,
        parentSpaceId: null,
        formedAt: null,
        foundingMemberCount: null,
        postCount: s.postCount,
        children: (s.communities ?? []).map((c) => ({
          spaceId: c.spaceId,
          name: c.fullName || c.name,
          communityId: c.communityId,
          parentSpaceId: s.id,
          formedAt: c.formedAt,
          foundingMemberCount: c.foundingMemberCount,
          children: [],
        })),
      }));
    }
    roots.sort((a, b) => a.name.localeCompare(b.name));

    // Any community anywhere => lineage exists.
    const hasTreeCommunity = (n: LineageTreeNodeVM): boolean =>
      n.communityId !== null || n.children.some(hasTreeCommunity);
    const lineageAvailable = roots.some(hasTreeCommunity);

    // Recently formed communities, newest first. list_spaces `children` is the
    // primary source; the tree adds any (e.g. nested) the list doesn't carry.
    const recentById = new Map<string, RecentCommunity>();
    for (const s of spaces) {
      for (const c of s.communities ?? []) {
        recentById.set(c.communityId, { ...c, parentName: s.name });
      }
    }
    const collectTreeCommunities = (n: LineageTreeNodeVM, parentName?: string): void => {
      if (n.communityId && n.parentSpaceId && !recentById.has(n.communityId)) {
        recentById.set(n.communityId, {
          communityId: n.communityId,
          spaceId: n.spaceId,
          parentSpaceId: n.parentSpaceId,
          name: n.name,
          fullName: n.name,
          formedAt: n.formedAt ?? 0,
          formationHeight: 0,
          foundingMemberCount: n.foundingMemberCount ?? 0,
          parentName,
        });
      }
      for (const c of n.children) collectTreeCommunities(c, n.name);
    };
    for (const r of roots) collectTreeCommunities(r);

    const recentlyFormed = Array.from(recentById.values())
      .sort((a, b) => (b.formedAt ?? 0) - (a.formedAt ?? 0));

    return {
      spaces,
      byId,
      roots,
      lineageAvailable,
      recentlyFormed,
      loading,
      error,
    };
  }, [spaces, treeRoots, loading, error]);
}

/** Per-space lineage from get_space_lineage (feature-detected). */
export interface SpaceLineage {
  /** Set iff the queried id IS a community (someone deep-linked to its sp1 id). */
  isCommunity: boolean;
  /** Parent space {id, name} — set iff isCommunity. */
  parent?: { id: string; name: string };
  /** The community's own info — set iff isCommunity. */
  community?: SpaceChildInfo;
  /** Communities formed out of this space. */
  children: SpaceChildInfo[];
  /** Thread root id ("sha256:<hex>") -> the community it grew into. */
  movedThreads: Map<string, MovedThreadPointer>;
  lineageAvailable: boolean;
  loading: boolean;
}

function normalizeThreadId(id: string): string {
  return id.startsWith('sha256:') ? id.slice(7) : id;
}

/**
 * Lineage for a single space, from the optional get_space_lineage RPC. When the
 * RPC is absent (-32601) children fall back to list_spaces data and
 * movedThreads stays empty, so continuity banners simply don't render.
 */
export function useSpaceLineage(spaceId: string | undefined): SpaceLineage {
  const { rpc, connected, authReady } = useRpc();
  const { spaces } = useSpaces();
  const [result, setResult] = useState<{
    parent: { space_id: string; name: string } | null;
    community: SpaceChildInfo | null;
    children: SpaceChildInfo[];
  } | null>(null);
  const [rpcAvailable, setRpcAvailable] = useState(false);
  const [lineageLoading, setLineageLoading] = useState(false);

  useEffect(() => {
    if (!rpc || !connected || !authReady || !spaceId) return;
    let cancelled = false;
    setLineageLoading(true);

    (async () => {
      try {
        const res = await rpc.getSpaceLineage(spaceId);
        if (cancelled) return;
        setResult({
          parent: res.parent ?? null,
          community: res.community ?? null,
          children: res.children ?? [],
        });
        setRpcAvailable(true);
      } catch (err) {
        if (cancelled) return;
        if (!isMethodNotFoundError(err)) {
          logger.warn('[Lineage] get_space_lineage failed; continuity pointers hidden', err);
        }
        setResult(null);
        setRpcAvailable(false);
      } finally {
        if (!cancelled) setLineageLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, authReady, spaceId]);

  return useMemo<SpaceLineage>(() => {
    // Fallback children from list_spaces when the lineage RPC is absent
    // (no moved_threads there, but the tree/rail still work).
    let children: SpaceChildInfo[] = result?.children ?? [];
    if (!result && spaceId) {
      const s = spaces.find((sp) => sp.id === spaceId);
      children = (s?.communities ?? []).map((c) => ({
        community_id: c.communityId,
        space_id: c.spaceId,
        parent_space_id: c.parentSpaceId,
        name: c.name,
        full_name: c.fullName,
        formed_at: c.formedAt,
        formation_height: c.formationHeight,
        founding_member_count: c.foundingMemberCount,
      }));
    }

    // Parent-side continuity pointers: thread root -> community it grew into.
    const movedThreads = new Map<string, MovedThreadPointer>();
    if (spaceId) {
      for (const child of children) {
        for (const threadId of child.moved_threads ?? []) {
          const ptr: MovedThreadPointer = {
            communityId: child.community_id,
            parentSpaceId: spaceId,
            communityName: child.full_name || child.name,
          };
          movedThreads.set(threadId, ptr);
          movedThreads.set(normalizeThreadId(threadId), ptr);
        }
      }
    }

    return {
      isCommunity: result?.community != null,
      parent: result?.parent ? { id: result.parent.space_id, name: result.parent.name } : undefined,
      community: result?.community ?? undefined,
      children,
      movedThreads,
      lineageAvailable: rpcAvailable || children.length > 0,
      loading: lineageLoading,
    };
  }, [result, rpcAvailable, lineageLoading, spaceId, spaces]);
}
