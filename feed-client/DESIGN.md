# Feed Client Design Document

## Overview

A social media-style feed client (Facebook/TikTok inspired) that presents Swimchain content as a personally curated, scrollable feed. Unlike the forum-client's space-centric threaded view, feed-client is content-centric with a continuous stream of posts.

**Key Principle**: User-curated feed, not algorithmic. Users explicitly choose what appears in their feed by following spaces, users, and saving posts.

## Philosophy Comparison

| Aspect | Forum-Client | Feed-Client |
|--------|-------------|-------------|
| Primary View | Space → Threads → Replies | Unified Feed → Post Detail |
| Navigation | Hierarchical (space tree) | Flat (infinite scroll) |
| Content Focus | Discussion threads | Individual posts |
| Discovery | Browse spaces | Follow users/spaces |
| Interaction | Reply threads | Like, Comment, Share |
| Layout | Table/list | Card-based |

## User Experience

### Core Feed Experience

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  [Search]           [Create Post] [Profile] [⚙] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 👤 alice.eth · 2h · in #crypto                   │   │
│  │                                                   │   │
│  │ Just deployed my first smart contract! 🎉        │   │
│  │                                                   │   │
│  │ [Image Preview]                                   │   │
│  │                                                   │   │
│  │ ❤️ 42  💬 12  🔄 5  📌                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 👤 bob_dev · 5h · in #rust                       │   │
│  │                                                   │   │
│  │ Hot take: async Rust is actually great once you  │   │
│  │ understand the mental model...                   │   │
│  │                                                   │   │
│  │ ❤️ 128  💬 45  🔄 23  📌                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Load More / Infinite Scroll]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Feed Curation Panel

```
┌─────────────────────────────────────────────────────────┐
│  My Feed Sources                              [+ Add]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  FOLLOWED SPACES (12)                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ #crypto        142 posts/day    [Mute] [Remove] │   │
│  │ #rust          89 posts/day     [Mute] [Remove] │   │
│  │ #gaming        234 posts/day    [Mute] [Remove] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  FOLLOWED USERS (28)                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 👤 alice.eth   ~5 posts/day     [Mute] [Remove] │   │
│  │ 👤 bob_dev     ~2 posts/day     [Mute] [Remove] │   │
│  │ 👤 crypto_sam  ~10 posts/day    [Mute] [Remove] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  SAVED POSTS (45)                                       │
│  [View Saved Posts →]                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Feed Curation Model

### What Users Can Follow

1. **Spaces** - All posts from a space appear in feed
2. **Users** - All posts from a user (across all spaces) appear in feed
3. **Saved Posts** - Bookmarked posts for later (separate tab)

### Feed Composition

```typescript
interface FeedSource {
  type: 'space' | 'user';
  id: string;           // spaceId or userPk
  displayName?: string;
  addedAt: number;
  muted: boolean;       // Temporarily hide without unfollowing
  notifications: boolean;
}

interface FeedPreferences {
  followedSpaces: FeedSource[];
  followedUsers: FeedSource[];
  savedPosts: string[]; // Post IDs

