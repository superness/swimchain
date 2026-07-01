/**
 * Navigation exports
 */

export * from './types';
export { RootNavigator } from './RootNavigator';
export { TabNavigator } from './TabNavigator';

// Core features navigation (Identity, Spaces, Content)
export {
  CoreNavigator,
  CORE_ROUTES,
  CoreNavigatorSetup,
  CoreNavigationSelectors,
  CoreNavigationHelpers,
} from './CoreNavigator';

export type {
  CoreStackParamList,
  CoreStackScreenProps,
  IdentityStackParamList,
  IdentityStackScreenProps,
  SpacesStackParamList,
  SpacesStackScreenProps,
  ContentStackParamList as CoreContentStackParamList,
  ContentStackScreenProps as CoreContentStackScreenProps,
} from './CoreNavigator';

// Content features navigation (Posts, Threads, Comments)
export {
  ContentNavigator,
  CONTENT_ROUTES,
  ContentNavigatorSetup,
  ContentNavigationSelectors,
  ContentNavigationHelpers,
} from './ContentNavigator';

export type {
  ContentStackParamList,
  ContentStackScreenProps,
  FeedStackParamList,
  FeedStackScreenProps,
  PostStackParamList,
  PostStackScreenProps,
  ThreadStackParamList,
  ThreadStackScreenProps,
  CommentStackParamList,
  CommentStackScreenProps,
} from './ContentNavigator';

// Social features navigation (Engagement, Reputation, Following)
export {
  SocialNavigator,
  SOCIAL_ROUTES,
  SocialNavigatorSetup,
  SocialNavigationSelectors,
  SocialNavigationHelpers,
} from './SocialNavigator';

export type {
  SocialStackParamList,
  SocialStackScreenProps,
  EngagementStackParamList,
  EngagementStackScreenProps,
  ReputationStackParamList,
  ReputationStackScreenProps,
  FollowingStackParamList,
  FollowingStackScreenProps,
} from './SocialNavigator';

// Moderation features navigation (Reports, Blocklist, Spam Attestation)
export {
  ModerationNavigator,
  MODERATION_ROUTES,
  ModerationNavigatorSetup,
  ModerationNavigationSelectors,
  ModerationNavigationHelpers,
} from './ModerationNavigator';

export type {
  ModerationStackParamList,
  ModerationStackScreenProps,
  ReportsStackParamList,
  ReportsStackScreenProps,
  BlocklistStackParamList,
  BlocklistStackScreenProps,
  SpamAttestationStackParamList,
  SpamAttestationStackScreenProps,
} from './ModerationNavigator';

// Sponsorship features navigation (Sponsorship, Penalties)
export {
  SponsorshipNavigator,
  SPONSORSHIP_ROUTES,
  SponsorshipNavigatorSetup,
  SponsorshipNavigationSelectors,
  SponsorshipNavigationHelpers,
} from './SponsorshipNavigator';

export type {
  SponsorshipNavigatorParamList,
  SponsorshipNavigatorScreenProps,
  SponsorshipStackParamList,
  SponsorshipStackScreenProps,
  PenaltiesStackParamList,
  PenaltiesStackScreenProps,
} from './SponsorshipNavigator';

// Network features navigation (Peers, Sync, Discovery)
export {
  NetworkNavigator,
  NETWORK_ROUTES,
  NetworkNavigatorSetup,
  NetworkNavigationSelectors,
  NetworkNavigationHelpers,
} from './NetworkNavigator';

export type {
  NetworkStackParamList,
  NetworkStackScreenProps,
  PeersStackParamList,
  PeersStackScreenProps,
  SyncStackParamList,
  SyncStackScreenProps,
  DiscoveryStackParamList,
  DiscoveryStackScreenProps,
} from './NetworkNavigator';

// Storage features navigation (Storage, Search Index, Archiver)
export {
  StorageNavigator,
  STORAGE_ROUTES,
  StorageNavigatorSetup,
  StorageNavigationSelectors,
  StorageNavigationHelpers,
} from './StorageNavigator';

export type {
  StorageStackParamList,
  StorageNavigatorScreenProps,
  StorageSubStackParamList,
  StorageSubStackScreenProps,
  SearchIndexStackParamList,
  SearchIndexStackScreenProps,
  ArchiverStackParamList,
  ArchiverStackScreenProps,
} from './StorageNavigator';

// Private features navigation (Private Spaces, Encryption, Invites)
export {
  PrivateNavigator,
  PRIVATE_ROUTES,
  PrivateNavigatorSetup,
  PrivateNavigationSelectors,
  PrivateNavigationHelpers,
} from './PrivateNavigator';

