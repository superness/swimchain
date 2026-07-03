/**
 * Desktop App - Node wrapper that embeds client UIs
 *
 * Architecture:
 * - Manages node lifecycle (identity, start/stop)
 * - Shows NodeStatusBar at top
 * - Embeds selected client (forum, reddit, chat) in iframe
 * - Passes RPC config to client via postMessage
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NodeStatusBar } from "./components/NodeStatusBar";
import { ClientFrame } from "./components/ClientFrame";
import { InviteRedemption } from "./components/InviteRedemption";
import { parseInviteInput, type InvitePayload } from "./lib/invite";

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

type AppStage = "checking" | "onboarding" | "unlock" | "starting" | "ready" | "error";
type ClientType = "forum" | "chat" | "feed" | "search" | "wiki";
type NetworkType = "mainnet" | "testnet" | "regtest";

const NETWORKS: NetworkType[] = ["mainnet", "testnet", "regtest"];

const NETWORK_LABELS: Record<NetworkType, string> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
  regtest: "Regtest (local dev)",
};

// Dev-only debug tooling (screenshots, verbose logging) is disabled in production builds
const IS_DEV = import.meta.env.DEV;

// Logger that writes to file via Tauri command
const log = (level: string, message: string, data?: unknown) => {
  const logLine = data ? `${message} ${JSON.stringify(data)}` : message;
  // Fire and forget - don't await
  invoke("write_client_log", { client: "desktop-app", level, message: logLine }).catch(() => {});
};

// Screenshot utility (dev only) - takes a screenshot and saves it with a label
const takeScreenshot = async (label: string): Promise<string | null> => {
  if (!IS_DEV) return null;
  try {
    const path = await invoke<string>("take_screenshot", { label });
    log("info", `Screenshot saved: ${path}`);
    return path;
  } catch (e) {
    log("error", `Failed to take screenshot: ${e}`);
    return null;
  }
};

// Expose screenshot function globally for debugging (dev only)
if (IS_DEV) {
  (window as unknown as { takeScreenshot: typeof takeScreenshot }).takeScreenshot = takeScreenshot;
}

function App() {
  const [stage, setStage] = useState<AppStage>("checking");
  const [error, setError] = useState<string | null>(null);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus | null>(null);
  const [identity, setIdentity] = useState<IdentityInfo | null>(null);
  const [rpcEndpoint, setRpcEndpoint] = useState<string | null>(null);
  const [rpcAuth, setRpcAuth] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientType>("forum");
  const [network, setNetwork] = useState<NetworkType>("testnet");

  // Onboarding form state
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Invite hand-off (SWIM-INV-3): raw code from the onboarding field or a
  // swimchain:// deep link, the parsed payload to redeem once the node is up,
  // and whether redemption has finished so we drop the overlay.
  const [inviteInput, setInviteInput] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<InvitePayload | null>(null);
  const [redeemComplete, setRedeemComplete] = useState(false);

  // Absorb a swimchain://invite/<token> deep link that the OS handed the node.
  // We poll a local Tauri command (no event-permission needed) so this works
  // for both cold starts and links that fire while the app is already open.
  useEffect(() => {
    let cancelled = false;

    const absorb = (raw: string | null) => {
      if (!raw || cancelled) return;
      try {
        const payload = parseInviteInput(raw);
        if (!payload) return;
        // Prefill the onboarding field (new users) AND stash the parsed
        // payload so returning users redeem straight after unlocking.
        setInviteInput(raw.trim());
        setShowInvite(true);
        setInviteError(null);
        setPendingInvite(payload);
        setRedeemComplete(false);
        log("info", "Deep-link invite absorbed");
      } catch (e) {
        log("warn", "Ignoring malformed deep-link invite:", e);
      }
    };

    const poll = async () => {
      try {
        const raw = await invoke<string | null>("take_pending_deeplink");
        absorb(raw);
      } catch {
        // Command unavailable (older shell) — deep links just won't fire.
      }
    };

    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetIdentity = async () => {
    log("info", "===== USER CHOSE START-FRESH (reset identity) =====");
    setError(null);
    try {
      await invoke("reset_identity");
      setIdentity(null);
      setPassword("");
      setConfirmReset(false);
      setStage("onboarding");
      log("info", "Identity archived; routing to onboarding");
    } catch (err) {
      log("error", "reset_identity FAILED:", err);
      setError(String(err));
    }
  };

  // Re-check identity (each network has its own data dir + identity)
  const checkIdentity = async () => {
    try {
      const info = await invoke<IdentityInfo>("check_identity");
      log("info", "Identity check result:", info);
      setIdentity(info);

      if (info.exists) {
        log("info", "IDENTITY EXISTS - showing unlock screen");
        setStage("unlock");
      } else {
        log("info", "NO IDENTITY - showing onboarding screen");
        setStage("onboarding");
      }
    } catch (e) {
      log("error", "FAILED to check identity:", e);
      setError(String(e));
      setStage("error");
    }
  };

  // Check network + identity on startup
  useEffect(() => {
    const init = async () => {
      log("info", "===== CHECKING IDENTITY ON STARTUP =====");
      try {
        const net = await invoke<string>("get_network");
        log("info", "Current network:", net);
        if (NETWORKS.includes(net as NetworkType)) {
          setNetwork(net as NetworkType);
        }
      } catch (e) {
        log("error", "Failed to get network, defaulting to testnet:", e);
      }
      await checkIdentity();
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch networks: stops the node (if running), re-checks identity for the
  // new network's data dir, and routes to unlock/onboarding accordingly.
  const selectNetwork = async (net: NetworkType) => {
    if (net === network) return;
    log("info", `===== SWITCHING NETWORK: ${network} -> ${net} =====`);
    setError(null);
    try {
      await invoke("set_network", { network: net });
      setNetwork(net);
      // Any previous node connection is now invalid
      setRpcEndpoint(null);
      setRpcAuth(null);
      setNodeStatus(null);
      setPassword("");
      setStage("checking");
      await checkIdentity();
    } catch (e) {
      log("error", "Failed to switch network:", e);
      setError(String(e));
    }
  };

  const startNode = async (pwd: string) => {
    log("info", "===== STARTING NODE =====");
    try {
      log("info", "Calling invoke(start_node)...");
      await invoke("start_node", { password: pwd });
      log("info", "start_node succeeded, waiting 1 second...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log("info", "Getting RPC endpoint...");
      const endpoint = await invoke<string>("get_rpc_endpoint");
      log("info", "RPC endpoint:", endpoint);

      log("info", "Getting RPC auth...");
      const auth = await invoke<string>("get_rpc_auth");
      log("info", "RPC auth obtained (length):", auth?.length);

      setRpcEndpoint(endpoint);
      setRpcAuth(auth);
      log("info", "===== NODE READY - setting stage to ready =====");
      setStage("ready");
    } catch (e) {
      log("error", "===== FAILED TO START NODE =====", e);
      setError(String(e));
      setStage("error");
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    log("info", "===== USER CLICKED UNLOCK BUTTON =====");
    setIsUnlocking(true);
    setError(null);

    try {
      log("info", "Setting stage to 'starting'...");
      setStage("starting");
      await startNode(password);
      log("info", "Unlock complete!");
    } catch (err) {
      log("error", "Unlock FAILED:", err);
      setError(String(err));
      setStage("unlock");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCreateIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    log("info", "===== USER CLICKED CREATE IDENTITY BUTTON =====");

    if (password !== confirmPassword) {
      log("error", "Passwords don't match");
      setError("Passwords don't match");
      return;
    }

    if (password.length < 8) {
      log("error", "Password too short");
      setError("Password must be at least 8 characters");
      return;
    }

    if (displayName.length < 1) {
      log("error", "No display name");
      setError("Please enter a display name");
      return;
    }

    // Validate any invite code up front so we fail before creating an identity.
    let invite: InvitePayload | null = null;
    if (inviteInput.trim()) {
      try {
        invite = parseInviteInput(inviteInput);
      } catch (e) {
        log("error", "Invalid invite code:", e);
        setInviteError(e instanceof Error ? e.message : "Invalid invite code");
        setShowInvite(true);
        return;
      }
    }

    setIsCreating(true);
    setError(null);
    setInviteError(null);

    try {
      log("info", "Calling create_identity with displayName:", displayName);
      const info = await invoke<IdentityInfo>("create_identity", {
        name: displayName,
        password: password,
      });
      log("info", "create_identity result:", info);

      if (info.exists) {
        log("info", "Identity created successfully!");
        setIdentity(info);
        // Redeem after the node is up, if an invite came along.
        if (invite) {
          setPendingInvite(invite);
          setRedeemComplete(false);
        }
        setStage("starting");
        await startNode(password);
      } else {
        log("error", "create_identity returned exists=false");
        setError("Failed to create identity");
      }
    } catch (e) {
      log("error", "===== FAILED TO CREATE IDENTITY =====", e);
      setError(String(e));
    } finally {
      setIsCreating(false);
    }
  };

  // Dev only: log stage changes and auto-screenshot for debugging
  useEffect(() => {
    if (!IS_DEV) return;
    log("info", "Stage changed", { stage, hasRpcEndpoint: !!rpcEndpoint, hasRpcAuth: !!rpcAuth });
    takeScreenshot(`stage-${stage}`);
  }, [stage, rpcEndpoint, rpcAuth]);

  // Dev only: keyboard shortcut for manual screenshot (F9 or Ctrl+Shift+P)
  useEffect(() => {
    if (!IS_DEV) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // F9 as simple trigger (F12 is devtools)
      if (e.key === 'F9') {
        e.preventDefault();
        takeScreenshot('manual-f9');
      }
      // Ctrl+Shift+P as backup (P for picture)
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        takeScreenshot('manual');
      }
    };
    // Capture phase to catch before iframe
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Poll node status when ready
  useEffect(() => {
    if (stage !== "ready") return;

    log("info", "Stage is ready, starting node status polling");

    const pollStatus = async () => {
      try {
        const status = await invoke<NodeStatus>("get_node_status");
        setNodeStatus(status);
      } catch (e) {
        log("error", "Failed to get node status:", e);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [stage]);

  // Wave SVG logo component
  const WaveLogo = ({ size = 64 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" className="logo-svg" role="img" aria-label="Swimchain logo">
      <title>Swimchain</title>
      <defs>
        <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <path
        d="M10,50 Q25,30 40,50 T70,50 T100,50 M10,60 Q25,40 40,60 T70,60 T100,60 M10,70 Q25,50 40,70 T70,70 T100,70"
        fill="none"
        stroke="url(#waveGradient)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );

  // Network selector shared by onboarding + unlock screens
  const renderNetworkSelector = (disabled?: boolean) => (
    <div className="form-group">
      <label htmlFor="networkSelect">Network</label>
      <select
        id="networkSelect"
        className="network-select"
        value={network}
        onChange={(e) => selectNetwork(e.target.value as NetworkType)}
        disabled={disabled}
      >
        {NETWORKS.map((net) => (
          <option key={net} value={net}>{NETWORK_LABELS[net]}</option>
        ))}
      </select>
      <small>Each network keeps its own identity and data</small>
    </div>
  );

  // Checking stage
  if (stage === "checking") {
    return (
      <div className="app loading">
        <div className="loading-spinner">
          <div className="logo"><WaveLogo /></div>
          <h2>Swimchain</h2>
          <p>Checking setup...</p>
        </div>
      </div>
    );
  }

  // Error stage
  if (stage === "error") {
    return (
      <div className="app loading">
        <div className="loading-spinner error">
          <div className="logo error-icon">!</div>
          <h2>Something went wrong</h2>
          <p className="error-message">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Unlock stage
  if (stage === "unlock") {
    return (
      <div className="app onboarding">
        <div className="onboarding-container">
          <div className="logo"><WaveLogo size={80} /></div>
          <h1>Welcome back</h1>
          <p className="subtitle">Enter your password to unlock your identity and start your node.</p>

          {identity?.address && (
            <div className="identity-preview">
              <code>{identity.address}</code>
            </div>
          )}

          <form onSubmit={handleUnlock} className="onboarding-form">
            {renderNetworkSelector(isUnlocking)}
            <div className="form-group">
              <label htmlFor="unlockPassword">Password</label>
              <input
                type="password"
                id="unlockPassword"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isUnlocking}
                autoFocus
              />
            </div>

            {error && <div className="form-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-large"
              disabled={isUnlocking || password.length === 0}
            >
              {isUnlocking ? "Unlocking..." : "Unlock & Connect"}
            </button>
          </form>

          {!confirmReset ? (
            <button
              type="button"
              className="btn-link"
              disabled={isUnlocking}
              onClick={() => setConfirmReset(true)}
            >
              Forgot your password? Start fresh with a new identity
            </button>
          ) : (
            <div className="reset-confirm">
              <p className="subtitle">
                Your current identity will be archived (not deleted) and you'll
                create a new one. Anything tied to the old identity stays with it.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleResetIdentity}
                >
                  Yes, start fresh
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Onboarding stage
  if (stage === "onboarding") {
    return (
      <div className="app onboarding">
        <div className="onboarding-container">
          <div className="logo"><WaveLogo size={80} /></div>
          <h1>Welcome to Swimchain</h1>
          <p className="subtitle">A truly decentralized social network - no servers, no ads, no algorithms.</p>

          <form onSubmit={handleCreateIdentity} className="onboarding-form">
            {renderNetworkSelector(isCreating)}
            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How others will see you"
                disabled={isCreating}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Protects your identity"
                disabled={isCreating}
              />
              <small>Used to encrypt your private key locally</small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                disabled={isCreating}
              />
            </div>

            {!showInvite ? (
              <button
                type="button"
                className="btn-link"
                disabled={isCreating}
                onClick={() => setShowInvite(true)}
              >
                Have an invite code?
              </button>
            ) : (
              <div className="form-group">
                <label htmlFor="inviteCode">Invite code (optional)</label>
                <input
                  type="text"
                  id="inviteCode"
                  value={inviteInput}
                  onChange={(e) => {
                    setInviteInput(e.target.value);
                    setInviteError(null);
                  }}
                  placeholder="Paste your invite code or link"
                  disabled={isCreating}
                  autoComplete="off"
                  spellCheck={false}
                />
                <small>
                  Paste the code your friend sent, or the whole
                  https://swimchain.io/i/ link. We&apos;ll get you sponsored automatically.
                </small>
                {inviteError && <div className="form-error">{inviteError}</div>}
              </div>
            )}

            {error && <div className="form-error">{error}</div>}

            <div className="identity-warning">
              <strong>Important:</strong> Your password cannot be recovered. If you forget it, you will permanently lose access to your identity, content, and reputation. Please use a strong password and store it safely.
            </div>

            <button type="submit" className="btn btn-primary btn-large" disabled={isCreating}>
              {isCreating ? "Creating Identity..." : "Create Identity & Join"}
            </button>
          </form>

          <div className="onboarding-info">
            <h3>What happens next?</h3>
            <ul>
              <li>Your identity is created locally on your machine</li>
              <li>A local node starts and connects to the network</li>
              <li>You can browse and post in decentralized spaces</li>
            </ul>
            <p className="notice">There are no accounts, no servers, no company. You own your data.</p>
          </div>
        </div>
      </div>
    );
  }

  // Starting stage
  if (stage === "starting") {
    return (
      <div className="app loading">
        <div className="loading-spinner">
          <div className="logo"><WaveLogo /></div>
          <h2>Starting your node...</h2>
          <p>Connecting to the Swimchain network</p>
          <div className="progress-bar">
            <div className="progress-bar-fill"></div>
          </div>
        </div>
      </div>
    );
  }

  // Ready stage - show NodeStatusBar + embedded client
  if (!rpcEndpoint || !rpcAuth) {
    return (
      <div className="app loading">
        <div className="loading-spinner">
          <h2>Waiting for node connection...</h2>
        </div>
      </div>
    );
  }

  // Invite hand-off (SWIM-INV-3): the node is up and the newcomer arrived with
  // an invite. Redeem it before dropping them into the client, so they land
  // already sponsored (with, ideally, a DM waiting from their friend).
  if (pendingInvite && !redeemComplete) {
    return (
      <InviteRedemption
        invite={pendingInvite}
        rpcEndpoint={rpcEndpoint}
        rpcAuth={rpcAuth}
        onDone={() => {
          setRedeemComplete(true);
          setPendingInvite(null);
          setInviteInput("");
        }}
      />
    );
  }

  return (
    <div className="app ready">
      <NodeStatusBar
        status={nodeStatus}
        identity={identity}
        selectedClient={selectedClient}
        onClientChange={setSelectedClient}
        network={network}
        onNetworkChange={(net) => selectNetwork(net as NetworkType)}
        onScreenshot={IS_DEV ? () => takeScreenshot('manual-btn') : undefined}
      />
      <ClientFrame
        client={selectedClient}
        rpcEndpoint={rpcEndpoint}
        rpcAuth={rpcAuth}
        nodeAddress={identity?.address ?? null}
        nodeDisplayName={identity?.name ?? null}
      />
    </div>
  );
}

export default App;
