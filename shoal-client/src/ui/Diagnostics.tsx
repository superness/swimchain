/**
 * The Shoal — shell diagnostics (developer-facing, Task 1 of the shell plan).
 *
 * DISPLAY SIDE. This is not a game surface and is not written like one: it says node,
 * sidecar and block height on purpose. The diegetic rule (spec §1.1) governs
 * PLAYER-facing copy, and the honest way to keep it is to make the developer screen
 * unmistakably a developer screen rather than dressing the plumbing in sea language.
 * Tasks 4-6 replace this view entirely.
 *
 * What it proves, and why that is the whole point of Task 1: the shell resolves its RPC
 * auth through `shoalRpc.resolveAuth` — the same function the game will use — and calls
 * `get_info` with it. A window that renders but shows "no answer" here is a shell that
 * cannot reach its own node, which is precisely the failure this task exists to catch.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { resolveAuth, rpcCall, type RpcAuth } from '../lib/shoalRpc';

/** `get_info`'s result (src/rpc/types.rs:118, `GetInfoResult`) — the fields verified
 *  field-by-field against that struct, not assumed. */
interface NodeInfo {
  version: string;
  network: string;
  uptime_seconds: number;
  peer_count: number;
  block_height: number;
  node_id: string;
  rpc_port: number;
  p2p_port: number;
}

/** `node_status`'s result (src-tauri/src/main.rs's `NodeStatusDto`). Reports the SHELL's
 *  view of the sidecar process — which is a different question from "does RPC answer",
 *  and the two disagreeing is itself diagnostic (a process that is up but not yet
 *  listening, or a startup error with no process at all). */
interface SidecarStatus {
  running: boolean;
  pid: number | null;
  port: number;
  network: string;
  data_dir: string;
  error: string | null;
}

interface TauriWindow {
  __TAURI__?: { core?: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } };
}

/** `undefined` outside a Tauri shell (e.g. a bare `npm run dev` in a browser), in which
 *  case the sidecar column simply reports that there is no shell to ask. */
function tauriInvoke(): (<T>(cmd: string) => Promise<T>) | undefined {
  const w = globalThis as unknown as TauriWindow;
  const invoke = w.__TAURI__?.core?.invoke;
  if (!invoke) return undefined;
  return <T,>(cmd: string) => invoke<T>(cmd);
}

const POLL_MS = 2000;