  // Display preferences
  showRepliesInFeed: boolean;     // Show reply activity
  showEngagementsInFeed: boolean; // "alice liked bob's post"
  sortOrder: 'recent' | 'hot';    // Default sort
  compactMode: boolean;           // Smaller cards
}
```

### Feed Generation (Client-Side)

The feed is assembled client-side by:

1. Fetch recent posts from each followed space (`get_space_content`)
2. Fetch recent posts from each followed user (`get_user_posts`)
3. Merge and deduplicate (same post from followed user in followed space)
4. Sort by timestamp (recent) or engagement score (hot)
5. Apply mute filters
6. Render with infinite scroll pagination

```typescript
async function buildFeed(
  preferences: FeedPreferences,
  rpc: SwimchainRpc,
  cursor?: string,
  limit = 20
): Promise<FeedItem[]> {
  const posts: FeedItem[] = [];

  // Fetch from followed spaces
  for (const space of preferences.followedSpaces) {
    if (space.muted) continue;
    const spaceContent = await rpc.getSpaceContent(space.id, { limit: 50 });
    posts.push(...spaceContent.threads.map(t => ({ ...t, source: 'space', spaceId: space.id })));
  }

  // Fetch from followed users
  for (const user of preferences.followedUsers) {
    if (user.muted) continue;
    const userPosts = await rpc.getUserPosts(user.id, { limit: 50 });
    posts.push(...userPosts.posts.map(p => ({ ...p, source: 'user', userId: user.id })));
  }

  // Deduplicate, sort, paginate
  return dedupeAndSort(posts, preferences.sortOrder, cursor, limit);
}
```

## Data Storage

### Local Storage (IndexedDB)

Feed preferences stored locally per identity:

```typescript
// Key: `feed_prefs_${userPkHex}`
interface StoredFeedPreferences {
  version: 1;
  followedSpaces: FeedSource[];
  followedUsers: FeedSource[];
  savedPosts: string[];
  settings: {
    showRepliesInFeed: boolean;
    showEngagementsInFeed: boolean;
    sortOrder: 'recent' | 'hot';
    compactMode: boolean;
  };
  lastUpdated: number;
}
```

### Optional: On-Chain Sync

For cross-device sync, preferences could be stored encrypted in a personal "feed config" space:

```typescript
const feedConfigSpaceId = sha256(`feed_config:v1:${userPk}`);
// Store encrypted preferences as a post in this space
```

## Component Architecture

### Pages

```
/                    → Main feed (posts from followed sources)
/explore             → Discover spaces and users to follow
/saved               → Saved/bookmarked posts
/profile/:userPk     → User profile with follow button
/space/:spaceId      → Space view with follow button
/post/:postId        → Single post detail with comments
/compose             → Create new post
/settings            → Feed preferences
```

### Core Components

```
src/
├── components/
│   ├── Feed/
│   │   ├── FeedContainer.tsx      # Infinite scroll container
│   │   ├── FeedItem.tsx           # Post card
│   │   ├── FeedItemCompact.tsx    # Compact post card
│   │   ├── FeedSkeleton.tsx       # Loading state
│   │   └── EmptyFeed.tsx          # No content state
│   │
│   ├── Post/
│   │   ├── PostCard.tsx           # Full post display
│   │   ├── PostMedia.tsx          # Image/video gallery
│   │   ├── PostActions.tsx        # Like, comment, share, save
│   │   ├── PostComments.tsx       # Comment thread
│   │   └── CommentComposer.tsx    # Add comment
│   │
│   ├── Compose/
│   │   ├── ComposeModal.tsx       # Create post modal
│   │   ├── SpaceSelector.tsx      # Choose space to post in
│   │   ├── MediaUploader.tsx      # Attach images
│   │   └── PostPreview.tsx        # Preview before posting
│   │
│   ├── Profile/
│   │   ├── ProfileHeader.tsx      # User banner, avatar, follow btn
│   │   ├── ProfileFeed.tsx        # User's posts
│   │   └── FollowButton.tsx       # Follow/unfollow user
│   │
│   ├── Space/
│   │   ├── SpaceHeader.tsx        # Space info, follow btn
│   │   ├── SpaceFeed.tsx          # Space's posts
│   │   └── FollowSpaceButton.tsx  # Follow/unfollow space
│   │
│   ├── Explore/
│   │   ├── TrendingSpaces.tsx     # Popular spaces to follow
│   │   ├── SuggestedUsers.tsx     # Users to follow
│   │   └── SearchResults.tsx      # Search spaces/users
│   │
│   ├── Sidebar/
│   │   ├── LeftSidebar.tsx        # Navigation
│   │   ├── RightSidebar.tsx       # Suggestions, trending
│   │   └── FeedSourcesList.tsx    # Manage followed sources
│   │
│   └── Common/
│       ├── UserAvatar.tsx         # Reuse from forum-client
│       ├── TimeAgo.tsx            # Relative timestamps
│       ├── EngagementBar.tsx      # Likes, comments, shares
│       └── DecayIndicator.tsx     # Content freshness
│
├── hooks/
│   ├── useFeed.ts                 # Build and fetch feed
│   ├── useFeedPreferences.ts      # Manage followed sources
│   ├── useInfiniteScroll.ts       # Pagination
│   ├── useFollowUser.ts           # Follow/unfollow user
│   ├── useFollowSpace.ts          # Follow/unfollow space
│   ├── useSavedPosts.ts           # Bookmark management
│   └── usePostActions.ts          # Like, share, etc.
│
├── pages/
│   ├── Home.tsx                   # Main feed
│   ├── Explore.tsx                # Discover content
│   ├── Saved.tsx                  # Saved posts
│   ├── Profile.tsx                # User profile
│   ├── Space.tsx                  # Space view
│   ├── Post.tsx                   # Single post
│   ├── Compose.tsx                # Create post
│   └── Settings.tsx               # Preferences
│
└── lib/
    ├── feedBuilder.ts             # Feed assembly logic
    ├── feedStorage.ts             # IndexedDB operations
    └── engagement.ts              # Engagement scoring
