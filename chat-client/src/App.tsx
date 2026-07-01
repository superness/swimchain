/**
 * Swimchain Chat Client - App Component
 *
 * Discord-style chat interface with servers, channels, and messages.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IdentityProvider } from '@swimchain/frontend';
import { TypingProvider } from './contexts/TypingContext';
import { PresenceProvider } from './contexts/PresenceContext';
import { ToastProvider } from './components/Toast';
import { RequireIdentity } from './components/RequireIdentity';
import { Chat } from './pages/Chat';
import { SettingsPage } from './pages/SettingsPage';
import { IdentityPage } from './pages/IdentityPage';
import { CreatePrivateChannel } from './pages/CreatePrivateChannel';

function AppRoutes(): JSX.Element {
  return (
    <Routes>
      {/* Public route - identity management */}
      <Route path="/identity" element={<IdentityPage />} />

      {/* Protected routes - require identity */}
      <Route
        path="/"
        element={
          <RequireIdentity>
            <Navigate to="/channels/@me" replace />
          </RequireIdentity>
        }
      />

      {/* Discord-style routing */}
      {/* /channels/@me - Direct messages (home) */}
      <Route
        path="/channels/@me"
        element={
          <RequireIdentity>
            <Chat />
          </RequireIdentity>
        }
      />

      {/* /channels/:serverId - Server without specific channel */}
      <Route
        path="/channels/:serverId"
        element={
          <RequireIdentity>
            <Chat />
          </RequireIdentity>
        }
      />

      {/* /channels/:serverId/:channelId - Specific channel */}
      <Route
        path="/channels/:serverId/:channelId"
        element={
          <RequireIdentity>
            <Chat />
          </RequireIdentity>
        }
      />

      {/* Settings */}
      <Route
        path="/settings"
        element={
          <RequireIdentity>
            <SettingsPage />
          </RequireIdentity>
        }
      />

      {/* Create private channel */}
      <Route
        path="/channels/create-private"
        element={
          <RequireIdentity>
            <CreatePrivateChannel />
          </RequireIdentity>
        }
      />

      {/* Server discovery */}
      <Route
        path="/servers/discover"
        element={
          <RequireIdentity>
            <Chat />
          </RequireIdentity>
        }
      />

      {/* Fallback - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <IdentityProvider>
      <ToastProvider>
        <PresenceProvider>
          <TypingProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TypingProvider>
        </PresenceProvider>
      </ToastProvider>
    </IdentityProvider>
  );
}
