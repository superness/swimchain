/* tslint:disable */
/* eslint-disable */

export class WasmDecayState {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get a human-readable description of the decay state
   */
  description(): string;
  /**
   * Get the decay percentage (100% - current_heat * 100)
   */
  decayPercent(): number;
  /**
   * Get the time remaining until content expires (in seconds)
   *
   * Returns 0 if content is already decayed.
   * Returns u64::MAX if content is protected.
   */
  timeUntilDecay(): bigint;
  /**
   * Current "heat" value (survival probability, 0.0 to 1.0)
   */
  currentHeat: number;
  /**
   * Whether the content has decayed below threshold
   */
  isDecayed: boolean;
  /**
   * Whether the content is protected (within floor period or pinned)
   */
  isProtected: boolean;
  /**
   * Number of half-lives elapsed since last engagement
   */
  halfLivesElapsed: number;
  /**
   * Content age in seconds
   */
  ageSeconds: bigint;
  /**
   * Seconds since last engagement
   */
  timeSinceEngagement: bigint;
}

export class WasmKeypair {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the public key as a 32-byte array
   *
   * # Returns
   * 32-byte Ed25519 public key
   */
  publicKey(): Uint8Array;
  /**
   * Generate a new random keypair
   *
   * Uses the browser's cryptographically secure random number generator.
   *
   * # Example (JavaScript)
   * ```js
   * const keypair = new WasmKeypair();
   * console.log(keypair.address()); // cs1...
   * ```
   */
  constructor();
  /**
   * Get the seed (private key) as a 32-byte array
   *
   * WARNING: The seed IS the private key. Store it securely (encrypted).
   * Anyone with access to this seed can sign messages as this identity.
   *
   * # Returns
   * 32-byte Ed25519 seed (private key)
   *
   * # Example (JavaScript)
   * ```js
   * const keypair = new WasmKeypair();
   * const seed = keypair.seed();
   * // Encrypt and store the seed securely
   * localStorage.setItem('identity_seed', encrypt(seed));
   *
   * // Later, recreate keypair from seed
   * const savedSeed = decrypt(localStorage.getItem('identity_seed'));
   * const restoredKeypair = WasmKeypair.fromSeed(savedSeed);
   * ```
   */
  seed(): Uint8Array;
  /**
   * Sign a message with this keypair
   *
   * # Arguments
   * * `message` - The message to sign
   *
   * # Returns
   * 64-byte Ed25519 signature
   *
   * # Example (JavaScript)
   * ```js
   * const keypair = new WasmKeypair();
   * const message = new TextEncoder().encode("Hello");
   * const signature = keypair.sign(message);
   * console.log(signature.length); // 64
   * ```
   */
  sign(message: Uint8Array): Uint8Array;
  /**
   * Get the Bech32m address for this keypair
   *
   * Returns an address in the format "cs1..." (Swimchain addresses).
   *
   * # Returns
   * Bech32m-encoded address string
   *
   * # Example (JavaScript)
   * ```js
   * const keypair = new WasmKeypair();
   * const addr = keypair.address();
   * console.log(addr.startsWith("sw1")); // true
   * ```
   */
  address(): string;
  /**
   * Create a keypair from a 32-byte seed
   *
   * The seed must be exactly 32 bytes and should be generated from
   * a cryptographically secure source.
   *
   * # Arguments
   * * `seed` - 32-byte seed value
   *
   * # Returns
   * A new keypair derived from the seed
   */
  static fromSeed(seed: Uint8Array): WasmKeypair;
}

export class WasmPowSolution {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the number of leading zeros in the hash
   */
  leadingZeros(): number;
  /**
   * Get the resulting hash
   */
  hash(): Uint8Array;
  /**
   * Get hash rate (hashes per second)
   */
  hashRate(): number;
  /**
   * Get the nonce value
   */
  readonly nonce: bigint;
  /**
   * Get the number of attempts made
   */
  readonly attempts: bigint;
  /**
   * Get the timestamp used
   */
  readonly timestamp: bigint;
  /**
   * Time elapsed in milliseconds
   */
  elapsedMs: number;
}

