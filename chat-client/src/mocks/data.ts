/**
 * Mock data for Swimchain Chat Client
 * Provides realistic test data for development
 */

import type {
  Space,
  SpaceCategory,
  Message,
  PresenceState,
} from '../types';

// ============================================
// Mock Users
// ============================================

export const mockUsers = [
  { address: 'cs1qabcdef1234567890abcdef1234567890abc1', name: 'alice' },
  { address: 'cs1qabcdef1234567890abcdef1234567890abc2', name: 'bob' },
  { address: 'cs1qabcdef1234567890abcdef1234567890abc3', name: 'charlie' },
  { address: 'cs1qabcdef1234567890abcdef1234567890abc4', name: 'diana' },
  { address: 'cs1qabcdef1234567890abcdef1234567890abc5', name: 'eve' },
  { address: 'cs1qabcdef1234567890abcdef1234567890abc6', name: 'frank' },
  { address: 'cs1qabcdef1234567890abcdef1234567890abc7', name: 'grace' },
  { address: 'cs1qabcdef1234567890abcdef1234567890abc8', name: 'henry' },
];

// Current user (for testing)
export const currentUser = mockUsers[0]!;

// ============================================
// Mock Spaces
// ============================================

export const mockSpaces: Space[] = [
  {
    id: 'sp1rustlang0000000000000000000000000001',
    name: 'rust-lang',
    icon: '🦀',
    memberCount: 1250,
    onlineCount: 89,
    unreadCount: 3,
    category: 'Tech',
  },
  {
    id: 'sp1webdev00000000000000000000000000002',
    name: 'web-dev',
    icon: '🌐',
    memberCount: 890,
    onlineCount: 45,
    unreadCount: 0,
    category: 'Tech',
  },
  {
    id: 'sp1boston00000000000000000000000000003',
    name: 'boston',
    icon: '🏙️',
    memberCount: 450,
    onlineCount: 23,
    unreadCount: 5,
    category: 'Local',
  },
  {
    id: 'sp1woodwork000000000000000000000000004',
    name: 'woodworking',
    icon: '🪵',
    memberCount: 320,
    onlineCount: 12,
    unreadCount: 0,
    category: 'Hobbies',
  },
  {
    id: 'sp1fishing0000000000000000000000000005',
    name: 'fishing',
    icon: '🎣',
    memberCount: 180,
    onlineCount: 8,
    unreadCount: 1,
    category: 'Hobbies',
  },
];

export const mockSpaceCategories: SpaceCategory[] = [
  {
    name: 'Tech',
    spaces: mockSpaces.filter(s => s.category === 'Tech'),
    isCollapsed: false,
  },
  {
    name: 'Local',
    spaces: mockSpaces.filter(s => s.category === 'Local'),
    isCollapsed: false,
  },
  {
    name: 'Hobbies',
    spaces: mockSpaces.filter(s => s.category === 'Hobbies'),
    isCollapsed: false,
  },
];

// ============================================
// Mock Messages
// ============================================

const now = Math.floor(Date.now() / 1000);
const minute = 60;
const hour = 60 * minute;

// Helper to create a message
function createMessage(
  id: string,
  authorIndex: number,
  content: string,
  spaceId: string,
  minutesAgo: number,
  heatPercent: number,
  replyCount: number = 0,
  parentId: string | null = null,
): Message {
  const author = mockUsers[authorIndex];
  if (!author) throw new Error(`Invalid author index: ${authorIndex}`);

  return {
    id: `sha256:${id}`,
    authorAddress: author.address,
    content,
    createdAt: now - minutesAgo * minute,
    lastEngagement: now - Math.floor(minutesAgo * minute * 0.5),
    heatPercent,
    poolCurrent: Math.min(60, Math.floor(heatPercent * 0.6)),
    poolTarget: 60,
    replyCount,
    parentId,
    spaceId,
    reactions: {
      quickCount: Math.floor(Math.random() * 5),
      standardCount: Math.floor(Math.random() * 3),
    },
  };
}

