/**
 * NodeStatusBar - Shows node status and client selector at top of app
 */

import { useMemo } from "react";

type ClientType = "forum" | "chat" | "feed" | "search";

interface NodeStatus {
  running: boolean;
  rpc_port: number;
  peer_count: number;
  network: string;
}

interface IdentityInfo {
  exists: boolean;
  name: string | null;
  address: string | null;
}

interface Props {
  status: NodeStatus | null;
  identity?: IdentityInfo | null;
  selectedClient: ClientType;
  onClientChange: (client: ClientType) => void;
  onScreenshot?: () => void;
}

const CLIENT_LABELS: Record<ClientType, string> = {
  forum: "Forum",
  chat: "Chat",
  feed: "Feed",
  search: "Search",
};

export function NodeStatusBar({ status, identity, selectedClient, onClientChange, onScreenshot }: Props) {
  const truncatedAddress = useMemo(() => {
    if (!identity?.address) return null;
    const addr = identity.address;
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  }, [identity?.address]);

  return (
    <div className={`status-bar ${status?.running ? "connected" : "connecting"}`}>
      <div className="status-left">
        <span className="status-indicator" />
        <span className="status-text">
          {status?.running ? "Connected" : "Connecting..."}
        </span>

        {status?.running && (
          <>
            <span className="status-divider">|</span>
            <span className="network-badge">{status.network}</span>
            <span className="status-divider">|</span>
            <span className="peer-count">{status.peer_count} peers</span>
          </>
        )}
      </div>

      <div className="status-center">
        <select
          className="client-selector"
          value={selectedClient}
          onChange={(e) => onClientChange(e.target.value as ClientType)}
        >
          {Object.entries(CLIENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="status-right">
        {onScreenshot && (
          <button
            className="screenshot-btn"
            onClick={onScreenshot}
            title="Take screenshot"
          >
            📷
          </button>
        )}
        {truncatedAddress && (
          <span className="identity-address" title={identity?.address ?? undefined}>
            {truncatedAddress}
          </span>
        )}
      </div>
    </div>
  );
}
