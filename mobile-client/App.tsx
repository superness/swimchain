/**
 * ChainSocial Mobile Client - Main Application Entry
 *
 * A touch-first mobile client for iOS/Android with full node capability.
 * Implements the ChainSocial protocol with battery-conscious PoW.
 */

import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation';
import { MobileSwimchainProvider } from './src/providers/MobileChainSocialProvider';
import { COLORS } from './src/theme';

// Suppress specific warnings in development
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MobileSwimchainProvider>
          <NavigationContainer>
            <StatusBar
              barStyle="dark-content"
              backgroundColor={COLORS.background}
            />
            <RootNavigator />
          </NavigationContainer>
        </MobileSwimchainProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
