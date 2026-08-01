export declare const TRUSTED_PARENT_ORIGINS: ReadonlySet<string>;
export declare function isConfigMessageTrusted(event: {
    origin: string;
    source: unknown;
}, ctx: {
    selfOrigin: string;
    parentWindow: unknown;
}): boolean;
export interface ParentRpcConfigLike {
    rpcEndpoint?: string;
    rpcAuth?: string;
    nodeAddress?: string;
    nodeDisplayName?: string;
}
export declare function mergeTrustedConfig<T extends ParentRpcConfigLike>(current: T | null, incoming: T): T;
//# sourceMappingURL=configTrust.d.ts.map