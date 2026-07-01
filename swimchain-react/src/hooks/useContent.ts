/**
 * Content fetching hooks for Swimchain
 *
 * Provides hooks for fetching spaces, threads, replies, and reactions.
 *
 * @packageDocumentation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc } from './useRpc';
import type {
  ContentResult,
  ReplyResult,
  ReactionResult,
} from '../lib/rpc';

// =========================================================================
// Types
// =========================================================================

export interface Space {
  id: string;
  name: string;
  description: string;
  postCount: number;
  lastActivity: number | null;
}

export interface Thread {
  id: string;
  spaceId: string;
  author: string;
  title: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  decayState: string;
  survivalProbability: number;
  hasPool: boolean;
  poolProgress: number;
}

export interface Reply {
  id: string;
  parentId: string | null;
  author: string;
  content: string;
  createdAt: number;
  lastEngagement: number;
  depth: number;
  childCount: number;
  children: Reply[];
  decayState: string;
  bodyLoading: boolean;
}

// =========================================================================
// Spaces Hook
// =========================================================================

/**
 * Hook to fetch spaces from the node
 */
export function useSpaces(options?: { limit?: number; offset?: number }): {
  spaces: Space[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  const refetch = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpaces({ limit, offset });

      const transformedSpaces: Space[] = result.spaces.map((s) => ({
        id: s.space_id,
        name: s.name ?? s.space_id.substring(0, 12) + '...',
        description: `${s.post_count} posts`,
        postCount: s.post_count,
        lastActivity: s.last_activity,
      }));

      setSpaces(transformedSpaces);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spaces');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, limit, offset]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { spaces, total, loading, error, refetch };
}

// =========================================================================
// Space Threads Hook
// =========================================================================

/**
 * Hook to fetch threads (posts) for a space
 */
export function useSpaceThreads(
  spaceId: string,
  options?: { limit?: number; offset?: number }
): {
  threads: Thread[];
  total: number;
  loading: boolean;
  error: string | null;
  fetching: boolean;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !spaceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpacePosts(spaceId, { limit, offset });

      const transformedThreads: Thread[] = result.items.map((item) =>
        contentToThread(item)
      );

      setThreads(transformedThreads);
      setTotal(result.total);
      setError(null);

      // Request missing content from network
      const missingIds = result.items
        .filter((item) => item.body === null)
        .map((item) => item.content_id)
        .filter((id) => !pendingRequestsRef.current.has(id));

      if (missingIds.length > 0) {
        setFetching(true);
        await requestMissingContent(rpc, missingIds, pendingRequestsRef.current);

        // Poll for arrival
        await pollForContent(
          rpc,
          spaceId,
          missingIds,
          pendingRequestsRef.current,
          (updatedItems) => {
            setThreads(updatedItems.map(contentToThread));
          },
          () => setFetching(false)
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch threads');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, spaceId, limit, offset]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { threads, total, loading, error, fetching, refetch };
}

// =========================================================================
// Single Thread Hook
// =========================================================================

/**
 * Hook to fetch a single thread by ID
 */
export function useThread(contentId: string): {
  thread: Thread | null;
  loading: boolean;
  error: string | null;
  fetching: boolean;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = await rpc.getContent(contentId);
      setThread(contentToThread(content));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      if (errorMessage.includes('not found')) {
        // Request from network
        setFetching(true);
        try {
          await rpc.requestContent(contentId);
          // Poll for arrival
          await pollForSingleContent(rpc, contentId, (content) => {
            setThread(contentToThread(content));
            setFetching(false);
          });
        } catch {
          setError('Content not available');
          setFetching(false);
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { thread, loading, error, fetching, refetch };
}

// =========================================================================
// Replies Hook
// =========================================================================

/**
 * Hook to fetch replies for content
 */
export function useReplies(contentId: string): {
  replies: Reply[];
  loading: boolean;
  fetching: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getReplies(contentId);
      const replyTree = buildReplyTree(result.replies, contentId);
      setReplies(replyTree);

      // Request missing bodies
      const emptyBodies = result.replies
        .filter((r) => !r.body)
        .map((r) => r.content_id)
        .filter((id) => !pendingRequestsRef.current.has(id));

      if (emptyBodies.length > 0) {
        setFetching(true);
        await requestMissingContent(rpc, emptyBodies, pendingRequestsRef.current);

        // Poll for arrival
        let pollCount = 0;
        const maxPolls = 10;

        const poll = async () => {
          if (pollCount >= maxPolls) {
            setFetching(false);
            emptyBodies.forEach((id) => pendingRequestsRef.current.delete(id));
            return;
          }

          pollCount++;
          await new Promise((resolve) => setTimeout(resolve, 2000));

          try {
            const pollResult = await rpc.getReplies(contentId);
            const stillEmpty = pollResult.replies.filter(
              (r) => !r.body && emptyBodies.includes(r.content_id)
            );

            setReplies(buildReplyTree(pollResult.replies, contentId));

            if (stillEmpty.length === 0) {
              setFetching(false);
              emptyBodies.forEach((id) => pendingRequestsRef.current.delete(id));
              return;
            }

            await poll();
          } catch {
            await poll();
          }
        };

        poll();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch replies');
      setReplies([]);
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { replies, loading, fetching, error, refetch };
}

// =========================================================================
// Reactions Hook
// =========================================================================

/**
 * Hook to fetch reactions for content
 */
export function useReactions(contentId: string): {
  reactions: ReactionResult[];
  total: number;
  userReactions: number[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [reactions, setReactions] = useState<ReactionResult[]>([]);
  const [total, setTotal] = useState(0);
  const [userReactions] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getReactions(contentId);
      setReactions(result.reactions);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch reactions');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reactions, total, userReactions, loading, error, refetch };
}

// =========================================================================
// User Posts Hook (Feed-style)
// =========================================================================

export interface UserPost {
  id: string;
  contentType: 'post' | 'reply';
  spaceId: string;
  parentId: string | null;
  author: string;
  title: string | null;
  content: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  decayState: string;
  survivalProbability: number;
  hasPool: boolean;
  poolProgress: number;
}

/**
 * Hook to fetch posts and replies by a specific user
 */
export function useUserPosts(
  userId: string,
  options?: { limit?: number; offset?: number; includeReplies?: boolean }
): {
  posts: UserPost[];
  totalPosts: number;
  totalContent: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalContent, setTotalContent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const includeReplies = options?.includeReplies ?? false;

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getUserPosts(userId, { limit, offset, includeReplies });

      const transformedPosts: UserPost[] = result.items.map((item) => ({
        id: item.content_id,
        contentType: item.content_type === 'post' ? 'post' : 'reply',
        spaceId: item.space_id,
        parentId: item.parent_id,
        author: item.author_id,
        title: item.title ?? null,
        content: item.body ?? '',
        createdAt: item.created_at,
        lastEngagement: item.last_engagement ?? item.created_at,
        replyCount: item.reply_count ?? 0,
        decayState: item.decay_state ?? 'active',
        survivalProbability: 1.0,
        hasPool: item.has_pool ?? false,
        poolProgress: item.pool_progress ?? 0,
      }));

      setPosts(transformedPosts);
      setTotalPosts(result.total_posts);
      setTotalContent(result.total_content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user posts');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, userId, limit, offset, includeReplies]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { posts, totalPosts, totalContent, loading, error, refetch };
}

// =========================================================================
// Helpers
// =========================================================================

function contentToThread(content: ContentResult): Thread {
  const body = content.body ?? '';
  const title =
    content.title ??
    (content.body === null
      ? '(Loading...)'
      : body.split('\n')[0]?.trim().substring(0, 80) || 'Untitled');

  return {
    id: content.content_id,
    spaceId: content.space_id,
    author: content.author_id,
    title,
    content: body,
    createdAt: content.created_at || Date.now(),
    lastEngagement: content.last_engagement || content.created_at || Date.now(),
    replyCount: content.reply_count ?? 0,
    decayState: content.decay_state || 'active',
    survivalProbability: 1.0,
    hasPool: content.has_pool ?? false,
    poolProgress: content.pool_progress ?? 0,
  };
}

function buildReplyTree(flatReplies: ReplyResult[], threadId: string): Reply[] {
  const replyMap = new Map<string, Reply>();

  for (const item of flatReplies) {
    const reply: Reply = {
      id: item.content_id,
      parentId: item.parent_id === threadId ? null : item.parent_id,
      author: item.author_id,
      content: item.body,
      createdAt: Math.floor(item.created_at / 1000),
      lastEngagement: Math.floor(item.last_engagement / 1000),
      depth: item.depth ?? 0,
      childCount: item.child_count ?? 0,
      children: [],
      decayState: item.decay_state || 'active',
      bodyLoading: !item.body,
    };
    replyMap.set(item.content_id, reply);
  }

  const rootReplies: Reply[] = [];

  for (const reply of replyMap.values()) {
    if (reply.parentId === null) {
      rootReplies.push(reply);
    } else {
      const parent = replyMap.get(reply.parentId);
      if (parent) {
        parent.children.push(reply);
      } else {
        rootReplies.push(reply);
      }
    }
  }

  const sortByTime = (a: Reply, b: Reply) => a.createdAt - b.createdAt;
  rootReplies.sort(sortByTime);

  const sortChildren = (reply: Reply) => {
    reply.children.sort(sortByTime);
    reply.children.forEach(sortChildren);
  };
  rootReplies.forEach(sortChildren);

  return rootReplies;
}

async function requestMissingContent(
  rpc: import('../lib/rpc').SwimchainRpc,
  contentIds: string[],
  pendingSet: Set<string>
): Promise<void> {
  const requests = contentIds.map(async (id) => {
    pendingSet.add(id);
    try {
      await rpc.requestContent(id);
    } catch {
      // Ignore individual failures
    }
  });
  await Promise.all(requests);
}

async function pollForContent(
  rpc: import('../lib/rpc').SwimchainRpc,
  spaceId: string,
  missingIds: string[],
  pendingSet: Set<string>,
  onUpdate: (items: ContentResult[]) => void,
  onComplete: () => void
): Promise<void> {
  let pollCount = 0;
  const maxPolls = 15;

  const poll = async () => {
    if (pollCount >= maxPolls) {
      onComplete();
      missingIds.forEach((id) => pendingSet.delete(id));
      return;
    }

    pollCount++;
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const result = await rpc.listSpaceContent(spaceId);
      const posts = result.items.filter(
        (item) => item.content_type === 'Post' || !item.parent_id
      );

      onUpdate(posts);

      const stillMissing = posts.filter(
        (item) => item.body === null && missingIds.includes(item.content_id)
      );

      if (stillMissing.length === 0) {
        onComplete();
        missingIds.forEach((id) => pendingSet.delete(id));
        return;
      }

      await poll();
    } catch {
      await poll();
    }
  };

  poll();
}

async function pollForSingleContent(
  rpc: import('../lib/rpc').SwimchainRpc,
  contentId: string,
  onFound: (content: ContentResult) => void
): Promise<void> {
  let retries = 0;
  const maxRetries = 30;

  const poll = async (): Promise<void> => {
    if (retries >= maxRetries) {
      throw new Error('Content not available');
    }

    retries++;
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const content = await rpc.getContent(contentId);
      onFound(content);
    } catch {
      await poll();
    }
  };

  await poll();
}
