/**
 * Node Data Service
 *
 * Typed methods wrapping SwimchainRpc for server components and API routes.
 * All methods distinguish "node offline" from "content not found" so pages can
 * render an honest offline notice instead of fake data.
 */

import type {
  ContentResponse,
  SpaceActivitySummary,
  PoolSummary,
} from '@/types/gateway';
import type { SearchResult } from '@/types/search';
import { calculateScore } from '@/lib/search/ranking';
import { getSearchIndexer } from '@/lib/search/indexer';
import { addressToHex, hexToAddress } from '@/lib/address';
import {
  getRpc,
  NodeUnreachableError,
  type NodeContentSummary,
  type NodeContent,
  type NodeReply,
  type NodeSpaceSummary,
} from './rpc';

/** Result wrapper distinguishing offline from missing content. */
export type NodeFetch<T> =
  | { status: 'ok'; data: T }
  | { status: 'offline' }
  | { status: 'not-found' };

/** Chain knows the content but no peer served the body in time (view-to-host). */
export type NodeFetchWithUnavailable<T> = NodeFetch<T> | { status: 'unavailable' };

/** Identity profile assembled from get_user_profile + get_user_posts. */
export interface IdentitySummary {
  address: string;
  displayName?: string;
  bio?: string;
  website?: string;
  postCount: number;
  replyCount: number;
  firstSeen: number | null; // unix ms of earliest known content
}

// ============================================================================
// Mapping helpers (node RPC shapes -> gateway types)
// ============================================================================

/**
 * Public browse gateway should not surface private, direct-message, or personal
 * profile spaces. Those are app-namespaced or use an @app:/@dm:/@profile:
 * naming convention. Wiki and ordinary public spaces stay visible.
 */
function isPublicSpace(space: NodeSpaceSummary): boolean {
  // Node doctrine (rpc/methods.rs): "general social clients hide ALL app
  // spaces so specialized content never pollutes the default experience."
  // An app-namespaced space has a non-null `app` (dm, profile, wiki, ...).
  if (typeof space.app === 'string' && space.app.length > 0) return false;
  // Belt-and-braces: catch the @app:/@dm:/@profile: name convention even if the
  // node returned it as a raw name rather than a parsed `app`.
  const name = typeof space.name === 'string' ? space.name.toLowerCase() : '';
  if (/^@[a-z0-9-]+:/.test(name)) return false;
  // Unresolved name: the node hasn't learned this space's name, so `app` is
  // ALSO unknown — it could be a DM/profile/app space in disguise. Don't leak
  // it into the public directory until it resolves to a confirmed public space.
  // (fetchAllSpaces triggers resolution so genuine public spaces reappear.)
  if (space.name_unresolved) return false;
  return true;
}

/** Drop app/DM/profile and not-yet-confirmed spaces from a public listing. */
function publicSpaces(spaces: NodeSpaceSummary[]): NodeSpaceSummary[] {
  return spaces.filter(isPublicSpace);
}

/**
 * Set of space ids the gateway treats as public (for filtering user posts,
 * search, etc.). Built from the cached public directory. Empty on failure so
 * callers hide rather than leak.
 */
async function publicSpaceIdSet(): Promise<Set<string>> {
  const dir = await fetchAllSpaces();
  if (!dir) return new Set();
  return new Set(dir.map(s => s.space_id));
}

/**
 * Fire name resolution (best-effort, non-blocking) for spaces the node hasn't
 * named yet, so a later directory refresh can classify them public-vs-app.
 */
function triggerNameResolution(spaces: NodeSpaceSummary[]): void {
  const rpc = getRpc();
  for (const s of spaces) {
    if (s.name_unresolved) {
      // fire-and-forget; the node queries peers and fills it in for next time
      rpc.resolveSpaceName(s.space_id).catch(() => {});
    }
  }
}

function isDecayed(summary: { decay_state: string }): boolean {
  return summary.decay_state === 'decayed';
}