/**
 * Calculate decay state with custom half-life
 *
 * # Arguments
 * * `created_at_secs` - Content creation timestamp (UNIX seconds)
 * * `last_engagement_secs` - Last engagement timestamp (UNIX seconds)
 * * `now_secs` - Current timestamp (UNIX seconds)
 * * `half_life_secs` - Optional custom half-life (defaults to 7 days)
 *
 * # Returns
 * `WasmDecayState` with all decay information
 */
export function calculateDecayWithHalfLife(created_at_secs: bigint, last_engagement_secs: bigint, now_secs: bigint, half_life_secs?: bigint | null): WasmDecayState;

/**
 * Calculate decay state for content
 *
 * # Arguments
 * * `created_at_secs` - Content creation timestamp (UNIX seconds)
 * * `last_engagement_secs` - Last engagement timestamp (UNIX seconds)
 * * `now_secs` - Current timestamp (UNIX seconds)
 *
 * # Returns
 * `WasmDecayState` with all decay information
 *
 * # Example (JavaScript)
 * ```js
 * const nowSecs = Math.floor(Date.now() / 1000);
 * const createdSecs = nowSecs - 86400; // 1 day ago
 * const state = calculate_decay(createdSecs, createdSecs, nowSecs);
 * console.log(state.isProtected); // true (within 48h floor)
 * ```
 */
export function calculate_decay(created_at_secs: bigint, last_engagement_secs: bigint, now_secs: bigint): WasmDecayState;

/**
 * Compute content ID from data
 *
 * Returns a content ID in the format "sha256:<hex_hash>".
 * This matches the content addressing scheme used by Swimchain.
 *
 * # Example (JavaScript)
 * ```js
 * const data = new TextEncoder().encode("Hello, World!");
 * const id = content_id(data);
 * console.log(id.startsWith("sha256:")); // true
 * ```
 */
export function content_id(data: Uint8Array): string;

/**
 * Decode a Bech32m address to a public key
 *
 * # Arguments
 * * `address` - Bech32m-encoded address string
 *
 * # Returns
 * 32-byte Ed25519 public key
 *
 * # Errors
 * Returns an error if the address is invalid, has wrong prefix,
 * unsupported version, or wrong length.
 *
 * # Example (JavaScript)
 * ```js
 * const pubkey = decode_address("cs1qqqq...");
 * console.log(pubkey.length); // 32
 * ```
 */
export function decode_address(address: string): Uint8Array;

/**
 * Compute double SHA-256 (SHA-256 of SHA-256)
 *
 * Used in some Bitcoin-style protocols for additional security.
 */
export function double_sha256(data: Uint8Array): Uint8Array;

/**
 * Encode a public key as a Bech32m address
 *
 * # Arguments
 * * `public_key` - 32-byte Ed25519 public key
 *
 * # Returns
 * Bech32m-encoded address string starting with "sw1"
 *
 * # Example (JavaScript)
 * ```js
 * const pubkey = keypair.publicKey();
 * const address = encode_address(pubkey);
 * console.log(address.startsWith("sw1")); // true
 * ```
 */
export function encode_address(public_key: Uint8Array): string;

/**
 * Estimate time to mine at a given difficulty
 *
 * Based on expected number of attempts: 2^difficulty
 * Assumes approximate hash rate (actual may vary by device).
 *
 * # Arguments
 * * `difficulty` - Number of leading zero bits required
 * * `hash_rate` - Estimated hashes per second (optional, defaults to 500000)
 *
 * # Returns
 * Estimated time in seconds
 */
export function estimateMiningTime(difficulty: number, hash_rate?: number | null): number;

/**
 * Get the default decay floor in seconds (48 hours)
 */
export function getDecayFloorSecs(): bigint;

/**
 * Get the decay threshold (6.25%)
 */
export function getDecayThreshold(): number;

/**
 * Get the default identity PoW difficulty
 */
export function getDefaultIdentityPowDifficulty(): number;

/**
 * Get the default half-life in seconds (7 days)
 */
export function getHalfLifeSecs(): bigint;

/**
 * Initialize the WASM module
 *
 * Sets up panic hook for better error messages in browser console.
 * This is called automatically when the module loads.
 */
export function init(): void;

/**
 * Check if a string is a valid Swimchain address
 *
 * # Arguments
 * * `address` - The address string to validate
 *
 * # Returns
 * `true` if the address is valid, `false` otherwise
 */
export function is_valid_address(address: string): boolean;

