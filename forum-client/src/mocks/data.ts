/**
 * Mock data for the Forum Client MVP
 *
 * This data simulates what would come from the Swimchain network.
 * In production, this would be replaced with actual network calls.
 */

import type { Space, Thread, Reply, SyncStatus, PoolState, DecayInfo } from '../types';

// Helper to generate timestamps
const now = Math.floor(Date.now() / 1000);
const hour = 3600;
const day = 86400;

/**
 * Create mock decay info based on survival probability
 */
function createDecayInfo(survivalProbability: number, isProtected: boolean = false): DecayInfo {
  return {
    state: isProtected ? 'protected' : survivalProbability >= 0.5 ? 'active' : survivalProbability >= 0.0625 ? 'stale' : 'decayed',
    survivalProbability,
    isProtected,
    secondsUntilDecayStarts: isProtected ? 48 * hour : null,
    secondsUntilPruned: Math.floor(survivalProbability * 30 * day), // Rough estimate
    timeSinceEngagement: isProtected ? 0 : Math.floor((1 - survivalProbability) * 7 * day),
  };
}

/**
 * Mock spaces for demonstration
 */
export const MOCK_SPACES: Space[] = [
  {
    id: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    name: 'general',
    description: 'General discussion and announcements',
    creator: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    postCount: 145,
    activePostCount: 23,
    createdAt: now - 30 * day,
  },
  {
    id: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7krust',
    name: 'rust-lang',
    description: 'Rust programming language discussions',
    creator: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    postCount: 89,
    activePostCount: 15,
    createdAt: now - 25 * day,
    parentId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7ktech',
  },
  {
    id: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7ktech',
    name: 'technology',
    description: 'Technology and software development',
    creator: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    postCount: 234,
    activePostCount: 42,
    createdAt: now - 28 * day,
  },
  {
    id: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kboston',
    name: 'boston',
    description: 'Boston local community',
    creator: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
    postCount: 67,
    activePostCount: 8,
    createdAt: now - 20 * day,
    parentId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7klocal',
  },
  {
    id: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7klocal',
    name: 'local',
    description: 'Local community discussions',
    creator: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    postCount: 156,
    activePostCount: 19,
    createdAt: now - 29 * day,
  },
  {
    id: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kcrypto',
    name: 'cryptography',
    description: 'Cryptography and security discussions',
    creator: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
    postCount: 45,
    activePostCount: 12,
    createdAt: now - 15 * day,
    parentId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7ktech',
  },
];

/**
 * Create a pool state based on parameters
 */
function createPool(contributed: number, contributors: number): PoolState {
  const status: PoolState['status'] =
    contributed >= 60 ? 'complete' :
    contributed > 0 ? 'partial' : 'empty';

  return {
    contributedSeconds: contributed,
    requiredSeconds: 60,
    contributorCount: contributors,
    status,
  };
}

/**
 * Mock threads for demonstration
 */