function poolFromSummary(item: NodeContentSummary): PoolSummary | null {
  if (!item.has_pool) return null;
  const contributed = Math.max(
    0,
    Math.min(60, Math.round(item.pool_progress * 60))
  );
  return {
    poolId: `pool-${item.content_id}`,
    contributedSeconds: contributed,
    requiredSeconds: 60,
    contributorCount: item.engagement_count,
    timeRemainingMs: null,
    progressPercentage: Math.min(100, Math.round(item.pool_progress * 100)),
  };
}

/**
 * Combine node title/body into the "Title\n\nBody" inline format clients use.
 * The node's list endpoints return the FULL original text in `body` (title
 * included), so only prepend the title when it is not already there.
 */
function combinedBody(title: string | null, body: string | null): string | null {
  if (title && body) {
    if (body.startsWith(title)) return body;
    return `${title}\n\n${body}`;
  }
  return title || body || null;
}

/** Body text without the leading title (for snippets). */
function bodyWithoutTitle(item: NodeContentSummary): string {
  // body_preview is already the parsed body (no title) when the node
  // could parse the "Title\n\nBody" format
  if (item.body_preview) return item.body_preview;
  const text = item.body ?? '';
  if (item.title && text.startsWith(item.title)) {
    return text.slice(item.title.length).replace(/^\n+/, '');
  }
  return text;
}

function hoursUntilDecay(item: {
  decay_state: string;
  seconds_until_decay?: number | null;
  seconds_until_pruned?: number | null;
}): number | null {
  if (item.decay_state === 'decayed') return null;
  const secs = item.seconds_until_decay ?? item.seconds_until_pruned;
  return secs != null ? Math.round(secs / 3600) : null;
}

/** Convert a list_space_content / get_user_posts item to a ContentResponse. */
export function summaryToContentResponse(
  item: NodeContentSummary
): ContentResponse {
  return {
    item: {
      content_id: item.content_id,
      author_id: item.author_id,
      signature: '',
      created_at: item.created_at,
      last_engagement: item.last_engagement || item.created_at,
      content_type: item.content_type === 'Reply' ? 'REPLY' : 'POST',
      parent_id: item.parent_id,
      space_id: item.space_id,
      body_inline: combinedBody(item.title, item.body ?? item.body_preview),
      content_hash: null,
      content_size: null,
      pow_nonce: 0,
      pow_difficulty: 0,
      engagement_count: item.engagement_count,
      media: mapMedia(item.media_refs),
    },
    survival_probability: item.survival_probability,
    is_decayed: isDecayed(item),
    is_protected: item.is_protected,
    hours_until_decay: hoursUntilDecay(item),
    pool: poolFromSummary(item),
  };
}

/** Node media_refs -> gateway {hash,type} for the media proxy. */
function mapMedia(
  refs: { media_hash: string; media_type: string }[] | undefined
): { hash: string; type: string }[] | undefined {
  if (!refs || refs.length === 0) return undefined;
  return refs.map((r) => ({ hash: r.media_hash, type: r.media_type }));
}

function createSnippet(body: string | null): string {
  if (!body) return '';
  if (body.length <= 200) return body.trim();
  return `${body.slice(0, 197).trim()}...`;
}

function extractTitle(item: NodeContentSummary): string {
  if (item.title) return item.title;
  const text = item.body_preview ?? item.body ?? '';
  if (!text) return '[No content]';
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  if (firstLine.length > 0 && firstLine.length <= 100) return firstLine;
  if (text.length <= 100) return text.trim();
  return `${text.slice(0, 97).trim()}...`;
}

/** Convert a node content summary to the gateway SearchResult card model. */
export function summaryToSearchResult(
  item: NodeContentSummary,
  spaceName?: string
): SearchResult {
  const contentResponse = summaryToContentResponse(item);
  return {
    contentId: item.content_id,
    spaceId: item.space_id,
    spaceName: spaceName || item.space_id,
    authorId: item.author_id,
    title: extractTitle(item),
    body: createSnippet(bodyWithoutTitle(item)),
    createdAt: item.created_at,
    lastEngagement: item.last_engagement || item.created_at,
    replyCount: item.reply_count,
    survivalProbability: item.survival_probability,
    isDecayed: isDecayed(item),
    isProtected: item.is_protected,
    hoursUntilDecay: hoursUntilDecay(item),
    pool: contentResponse.pool,
    scoreBreakdown: calculateScore(0, contentResponse, Date.now()),
  };
}

