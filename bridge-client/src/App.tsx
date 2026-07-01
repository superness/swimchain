/**
 * Main App component with routing - Bridge Client
 */

import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoadingScreen } from './components/Loading';
import { RpcProvider } from './hooks/useRpc';
import { IdentityProvider } from './providers/IdentityProvider';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { MatrixConfig } from './pages/MatrixConfig';
import { IrcConfig } from './pages/IrcConfig';
import { Settings } from './pages/Settings';
import { ActivityLog } from './pages/ActivityLog';
import { Identity } from './pages/Identity';

export function App(): JSX.Element {
  return (
    <RpcProvider>
      <IdentityProvider>
        <ToastProvider>
          <Suspense fallback={<LoadingScreen />}>
            <BrowserRouter>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/matrix" element={<MatrixConfig />} />
                  <Route path="/irc" element={<IrcConfig />} />
                  <Route path="/activity" element={<ActivityLog />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/identity" element={<Identity />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </MainLayout>
            </BrowserRouter>
          </Suspense>
        </ToastProvider>
      </IdentityProvider>
    </RpcProvider>
  );
}
