/**
 * Space-class taxonomy — MUST match the node (src/types/space_class.rs).
 * Byte 0 of the 16-byte space id encodes the class.
 */
export enum SpaceClass {
  Social = 0x01,
  Profile = 0x02,
  Dm = 0x03,
  Private = 0x04,
  App = 0x05,
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** hex of `cls ‖ hash[..15]` (16 bytes → 32 hex chars). */
export function applyClass(cls: SpaceClass, hash: Uint8Array): string {
  const out = new Uint8Array(16);
  out[0] = cls;
  out.set(hash.slice(0, 15), 1);
  return bytesToHex(out);
}

export function classOf(spaceIdHex: string): SpaceClass | null {
  const b = parseInt(spaceIdHex.slice(0, 2), 16);
  return (Object.values(SpaceClass) as number[]).includes(b) ? (b as SpaceClass) : null;
}
