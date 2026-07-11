/**
 * DmHomeSidebar — the sidebar shown at the Direct Messages home (/channels/@me),
 * where there is no server selected. Without it the DM panel (which otherwise lives
 * inside a server's ChannelSidebar) would be unreachable for a user with no servers.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DmPanel } from './DmPanel';
import { StartDmModal } from './StartDmModal';

export function DmHomeSidebar(): JSX.Element {
  const navigate = useNavigate();
  const [showDmModal, setShowDmModal] = useState(false);
  const handleSelectDm = useCallback(
    (spaceId: string) => navigate('/channels/@me/' + spaceId),
    [navigate]
  );

  return (
    <div className="channel-sidebar">
      <div className="server-header">
        <button className="server-header-button" aria-label="Direct messages">
          <h2 className="server-name">Direct Messages</h2>
        </button>
      </div>
      <div className="channel-list">
        <DmPanel onSelectDm={handleSelectDm} onStartDm={() => setShowDmModal(true)} />
        {showDmModal && <StartDmModal onClose={() => setShowDmModal(false)} />}
      </div>
    </div>
  );
}

export default DmHomeSidebar;
