/**
 * Main layout component with header, sidebar, and status bar
 */

import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { StatusBar } from '../components/StatusBar';
import './MainLayout.css';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps): JSX.Element {
  const location = useLocation();

  // Focus management on route change for accessibility
  useEffect(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.focus();
    }
  }, [location.pathname]);

  return (
    <div className="main-layout">

      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Header />

      <div className="content-area">
        <Sidebar />
        <main
          id="main-content"
          className="main-content"
          role="main"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
