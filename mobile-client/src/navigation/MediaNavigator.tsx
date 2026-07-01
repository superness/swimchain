/**
 * MediaNavigator - Navigation for Media Features Group
 * Handles: Images, Gallery, Attachments navigation
 *
 * Routes:
 * - Images: Image viewing, zooming, sharing, metadata
 * - Gallery: Media browsing, grid views, albums
 * - Attachments: File attachments, downloads, uploads
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
 * Media feature navigation param lists
 */

// Image-related screens
export type ImagesStackParamList = {
  ImageViewer: { imageId: string; contentId?: string };
  ImageZoom: { imageUrl: string; title?: string };
  ImageMetadata: { imageId: string };
  ImageShare: { imageId: string };
  ImageEdit: { imageId: string };
};

// Gallery-related screens
export type GalleryStackParamList = {
  GalleryGrid: { spaceId?: string; userId?: string };
  GalleryAlbums: { userId?: string };
  GalleryAlbumView: { albumId: string };
  GalleryAlbumCreate: undefined;
  GalleryAlbumEdit: { albumId: string };
  GallerySearch: { query?: string };
};

// Attachment-related screens
export type AttachmentsStackParamList = {
  AttachmentsList: { contentId: string };
  AttachmentViewer: { attachmentId: string };
  AttachmentUpload: { contentId?: string; spaceId?: string };
  AttachmentDownload: { attachmentId: string };
  AttachmentMetadata: { attachmentId: string };
  AttachmentSettings: undefined;
};

// Combined Media navigation param list
export type MediaStackParamList = {
  // Images routes
  ImageViewer: { imageId: string; contentId?: string };
  ImageZoom: { imageUrl: string; title?: string };
  ImageMetadata: { imageId: string };
  ImageShare: { imageId: string };
  ImageEdit: { imageId: string };

  // Gallery routes
  GalleryGrid: { spaceId?: string; userId?: string };
  GalleryAlbums: { userId?: string };
  GalleryAlbumView: { albumId: string };
  GalleryAlbumCreate: undefined;
  GalleryAlbumEdit: { albumId: string };
  GallerySearch: { query?: string };

  // Attachments routes
  AttachmentsList: { contentId: string };
  AttachmentViewer: { attachmentId: string };
  AttachmentUpload: { contentId?: string; spaceId?: string };
  AttachmentDownload: { attachmentId: string };
  AttachmentMetadata: { attachmentId: string };
  AttachmentSettings: undefined;
};

// ============================================================================
// SCREEN PROPS TYPES
// ============================================================================

export type MediaStackScreenProps<T extends keyof MediaStackParamList> =
  NativeStackScreenProps<MediaStackParamList, T>;

export type ImagesStackScreenProps<T extends keyof ImagesStackParamList> =
  NativeStackScreenProps<ImagesStackParamList, T>;

export type GalleryStackScreenProps<T extends keyof GalleryStackParamList> =
  NativeStackScreenProps<GalleryStackParamList, T>;

export type AttachmentsStackScreenProps<T extends keyof AttachmentsStackParamList> =
  NativeStackScreenProps<AttachmentsStackParamList, T>;

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * Route configuration for Media features
 */
export const MEDIA_ROUTES = {
  // Images routes
  IMAGES: {
    VIEWER: 'ImageViewer',
    ZOOM: 'ImageZoom',
    METADATA: 'ImageMetadata',
    SHARE: 'ImageShare',
    EDIT: 'ImageEdit',
  },

  // Gallery routes
  GALLERY: {
    GRID: 'GalleryGrid',
    ALBUMS: 'GalleryAlbums',
    ALBUM_VIEW: 'GalleryAlbumView',
    ALBUM_CREATE: 'GalleryAlbumCreate',
    ALBUM_EDIT: 'GalleryAlbumEdit',
    SEARCH: 'GallerySearch',
  },

  // Attachments routes
  ATTACHMENTS: {
    LIST: 'AttachmentsList',
    VIEWER: 'AttachmentViewer',
    UPLOAD: 'AttachmentUpload',
    DOWNLOAD: 'AttachmentDownload',
    METADATA: 'AttachmentMetadata',
    SETTINGS: 'AttachmentSettings',
  },
} as const;

// ============================================================================
// NAVIGATION SELECTORS
// ============================================================================

/**
 * Selectors for extracting route params and state
 */
