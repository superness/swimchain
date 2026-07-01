/**
 * TabNavigator - Bottom Tab Navigation
 * Per CLIENT_DESIGN.md §6.1: 4-tab navigation with 44pt touch targets
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING, TOUCH_TARGET_MIN, LAYOUT, TYPOGRAPHY } from '../theme';
import type { TabParamList, HomeStackParamList, ProfileStackParamList } from './types';

// Import screens (will be created in later steps)
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SpaceViewScreen from '../screens/SpaceViewScreen';
import ThreadViewScreen from '../screens/ThreadViewScreen';
import StorageScreen from '../screens/StorageScreen';
import SettingsScreen from '../screens/SettingsScreen';
import QueueScreen from '../screens/QueueScreen';

// Tab icons (simple text-based for now, replace with SVG icons)
const TabIcon = ({
  name,
  focused,
  badge,
}: {
  name: string;
  focused: boolean;
  badge?: number;
}) => (
  <View style={styles.iconContainer}>
    <Text style={[styles.iconText, focused && styles.iconTextFocused]}>{name}</Text>
    {badge !== undefined && badge > 0 && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
      </View>
    )}
  </View>
);

// Create navigators
const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

// Home Stack Navigator
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.background },
        headerTitleStyle: { color: COLORS.text },
        headerTintColor: COLORS.primary,
      }}
    >
      <HomeStack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{ title: 'Swimchain' }}
      />
      <HomeStack.Screen
        name="SpaceViewScreen"
        component={SpaceViewScreen}
        options={({ route }) => ({ title: `s/${route.params.spaceId}` })}
      />
      <HomeStack.Screen
        name="ThreadViewScreen"
        component={ThreadViewScreen}
        options={{ title: 'Thread' }}
      />
    </HomeStack.Navigator>
  );
}

// Profile Stack Navigator
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.background },
        headerTitleStyle: { color: COLORS.text },
        headerTintColor: COLORS.primary,
      }}
    >
      <ProfileStack.Screen
        name="ProfileScreen"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <ProfileStack.Screen
        name="StorageScreen"
        component={StorageScreen}
        options={{ title: 'Storage' }}
      />
      <ProfileStack.Screen
        name="SettingsScreen"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <ProfileStack.Screen
        name="QueueScreen"
        component={QueueScreen}
        options={{ title: 'Offline Queue' }}
      />
    </ProfileStack.Navigator>
  );
}

// Placeholder for Post tab (opens modal)
function PostPlaceholder() {
  return null;
}

export function TabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          { height: LAYOUT.tabBarHeight + insets.bottom },
        ],
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="🏠" focused={focused} />,
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="🔍" focused={focused} />,
          tabBarLabel: 'Search',
        }}
      />
      <Tab.Screen
        name="Post"
        component={PostPlaceholder}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Prevent default behavior (switching to Post tab)
            e.preventDefault();
            // Open Compose modal instead
            navigation.navigate('Compose', {});
          },
        })}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="➕" focused={focused} />,
          tabBarLabel: 'Post',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="👤" focused={focused} badge={0} />
          ),
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.background,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
  },
  tabBarItem: {
    minHeight: TOUCH_TARGET_MIN,
    paddingVertical: SPACING.xs,
  },
  tabBarLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 28,
  },
  iconText: {
    fontSize: 22,
    opacity: 0.7,
  },
  iconTextFocused: {
    opacity: 1,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.textInverse,
    fontSize: 10,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
});

export default TabNavigator;
