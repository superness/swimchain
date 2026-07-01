/**
 * Main App component with routing
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IdentityProvider } from '@swimchain/frontend';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './layouts/MainLayout';
import { Home } from './pages/Home';
import { Results } from './pages/Results';
import { IdentityPage } from './pages/IdentityPage';

export function App(): JSX.Element {
  return (
    <IdentityProvider>
      <ToastProvider>
        <BrowserRouter>
          <MainLayout>
            <Routes>
              {/* Identity management */}
              <Route path="/identity" element={<IdentityPage />} />

              {/* Search home - big search bar, trending, history */}
              <Route path="/" element={<Home />} />

              {/* Search results with query in URL */}
              <Route path="/search" element={<Results />} />

              {/* Deep links to content (redirect to forum-client) */}
              <Route
                path="/space/:spaceId"
                element={<RedirectToForum type="space" />}
              />
              <Route
                path="/thread/:threadId"
                element={<RedirectToForum type="thread" />}
              />
              <Route
                path="/user/:userId"
                element={<RedirectToForum type="user" />}
              />

              {/* Catch-all redirect to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MainLayout>
        </BrowserRouter>
      </ToastProvider>
    </IdentityProvider>
  );
}

/**
 * Redirect component for deep links to forum-client.
 * Preserves the current path (e.g. /space/:id) and redirects to forum-client.
 */
interface RedirectToForumProps {
  type: 'space' | 'thread' | 'user';
}

function RedirectToForum({ type }: RedirectToForumProps) {
  const forumClientUrl = import.meta.env.VITE_FORUM_CLIENT_URL || 'http://localhost:5173';
  const path = window.location.pathname;

  window.location.href = `${forumClientUrl}${path}`;

  const labels = { space: 'space', thread: 'thread', user: 'profile' };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      color: 'var(--color-text-secondary)',
    }}>
      <p>Opening {labels[type]} in forum...</p>
    </div>
  );
}