function spaceToActivitySummary(
  space: NodeSpaceSummary,
  content: NodeContentSummary[] | null
): SpaceActivitySummary {
  let activePosts = 0;
  let uniqueParticipants = 0;
  let decayHealth = 0;
  if (content && content.length > 0) {
    activePosts = content.filter(c => !isDecayed(c)).length;
    uniqueParticipants = new Set(content.map(c => c.author_id)).size;
    decayHealth = Math.round(
      (content.reduce((sum, c) => sum + c.survival_probability, 0) /
        content.length) *
        100
    );
  }
  return {
    space_id: space.space_id,
    space_name: space.name || space.space_id,
    description: undefined,
    post_count: space.post_count,
    active_posts: activePosts,
    unique_participants: uniqueParticipants,
    last_activity: space.last_activity ?? 0,
    decay_health: decayHealth,
    created_at: 0, // not exposed by list_spaces
  };
}

// ============================================================================
// Page-level fetchers
// ============================================================================

/** Number of spaces to enrich with per-space content stats (avoids N+1 blowup). */
const SPACE_ENRICH_LIMIT = 20;

/**
 * Short-TTL cache for the space directory. Each render of /spaces (and the
 * search-index feed) otherwise fires an N+1 burst (list_spaces + one
 * list_space_content per space) at the node. On a 1-vCPU seed that burst,
 * repeated per request, is what hammers the node's RPC limiter. Serving a
 * cached directory for a few seconds collapses that to one burst per window.
 */
let spaceDirCache: { at: number; data: SpaceActivitySummary[] } | null = null;
const SPACE_DIR_TTL_MS = 15_000;

/**
 * Fetch all spaces with activity stats.
 * Returns null when the node is unreachable.
 */
export async function fetchAllSpaces(): Promise<SpaceActivitySummary[] | null> {
  if (spaceDirCache && Date.now() - spaceDirCache.at < SPACE_DIR_TTL_MS) {
    return spaceDirCache.data;
  }
  const rpc = getRpc();
  let spaces: NodeSpaceSummary[];
  try {
    const _all = (await rpc.listSpaces(100)).spaces;
    triggerNameResolution(_all);
    spaces = publicSpaces(_all);
  } catch {
    // On a transient failure, serve stale rather than flashing "offline".
    if (spaceDirCache) return spaceDirCache.data;
    return null;
  }

  const result = await Promise.all(
    spaces.map(async (space, i) => {
      let content: NodeContentSummary[] | null = null;
      if (i < SPACE_ENRICH_LIMIT) {
        try {
          content = (await rpc.listSpaceContent(space.space_id, 100)).items;
        } catch {
          content = null;
        }
      }
      return spaceToActivitySummary(space, content);
    })
  );

  spaceDirCache = { at: Date.now(), data: result };
  return result;
}

/** Fetch one space plus its posts. */
export async function fetchSpaceWithPosts(spaceId: string): Promise<
  NodeFetch<{ space: SpaceActivitySummary; posts: SearchResult[] }>
> {
  const rpc = getRpc();
  try {
    const [spacesResult, contentResult] = await Promise.all([
      rpc.listSpaces(100),
      rpc.listSpaceContent(spaceId, 100),
    ]);
    const spaceInfo = spacesResult.spaces.find(s => s.space_id === spaceId);
    if (!spaceInfo || !isPublicSpace(spaceInfo)) {
      // Not found, or a private/DM/profile space that the public gateway hides.
      return { status: 'not-found' };
    }
    const spaceName = spaceInfo.name || spaceInfo.space_id;
    const posts = contentResult.items
      .filter(item => item.content_type !== 'Reply' && !isDecayed(item))
      .map(item => summaryToSearchResult(item, spaceName));
    return {
      status: 'ok',
      data: {
        space: spaceToActivitySummary(spaceInfo, contentResult.items),
        posts,
      },
    };
  } catch (err) {
    if (err instanceof NodeUnreachableError) return { status: 'offline' };
    // RPC error (e.g. invalid space id) -> treat as not found
    return { status: 'not-found' };
  }
}

