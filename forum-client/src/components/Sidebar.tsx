/**
 * Sidebar component with space navigation
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SpaceTree } from './SpaceTree';
import { PrivateSpaceList } from './PrivateSpaceList';
import { useSponsorship } from '../hooks/useSponsorship';
import { useMySponsorshipOffers } from '../hooks/useMySponsorshipOffers';
import './Sidebar.css';

export function Sidebar(): JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
  const navigate = useNavigate();
  const location = useLocation();
  const { isSponsored } = useSponsorship();
  const { totalPendingClaims } = useMySponsorshipOffers();

  return (
    <aside
      className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}
      role="navigation"
      aria-label="Space navigation"
    >
      <div className="sidebar-header">
        <h2 className="sidebar-title">Spaces</h2>
        <button
          type="button"
          className="sidebar-toggle btn btn-ghost"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="sidebar-tabs">
            <button
              type="button"
              className={`sidebar-tab ${activeTab === 'public' ? 'active' : ''}`}
              onClick={() => setActiveTab('public')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Public
            </button>
            <button
              type="button"
              className={`sidebar-tab ${activeTab === 'private' ? 'active' : ''}`}
              onClick={() => setActiveTab('private')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Private
            </button>
          </div>

          <div className="sidebar-content">
            {activeTab === 'public' ? (
              <SpaceTree />
            ) : (
              <PrivateSpaceList />
            )}
          </div>

          <div className="sidebar-footer">
            <button
              type="button"
              className={`sidebar-footer-link ${location.pathname === '/sponsorship' ? 'active' : ''}`}
              onClick={() => navigate('/sponsorship')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              {isSponsored === false ? 'Get Sponsored' : 'Sponsorship'}
              {totalPendingClaims > 0 && (
                <span className="sidebar-badge">{totalPendingClaims}</span>
              )}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
