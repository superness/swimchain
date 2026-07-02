/**
 * Honest empty state shown when the gateway's node is unreachable.
 * Server-component safe (no client hooks).
 */
export function NodeOfflineNotice({ context }: { context?: string }) {
  return (
    <div className="node-offline-notice" role="status">
      <strong>Node offline</strong>
      <p>
        The gateway could not reach its Swimchain node
        {context ? ` to load ${context}` : ''}. Live content is temporarily
        unavailable — please try again shortly.
      </p>
    </div>
  );
}
