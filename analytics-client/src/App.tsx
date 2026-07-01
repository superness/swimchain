/**
 * Main App component with routing - Analytics Client
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IdentityProvider } from './providers/IdentityProvider';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Spaces } from './pages/Spaces';
import { SpaceDetail } from './pages/SpaceDetail';
import { Settings } from './pages/Settings';
import { Identity } from './pages/Identity';
import { Moderation } from './pages/Moderation';
import { SponsorshipAnalytics } from './pages/SponsorshipAnalytics';

export function App(): JSX.Element {
  return (
    <IdentityProvider>
      <ToastProvider>
        <BrowserRouter>
          <MainLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/spaces" element={<Spaces />} />
              <Route path="/spaces/:spaceId" element={<SpaceDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/moderation" element={<Moderation />} />
              <Route path="/sponsorship" element={<SponsorshipAnalytics />} />
              <Route path="/identity" element={<Identity />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MainLayout>
        </BrowserRouter>
      </ToastProvider>
    </IdentityProvider>
  );
}
