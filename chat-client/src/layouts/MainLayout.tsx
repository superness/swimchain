/**
 * Main layout for the chat client
 * Three-column Discord-like layout
 */

import { ReactNode, useState, useCallback, useMemo } from 'react';
import { SpaceSidebar } from '../components/SpaceSidebar';
import { StatusBar } from '../components/StatusBar';
import { useSpaces, useNetworkStatus } from '../hooks/useRpc';
import type { SpaceCategory } from '../types';
import './MainLayout.css';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { spaces, loading: spacesLoading } = useSpaces();
  const { status: networkStatus } = useNetworkStatus();

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Group spaces by category (from RPC)
  const categories: SpaceCategory[] = useMemo(() => {
    if (spacesLoading || spaces.length === 0) {
      return [];
    }

    // Group spaces by category
    const categoryMap = new Map<string, typeof spaces>();
    for (const space of spaces) {
      const category = space.category || 'General';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(space);
    }

    return Array.from(categoryMap.entries()).map(([name, categorySpaces]) => ({
      name,
      spaces: categorySpaces,
      isCollapsed: false,
    }));
  }, [spaces, spacesLoading]);

  // Convert network status to StatusBar props
  const syncState = networkStatus?.state ?? 'offline';
  const chainPercent = networkStatus?.chainPercent ?? 0;
  const peerCount = networkStatus?.peerCount ?? 0;
  const storageMB = networkStatus?.storageMB ?? 0;

  return (
    <div className="main-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="main-layout__overlay"
          onClick={handleCloseSidebar}
          aria-hidden="true"
        />
      )}

      {/* Left sidebar with spaces */}
      <div
        className={`main-layout__sidebar ${
          sidebarOpen ? 'main-layout__sidebar--open' : ''
        }`}
      >
        <SpaceSidebar
          categories={categories}
          onSpaceClick={handleCloseSidebar}
        />
      </div>

      {/* Main content area */}
      <main className="main-layout__main" id="main-content">
        {children}
      </main>

      {/* Right panel - peer info (P2P network has no central presence) */}
      <div className="main-layout__online-panel">
        <aside className="online-users" aria-label="Network info">
          <div className="online-users__header">
            <h3 className="online-users__title">NETWORK</h3>
          </div>
          <div className="online-users__footer">
            <span>{peerCount} peers connected</span>
          </div>
        </aside>
      </div>

      {/* Status bar at bottom */}
      <div className="main-layout__status-bar">
        <StatusBar
          chainPercent={chainPercent}
          peerCount={peerCount}
          storageMB={storageMB}
          state={syncState}
        />
      </div>
    </div>
  );
}

// Export handleMenuClick for Header to use
export function useMainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return { sidebarOpen, toggleSidebar, closeSidebar };
}