export const MOCK_THREADS: Thread[] = [
  {
    id: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    title: 'Welcome to Swimchain!',
    content: 'This is the first post on Swimchain. Welcome to a new era of decentralized discussion where content persistence is driven by collective engagement rather than centralized moderation.',
    createdAt: now - 2 * hour,
    lastEngagement: now - 30 * 60,
    replyCount: 12,
    heat: 0.95,
    pool: createPool(60, 8),
    decay: createDecayInfo(0.95, true), // Still in floor protection
  },
  {
    id: 'sha256:b2c3d4e5f6789012345678901234567890abcdef01',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
    title: 'Understanding the Heat Decay System',
    content: 'The heat decay system uses a 7-day half-life with a 48-hour floor protection period. This means new content is protected for 48 hours, then begins to decay exponentially.',
    createdAt: now - 6 * hour,
    lastEngagement: now - 2 * hour,
    replyCount: 8,
    heat: 0.78,
    pool: createPool(45, 5),
    decay: createDecayInfo(0.78, true), // Still in floor protection
  },
  {
    id: 'sha256:c3d4e5f6789012345678901234567890abcdef0123',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7krust',
    author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    title: 'Implementing Swimchain in Rust',
    content: 'Swimchain is implemented in Rust for performance and safety. The core library compiles to WASM for browser integration.',
    createdAt: now - 12 * hour,
    lastEngagement: now - 4 * hour,
    replyCount: 15,
    heat: 0.65,
    pool: createPool(60, 10),
    decay: createDecayInfo(0.65, true), // Still in floor protection
  },
  {
    id: 'sha256:d4e5f6789012345678901234567890abcdef012345',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7krust',
    author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
    title: 'WASM Bundle Optimization Tips',
    content: 'Here are some tips for optimizing your WASM bundle size when working with the Swimchain library...',
    createdAt: now - 1 * day,
    lastEngagement: now - 8 * hour,
    replyCount: 6,
    heat: 0.52,
    pool: createPool(35, 4),
    decay: createDecayInfo(0.52, true), // Still in floor protection
  },
  {
    id: 'sha256:e5f6789012345678901234567890abcdef01234567',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kboston',
    author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    title: 'Boston Swimchain Meetup?',
    content: 'Anyone interested in organizing a Boston area meetup to discuss Swimchain and decentralized social platforms?',
    createdAt: now - 2 * day,
    lastEngagement: now - 1 * day,
    replyCount: 4,
    heat: 0.35,
    pool: createPool(20, 3),
    decay: createDecayInfo(0.35), // Past floor, actively decaying
  },
  {
    id: 'sha256:f6789012345678901234567890abcdef0123456789',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kcrypto',
    author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
    title: 'Ed25519 Signature Verification Deep Dive',
    content: 'Let\'s explore how Ed25519 signatures work in Swimchain and why they were chosen for identity verification.',
    createdAt: now - 3 * day,
    lastEngagement: now - 2 * day,
    replyCount: 9,
    heat: 0.22,
    pool: createPool(60, 7),
    decay: createDecayInfo(0.22), // Past floor, stale
  },
  {
    id: 'sha256:789012345678901234567890abcdef0123456789ab',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
    title: 'Fading Content Example',
    content: 'This is an example of content that is in the fading state, demonstrating the decay visualization.',
    createdAt: now - 5 * day,
    lastEngagement: now - 4 * day,
    replyCount: 2,
    heat: 0.12,
    pool: createPool(15, 2),
    decay: createDecayInfo(0.12), // Past floor, stale
  },
  {
    id: 'sha256:89012345678901234567890abcdef0123456789abc',
    spaceId: 'sp1qw508d6qejxtdg4y5r3zarvary0c5xw7ktech',
    author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
    title: 'Almost Decayed Content',
    content: 'This content is about to decay completely unless engagement keeps it alive.',
    createdAt: now - 7 * day,
    lastEngagement: now - 6 * day,
    replyCount: 1,
    heat: 0.03,
    pool: createPool(5, 1),
    decay: createDecayInfo(0.03), // Nearly decayed
  },
];

/**
 * Mock replies for demonstration (for the first thread)
 */
