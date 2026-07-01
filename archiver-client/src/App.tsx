/**
 * Main App component with routing - Archiver Client
 */

import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoadingScreen } from './components/Loading';
import { IdentityProvider } from './providers/IdentityProvider';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { ArchivedContent } from './pages/ArchivedContent';
import { Identity } from './pages/Identity';

export function App(): JSX.Element {
  return (
    <IdentityProvider>
      <ToastProvider>
        <Suspense fallback={<LoadingScreen />}>
          <BrowserRouter>
            <MainLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/archived" element={<ArchivedContent />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/identity" element={<Identity />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </MainLayout>
          </BrowserRouter>
        </Suspense>
      </ToastProvider>
    </IdentityProvider>
  );
}
