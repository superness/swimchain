/**
 * RootNavigator - Main Application Navigator
 * Includes tab navigation and modal screens
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { COLORS } from '../theme';
import type { RootStackParamList } from './types';
import { TabNavigator } from './TabNavigator';

// Import modal screens
import ComposeScreen from '../screens/ComposeScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      {/* Main Tab Navigation */}
      <Stack.Screen name="Main" component={TabNavigator} />

      {/* Modal Screens */}
      <Stack.Group
        screenOptions={{
          presentation: 'modal',
          headerShown: true,
          headerStyle: { backgroundColor: COLORS.background },
          headerTitleStyle: { color: COLORS.text },
          headerTintColor: COLORS.primary,
        }}
      >
        <Stack.Screen
          name="Compose"
          component={ComposeScreen}
          options={({ route }) => ({
            title: route.params?.replyTo ? 'Reply' : 'New Post',
          })}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export default RootNavigator;