/**
 * Count leading zero bits in a hash
 *
 * Used for proof-of-work difficulty verification.
 * Returns the number of leading zero bits (0-256 for a 32-byte hash).
 *
 * # Example (JavaScript)
 * ```js
 * const hash = new Uint8Array(32);
 * hash[0] = 0x0F; // 4 leading zeros
 * console.log(leading_zeros(hash)); // 4
 * ```
 */
export function leading_zeros(hash: Uint8Array): number;

/**
 * Mine identity proof-of-work with maximum attempts limit
 *
 * Same as `mine_identity_pow` but stops after `max_attempts` hashes.
 *
 * # Arguments
 * * `public_key` - 32-byte Ed25519 public key
 * * `difficulty` - Number of leading zero bits required (1-64)
 * * `max_attempts` - Maximum number of hash attempts
 *
 * # Returns
 * A `WasmPowSolution` if successful
 *
 * # Errors
 * Returns an error if max attempts is exceeded
 */
export function mineIdentityPowWithLimit(public_key: Uint8Array, difficulty: number, max_attempts: bigint): WasmPowSolution;

/**
 * Mine identity proof-of-work
 *
 * Finds a nonce such that SHA-256(pubkey || timestamp || nonce) has at least
 * `difficulty` leading zero bits.
 *
 * # Arguments
 * * `public_key` - 32-byte Ed25519 public key
 * * `difficulty` - Number of leading zero bits required (1-64)
 *
 * # Returns
 * A `WasmPowSolution` containing the nonce and metadata
 *
 * # Errors
 * Returns an error if:
 * - Public key is not 32 bytes
 * - Difficulty is out of range
 * - Maximum attempts exceeded (extremely unlikely)
 *
 * # Example (JavaScript)
 * ```js
 * const keypair = new WasmKeypair();
 * const solution = mine_identity_pow(keypair.publicKey(), 8);
 * console.log(solution.elapsedMs);
 * ```
 */
export function mine_identity_pow(public_key: Uint8Array, difficulty: number): WasmPowSolution;

/**
 * Compute SHA-256 hash of data
 *
 * Returns a 32-byte hash as a Uint8Array in JavaScript.
 *
 * # Example (JavaScript)
 * ```js
 * const hash = sha256(new Uint8Array([1, 2, 3]));
 * console.log(hash.length); // 32
 * ```
 */
export function sha256(data: Uint8Array): Uint8Array;

/**
 * Verify identity proof-of-work and return the hash
 *
 * Same as `verify_identity_pow` but also returns the computed hash.
 *
 * # Returns
 * The hash if valid, null otherwise
 */
export function verifyIdentityPowWithHash(pubkey: Uint8Array, timestamp: bigint, nonce: bigint, difficulty: number): Uint8Array | undefined;

/**
 * Verify identity proof-of-work
 *
 * Validates that SHA-256(pubkey || timestamp || nonce) has at least
 * `difficulty` leading zero bits.
 *
 * # Arguments
 * * `pubkey` - 32-byte Ed25519 public key
 * * `timestamp` - Timestamp used in the PoW (UNIX seconds)
 * * `nonce` - The nonce value (as BigInt in JavaScript)
 * * `difficulty` - Required number of leading zero bits
 *
 * # Returns
 * `true` if the proof is valid, `false` otherwise
 *
 * # Example (JavaScript)
 * ```js
 * const isValid = verify_identity_pow(
 *   solution.hash(),
 *   solution.timestamp,
 *   solution.nonce,
 *   8
 * );
 * ```
 */
export function verify_identity_pow(pubkey: Uint8Array, timestamp: bigint, nonce: bigint, difficulty: number): boolean;

/**
 * Verify that a hash meets the required PoW difficulty
 *
 * Returns true if the hash has at least `difficulty` leading zero bits.
 */
export function verify_pow_difficulty(hash: Uint8Array, difficulty: number): boolean;

/**
 * Verify a signature against a message and public key
 *
 * # Arguments
 * * `pubkey` - 32-byte Ed25519 public key
 * * `message` - The message that was signed
 * * `signature` - 64-byte Ed25519 signature
 *
 * # Returns
 * `true` if the signature is valid, `false` otherwise
 *
 * # Example (JavaScript)
 * ```js
 * const isValid = verify_signature(pubkey, message, signature);
 * ```
 */