export const MediaNavigationSelectors = {
  // Images selectors
  getImageViewerParams: (route: MediaStackScreenProps<'ImageViewer'>['route']) => ({
    imageId: route.params.imageId,
    contentId: route.params?.contentId,
  }),

  getImageZoomParams: (route: MediaStackScreenProps<'ImageZoom'>['route']) => ({
    imageUrl: route.params.imageUrl,
    title: route.params?.title,
  }),

  getImageMetadataParams: (route: MediaStackScreenProps<'ImageMetadata'>['route']) => ({
    imageId: route.params.imageId,
  }),

  getImageShareParams: (route: MediaStackScreenProps<'ImageShare'>['route']) => ({
    imageId: route.params.imageId,
  }),

  getImageEditParams: (route: MediaStackScreenProps<'ImageEdit'>['route']) => ({
    imageId: route.params.imageId,
  }),

  // Gallery selectors
  getGalleryGridParams: (route: MediaStackScreenProps<'GalleryGrid'>['route']) => ({
    spaceId: route.params?.spaceId,
    userId: route.params?.userId,
  }),

  getGalleryAlbumsParams: (route: MediaStackScreenProps<'GalleryAlbums'>['route']) => ({
    userId: route.params?.userId,
  }),

  getGalleryAlbumViewParams: (route: MediaStackScreenProps<'GalleryAlbumView'>['route']) => ({
    albumId: route.params.albumId,
  }),

  getGalleryAlbumEditParams: (route: MediaStackScreenProps<'GalleryAlbumEdit'>['route']) => ({
    albumId: route.params.albumId,
  }),

  getGallerySearchParams: (route: MediaStackScreenProps<'GallerySearch'>['route']) => ({
    query: route.params?.query,
  }),

  // Attachments selectors
  getAttachmentsListParams: (route: MediaStackScreenProps<'AttachmentsList'>['route']) => ({
    contentId: route.params.contentId,
  }),

  getAttachmentViewerParams: (route: MediaStackScreenProps<'AttachmentViewer'>['route']) => ({
    attachmentId: route.params.attachmentId,
  }),

  getAttachmentUploadParams: (route: MediaStackScreenProps<'AttachmentUpload'>['route']) => ({
    contentId: route.params?.contentId,
    spaceId: route.params?.spaceId,
  }),

  getAttachmentDownloadParams: (route: MediaStackScreenProps<'AttachmentDownload'>['route']) => ({
    attachmentId: route.params.attachmentId,
  }),

  getAttachmentMetadataParams: (route: MediaStackScreenProps<'AttachmentMetadata'>['route']) => ({
    attachmentId: route.params.attachmentId,
  }),
};

// ============================================================================
// SETUP DEFINITIONS
// ============================================================================

/**
 * Navigator screen options configuration
 */
export const MediaNavigatorSetup = {
  // Default screen options for Media navigator
  defaultScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    contentStyle: { backgroundColor: COLORS.background },
  },

  // Images group screen options (fullscreen-friendly)
  imagesScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
    animation: 'fade' as const,
  },

  // Gallery group screen options
  galleryScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Attachments group screen options
  attachmentsScreenOptions: {
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Modal presentation options (for upload, share, settings)
  modalScreenOptions: {
    presentation: 'modal' as const,
    headerShown: true,
    headerStyle: { backgroundColor: COLORS.background },
    headerTitleStyle: { color: COLORS.text },
    headerTintColor: COLORS.primary,
  },

  // Fullscreen options for image viewing
  fullscreenScreenOptions: {
    headerShown: false,
    animation: 'fade' as const,
    contentStyle: { backgroundColor: '#000000' },
  },

  // Screen titles configuration
  screenTitles: {
    // Images
    ImageViewer: 'Image',
    ImageZoom: 'Zoom',
    ImageMetadata: 'Image Details',
    ImageShare: 'Share Image',
    ImageEdit: 'Edit Image',
    // Gallery
    GalleryGrid: 'Gallery',
    GalleryAlbums: 'Albums',
    GalleryAlbumView: 'Album',
    GalleryAlbumCreate: 'Create Album',
    GalleryAlbumEdit: 'Edit Album',
    GallerySearch: 'Search Media',
    // Attachments
    AttachmentsList: 'Attachments',
    AttachmentViewer: 'Attachment',
    AttachmentUpload: 'Upload',
    AttachmentDownload: 'Download',
    AttachmentMetadata: 'File Details',
    AttachmentSettings: 'Attachment Settings',
  } as Record<keyof MediaStackParamList, string>,
};

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

/**
 * Helper functions for Media navigation
 */
