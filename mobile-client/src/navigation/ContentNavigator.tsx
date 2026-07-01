/**
 * ContentNavigator - Navigation for Content Features Group
 * Handles: Posts, Threads, Comments navigation
 *
 * Routes:
 * - Feed: Content feed browsing (global or space-specific)
 * - Posts: Post viewing, creation, editing
 * - Threads: Threaded discussion navigation
 * - Comments: Comment chains and replies
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';

import { COLORS } from '../theme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Content feature navigation param lists
 */

// Feed-related screens
export type FeedStackParamList = {
  FeedHome: undefined;
  FeedBySpace: { spaceId: string };
  FeedByTag: { tag: string };
  FeedTrending: undefined;
  FeedNew: undefined;
};

// Post-related screens
export type PostStackParamList = {
  PostDetail: { postId: string };
  PostCreate: { spaceId?: string };
  PostEdit: { postId: string };
  PostPreview: { content: string; title?: string; spaceId?: string };
  PostHistory: { postId: string };
  PostShare: { postId: string };
};

// Thread-related screens
export type ThreadStackParamList = {
  ThreadView: { postId: string; spaceId: string };
  ThreadExpanded: { postId: string; spaceId: string; focusCommentId?: string };
  ThreadParticipants: { postId: string };
};

// Comment-related screens
export type CommentStackParamList = {
  CommentThread: { parentId: string; postId: string };
  CommentCompose: { postId: string; replyTo?: string };
  CommentEdit: { commentId: string };
  CommentHistory: { commentId: string };
};

