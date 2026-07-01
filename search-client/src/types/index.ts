/**
 * Core type definitions for the Swimchain Search Client
 */

/**
 * Search result types
 */
export type SearchResultType = 'space' | 'thread' | 'reply' | 'user';

/**
 * Search sort options
 */
export type SearchSortOption = 'relevance' | 'recent' | 'reactions' | 'replies';

/**
 * Parsed query from advanced search syntax
 */
export interface ParsedQuery {
  terms: string[];           // Plain search terms
  phrases: string[];         // "exact phrases"
  author?: string;
  space?: string;
  type?: SearchResultType;
  before?: number;           // Timestamp
  after?: number;            // Timestamp
  hasMedia?: boolean;
  minReplies?: number;
  minReactions?: number;
  excludeTerms: string[];
}

/**
 * Search parameters for RPC call
 */
export interface SearchParams {
  query: string;
  types?: SearchResultType[];
  spaceId?: string;
  author?: string;
  afterTimestamp?: number;
  beforeTimestamp?: number;
  hasMedia?: boolean;
  minReplies?: number;
  minReactions?: number;
  excludeTerms?: string[];
  sortBy?: SearchSortOption;
  limit?: number;
  offset?: number;
}

/**
 * Search filters from UI
 */
export interface SearchFilters {
  types?: SearchResultType[];
  spaceId?: string;
  author?: string;
  dateRange?: 'any' | 'day' | 'week' | 'month' | 'year';
  sortBy?: SearchSortOption;
}

/**
 * Highlighted text snippets in search results
 */
export interface SearchHighlights {
  title?: string;
  content?: string;
  name?: string;
}

/**
 * Base search result
 */
export interface SearchResult {
  id: string;
  type: SearchResultType;
  score: number;
  highlights: SearchHighlights;
  data: SpaceInfo | ThreadInfo | ReplyInfo | UserInfo;
}

/**
 * Space information
 */
export interface SpaceInfo {
  spaceId: string;
  name: string;
  description?: string;
  threadCount: number;
  memberCount: number;
  lastActivity: number;
  isActive: boolean;
}

/**
 * Thread information
 */
export interface ThreadInfo {
  contentId: string;
  spaceId: string;
  spaceName?: string;
  authorId: string;
  authorName?: string;
  title: string;
  body: string;
  createdAt: number;
  lastEngagement: number;
  replyCount: number;
  reactionCount: number;
  hasMedia: boolean;
  sponsorshipId?: string;
}

/**
 * Reply information
 */
export interface ReplyInfo {
  contentId: string;
  parentId: string;
  threadId: string;
  threadTitle?: string;
  spaceId: string;
  spaceName?: string;
  authorId: string;
  authorName?: string;
  body: string;
  createdAt: number;
  reactionCount: number;
  sponsorshipId?: string;
}

/**
 * User/Identity information
 */
export interface UserInfo {
  identityId: string;
  displayName?: string;
  bio?: string;
  postCount: number;
  replyCount: number;
  reactionsReceived: number;
  createdAt: number;
  isVerified: boolean;
}

/**
 * Search response from RPC
 */
export interface SearchResponse {
  results: SearchResult[];
  total: number;
  took_ms: number;
  suggestions?: string[];
}

/**
 * Stored identity data (persisted in localStorage)
 */
export interface StoredIdentity {
  address: string;         // cs1... bech32m address
  publicKey: string;       // Hex-encoded public key (64 hex chars = 32 bytes)
  seed: string;            // Hex-encoded seed/private key (64 hex chars = 32 bytes)
  createdAt: number;       // UNIX timestamp of creation
  powSolution?: {          // Optional stored PoW solution
    nonce: string;
    timestamp: string;
    difficulty: number;
  };
}

/**
 * Network synchronization status
 */
export interface SyncStatus {
  chainPercent: number;
  peerCount: number;
  peersReceiving: number;
  peersSending: number;
  storageMB: number;
  storageTargetMB: number;
  lastBlockTime: number;
  state: 'synced' | 'syncing' | 'behind' | 'offline';
}

/**
 * Tab options for search results
 */
export type SearchTab = 'all' | 'spaces' | 'threads' | 'replies' | 'users';