export function Diagnostics() {
  const [auth, setAuth] = useState<RpcAuth | null>(null);
  const [info, setInfo] = useState<NodeInfo | null>(null);
  const [status, setStatus] = useState<SidecarStatus | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [handoff, setHandoff] = useState<string | null>(null);

  // `resolveAuth` is not idempotent-cheap — inside Tauri it invokes `get_rpc_config`,
  // which itself polls the node's handoff files for up to HANDOFF_WAIT
  // (src-tauri/src/main.rs), and that is 120 s, not the 10 s this comment used to
  // claim: the reference shell's flat 10 s cap was measured too short on a cold
  // mainnet start and raised. Resolving once and holding the answer is what keeps the
  // 2 s poll from stacking twelve of those on top of each other.
  const authRef = useRef<RpcAuth | null>(null);
  const resolving = useRef(false);

  const ensureAuth = useCallback(async (): Promise<RpcAuth | null> => {
    if (authRef.current) return authRef.current;
    if (resolving.current) return null;
    resolving.current = true;
    try {
      const a = await resolveAuth();
      setAuth(a);
      // `resolveAuth` now returns `null` rather than inventing an unauthenticated
      // `http://127.0.0.1:9736` — see its header. Nothing to cache and nothing to call.
      if (a === null) {
        setRpcError('resolveAuth found no node: no app-shell envelope, no get_rpc_config '
          + 'answer, and no SHOAL_RPC_ENDPOINT. There is deliberately no bare-localhost '
          + 'fallback (shoalRpc.ts) — an unauthenticated endpoint answers reads and fails '
          + 'every write, which reads as healthy and is not.');
        return null;
      }
      // Cache only a REAL answer. Inside a Tauri shell an `authHeader`-less result means
      // `get_rpc_config` did not answer and `resolveAuth` fell through to the
      // `SHOAL_RPC_ENDPOINT` env step — caching that would freeze the app in a state that
      // looks connected and cannot write. Leaving it uncached makes the next poll retry.
      if (a.authHeader || !tauriInvoke()) authRef.current = a;
      return a;
    } finally {
      resolving.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    setAttempts((n) => n + 1);

    const invoke = tauriInvoke();
    if (invoke) {
      try {
        setStatus(await invoke<SidecarStatus>('node_status'));
      } catch (e) {
        setStatus(null);
        setRpcError(`node_status failed: ${String(e)}`);
      }
      // Invoked RAW, separately from `resolveAuth`, on purpose. `resolveAuth` swallows a
      // failing `get_rpc_config` — it has other sources to try — so this row is the only
      // place the handoff's own answer (or its exception) is visible. It stays even now
      // that the unauthenticated fallback is gone: `SHOAL_RPC_ENDPOINT` can still put the
      // shell on an endpoint whose read methods answer without auth, and a green
      // "reachable" lamp would again not be evidence the auth path works.
      try {
        const cfg = await invoke<{ endpoint: string; auth: string | null }>('get_rpc_config');
        setHandoff(`${cfg.endpoint}  auth=${cfg.auth ? `${cfg.auth.slice(0, 16)}… (${cfg.auth.length} chars)` : 'null'}`);
      } catch (e) {
        setHandoff(`THREW: ${String(e)}`);
      }
    }

    const a = await ensureAuth();
    if (!a) return;
    try {
      setInfo(await rpcCall<NodeInfo>(a, 'get_info', {}));
      setRpcError(null);
    } catch (e) {
      setInfo(null);
      setRpcError(String(e));
      // A first run can resolve auth before the node is listening, or against a stale
      // cookie after a restart. Drop the cached answer so the next tick re-resolves
      // rather than retrying a dead endpoint forever.
      authRef.current = null;
    }
  }, [ensureAuth]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive) void refresh();
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refresh]);

  const reachable = info !== null;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={S.h1}>The Shoal — shell diagnostics</h1>
        <p style={S.sub}>
          Developer view (plan 2c, Task 1). Not a game surface. Replaced by the sea in Task 4.
        </p>
      </header>

      <section style={S.card}>
        <div style={S.lampRow}>
          <span style={{ ...S.lamp, background: reachable ? '#3ddc84' : '#e0564a' }} />
          <strong style={S.lampText}>
            {reachable ? 'sidecar reachable over RPC' : 'no answer from the sidecar yet'}
          </strong>
          <span style={S.dim}>poll #{attempts}</span>
        </div>

        <Rows
          rows={[
            ['network', info?.network],
            ['block height', info === null ? undefined : String(info.block_height)],
            ['peers', info === null ? undefined : String(info.peer_count)],
            ['node version', info?.version],
            ['uptime (s)', info === null ? undefined : String(info.uptime_seconds)],
            ['node id', info?.node_id],
            ['p2p / rpc port', info === null ? undefined : `${info.p2p_port} / ${info.rpc_port}`],
          ]}
        />
      </section>

      <div style={S.split}>
      <section style={S.card}>
        <h2 style={S.h2}>resolved auth (shoalRpc.resolveAuth)</h2>
        <Rows
          rows={[
            ['endpoint', auth?.endpoint],
            ['Authorization', auth?.authHeader ? `${auth.authHeader.slice(0, 16)}… (${auth.authHeader.length} chars)` : auth ? '(none)' : undefined],
            ['auth source', auth === null ? 'NONE — resolveAuth found no node' : auth.authHeader ? 'get_rpc_config (shell)' : 'SHOAL_RPC_ENDPOINT (unauthenticated)'],
            ['get_rpc_config (raw)', handoff ?? undefined],
          ]}
        />
        {rpcError && <pre style={S.err}>{rpcError}</pre>}
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>sidecar process (Tauri node_status)</h2>
        {status === null ? (
          <p style={S.dim}>no Tauri shell — running in a plain browser</p>
        ) : (
          <Rows
            rows={[
              ['process', status.running ? 'running' : 'not running'],
              ['pid', status.pid === null ? '—' : String(status.pid)],
              ['network', status.network],
              ['rpc port', String(status.port)],
              ['data dir', status.data_dir],
            ]}
          />
        )}
        {status?.error && <pre style={S.err}>{status.error}</pre>}
      </section>
      </div>

      <button style={S.button} onClick={() => { authRef.current = null; void refresh(); }}>
        re-resolve and refresh
      </button>
    </div>
  );
}

function Rows({ rows }: { rows: readonly (readonly [string, string | undefined])[] }) {
  return (
    <dl style={S.dl}>
      {rows.map(([k, v]) => (
        <div key={k} style={S.dlRow}>
          <dt style={S.dt}>{k}</dt>
          <dd style={S.dd}>{v ?? <span style={S.dim}>—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    margin: 0,
    padding: '18px 22px',
    background: '#05161f',
    color: '#cfe8f2',
    font: `12px/1.45 ${mono}`,
    boxSizing: 'border-box',
  },
  header: { marginBottom: 12 },
  h1: { margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: 0.2 },
  sub: { margin: '3px 0 0', color: '#6f93a3' },
  // Two columns below the fold-line so the whole panel fits one window without
  // scrolling — a diagnostic you have to scroll is a diagnostic that gets half-read.
  split: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  card: {
    border: '1px solid #12384a',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 10,
    background: '#08202c',
    minWidth: 0,
  },
  h2: { margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#8fc4d8' },
  lampRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  lamp: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  lampText: { fontWeight: 600 },
  dl: { margin: 0 },
  dlRow: { display: 'flex', gap: 10, padding: '1px 0' },
  dt: { width: 140, flex: '0 0 140px', color: '#6f93a3' },
  dd: { margin: 0, wordBreak: 'break-all' },
  dim: { color: '#4d6c7a' },
  err: {
    margin: '10px 0 0',
    padding: '8px 10px',
    background: '#2a1113',
    border: '1px solid #57262a',
    borderRadius: 6,
    color: '#f0a9a2',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  button: {
    font: `12px ${mono}`,
    color: '#cfe8f2',
    background: '#0d3346',
    border: '1px solid #1b5771',
    borderRadius: 6,
    padding: '7px 12px',
    cursor: 'pointer',
  },
};
