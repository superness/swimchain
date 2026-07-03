/**
 * Hook exports
 */

export { useFeed } from './useFeed';
export type { UseFeedResult, UseFeedOptions } from './useFeed';

export {
  useFeedPreferences,
  useFollowSpace,
  useFollowUser,
} from './useFeedPreferences';
export type { UseFeedPreferencesResult } from './useFeedPreferences';

export {
  useRpc,
  useSpaces,
  RpcProvider,
  // Content submission hooks
  usePostSubmit,
  useReplySubmit,
  useEditSubmit,
  // Content fetching hooks
  useThread,
  useReplies,
  // Media hooks
  useMediaUpload,
} from './useRpc';
export { useStoredIdentity } from './useStoredIdentity';
export { useStoredKeypair } from './useStoredKeypair';

// Action PoW hooks
export {
  useActionPow,
  usePostPow,
  useReplyPow,
  useEngagementPow,
  useSpaceCreationPow,
  useEditPow,
  ActionType,
} from './useActionPow';
export type { MiningState, MiningProgress, UseActionPowResult } from './useActionPow';

// Profile hooks
export {
  useUserProfile,
  useUserProfiles,
  clearProfileCache,
} from './useUserProfile';

// Profile modal hook (from component)
export { useProfileModal } from '../components/UserProfileModal';

// Blocklist hooks
export { useBlocklist } from './useBlocklist';
export type { BlockType, UseBlocklistResult } from './useBlocklist';

// Spam/Report hooks (from useRpc)
export { useSpamStatus, useSpamReport } from './useRpc';
export type { SpamReason } from './useRpc';

// Engagement/Reaction hooks (from useRpc)
export { useReactions, usePoolContribution } from './useRpc';

// Sponsorship hooks
export { useSponsorship, SponsorshipProvider } from './useSponsorship';
export { useSponsorshipOffers } from './useSponsorshipOffers';
export { useMySponsorshipOffers } from './useMySponsorshipOffers';

// Real-time new-posts indicator (node WebSocket events)
export { useNewPostsIndicator } from './useNewPostsIndicator';
export type { UseNewPostsIndicatorResult } from './useNewPostsIndicator';

// Keyboard navigation
export { useKeyboardNavigation, KeyboardNavigationProvider } from './useKeyboardNavigation';
