/**
 * Main App component with routing - Bridge Client
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { MatrixConfig } from './pages/MatrixConfig';
import { IrcConfig } from './pages/IrcConfig';
import { Settings } from './pages/Settings';
import { ActivityLog } from './pages/ActivityLog';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/matrix" element={<MatrixConfig />} />
        <Route path="/irc" element={<IrcConfig />} />
        <Route path="/activity" element={<ActivityLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