export type {
  PrivateStackParamList,
  PrivateStackScreenProps,
  PrivateSpacesStackParamList,
  PrivateSpacesStackScreenProps,
  EncryptionStackParamList,
  EncryptionStackScreenProps,
  InvitesStackParamList,
  InvitesStackScreenProps,
} from './PrivateNavigator';

// Media features navigation (Images, Gallery, Attachments)
export {
  MediaNavigator,
  MEDIA_ROUTES,
  MediaNavigatorSetup,
  MediaNavigationSelectors,
  MediaNavigationHelpers,
} from './MediaNavigator';

export type {
  MediaStackParamList,
  MediaStackScreenProps,
  ImagesStackParamList,
  ImagesStackScreenProps,
  GalleryStackParamList,
  GalleryStackScreenProps,
  AttachmentsStackParamList,
  AttachmentsStackScreenProps,
} from './MediaNavigator';

// Analytics features navigation (Metrics, Health, Decay)
export {
  AnalyticsNavigator,
  ANALYTICS_ROUTES,
  AnalyticsNavigatorSetup,
  AnalyticsNavigationSelectors,
  AnalyticsNavigationHelpers,
} from './AnalyticsNavigator';

export type {
  AnalyticsStackParamList,
  AnalyticsStackScreenProps,
  MetricsStackParamList,
  MetricsStackScreenProps,
  HealthStackParamList,
  HealthStackScreenProps,
  DecayStackParamList,
  DecayStackScreenProps,
} from './AnalyticsNavigator';

// Bridge features navigation (CrossChain, External)
export {
  BridgeNavigator,
  BRIDGE_ROUTES,
  BridgeNavigatorSetup,
  BridgeNavigationSelectors,
  BridgeNavigationHelpers,
} from './BridgeNavigator';

export type {
  BridgeStackParamList,
  BridgeStackScreenProps,
  CrossChainStackParamList,
  CrossChainStackScreenProps,
  ExternalStackParamList,
  ExternalStackScreenProps,
} from './BridgeNavigator';

// Settings features navigation (Profile, Preferences, Backup)
export {
  SettingsNavigator,
  SETTINGS_ROUTES,
  SettingsNavigatorSetup,
  SettingsNavigationSelectors,
  SettingsNavigationHelpers,
} from './SettingsNavigator';

export type {
  SettingsStackParamList,
  SettingsStackScreenProps,
  ProfileStackParamList,
  ProfileStackScreenProps,
  PreferencesStackParamList,
  PreferencesStackScreenProps,
  BackupStackParamList,
  BackupStackScreenProps,
} from './SettingsNavigator';

// ============================================================================
// UNIFIED ROUTING CONFIGURATION
// ============================================================================

/**
 * All navigators in a single registry for easy access
 */
export const NavigatorRegistry = {
  Core: {
    navigator: CoreNavigator,
    routes: CORE_ROUTES,
    setup: CoreNavigatorSetup,
    selectors: CoreNavigationSelectors,
    helpers: CoreNavigationHelpers,
  },
  Content: {
    navigator: ContentNavigator,
    routes: CONTENT_ROUTES,
    setup: ContentNavigatorSetup,
    selectors: ContentNavigationSelectors,
    helpers: ContentNavigationHelpers,
  },
  Social: {
    navigator: SocialNavigator,
    routes: SOCIAL_ROUTES,
    setup: SocialNavigatorSetup,
    selectors: SocialNavigationSelectors,
    helpers: SocialNavigationHelpers,
  },
  Moderation: {
    navigator: ModerationNavigator,
    routes: MODERATION_ROUTES,
    setup: ModerationNavigatorSetup,
    selectors: ModerationNavigationSelectors,
    helpers: ModerationNavigationHelpers,
  },
  Sponsorship: {
    navigator: SponsorshipNavigator,
    routes: SPONSORSHIP_ROUTES,
    setup: SponsorshipNavigatorSetup,
    selectors: SponsorshipNavigationSelectors,
    helpers: SponsorshipNavigationHelpers,
  },
  Network: {
    navigator: NetworkNavigator,
    routes: NETWORK_ROUTES,
    setup: NetworkNavigatorSetup,
    selectors: NetworkNavigationSelectors,
    helpers: NetworkNavigationHelpers,
  },
  Storage: {
    navigator: StorageNavigator,
    routes: STORAGE_ROUTES,
    setup: StorageNavigatorSetup,
    selectors: StorageNavigationSelectors,
    helpers: StorageNavigationHelpers,
  },
  Private: {
    navigator: PrivateNavigator,
    routes: PRIVATE_ROUTES,
    setup: PrivateNavigatorSetup,
    selectors: PrivateNavigationSelectors,
    helpers: PrivateNavigationHelpers,
  },
  Media: {
    navigator: MediaNavigator,
    routes: MEDIA_ROUTES,
    setup: MediaNavigatorSetup,
    selectors: MediaNavigationSelectors,
    helpers: MediaNavigationHelpers,
  },
  Analytics: {
    navigator: AnalyticsNavigator,
    routes: ANALYTICS_ROUTES,
    setup: AnalyticsNavigatorSetup,
    selectors: AnalyticsNavigationSelectors,
    helpers: AnalyticsNavigationHelpers,
  },
  Bridge: {
    navigator: BridgeNavigator,
    routes: BRIDGE_ROUTES,
    setup: BridgeNavigatorSetup,
    selectors: BridgeNavigationSelectors,
    helpers: BridgeNavigationHelpers,
  },
  Settings: {
    navigator: SettingsNavigator,
    routes: SETTINGS_ROUTES,
    setup: SettingsNavigatorSetup,
    selectors: SettingsNavigationSelectors,
    helpers: SettingsNavigationHelpers,
  },
} as const;

