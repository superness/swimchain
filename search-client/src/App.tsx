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
    <IdentityProvider><ToastProvider><BrowserRouter><MainLayout>
      <Routes>
        <Route path="/identity" element={<IdentityPage />} />
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Results />} />
        <Route path="/space/:spaceId" element={<RedirectToForum type="space" />} />
        <Route path="/thread/:threadId" element={<RedirectToForum type="thread" />} />
        <Route path="/user/:userId" element={<RedirectToForum type="user" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout></BrowserRouter></ToastProvider></IdentityProvider>
  );
}

interface RedirectToForumProps { type: 'space' | 'thread' | 'user'; }

function RedirectToForum({ type }: RedirectToForumProps) {
  const baseUrl = import.meta.env.VITE_FORUM_CLIENT_URL || 'http://localhost:5173';
  window.location.href = baseUrl + window.location.pathname;
  const labels: Record<string, string> = { space: 'space', thread: 'thread', user: 'profile' };
  return <div style={{padding:'2rem',textAlign:'center',color:'#666'}}><p>Opening {labels[type]}...</p></div>;
}