// rust-lang messages (10)
export const rustLangMessages: Message[] = [
  createMessage('msg001', 0, "Just discovered the borrow checker isn't as scary as I thought! Any tips for Rust beginners?", mockSpaces[0]!.id, 5, 92, 4),
  createMessage('msg002', 1, "Working on a new async runtime implementation. The performance gains are incredible!", mockSpaces[0]!.id, 12, 85, 2),
  createMessage('msg003', 2, "Has anyone tried the new const generics features? They're game-changing for library authors.", mockSpaces[0]!.id, 25, 78),
  createMessage('msg004', 3, "Quick question: what's the difference between Box, Rc, and Arc?", mockSpaces[0]!.id, 45, 65, 5),
  createMessage('msg005', 4, "Just released v2.0 of my CLI tool written in Rust. Feedback welcome!", mockSpaces[0]!.id, 90, 52),
  createMessage('msg006', 5, "The Rust community is so welcoming. Just want to say thanks to everyone who helps beginners!", mockSpaces[0]!.id, 120, 38),
  createMessage('msg007', 6, "Struggling with lifetimes. Can someone explain 'a syntax?", mockSpaces[0]!.id, 180, 25, 3),
  createMessage('msg008', 7, "PSA: Don't forget to run clippy on your code. It catches so many issues!", mockSpaces[0]!.id, 240, 18),
  createMessage('msg009', 0, "Anyone going to RustConf next year?", mockSpaces[0]!.id, 360, 8),
  createMessage('msg010', 1, "Old thread but still relevant: memory safety without GC is beautiful", mockSpaces[0]!.id, 720, 3),
];

// web-dev messages (5)
export const webDevMessages: Message[] = [
  createMessage('msg011', 2, "React vs Vue vs Svelte - the eternal debate continues. What's your pick for 2024?", mockSpaces[1]!.id, 8, 88, 6),
  createMessage('msg012', 3, "Just migrated from webpack to vite. Build times went from 45s to 2s!", mockSpaces[1]!.id, 30, 72),
  createMessage('msg013', 4, "CSS Grid is underrated. Just solved a complex layout in 10 lines.", mockSpaces[1]!.id, 60, 55),
  createMessage('msg014', 5, "TypeScript tip: use satisfies for better type inference", mockSpaces[1]!.id, 150, 32),
  createMessage('msg015', 6, "Anyone else tired of JavaScript fatigue?", mockSpaces[1]!.id, 300, 15),
];

// boston messages (5)
export const bostonMessages: Message[] = [
  createMessage('msg016', 7, "Best coffee shops near South Station? New to the area.", mockSpaces[2]!.id, 15, 75, 8),
  createMessage('msg017', 0, "The T is actually running on time today. Mark your calendars!", mockSpaces[2]!.id, 45, 68),
  createMessage('msg018', 1, "Looking for hiking buddies for Blue Hills this weekend", mockSpaces[2]!.id, 90, 42),
  createMessage('msg019', 2, "Snow forecast for tomorrow. Stock up on milk and bread!", mockSpaces[2]!.id, 200, 22),
  createMessage('msg020', 3, "Best lobster roll: Neptune vs James Hook?", mockSpaces[2]!.id, 400, 12),
];

// woodworking messages (3)
export const woodworkingMessages: Message[] = [
  createMessage('msg021', 4, "Just finished my first dovetail joint. It's not perfect but I'm proud!", mockSpaces[3]!.id, 20, 82),
  createMessage('msg022', 5, "Japanese hand tools vs Western - which do you prefer?", mockSpaces[3]!.id, 100, 45, 3),
  createMessage('msg023', 6, "Looking for hardwood suppliers in the Northeast", mockSpaces[3]!.id, 250, 18),
];

// fishing messages (2)
export const fishingMessages: Message[] = [
  createMessage('msg024', 7, "Caught a 5lb bass at Walden Pond yesterday! Catch and release of course.", mockSpaces[4]!.id, 35, 70),
  createMessage('msg025', 0, "Best time of year for striper fishing on the Cape?", mockSpaces[4]!.id, 180, 28),
];

// All messages combined
export const allMessages: Message[] = [
  ...rustLangMessages,
  ...webDevMessages,
  ...bostonMessages,
  ...woodworkingMessages,
  ...fishingMessages,
];

// Messages by space
export const messagesBySpace: Record<string, Message[]> = {
  [mockSpaces[0]!.id]: rustLangMessages,
  [mockSpaces[1]!.id]: webDevMessages,
  [mockSpaces[2]!.id]: bostonMessages,
  [mockSpaces[3]!.id]: woodworkingMessages,
  [mockSpaces[4]!.id]: fishingMessages,
};