export function verify_signature(pubkey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;

/**
 * Get the library version
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_get_wasmdecaystate_ageSeconds: (a: number) => bigint;
  readonly __wbg_get_wasmdecaystate_currentHeat: (a: number) => number;
  readonly __wbg_get_wasmdecaystate_halfLivesElapsed: (a: number) => number;
  readonly __wbg_get_wasmdecaystate_isDecayed: (a: number) => number;
  readonly __wbg_get_wasmdecaystate_isProtected: (a: number) => number;
  readonly __wbg_get_wasmdecaystate_timeSinceEngagement: (a: number) => bigint;
  readonly __wbg_get_wasmpowsolution_elapsedMs: (a: number) => number;
  readonly __wbg_set_wasmdecaystate_ageSeconds: (a: number, b: bigint) => void;
  readonly __wbg_set_wasmdecaystate_currentHeat: (a: number, b: number) => void;
  readonly __wbg_set_wasmdecaystate_halfLivesElapsed: (a: number, b: number) => void;
  readonly __wbg_set_wasmdecaystate_isDecayed: (a: number, b: number) => void;
  readonly __wbg_set_wasmdecaystate_isProtected: (a: number, b: number) => void;
  readonly __wbg_set_wasmdecaystate_timeSinceEngagement: (a: number, b: bigint) => void;
  readonly __wbg_set_wasmpowsolution_elapsedMs: (a: number, b: number) => void;
  readonly __wbg_wasmdecaystate_free: (a: number, b: number) => void;
  readonly __wbg_wasmkeypair_free: (a: number, b: number) => void;
  readonly __wbg_wasmpowsolution_free: (a: number, b: number) => void;
  readonly calculateDecayWithHalfLife: (a: bigint, b: bigint, c: bigint, d: number, e: bigint) => number;
  readonly calculate_decay: (a: bigint, b: bigint, c: bigint) => number;
  readonly content_id: (a: number, b: number) => [number, number];
  readonly decode_address: (a: number, b: number) => [number, number, number, number];
  readonly double_sha256: (a: number, b: number) => [number, number];
  readonly encode_address: (a: number, b: number) => [number, number, number, number];
  readonly estimateMiningTime: (a: number, b: number, c: number) => number;
  readonly getDecayFloorSecs: () => bigint;
  readonly getDecayThreshold: () => number;
  readonly getDefaultIdentityPowDifficulty: () => number;
  readonly getHalfLifeSecs: () => bigint;
  readonly is_valid_address: (a: number, b: number) => number;
  readonly leading_zeros: (a: number, b: number) => number;
  readonly mineIdentityPowWithLimit: (a: number, b: number, c: number, d: bigint) => [number, number, number];
  readonly mine_identity_pow: (a: number, b: number, c: number) => [number, number, number];
  readonly sha256: (a: number, b: number) => [number, number];
  readonly verifyIdentityPowWithHash: (a: number, b: number, c: bigint, d: bigint, e: number) => [number, number];
  readonly verify_identity_pow: (a: number, b: number, c: bigint, d: bigint, e: number) => number;
  readonly verify_pow_difficulty: (a: number, b: number, c: number) => number;
  readonly verify_signature: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly version: () => [number, number];
  readonly wasmdecaystate_decayPercent: (a: number) => number;
  readonly wasmdecaystate_description: (a: number) => [number, number];
  readonly wasmdecaystate_timeUntilDecay: (a: number) => bigint;
  readonly wasmkeypair_address: (a: number) => [number, number];
  readonly wasmkeypair_fromSeed: (a: number, b: number) => [number, number, number];
  readonly wasmkeypair_new: () => [number, number, number];
  readonly wasmkeypair_publicKey: (a: number) => [number, number];
  readonly wasmkeypair_seed: (a: number) => [number, number];
  readonly wasmkeypair_sign: (a: number, b: number, c: number) => [number, number];
  readonly wasmpowsolution_attempts: (a: number) => any;
  readonly wasmpowsolution_hash: (a: number) => [number, number];
  readonly wasmpowsolution_hashRate: (a: number) => number;
  readonly wasmpowsolution_leadingZeros: (a: number) => number;
  readonly wasmpowsolution_nonce: (a: number) => any;
  readonly wasmpowsolution_timestamp: (a: number) => any;
  readonly init: () => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
