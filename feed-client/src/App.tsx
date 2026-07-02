/**
 * Main App component with routing
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Feed } from './pages/Feed';
import { Discover } from './pages/Discover';
import { IdentityPage } from './pages/IdentityPage';
import { Compose } from './pages/Compose';
import { Post } from './pages/Post';
import { ProfilePage } from './pages/Profile';
import { Settings } from './pages/Settings';
import { CreatePrivateSpace } from './pages/CreatePrivateSpace';
import { SponsorshipPage } from './pages/Sponsorship';
import { SpaceView } from './pages/SpaceView';
import { SavedPosts } from './pages/SavedPosts';
import { DmInbox } from './pages/DmInbox';
import { IdentityProvider } from './providers/IdentityProvider';
import { RequireIdentity } from './components/RequireIdentity';
import { SponsorshipProvider } from './hooks/useSponsorship';
import { KeyboardNavigationProvider } from './hooks/useKeyboardNavigation';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './layouts/MainLayout';

export function App(): JSX.Element {
  return (
    <IdentityProvider>
      <SponsorshipProvider>
        <ToastProvider>
          <BrowserRouter>
          <KeyboardNavigationProvider>
          <MainLayout>
            <Routes>
              {/* Public routes - can be viewed without identity */}
              <Route path="/" element={<Feed />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/identity" element={<IdentityPage />} />
              <Route path="/post/:postId" element={<Post />} />
              <Route path="/space/:spaceId" element={<SpaceView />} />

              {/* Protected routes - require identity */}
              <Route path="/compose" element={
                <RequireIdentity>
                  <Compose />
                </RequireIdentity>
              } />
              <Route path="/sponsorship" element={
                <RequireIdentity>
                  <SponsorshipPage />
                </RequireIdentity>
              } />
              <Route path="/profile" element={
                <RequireIdentity>
                  <ProfilePage />
                </RequireIdentity>
              } />
              <Route path="/profile/:userPk" element={<ProfilePage />} />
              <Route path="/create-private-space" element={
                <RequireIdentity>
                  <CreatePrivateSpace />
                </RequireIdentity>
              } />
              <Route path="/settings" element={
                <RequireIdentity>
                  <Settings />
                </RequireIdentity>
              } />

              {/* DM inbox */}
              <Route path="/dm" element={
                <RequireIdentity>
                  <DmInbox />
                </RequireIdentity>
              } />

              {/* Saved posts */}
              <Route path="/saved" element={
                <RequireIdentity>
                  <SavedPosts />
                </RequireIdentity>
              } />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MainLayout>
          </KeyboardNavigationProvider>
        </BrowserRouter>
        </ToastProvider>
      </SponsorshipProvider>
    </IdentityProvider>
  );
}
