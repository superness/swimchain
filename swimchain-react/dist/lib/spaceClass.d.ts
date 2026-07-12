/**
 * Space-class taxonomy — MUST match the node (src/types/space_class.rs).
 * Byte 0 of the 16-byte space id encodes the class.
 */
export declare enum SpaceClass {
    Social = 1,
    Profile = 2,
    Dm = 3,
    Private = 4,
    App = 5
}
/** hex of `cls ‖ hash[..15]` (16 bytes → 32 hex chars). */
export declare function applyClass(cls: SpaceClass, hash: Uint8Array): string;
export declare function classOf(spaceIdHex: string): SpaceClass | null;
//# sourceMappingURL=spaceClass.d.ts.map