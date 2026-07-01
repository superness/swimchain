/**
 * Navigation Type Definitions
 * Per CLIENT_DESIGN.md §6.1: Tab-based navigation
 */

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Root stack param list (includes modals and main tabs)
export type RootStackParamList = {
  Main: NavigatorScreenParams<TabParamList>;
  Compose: {
    spaceId?: string;
    replyTo?: string;
  };
  ThreadView: {
    postId: string;
    spaceId: string;
  };
  SpaceView: {
    spaceId: string;
  };
  Storage: undefined;
  Settings: undefined;
  Queue: undefined;
};

// Bottom tab param list
export type TabParamList = {
  Home: undefined;
  Search: undefined;
  Post: undefined; // Opens Compose modal
  Profile: undefined;
};

// Home stack param list (nested within Home tab)
export type HomeStackParamList = {
  HomeScreen: undefined;
  SpaceViewScreen: {
    spaceId: string;
  };
  ThreadViewScreen: {
    postId: string;
    spaceId: string;
  };
};

// Profile stack param list (nested within Profile tab)
export type ProfileStackParamList = {
  ProfileScreen: undefined;
  StorageScreen: undefined;
  SettingsScreen: undefined;
  QueueScreen: undefined;
};

// Screen props types for each navigator

// Root stack screens
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

// Tab screens
export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<
  TabParamList,
  T
>;

// Home stack screens
export type HomeStackScreenProps<T extends keyof HomeStackParamList> =
  NativeStackScreenProps<HomeStackParamList, T>;

// Profile stack screens
export type ProfileStackScreenProps<T extends keyof ProfileStackParamList> =
  NativeStackScreenProps<ProfileStackParamList, T>;

// Utility type for getting navigation prop
export type NavigationProp<T extends keyof RootStackParamList> =
  RootStackScreenProps<T>['navigation'];

// Utility type for getting route prop
export type RouteProp<T extends keyof RootStackParamList> =
  RootStackScreenProps<T>['route'];

// Declare navigation globally for useNavigation hook
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
