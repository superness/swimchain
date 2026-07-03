/**
 * Content fetching hooks for Swimchain
 *
 * Provides hooks for fetching spaces, threads, replies, and reactions.
 *
 * @packageDocumentation
 */
import type { ReactionResult } from '../lib/rpc';
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
/**
 * Hook to fetch spaces from the node
 */
export declare function useSpaces(options?: {
    limit?: number;
    offset?: number;
}): {
    spaces: Space[];
    total: number;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
};
/**
 * Hook to fetch threads (posts) for a space
 */
export declare function useSpaceThreads(spaceId: string, options?: {
    limit?: number;
    offset?: number;
}): {
    threads: Thread[];
    total: number;
    loading: boolean;
    error: string | null;
    fetching: boolean;
    refetch: () => Promise<void>;
};
/**
 * Hook to fetch a single thread by ID
 */
export declare function useThread(contentId: string): {
    thread: Thread | null;
    loading: boolean;
    error: string | null;
    fetching: boolean;
    refetch: () => Promise<void>;
};
/**
 * Hook to fetch replies for content
 */
export declare function useReplies(contentId: string): {
    replies: Reply[];
    loading: boolean;
    fetching: boolean;
    error: string | null;
    refetch: () => Promise<void>;
};
/**
 * Hook to fetch reactions for content
 */
export declare function useReactions(contentId: string): {
    reactions: ReactionResult[];
    total: number;
    userReactions: number[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
};
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
export declare function useUserPosts(userId: string, options?: {
    limit?: number;
    offset?: number;
    includeReplies?: boolean;
}): {
    posts: UserPost[];
    totalPosts: number;
    totalContent: number;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
};
//# sourceMappingURL=useContent.d.ts.map