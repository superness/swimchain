/**
 * Space-class taxonomy — MUST match the node (src/types/space_class.rs).
 * Byte 0 of the 16-byte space id encodes the class.
 */
export var SpaceClass;
(function (SpaceClass) {
    SpaceClass[SpaceClass["Social"] = 1] = "Social";
    SpaceClass[SpaceClass["Profile"] = 2] = "Profile";
    SpaceClass[SpaceClass["Dm"] = 3] = "Dm";
    SpaceClass[SpaceClass["Private"] = 4] = "Private";
    SpaceClass[SpaceClass["App"] = 5] = "App";
})(SpaceClass || (SpaceClass = {}));
function bytesToHex(b) {
    return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** hex of `cls ‖ hash[..15]` (16 bytes → 32 hex chars). */
export function applyClass(cls, hash) {
    const out = new Uint8Array(16);
    out[0] = cls;
    out.set(hash.slice(0, 15), 1);
    return bytesToHex(out);
}
export function classOf(spaceIdHex) {
    const b = parseInt(spaceIdHex.slice(0, 2), 16);
    return Object.values(SpaceClass).includes(b) ? b : null;
}
//# sourceMappingURL=spaceClass.js.map