function normalizeContentId(postId: string): string {
  if (postId.startsWith('sha256:')) return postId;
  if (/^[0-9a-fA-F]{64}$/.test(postId)) return `sha256:${postId}`;
  return postId;
}

function replyToContentResponse(reply: NodeReply, spaceId: string): ContentResponse {
  return {
    item: {
      content_id: reply.content_id,
      author_id: hexToAddress(reply.author_id) ?? reply.author_id,
      signature: '',
      created_at: reply.created_at,
      last_engagement: reply.last_engagement || reply.created_at,
      content_type: 'REPLY',
      parent_id: reply.parent_id,
      space_id: spaceId,
      body_inline: reply.body,
      content_hash: null,
      content_size: null,
      pow_nonce: 0,
      pow_difficulty: 0,
      engagement_count: 0,
      media: mapMedia(reply.media_refs),
    },
    survival_probability: 1.0,
    is_decayed: false,
    is_protected: false,
    hours_until_decay: null,
    pool: null,
    children: [],
  };
}

/**
 * Fetch a post plus its reply tree.
 * Returns 'offline' when the node is unreachable, 'not-found' for unknown IDs.
 */
/**
 * Trigger network retrieval of a content body and poll for it within a short,
 * SSR-safe budget. Mirrors the forum/feed client flow (get → request → poll),
 * bounded so a page render never hangs. Returns the content, null if it didn't
 * arrive in time, or the NodeUnreachableError if the node dropped.
 */
async function requestAndPoll(
  rpc: ReturnType<typeof getRpc>,
  contentId: string
): Promise<NodeContent | null | NodeUnreachableError> {
  try {
    const req = await rpc.requestContent(contentId);
    if (req.status === 'found_locally') {
      return await rpc.getContent(contentId);
    }
  } catch (err) {
    if (err instanceof NodeUnreachableError) return err;
    return null; // request_content unsupported or errored — nothing to poll for
  }

  const maxAttempts = 6; // ~6 x 1s ≈ 6s, safe for SSR
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      return await rpc.getContent(contentId);
    } catch (err) {
      if (err instanceof NodeUnreachableError) return err;
      // still not here — keep polling
    }
  }
  return null;
}