export const MediaNavigationHelpers = {
  // Navigate to image viewer
  navigateToImageViewer: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    imageId: string,
    contentId?: string
  ) => {
    navigation.navigate('ImageViewer', { imageId, contentId });
  },

  // Navigate to image zoom
  navigateToImageZoom: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    imageUrl: string,
    title?: string
  ) => {
    navigation.navigate('ImageZoom', { imageUrl, title });
  },

  // Navigate to image metadata
  navigateToImageMetadata: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    imageId: string
  ) => {
    navigation.navigate('ImageMetadata', { imageId });
  },

  // Navigate to image share
  navigateToImageShare: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    imageId: string
  ) => {
    navigation.navigate('ImageShare', { imageId });
  },

  // Navigate to image edit
  navigateToImageEdit: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    imageId: string
  ) => {
    navigation.navigate('ImageEdit', { imageId });
  },

  // Navigate to gallery grid
  navigateToGalleryGrid: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    options?: { spaceId?: string; userId?: string }
  ) => {
    navigation.navigate('GalleryGrid', options ?? {});
  },

  // Navigate to gallery albums
  navigateToGalleryAlbums: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    userId?: string
  ) => {
    navigation.navigate('GalleryAlbums', { userId });
  },

  // Navigate to album view
  navigateToGalleryAlbumView: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    albumId: string
  ) => {
    navigation.navigate('GalleryAlbumView', { albumId });
  },

  // Navigate to album create
  navigateToGalleryAlbumCreate: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation']
  ) => {
    navigation.navigate('GalleryAlbumCreate');
  },

  // Navigate to album edit
  navigateToGalleryAlbumEdit: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    albumId: string
  ) => {
    navigation.navigate('GalleryAlbumEdit', { albumId });
  },

  // Navigate to gallery search
  navigateToGallerySearch: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    query?: string
  ) => {
    navigation.navigate('GallerySearch', { query });
  },

  // Navigate to attachments list
  navigateToAttachmentsList: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    contentId: string
  ) => {
    navigation.navigate('AttachmentsList', { contentId });
  },

  // Navigate to attachment viewer
  navigateToAttachmentViewer: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    attachmentId: string
  ) => {
    navigation.navigate('AttachmentViewer', { attachmentId });
  },

  // Navigate to attachment upload
  navigateToAttachmentUpload: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    options?: { contentId?: string; spaceId?: string }
  ) => {
    navigation.navigate('AttachmentUpload', options ?? {});
  },

  // Navigate to attachment download
  navigateToAttachmentDownload: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    attachmentId: string
  ) => {
    navigation.navigate('AttachmentDownload', { attachmentId });
  },

  // Navigate to attachment metadata
  navigateToAttachmentMetadata: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation'],
    attachmentId: string
  ) => {
    navigation.navigate('AttachmentMetadata', { attachmentId });
  },

  // Navigate to attachment settings
  navigateToAttachmentSettings: (
    navigation: MediaStackScreenProps<keyof MediaStackParamList>['navigation']
  ) => {
    navigation.navigate('AttachmentSettings');
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

const Stack = createNativeStackNavigator<MediaStackParamList>();

/**
 * Media Navigator Component
 * Groups Images, Gallery, and Attachments navigation
 */
export function MediaNavigator() {
  return (
    <Stack.Navigator
      screenOptions={MediaNavigatorSetup.defaultScreenOptions}
      initialRouteName="GalleryGrid"
    >
      {/* Images Group */}
      <Stack.Group screenOptions={MediaNavigatorSetup.imagesScreenOptions}>
        <Stack.Screen
          name="ImageViewer"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.ImageViewer }}
        />
        <Stack.Screen
          name="ImageZoom"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: route.params?.title ?? MediaNavigatorSetup.screenTitles.ImageZoom,
            ...MediaNavigatorSetup.fullscreenScreenOptions,
          })}
        />
        <Stack.Screen
          name="ImageMetadata"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.ImageMetadata }}
        />
      </Stack.Group>

      {/* Gallery Group */}
      <Stack.Group screenOptions={MediaNavigatorSetup.galleryScreenOptions}>
        <Stack.Screen
          name="GalleryGrid"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.GalleryGrid }}
        />
        <Stack.Screen
          name="GalleryAlbums"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.GalleryAlbums }}
        />
        <Stack.Screen
          name="GalleryAlbumView"
          component={PlaceholderScreen}
          options={({ route }) => ({
            title: `Album: ${route.params.albumId.slice(0, 8)}...`,
          })}
        />
        <Stack.Screen
          name="GallerySearch"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.GallerySearch }}
        />
      </Stack.Group>

      {/* Attachments Group */}
      <Stack.Group screenOptions={MediaNavigatorSetup.attachmentsScreenOptions}>
        <Stack.Screen
          name="AttachmentsList"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.AttachmentsList }}
        />
        <Stack.Screen
          name="AttachmentViewer"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.AttachmentViewer }}
        />
        <Stack.Screen
          name="AttachmentDownload"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.AttachmentDownload }}
        />
        <Stack.Screen
          name="AttachmentMetadata"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.AttachmentMetadata }}
        />
      </Stack.Group>

      {/* Modal Screens */}
      <Stack.Group screenOptions={MediaNavigatorSetup.modalScreenOptions}>
        <Stack.Screen
          name="ImageShare"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.ImageShare }}
        />
        <Stack.Screen
          name="ImageEdit"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.ImageEdit }}
        />
        <Stack.Screen
          name="GalleryAlbumCreate"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.GalleryAlbumCreate }}
        />
        <Stack.Screen
          name="GalleryAlbumEdit"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.GalleryAlbumEdit }}
        />
        <Stack.Screen
          name="AttachmentUpload"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.AttachmentUpload }}
        />
        <Stack.Screen
          name="AttachmentSettings"
          component={PlaceholderScreen}
          options={{ title: MediaNavigatorSetup.screenTitles.AttachmentSettings }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default MediaNavigator;