// Combined Content navigation param list
export type ContentStackParamList = {
  // Feed routes
  Feed: undefined;
  FeedHome: undefined;
  FeedBySpace: { spaceId: string };
  FeedByTag: { tag: string };
  FeedTrending: undefined;
  FeedNew: undefined;

  // Post routes
  PostDetail: { postId: string };
  PostCreate: { spaceId?: string };
  PostEdit: { postId: string };
  PostPreview: { content: string; title?: string; spaceId?: string };
  PostHistory: { postId: string };
  PostShare: { postId: string };

  // Thread routes
  ThreadView: { postId: string; spaceId: string };
  ThreadExpanded: { postId: string; spaceId: string; focusCommentId?: string };
  ThreadParticipants: { postId: string };

  // Comment routes
  CommentThread: { parentId: string; postId: string };
  CommentCompose: { postId: string; replyTo?: string };
  CommentEdit: { commentId: string };
  CommentHistory: { commentId: string };
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type ContentStackScreenProps<T extends keyof ContentStackParamList> =
  NativeStackScreenProps<ContentStackParamList, T>;

export type FeedStackScreenProps<T extends keyof FeedStackParamList> =
  NativeStackScreenProps<FeedStackParamList, T>;

export type PostStackScreenProps<T extends keyof PostStackParamList> =
  NativeStackScreenProps<PostStackParamList, T>;

export type ThreadStackScreenProps<T extends keyof ThreadStackParamList> =
  NativeStackScreenProps<ThreadStackParamList, T>;

export type CommentStackScreenProps<T extends keyof CommentStackParamList> =
  NativeStackScreenProps<CommentStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Content features
 */
export const CONTENT_ROUTES = {
  // Feed routes
  FEED: {
    HOME: 'FeedHome',
    BY_SPACE: 'FeedBySpace',
    BY_TAG: 'FeedByTag',
    TRENDING: 'FeedTrending',
    NEW: 'FeedNew',
  },

  // Post routes
  POST: {
    DETAIL: 'PostDetail',
    CREATE: 'PostCreate',
    EDIT: 'PostEdit',
    PREVIEW: 'PostPreview',
    HISTORY: 'PostHistory',
    SHARE: 'PostShare',
  },

  // Thread routes
  THREAD: {
    VIEW: 'ThreadView',
    EXPANDED: 'ThreadExpanded',
    PARTICIPANTS: 'ThreadParticipants',
  },

  // Comment routes
  COMMENT: {
    THREAD: 'CommentThread',
    COMPOSE: 'CommentCompose',
    EDIT: 'CommentEdit',
    HISTORY: 'CommentHistory',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const ContentNavigationSelectors = {
  // Feed selectors
  getFeedBySpaceParams: (route: ContentStackScreenProps<'FeedBySpace'>['route']) => ({
    spaceId: route.params.spaceId,
  }),

  getFeedByTagParams: (route: ContentStackScreenProps<'FeedByTag'>['route']) => ({
    tag: route.params.tag,
  }),

  // Post selectors
  getPostDetailParams: (route: ContentStackScreenProps<'PostDetail'>['route']) => ({
    postId: route.params.postId,
  }),

  getPostCreateParams: (route: ContentStackScreenProps<'PostCreate'>['route']) => ({
    spaceId: route.params?.spaceId,
  }),

  getPostEditParams: (route: ContentStackScreenProps<'PostEdit'>['route']) => ({
    postId: route.params.postId,
  }),

  getPostPreviewParams: (route: ContentStackScreenProps<'PostPreview'>['route']) => ({
    content: route.params.content,
    title: route.params?.title,
    spaceId: route.params?.spaceId,
  }),

  getPostHistoryParams: (route: ContentStackScreenProps<'PostHistory'>['route']) => ({
    postId: route.params.postId,
  }),

  getPostShareParams: (route: ContentStackScreenProps<'PostShare'>['route']) => ({
    postId: route.params.postId,
  }),

  // Thread selectors
  getThreadViewParams: (route: ContentStackScreenProps<'ThreadView'>['route']) => ({
    postId: route.params.postId,
    spaceId: route.params.spaceId,
  }),

  getThreadExpandedParams: (route: ContentStackScreenProps<'ThreadExpanded'>['route']) => ({
    postId: route.params.postId,
    spaceId: route.params.spaceId,
    focusCommentId: route.params?.focusCommentId,
  }),

  getThreadParticipantsParams: (route: ContentStackScreenProps<'ThreadParticipants'>['route']) => ({
    postId: route.params.postId,
  }),

  // Comment selectors
  getCommentThreadParams: (route: ContentStackScreenProps<'CommentThread'>['route']) => ({
    parentId: route.params.parentId,
    postId: route.params.postId,
  }),

  getCommentComposeParams: (route: ContentStackScreenProps<'CommentCompose'>['route']) => ({
    postId: route.params.postId,
    replyTo: route.params?.replyTo,
  }),

  getCommentEditParams: (route: ContentStackScreenProps<'CommentEdit'>['route']) => ({
    commentId: route.params.commentId,
  }),

  getCommentHistoryParams: (route: ContentStackScreenProps<'CommentHistory'>['route']) => ({
    commentId: route.params.commentId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const ContentNavigatorSetup = {
  // Default screen options for Content navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Feed group screen options
  feedScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    headerLargeTitle: true,
  },

  // Post group screen options
  postScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Thread group screen options
  threadScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Comment group screen options
  commentScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for compose/preview screens)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Full screen modal (for expanded thread view)
  fullScreenModalOptions: {
    presentation: 'fullScreenModal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Screen titles configuration
  screenTitles: {
    // Feed
    FeedHome: 'Home',
    FeedBySpace: 'Space Feed',
    FeedByTag: 'Tagged Posts',
    FeedTrending: 'Trending',
    FeedNew: 'New',
    // Posts
    PostDetail: 'Post',
    PostCreate: 'New Post',
    PostEdit: 'Edit Post',
    PostPreview: 'Preview',
    PostHistory: 'Edit History',
    PostShare: 'Share',
    // Threads
    ThreadView: 'Thread',
    ThreadExpanded: 'Full Thread',
    ThreadParticipants: 'Participants',
    // Comments
    CommentThread: 'Comments',
    CommentCompose: 'Reply',
    CommentEdit: 'Edit Comment',
    CommentHistory: 'Comment History',
  } as Record<keyof ContentStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Content navigation
 */
export const ContentNavigationHelpers = {
  // Navigate to feed home
  navigateToFeedHome: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation']
  ) => {
    navigation.navigate('FeedHome');
  },

  // Navigate to space-specific feed
  navigateToSpaceFeed: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    spaceId: string
  ) => {
    navigation.navigate('FeedBySpace', { spaceId });
  },

  // Navigate to tag-filtered feed
  navigateToTagFeed: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    tag: string
  ) => {
    navigation.navigate('FeedByTag', { tag });
  },

  // Navigate to post detail
  navigateToPost: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    postId: string
  ) => {
    navigation.navigate('PostDetail', { postId });
  },

  // Navigate to create post
  navigateToCreatePost: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    spaceId?: string
  ) => {
    navigation.navigate('PostCreate', { spaceId });
  },

  // Navigate to edit post
  navigateToEditPost: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    postId: string
  ) => {
    navigation.navigate('PostEdit', { postId });
  },

  // Navigate to post preview
  navigateToPostPreview: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    content: string,
    options?: { title?: string; spaceId?: string }
  ) => {
    navigation.navigate('PostPreview', { content, ...options });
  },

  // Navigate to thread view
  navigateToThread: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    postId: string,
    spaceId: string
  ) => {
    navigation.navigate('ThreadView', { postId, spaceId });
  },

  // Navigate to expanded thread (full screen)
  navigateToExpandedThread: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    postId: string,
    spaceId: string,
    focusCommentId?: string
  ) => {
    navigation.navigate('ThreadExpanded', { postId, spaceId, focusCommentId });
  },

  // Navigate to comment thread
  navigateToCommentThread: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    parentId: string,
    postId: string
  ) => {
    navigation.navigate('CommentThread', { parentId, postId });
  },

  // Navigate to compose reply
  navigateToCompose: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    postId: string,
    replyTo?: string
  ) => {
    navigation.navigate('CommentCompose', { postId, replyTo });
  },

  // Navigate to edit comment
  navigateToEditComment: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    commentId: string
  ) => {
    navigation.navigate('CommentEdit', { commentId });
  },

  // Navigate to post share screen
  navigateToSharePost: (
    navigation: ContentStackScreenProps<keyof ContentStackParamList>['navigation'],
    postId: string
  ) => {
    navigation.navigate('PostShare', { postId });
  },
};