export async function fetchPost(
  postId: string
): Promise<NodeFetchWithUnavailable<ContentResponse>> {
  const rpc = getRpc();
  const contentId = normalizeContentId(postId);

  let content: NodeContent;
  try {
    content = await rpc.getContent(contentId);
  } catch (err) {
    if (err instanceof NodeUnreachableError) return { status: 'offline' };
    // View-to-host: the node has chain metadata but not the body yet. Ask it to
    // retrieve from the network (how real clients work), then poll briefly. SSR
    // can't hang for 30s, so use a short bounded budget; if the body doesn't
    // arrive, report 'unavailable' (distinct from a genuine 404) so the page can
    // show an honest "retrieving / not currently seeded" state.
    const retrieved = await requestAndPoll(rpc, contentId);
    if (retrieved instanceof NodeUnreachableError) return { status: 'offline' };
    if (!retrieved) return { status: 'unavailable' };
    content = retrieved;
  }

  const root: ContentResponse = {
    item: {
      content_id: content.content_id,
      author_id: content.author_id,
      signature: '',
      created_at: content.created_at,
      last_engagement: content.last_engagement || content.created_at,
      content_type: content.content_type === 'Reply' ? 'REPLY' : 'POST',
      parent_id: content.parent_id,
      space_id: content.space_id,
      body_inline: combinedBody(content.title, content.body),
      content_hash: null,
      content_size: null,
      pow_nonce: 0,
      pow_difficulty: 0,
      engagement_count: content.engagement_count,
      media: mapMedia(content.media_refs),
    },
    survival_probability: content.survival_probability,
    is_decayed: content.decay_state === 'decayed',
    is_protected: content.is_protected,
    hours_until_decay: hoursUntilDecay(content),
    pool: null,
    children: [],
  };

  // Attach the reply tree (best effort - never fail the page over replies)
  try {
    const repliesResult = await rpc.getReplies(contentId, 200, 8);
    const nodes = new Map<string, ContentResponse>();
    for (const reply of repliesResult.replies) {
      nodes.set(
        reply.content_id,
        replyToContentResponse(reply, content.space_id)
      );
    }
    // Attach each reply under its parent, but never form a cycle. Cyclic
    // parent data (e.g. a reply whose parent chain leads back to itself, seen
    // with wiki-revision content) would otherwise make a node its own
    // descendant and send the recursive walkers into a stack overflow.
    const replyById = new Map(
      repliesResult.replies.map((r) => [r.content_id, r])
    );
    const isAncestor = (
      candidateAncestorId: string,
      nodeId: string
    ): boolean => {
      // Walk up from nodeId via parent_id; true if we reach candidateAncestorId.
      let cur: string | undefined = nodeId;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        if (cur === candidateAncestorId) return true;
        guard.add(cur);
        const r = replyById.get(cur);
        cur = r?.parent_id;
      }
      return false;
    };
    for (const reply of repliesResult.replies) {
      const node = nodes.get(reply.content_id)!;
      if (reply.parent_id === reply.content_id) {
        // Self-parent: attach at root, never under itself.
        root.children!.push(node);
        continue;
      }
      const parentNode =
        reply.parent_id === content.content_id
          ? root
          : nodes.get(reply.parent_id);
      // Guard: don't attach node under one of its own descendants.
      if (
        parentNode &&
        parentNode !== root &&
        isAncestor(reply.content_id, reply.parent_id)
      ) {
        root.children!.push(node);
        continue;
      }
      (parentNode ?? root).children!.push(node);
    }
    // Oldest first at each level (cycle-safe: never revisit a node).
    const sorted = new Set<ContentResponse>();
    const sortTree = (n: ContentResponse): void => {
      if (sorted.has(n)) return;
      sorted.add(n);
      n.children?.sort((a, b) => a.item.created_at - b.item.created_at);
      n.children?.forEach(sortTree);
    };
    sortTree(root);
  } catch {
    // Replies unavailable - render the post alone
  }

  return { status: 'ok', data: root };
}

/**
 * Fetch identity profile + posts for a cs1 address.
 * Returns null when the node is unreachable.
 */
export async function fetchIdentityWithPosts(address: string): Promise<{
  identity: IdentitySummary;
  posts: SearchResult[];
} | null> {
  const rpc = getRpc();
  const userIdHex = addressToHex(address);

  let posts: SearchResult[] = [];
  let postCount = 0;
  let replyCount = 0;
  let firstSeen: number | null = null;
  let displayName: string | undefined;
  let bio: string | undefined;
  let website: string | undefined;

  if (userIdHex) {
    // Set of space ids the public gateway is willing to surface. A user's posts
    // in private/DM/profile/app (or not-yet-confirmed) spaces must not leak onto
    // their public profile, so we only show posts whose space is public. On
    // uncertainty (node blip) this is empty -> hide, never leak.
    const publicIds = await publicSpaceIdSet();

    try {
      const result = await rpc.getUserPosts(userIdHex, 50, 0, true);
      postCount = result.total_posts;
      replyCount = Math.max(0, result.total_content - result.total_posts);
      posts = result.items
        .filter(item => !isDecayed(item))
        .filter(item => publicIds.has(item.space_id))
        .map(item => summaryToSearchResult(item));
      for (const item of result.items) {
        if (firstSeen === null || item.created_at < firstSeen) {
          firstSeen = item.created_at;
        }
      }
    } catch (err) {
      if (err instanceof NodeUnreachableError) return null;
      // Method unavailable or identity unknown - fall through with empty posts
    }

    try {
      const profile = await rpc.getUserProfile(userIdHex);
      if (profile) {
        displayName = profile.display_name ?? undefined;
        bio = profile.bio ?? undefined;
        website = profile.website ?? undefined;
      }
    } catch (err) {
      if (err instanceof NodeUnreachableError) return null;
      // No profile published - that's fine
    }
  } else {
    // Address didn't decode; confirm the node is even reachable so the page
    // can distinguish offline from empty.
    try {
      await rpc.getInfo();
    } catch {
      return null;
    }
  }

  return {
    identity: {
      address,
      displayName,
      bio,
      website,
      postCount,
      replyCount,
      firstSeen,
    },
    posts,
  };
}

