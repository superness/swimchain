/**
 * Hook to receive RPC config from parent frame (desktop-app wrapper)
 *
 * When running inside the desktop-app iframe, the parent sends:
 * {
 *   type: 'SWIMCHAIN_RPC_CONFIG',
 *   rpcEndpoint: 'http://127.0.0.1:19736',
 *   rpcAuth: 'Basic ...'
 * }
 */
interface ParentRpcConfig {
    rpcEndpoint: string;
    rpcAuth: string;
}
/**
 * Hook to get RPC config from parent frame
 * Returns null if not running in iframe or config not yet received
 */
export declare function useParentRpcConfig(): ParentRpcConfig | null;
/**
 * Check if running inside an iframe
 */
export declare function isInIframe(): boolean;
/**
 * Get parent config synchronously (for use outside React)
 */
export declare function getParentConfig(): ParentRpcConfig | null;
export {};
//# sourceMappingURL=useParentRpcConfig.d.ts.map