// ============================================================================
// PLACEHOLDER SCREENS (to be replaced with actual implementations)
// ============================================================================

const PlaceholderScreen = ({ route }: { route: { name: string } }) => {
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>
        {route.name} - Coming Soon
      </Text>
    </View>
  );
};

const placeholderStyles = {
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: COLORS.background,
  },
  text: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
};

// ============================================================================
// NAVIGATOR COMPONENT
// ============================================================================

const Stack = createNativeStackNavigator<ContentStackParamList>();

/**
 * Content Navigator Component
 * Groups Feed, Posts, Threads, and Comments navigation
 */
export function ContentNavigator() {
  return (
    <Stack.Navigator
      screenOptions={ContentNavigatorSetup.defaultScreenOptions}
      initialRouteName="FeedHome"
    >
      {/* Feed Group */}
      <Stack.Group screenOptions={ContentNavigatorSetup.feedScreenOptions}>
        <Stack.Screen
          name="FeedHome"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.FeedHome }}
        />
        <Stack.Screen
          name="FeedBySpace"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `s/${route.params.spaceId}`,
          })}
        />
        <Stack.Screen
          name="FeedByTag"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `#${route.params.tag}`,
          })}
        />
        <Stack.Screen
          name="FeedTrending"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.FeedTrending }}
        />
        <Stack.Screen
          name="FeedNew"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.FeedNew }}
        />
      </Stack.Group>

      {/* Post Group */}
      <Stack.Group screenOptions={ContentNavigatorSetup.postScreenOptions}>
        <Stack.Screen
          name="PostDetail"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.PostDetail }}
        />
        <Stack.Screen
          name="PostHistory"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.PostHistory }}
        />
      </Stack.Group>

      {/* Thread Group */}
      <Stack.Group screenOptions={ContentNavigatorSetup.threadScreenOptions}>
        <Stack.Screen
          name="ThreadView"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.ThreadView }}
        />
        <Stack.Screen
          name="ThreadParticipants"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.ThreadParticipants }}
        />
      </Stack.Group>

      {/* Comment Group */}
      <Stack.Group screenOptions={ContentNavigatorSetup.commentScreenOptions}>
        <Stack.Screen
          name="CommentThread"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.CommentThread }}
        />
        <Stack.Screen
          name="CommentHistory"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.CommentHistory }}
        />
      </Stack.Group>

      {/* Modal Screens */}
      <Stack.Group screenOptions={ContentNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="PostCreate"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.PostCreate }}
        />
        <Stack.Screen
          name="PostEdit"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.PostEdit }}
        />
        <Stack.Screen
          name="PostPreview"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.PostPreview }}
        />
        <Stack.Screen
          name="PostShare"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.PostShare }}
        />
        <Stack.Screen
          name="CommentCompose"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.replyTo ? 'Reply' : 'New Comment',
          })}
        />
        <Stack.Screen
          name="CommentEdit"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.CommentEdit }}
        />
      </Stack.Group>

      {/* Full Screen Modal */}
      <Stack.Group screenOptions={ContentNavigatorSetup.fullScreenModalOptions}>
        <Stack.Screen
          name="ThreadExpanded"
          component={PlaceholderScreen}
          options={{ title: ContentNavigatorSetup.screenTitles.ThreadExpanded }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default ContentNavigator;
