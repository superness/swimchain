// Canonical trust check + merge for the SWIMCHAIN_RPC_CONFIG handover (Surf spec §2.2).
// A config message hands the client its RPC endpoint + cookie auth; accepting one from
// the wrong sender lets a hostile frame repoint every RPC call — including sign_message —
// at an attacker. So the message must come from THIS frame's real parent window at an
// exactly-trusted origin (no prefix, no empty-origin), and the endpoint/auth are locked
// after the first accept (repoints refused).
export const TRUSTED_PARENT_ORIGINS: ReadonlySet<string> = new Set([
  'tauri://localhost',      // Tauri v1 shell
  'http://tauri.localhost', // Tauri v2 shell
  'https://tauri.localhost',
]);

export function isConfigMessageTrusted(
  event: { origin: string; source: unknown },
  ctx: { selfOrigin: string; parentWindow: unknown },
): boolean {
  if (event.source == null || event.source !== ctx.parentWindow) return false; // event.source === window.parent
  const origin = event.origin;
  if (origin && origin === ctx.selfOrigin) return true;   // exact same-origin (the embed case), never ""
  return TRUSTED_PARENT_ORIGINS.has(origin);              // enumerated trusted shell hosts, exact
}

export interface ParentRpcConfigLike {
  rpcEndpoint?: string;
  rpcAuth?: string;
  nodeAddress?: string;
  nodeDisplayName?: string;
}

// Endpoint-keyed first-wins. First accept sets everything. A later trusted message may
// NOT change endpoint/auth (that's a repoint attack — refused), but MAY fill a still-empty
// nodeAddress/nodeDisplayName — the launcher posts the endpoint immediately and the real
// nodeAddress once get_identity_info resolves, and that late flip must survive.
export function mergeTrustedConfig<T extends ParentRpcConfigLike>(current: T | null, incoming: T): T {
  if (current == null) return incoming;
  if (incoming.rpcEndpoint !== current.rpcEndpoint || incoming.rpcAuth !== current.rpcAuth) {
    return current; // repoint refused
  }
  if (current.nodeAddress || !incoming.nodeAddress) return current; // already filled, or nothing new to fill
  return { ...current, nodeAddress: incoming.nodeAddress, nodeDisplayName: current.nodeDisplayName || incoming.nodeDisplayName };
}
