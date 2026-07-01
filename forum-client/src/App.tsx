/**
 * Main App component with routing
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { SpaceList } from './pages/SpaceList';
import { SpaceView } from './pages/SpaceView';
import { NewThread } from './pages/NewThread';
import { ThreadView } from './pages/ThreadView';
import { SearchResults } from './pages/SearchResults';
import { IdentityPage } from './pages/Identity';
import { SettingsPage } from './pages/Settings';
import { ChatView } from './components/ChatView';
import { CreatePrivateSpace } from './pages/CreatePrivateSpace';
import { ProfilePage } from './pages/Profile';
import { SponsorshipPage } from './pages/Sponsorship';
import { PreferencesProvider } from './hooks/usePreferences';
import { KeyboardNavigationProvider } from './hooks/useKeyboardNavigation';
import { IdentityProvider, useIdentityContext } from './providers/IdentityProvider';
import { SponsorshipProvider } from './hooks/useSponsorship';
import { RequireIdentity } from './components/RequireIdentity';
import { SponsorshipBanner } from './components/SponsorshipBanner';
import { useRpc } from './hooks/useRpc';
import { useNodeIdentity } from './hooks/useNodeIdentity';
import { logger } from './lib/logger';

/**
 * Logs app state on mount and route changes
 */
function AppStateLogger(): null {
  const location = useLocation();
  const { connected, rpc } = useRpc();
  const { identity: nodeIdentity, isLoading: nodeLoading, error: nodeError } = useNodeIdentity();
  const { identity, isLoading: identityLoading, hasValidIdentity } = useIdentityContext();

  useEffect(() => {
    logger.info('[APP] ===== APP STATE =====', {
      route: location.pathname,
      rpcConnected: connected,
      hasRpc: !!rpc,
      nodeIdentity: nodeIdentity ? {
        address: nodeIdentity.address,
        publicKey: nodeIdentity.publicKey?.substring(0, 20),
      } : null,
      nodeLoading,
      nodeError,
      identity: identity ? {
        address: identity.address,
        hasPublicKey: !!identity.publicKey,
      } : null,
      identityLoading,
      hasValidIdentity,
    });
  }, [location.pathname, connected, rpc, nodeIdentity, nodeLoading, nodeError, identity, identityLoading, hasValidIdentity]);

  // Log on mount
  useEffect(() => {
    logger.info('[APP] ===== CLIENT OPENED =====', {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  }, []);

  return null;
}

export function App(): JSX.Element {
  logger.info('[APP] ===== App COMPONENT RENDERING =====');

  return (
    <PreferencesProvider>
      <BrowserRouter>
        <IdentityProvider>
          <SponsorshipProvider>
            <KeyboardNavigationProvider>
              <AppStateLogger />
              <SponsorshipBanner />
              <MainLayout>
              <Routes>
                {/* Identity page - accessible without identity */}
                <Route path="/identity" element={<IdentityPage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Sponsorship page - accessible without full sponsorship */}
                <Route path="/sponsorship" element={<SponsorshipPage />} />

                {/* Profile routes */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/profile/:userPk" element={<ProfilePage />} />

                {/* Protected routes - require valid identity */}
                <Route
                  path="/"
                  element={
                    <RequireIdentity>
                      <Navigate to="/spaces" replace />
                    </RequireIdentity>
                  }
                />
                <Route
                  path="/spaces"
                  element={
                    <RequireIdentity>
                      <SpaceList />
                    </RequireIdentity>
                  }
                />
                <Route
                  path="/spaces/:spaceId"
                  element={
                    <RequireIdentity>
                      <SpaceView />
                    </RequireIdentity>
                  }
                />
                <Route
                  path="/spaces/:spaceId/new"
                  element={
                    <RequireIdentity>
                      <NewThread />
                    </RequireIdentity>
                  }
                />
                <Route
                  path="/spaces/:spaceId/thread/:threadId"
                  element={
                    <RequireIdentity>
                      <ThreadView />
                    </RequireIdentity>
                  }
                />
                <Route
                  path="/spaces/:spaceId/thread/:threadId/reply/:replyId"
                  element={
                    <RequireIdentity>
                      <ThreadView />
                    </RequireIdentity>
                  }
                />
                <Route
                  path="/search"
                  element={
                    <RequireIdentity>
                      <SearchResults />
                    </RequireIdentity>
                  }
                />
                {/* Private space routes */}
                <Route
                  path="/spaces/new/private"
                  element={
                    <RequireIdentity>
                      <CreatePrivateSpace />
                    </RequireIdentity>
                  }
                />
                <Route
                  path="/chat/:spaceId"
                  element={
                    <RequireIdentity>
                      <ChatView />
                    </RequireIdentity>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </MainLayout>
            </KeyboardNavigationProvider>
          </SponsorshipProvider>
        </IdentityProvider>
      </BrowserRouter>
    </PreferencesProvider>
  );
}