export const MOCK_REPLIES: Reply[] = [
  {
    id: 'reply-001',
    threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
    parentId: null,
    author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
    content: 'This is really exciting! I\'ve been waiting for a decentralized discussion platform that doesn\'t rely on centralized moderation.',
    createdAt: now - 1.5 * hour,
    lastEngagement: now - 1 * hour,
    heat: 0.92,
    depth: 0,
    children: [
      {
        id: 'reply-002',
        threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
        parentId: 'reply-001',
        author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
        content: 'Thanks! The key innovation is that content naturally expires unless the community collectively decides to keep it alive through engagement.',
        createdAt: now - 1.2 * hour,
        lastEngagement: now - 45 * 60,
        heat: 0.88,
        depth: 1,
        children: [
          {
            id: 'reply-003',
            threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
            parentId: 'reply-002',
            author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
            content: 'How does the 60-second pool work exactly?',
            createdAt: now - 1 * hour,
            lastEngagement: now - 50 * 60,
            heat: 0.85,
            depth: 2,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'reply-004',
    threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
    parentId: null,
    author: 'cs1q9vza2e8x573nczrlzms0wvx3gsqjx7vavt3ev8',
    content: 'The proof-of-work requirement for posting is clever - it prevents spam without needing moderators.',
    createdAt: now - 50 * 60,
    lastEngagement: now - 40 * 60,
    heat: 0.90,
    depth: 0,
    children: [
      {
        id: 'reply-005',
        threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
        parentId: 'reply-004',
        author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
        content: 'Exactly! The economic cost of PoW makes large-scale spam attacks impractical.',
        createdAt: now - 45 * 60,
        lastEngagement: now - 35 * 60,
        heat: 0.88,
        depth: 1,
        children: [],
      },
    ],
  },
  {
    id: 'reply-006',
    threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
    parentId: null,
    author: 'cs1q9vza2e8x573nczrlzms0wvx3gsqjx7vavt3ev8',
    content: 'What happens to content that nobody engages with?',
    createdAt: now - 40 * 60,
    lastEngagement: now - 30 * 60,
    heat: 0.87,
    depth: 0,
    children: [
      {
        id: 'reply-007',
        threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
        parentId: 'reply-006',
        author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
        content: 'It naturally fades away after about 4 half-lives (roughly a month). The heat indicator shows this visually.',
        createdAt: now - 35 * 60,
        lastEngagement: now - 30 * 60,
        heat: 0.85,
        depth: 1,
        children: [
          {
            id: 'reply-008',
            threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
            parentId: 'reply-007',
            author: 'cs1q9vza2e8x573nczrlzms0wvx3gsqjx7vavt3ev8',
            content: 'That\'s a really elegant solution to content moderation!',
            createdAt: now - 32 * 60,
            lastEngagement: now - 30 * 60,
            heat: 0.84,
            depth: 2,
            children: [
              {
                id: 'reply-009',
                threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
                parentId: 'reply-008',
                author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
                content: 'Agreed! No central authority needed.',
                createdAt: now - 30 * 60,
                lastEngagement: now - 30 * 60,
                heat: 0.82,
                depth: 3,
                children: [
                  {
                    id: 'reply-010',
                    threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
                    parentId: 'reply-009',
                    author: 'cs1qw508d6qejxtdg4y5r3zarvary0c5xw7k7k4ev2',
                    content: 'This is a deeply nested reply to test the threading UI.',
                    createdAt: now - 28 * 60,
                    lastEngagement: now - 28 * 60,
                    heat: 0.80,
                    depth: 4,
                    children: [
                      {
                        id: 'reply-011',
                        threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
                        parentId: 'reply-010',
                        author: 'cs1q9vza2e8x573nczrlzms0wvx3gsqjx7vavt3ev8',
                        content: 'Depth 5! Testing deep nesting.',
                        createdAt: now - 26 * 60,
                        lastEngagement: now - 26 * 60,
                        heat: 0.78,
                        depth: 5,
                        children: [
                          {
                            id: 'reply-012',
                            threadId: 'sha256:a1b2c3d4e5f6789012345678901234567890abcdef',
                            parentId: 'reply-011',
                            author: 'cs1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0g',
                            content: 'Depth 6 - should still be visible but more collapsed.',
                            createdAt: now - 24 * 60,
                            lastEngagement: now - 24 * 60,
                            heat: 0.76,
                            depth: 6,
                            children: [],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Mock sync status (simulates a node that is synced)
 */
export const MOCK_SYNC_STATUS: SyncStatus = {
  chainPercent: 100,
  peerCount: 8,
  peersReceiving: 5,
  peersSending: 3,
  storageMB: 245,
  storageTargetMB: 500,
  lastBlockTime: now - 10,
  state: 'synced',
};

/**
 * Get threads for a specific space
 */
export function getThreadsForSpace(spaceId: string): Thread[] {
  return MOCK_THREADS.filter(t => t.spaceId === spaceId);
}

/**
 * Get a specific thread by ID
 */
export function getThread(threadId: string): Thread | undefined {
  return MOCK_THREADS.find(t => t.id === threadId);
}

/**
 * Get replies for a specific thread
 */
export function getRepliesForThread(threadId: string): Reply[] {
  return MOCK_REPLIES.filter(r => r.threadId === threadId && r.parentId === null);
}

/**
 * Get a specific space by ID
 */
export function getSpace(spaceId: string): Space | undefined {
  return MOCK_SPACES.find(s => s.id === spaceId);
}

/**
 * Get child spaces for a parent
 */
export function getChildSpaces(parentId: string | undefined): Space[] {
  return MOCK_SPACES.filter(s => s.parentId === parentId);
}

/**
 * Get root spaces (no parent)
 */
export function getRootSpaces(): Space[] {
  return MOCK_SPACES.filter(s => !s.parentId);
}
