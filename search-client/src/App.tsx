import { useEffect } from 'react';
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
        <Route path="/space/:spaceId" element={<RedirectToApp type="space" />} />
        <Route path="/post/:postId" element={<RedirectToApp type="post" />} />
        <Route path="/thread/:threadId" element={<RedirectToApp type="post" />} />
        <Route path="/user/:userId" element={<RedirectToApp type="user" />} />
        <Route path="/profile/:userPk" element={<RedirectToApp type="user" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout></BrowserRouter></ToastProvider></IdentityProvider>
  );
}

interface RedirectToAppProps { type: 'space' | 'post' | 'user'; }

function RedirectToApp({ type }: RedirectToAppProps) {
  useEffect(() => {
    const rawPath = window.location.pathname;
    const spaceId = new URLSearchParams(window.location.search).get('space');

    // Embedded in the desktop shell: all clients are same-origin iframes with no
    // dev server, so a URL redirect (localhost:5179) goes nowhere / hangs. Ask the
    // shell to switch to the forum client and route there, translating to forum's
    // native routes. Standalone browser: fall back to the deep-link URL.
    // The search index returns content ids WITHOUT the `sha256:` prefix, but the
    // node's content RPCs (get_content/get_replies) require it — restore it before
    // navigating, or the thread view fails with -32006 "must start with sha256:".
    const withSha256 = (id: string) => (id.startsWith('sha256:') ? id : `sha256:${id}`);
    if (window.parent !== window) {
      let forumPath = rawPath;
      if (rawPath.startsWith('/space/')) {
        // forum spaces live at /spaces/<id>
        forumPath = rawPath.replace('/space/', '/spaces/');
      } else if (rawPath.startsWith('/thread/') && spaceId) {
        // forum threads need both ids: /spaces/<space>/thread/<thread>
        const threadId = withSha256(rawPath.slice('/thread/'.length));
        forumPath = `/spaces/${spaceId}/thread/${threadId}`;
      } else if (rawPath.startsWith('/user/')) {
        forumPath = rawPath.replace('/user/', '/profile/');
      }
      // (/profile/<id> already matches forum; a thread with no space id falls
      //  through to forum's home.)
      window.parent.postMessage({ type: 'SWIMCHAIN_NAVIGATE', client: 'forum', path: forumPath }, '*');
    } else {
      let path = rawPath;
      if (path.startsWith('/thread/')) path = `/post/${withSha256(rawPath.slice('/thread/'.length))}`;
      if (path.startsWith('/user/')) path = path.replace('/user/', '/profile/');
      const targetUrl = import.meta.env.VITE_DEEP_LINK_URL || 'http://localhost:5179';
      window.location.href = targetUrl + path;
    }
  }, []);
  const labels: Record<string, string> = { space: 'space', post: 'post', user: 'profile' };
  return <div style={{padding:'2rem',textAlign:'center',color:'#666'}}><p>Opening {labels[type]}...</p></div>;
}
