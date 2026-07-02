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
  const targetUrl = import.meta.env.VITE_DEEP_LINK_URL || 'http://localhost:5174';
  let path = window.location.pathname;
  if (path.startsWith('/thread/')) path = path.replace('/thread/', '/post/');
  if (path.startsWith('/user/')) path = path.replace('/user/', '/profile/');
  window.location.href = targetUrl + path;
  const labels: Record<string, string> = { space: 'space', post: 'post', user: 'profile' };
  return <div style={{padding:'2rem',textAlign:'center',color:'#666'}}><p>Opening {labels[type]}...</p></div>;
}