// ============================================
// Mock Thread Replies
// ============================================

// Replies to "Just discovered the borrow checker" (msg001)
export const msg001Replies: Message[] = [
  createMessage('reply001a', 1, "Start with simple ownership patterns. The book's chapter on ownership is great!", mockSpaces[0]!.id, 4, 88, 0, 'sha256:msg001'),
  createMessage('reply001b', 2, "Practice with small projects. Error messages are actually super helpful!", mockSpaces[0]!.id, 3, 82, 0, 'sha256:msg001'),
  createMessage('reply001c', 3, "Don't fight the borrow checker, work with it. It's teaching you good patterns.", mockSpaces[0]!.id, 2, 75, 0, 'sha256:msg001'),
  createMessage('reply001d', 0, "Thanks everyone! These tips are really helpful.", mockSpaces[0]!.id, 1, 70, 0, 'sha256:msg001'),
];

// Replies to "Quick question: Box vs Rc vs Arc" (msg004)
export const msg004Replies: Message[] = [
  createMessage('reply004a', 4, "Box: single ownership, heap allocated. Rc: shared ownership single-threaded. Arc: shared ownership thread-safe.", mockSpaces[0]!.id, 40, 78, 0, 'sha256:msg004'),
  createMessage('reply004b', 5, "Use Box when you need heap allocation. Rc when you need shared refs. Arc for multithreading.", mockSpaces[0]!.id, 38, 72, 0, 'sha256:msg004'),
  createMessage('reply004c', 6, "Arc has atomic reference counting overhead, so prefer Rc in single-threaded code.", mockSpaces[0]!.id, 35, 68, 0, 'sha256:msg004'),
  createMessage('reply004d', 7, "Also look into Cow (Clone on Write) for some use cases!", mockSpaces[0]!.id, 30, 62, 0, 'sha256:msg004'),
  createMessage('reply004e', 3, "This is super helpful, thanks team!", mockSpaces[0]!.id, 25, 55, 0, 'sha256:msg004'),
];

// Replies to "Best coffee shops" (msg016)
export const msg016Replies: Message[] = [
  createMessage('reply016a', 1, "Thinking Cup on Tremont is solid. Great espresso.", mockSpaces[2]!.id, 12, 72, 0, 'sha256:msg016'),
  createMessage('reply016b', 2, "Ogawa Coffee if you want something special. Japanese-style pour over.", mockSpaces[2]!.id, 10, 68, 0, 'sha256:msg016'),
];

// All thread replies
export const threadReplies: Record<string, Message[]> = {
  'sha256:msg001': msg001Replies,
  'sha256:msg004': msg004Replies,
  'sha256:msg016': msg016Replies,
};

// ============================================
// Mock Presence States
// ============================================

export const mockPresenceStates: PresenceState[] = [
  { userId: mockUsers[0]!.address, status: 'online', lastSeen: now },
  { userId: mockUsers[1]!.address, status: 'online', lastSeen: now - 30 },
  { userId: mockUsers[2]!.address, status: 'online', lastSeen: now - 60 },
  { userId: mockUsers[3]!.address, status: 'online', lastSeen: now - 90 },
  { userId: mockUsers[4]!.address, status: 'away', lastSeen: now - 5 * minute },
  { userId: mockUsers[5]!.address, status: 'away', lastSeen: now - 8 * minute },
  { userId: mockUsers[6]!.address, status: 'offline', lastSeen: now - 2 * hour },
  { userId: mockUsers[7]!.address, status: 'offline', lastSeen: now - 5 * hour },
];

// ============================================
// Helper Functions
// ============================================

/**
 * Get messages for a specific space
 */
export function getMessagesForSpace(spaceId: string): Message[] {
  return messagesBySpace[spaceId] ?? [];
}

/**
 * Get thread replies for a message
 */
export function getThreadReplies(messageId: string): Message[] {
  return threadReplies[messageId] ?? [];
}

/**
 * Get space by ID
 */
export function getSpaceById(spaceId: string): Space | undefined {
  return mockSpaces.find(s => s.id === spaceId);
}

/**
 * Get presence for a user
 */
export function getPresenceForUser(userId: string): PresenceState | undefined {
  return mockPresenceStates.find(p => p.userId === userId);
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars: number = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
