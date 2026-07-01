/**
 * Swimchain Wiki - Main App with routing
 *
 * Maps Swimchain content model to wiki navigation:
 *   / = Wiki Home (recent changes, featured namespaces)
 *   /ns/:id = Namespace page (list of wiki pages in a space)
 *   /ns/:id/page/:pageId = View a wiki page
 *   /ns/:id/page/:pageId/edit = Edit/create a wiki page
 *   /ns/:id/page/:pageId/history = Revision history
 *   /ns/:id/page/:pageId/discuss = Discussion (talk page)
 *   /search = Wiki search
 *   /identity = Identity management
 *   /settings = Settings
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IdentityProvider } from '@swimchain/frontend';
import { ToastProvider } from './components/Toast';
import { WikiLayout } from './layouts/WikiLayout';
import { WikiHome } from './pages/WikiHome';
import { NamespacePage } from './pages/NamespacePage';
import { WikiPageView } from './pages/WikiPageView';
import { WikiPageEdit } from './pages/WikiPageEdit';
import { RevisionHistory } from './pages/RevisionHistory';
import { Discussion } from './pages/Discussion';
import { WikiSearch } from './pages/WikiSearch';
import { IdentityPage } from './pages/IdentityPage';

export function App(): JSX.Element {
  return (
    <IdentityProvider>
      <ToastProvider>
        <BrowserRouter>
          <WikiLayout>
            <Routes>
              {/* Wiki home - recent changes, namespaces */}
              <Route path="/" element={<WikiHome />} />

              {/* Namespace (space) - list pages */}
              <Route path="/ns/:namespaceId" element={<NamespacePage />} />

              {/* Wiki page - read view */}
              <Route path="/ns/:namespaceId/page/:pageId" element={<WikiPageView />} />

              {/* Wiki page - edit/create */}
              <Route path="/ns/:namespaceId/page/:pageId/edit" element={<WikiPageEdit />} />
              <Route path="/ns/:namespaceId/new" element={<WikiPageEdit />} />

              {/* Revision history */}
              <Route path="/ns/:namespaceId/page/:pageId/history" element={<RevisionHistory />} />

              {/* Discussion / talk page */}
              <Route path="/ns/:namespaceId/page/:pageId/discuss" element={<Discussion />} />

              {/* Search */}
              <Route path="/search" element={<WikiSearch />} />

              {/* Identity management */}
              <Route path="/identity" element={<IdentityPage />} />

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </WikiLayout>
        </BrowserRouter>
      </ToastProvider>
    </IdentityProvider>
  );
}