// ============================================================================
// Search index feeding (server-side lunr index over live node content)
// ============================================================================

let lastIndexFeed = 0;
const INDEX_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes

/**
 * Populate the server-side search index from the node.
 * Returns the number of indexed documents, or null if the node is unreachable.
 */
export async function feedSearchIndexer(): Promise<number | null> {
  const rpc = getRpc();
  let spaces: NodeSpaceSummary[];
  try {
    const _all = (await rpc.listSpaces(100)).spaces;
    triggerNameResolution(_all);
    spaces = publicSpaces(_all);
  } catch {
    return null;
  }

  const indexer = getSearchIndexer();
  indexer.clear();
  let total = 0;

  for (const space of spaces) {
    try {
      const { items } = await rpc.listSpaceContent(space.space_id, 200);
      for (const item of items) {
        if (isDecayed(item)) continue;
        indexer.addDocument(
          summaryToContentResponse(item),
          space.name || space.space_id
        );
        total++;
      }
    } catch {
      // Skip spaces that fail; index what we can
    }
  }

  lastIndexFeed = Date.now();
  return total;
}

/**
 * Ensure the search index is populated and reasonably fresh.
 * Returns { nodeOffline } so callers can surface honest state.
 */
export async function ensureSearchIndex(): Promise<{ nodeOffline: boolean }> {
  const indexer = getSearchIndexer();
  const stale = Date.now() - lastIndexFeed > INDEX_TTL_MS;
  if (indexer.size === 0 || stale) {
    const fed = await feedSearchIndexer();
    if (fed === null) {
      return { nodeOffline: true };
    }
  }
  return { nodeOffline: false };
}

// ============================================================================
// Sitemap
// ============================================================================

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

/**
 * Build sitemap entries from live node data.
 * Falls back to static routes only when the node is unreachable.
 */
export async function fetchSitemapEntries(baseUrl: string): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [
    { url: `${baseUrl}/`, changefreq: 'daily', priority: 1.0 },
    { url: `${baseUrl}/about`, changefreq: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/spaces`, changefreq: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/search`, changefreq: 'always', priority: 0.7 },
    { url: `${baseUrl}/docs/search-ranking`, changefreq: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/docs/gateway-operation`, changefreq: 'monthly', priority: 0.5 },
  ];

  const rpc = getRpc();
  let spaces: NodeSpaceSummary[];
  try {
    const _all = (await rpc.listSpaces(100)).spaces;
    triggerNameResolution(_all);
    spaces = publicSpaces(_all);
  } catch {
    // Node down: static routes only
    return entries;
  }

  const authors = new Set<string>();

  for (const space of spaces) {
    entries.push({
      url: `${baseUrl}/spaces/${encodeURIComponent(space.space_id)}`,
      lastmod: space.last_activity
        ? new Date(space.last_activity).toISOString()
        : undefined,
      changefreq: 'hourly',
      priority: 0.7,
    });

    try {
      const { items } = await rpc.listSpaceContent(space.space_id, 100);
      for (const item of items) {
        if (isDecayed(item) || item.content_type === 'Reply') continue;
        entries.push({
          url: `${baseUrl}/s/${encodeURIComponent(item.space_id)}/${encodeURIComponent(item.content_id)}`,
          lastmod: new Date(item.last_engagement || item.created_at).toISOString(),
          changefreq: 'daily',
          priority: Math.min(0.9, 0.5 + item.survival_probability * 0.4),
        });
        authors.add(item.author_id);
      }
    } catch {
      // Skip space content on error
    }
  }

  for (const author of authors) {
    entries.push({
      url: `${baseUrl}/u/${encodeURIComponent(author)}`,
      changefreq: 'weekly',
      priority: 0.5,
    });
  }

  return entries;
}