/**
 * All route constants combined for global access
 */
export const ALL_ROUTES = {
  CORE: CORE_ROUTES,
  CONTENT: CONTENT_ROUTES,
  SOCIAL: SOCIAL_ROUTES,
  MODERATION: MODERATION_ROUTES,
  SPONSORSHIP: SPONSORSHIP_ROUTES,
  NETWORK: NETWORK_ROUTES,
  STORAGE: STORAGE_ROUTES,
  PRIVATE: PRIVATE_ROUTES,
  MEDIA: MEDIA_ROUTES,
  ANALYTICS: ANALYTICS_ROUTES,
  BRIDGE: BRIDGE_ROUTES,
  SETTINGS: SETTINGS_ROUTES,
} as const;

/**
 * Navigator group names for iteration and dynamic access
 */
export const NAVIGATOR_GROUPS = [
  'Core',
  'Content',
  'Social',
  'Moderation',
  'Sponsorship',
  'Network',
  'Storage',
  'Private',
  'Media',
  'Analytics',
  'Bridge',
  'Settings',
] as const;

export type NavigatorGroupName = (typeof NAVIGATOR_GROUPS)[number];

/**
 * All navigators as an array for easy registration
 */
export const ALL_NAVIGATORS = [
  CoreNavigator,
  ContentNavigator,
  SocialNavigator,
  ModerationNavigator,
  SponsorshipNavigator,
  NetworkNavigator,
  StorageNavigator,
  PrivateNavigator,
  MediaNavigator,
  AnalyticsNavigator,
  BridgeNavigator,
  SettingsNavigator,
] as const;

/**
 * Unified navigation helpers for cross-navigator operations
 */
export const UnifiedNavigationHelpers = {
  /**
   * Get navigator registry entry by group name
   */
  getNavigatorByGroup: (group: NavigatorGroupName) => NavigatorRegistry[group],

  /**
   * Get all routes for a specific group
   */
  getRoutesForGroup: (group: NavigatorGroupName) => NavigatorRegistry[group].routes,

  /**
   * Get setup configuration for a specific group
   */
  getSetupForGroup: (group: NavigatorGroupName) => NavigatorRegistry[group].setup,

  /**
   * Get selectors for a specific group
   */
  getSelectorsForGroup: (group: NavigatorGroupName) => NavigatorRegistry[group].selectors,

  /**
   * Get helpers for a specific group
   */
  getHelpersForGroup: (group: NavigatorGroupName) => NavigatorRegistry[group].helpers,

  /**
   * Check if a route belongs to a specific navigator group
   */
  isRouteInGroup: (routeName: string, group: NavigatorGroupName): boolean => {
    const routes = NavigatorRegistry[group].routes;
    const allRouteNames = Object.values(routes).flatMap((subRoutes) =>
      typeof subRoutes === 'object' ? Object.values(subRoutes) : [subRoutes]
    );
    return allRouteNames.includes(routeName);
  },

  /**
   * Find which navigator group a route belongs to
   */
  findGroupForRoute: (routeName: string): NavigatorGroupName | null => {
    for (const group of NAVIGATOR_GROUPS) {
      if (UnifiedNavigationHelpers.isRouteInGroup(routeName, group)) {
        return group;
      }
    }
    return null;
  },
};