```

## Key Hooks

### useFeed

```typescript
interface UseFeedResult {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

function useFeed(options?: {
  sortOrder?: 'recent' | 'hot';
  filter?: 'all' | 'spaces' | 'users';
}): UseFeedResult;
```

### useFeedPreferences

```typescript
interface UseFeedPreferencesResult {
  preferences: FeedPreferences;
  loading: boolean;

  // Space management
  followSpace: (spaceId: string, name?: string) => Promise<void>;
  unfollowSpace: (spaceId: string) => Promise<void>;
  muteSpace: (spaceId: string, muted: boolean) => Promise<void>;
  isFollowingSpace: (spaceId: string) => boolean;

  // User management
  followUser: (userPk: string, name?: string) => Promise<void>;
  unfollowUser: (userPk: string) => Promise<void>;
  muteUser: (userPk: string, muted: boolean) => Promise<void>;
  isFollowingUser: (userPk: string) => boolean;

  // Saved posts
  savePost: (postId: string) => Promise<void>;
  unsavePost: (postId: string) => Promise<void>;
  isPostSaved: (postId: string) => boolean;

  // Settings
  updateSettings: (settings: Partial<FeedSettings>) => Promise<void>;
}
```

### useFollowUser / useFollowSpace

```typescript
// Simple toggle hooks for follow buttons
function useFollowUser(userPk: string): {
  isFollowing: boolean;
  toggle: () => Promise<void>;
  loading: boolean;
};

function useFollowSpace(spaceId: string): {
  isFollowing: boolean;
  toggle: () => Promise<void>;
  loading: boolean;
};
```

## UI/UX Details

### Post Card Design

```
┌─────────────────────────────────────────────────────────┐
│ ┌──┐                                                    │
│ │🖼│ Display Name              · 2h · in #spacename     │
│ └──┘ @truncated_address...                    [···]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Post content goes here. Can be multiple lines of text.  │
│ Links are clickable and previews are shown below.       │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │              [Image/Media Preview]                  │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ❤️ 42      💬 12 comments      🔄 5      📌 Save       │
│                                                         │
│  [Decay indicator: ████████░░ 80% fresh]               │
└─────────────────────────────────────────────────────────┘
```

### Follow Button States

```
[+ Follow]           → Not following
[✓ Following ▼]      → Following (dropdown: Mute, Unfollow)
[🔇 Muted ▼]         → Muted (dropdown: Unmute, Unfollow)
```

### Infinite Scroll Behavior

- Load 20 posts initially
- Fetch more when scrolled 80% down
- Show skeleton loaders while fetching
- Pull-to-refresh on mobile
- "New posts available" banner when feed updates

### Empty States

**No followed sources:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    📭 Your feed is empty                │
│                                                         │
│     Start by following some spaces or users to see      │
│     their posts here.                                   │
│                                                         │
│              [Explore Spaces]  [Find Users]             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**No posts from sources:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                   🌱 Nothing new yet                    │
│                                                         │
│     The spaces and users you follow haven't posted      │
│     recently. Check back later!                         │
│                                                         │
│                    [Explore More]                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Reuse from swimchain-react

The feed-client will import these from `@swimchain/react`:

```typescript
// Core providers
import { SwimchainProvider, RpcProvider, useRpc } from '@swimchain/react';

// Identity
import { useStoredIdentity, useStoredKeypair } from '@swimchain/react';

// Content fetching
import { useSpaces, useSpaceThreads, useUserPosts, useThread, useReplies } from '@swimchain/react';

// Engagement & posting
import { computePow, createPostChallenge, createReplyChallenge } from '@swimchain/react';

// Profile
import { useUserProfile, getAvatarColor, getAvatarInitials } from '@swimchain/react';

// Utilities
import { useDecay, bytesToHex, hexToBytes } from '@swimchain/react';

// Encryption (for private posts)
import { encryptPost, decryptPost, isEncrypted } from '@swimchain/react';

// Caching
import { getContentFromCache, setContentInCache } from '@swimchain/react';
```

## Implementation Phases

### Phase 1: Core Feed (MVP)
- [ ] Project setup (Vite, React, TypeScript)
- [ ] Basic routing (/, /explore, /profile/:pk, /space/:id)
- [ ] Feed preferences storage (IndexedDB)
- [ ] Follow/unfollow spaces
- [ ] Follow/unfollow users
- [ ] Feed builder combining sources
- [ ] Infinite scroll with FeedItem cards
- [ ] Basic post detail view

### Phase 2: Engagement & Compose
- [ ] Like/engage on posts (with PoW)
- [ ] Comment on posts
- [ ] Compose new post modal
- [ ] Media upload support
- [ ] Save/bookmark posts
- [ ] Share functionality

### Phase 3: Discovery
- [ ] Explore page with trending spaces
- [ ] User search
- [ ] Space search
- [ ] "Suggested for you" based on follows

### Phase 4: Polish
- [ ] Pull-to-refresh
- [ ] "New posts" notification banner
- [ ] Compact mode toggle
- [ ] Sort options (recent/hot)
- [ ] Mute functionality
- [ ] Keyboard navigation
- [ ] Mobile responsive design

### Phase 5: Advanced
- [ ] Cross-device sync (on-chain preferences)
- [ ] Notifications for followed user posts
- [ ] Quote posts / reposts
- [ ] Post scheduling
- [ ] Analytics (your posts' reach)

## File Structure

```
feed-client/
├── public/
│   └── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── lib/
│   ├── styles/
│   │   ├── globals.css
│   │   ├── variables.css
│   │   └── components/
│   └── types/
│       └── feed.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── DESIGN.md
```

## package.json Dependencies

```json
{
  "name": "@swimchain/feed-client",
  "version": "0.1.0",
  "dependencies": {
    "@swimchain/react": "workspace:*",
    "@swimchain/core": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

## Key Differences from Forum-Client

| Feature | Forum-Client | Feed-Client |
|---------|-------------|-------------|
| Primary navigation | Space tree sidebar | Follow-based feed |
| Content display | Threaded discussions | Card stream |
| Discovery | Browse space list | Explore/search |
| User relationship | View profile | Follow/unfollow |
| Space relationship | Navigate to | Follow/unfollow |
| Saved content | N/A | Bookmarks tab |
| Post creation | In space context | Global + space picker |
| Replies | Nested tree | Flat comments |
| Engagement | Upvote/downvote | Like + comment |

## Success Metrics

1. **Feed Load Time** - < 2s for initial 20 posts
2. **Scroll Performance** - 60fps during infinite scroll
3. **Follow Action** - < 500ms to update preferences
4. **Post Render** - < 100ms per card
5. **Memory Usage** - < 100MB for 500 posts in memory
