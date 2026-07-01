let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

let WASM_VECTOR_LEN = 0;

const WasmDecayStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdecaystate_free(ptr >>> 0, 1));

const WasmKeypairFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmkeypair_free(ptr >>> 0, 1));

const WasmPowSolutionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpowsolution_free(ptr >>> 0, 1));

/**
 * Result of a decay calculation
 *
 * Contains all information about the current decay state of content.
 */
export class WasmDecayState {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmDecayState.prototype);
        obj.__wbg_ptr = ptr;
        WasmDecayStateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDecayStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdecaystate_free(ptr, 0);
    }
    /**
     * Get a human-readable description of the decay state
     * @returns {string}
     */
    description() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmdecaystate_description(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the decay percentage (100% - current_heat * 100)
     * @returns {number}
     */
    decayPercent() {
        const ret = wasm.wasmdecaystate_decayPercent(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the time remaining until content expires (in seconds)
     *
     * Returns 0 if content is already decayed.
     * Returns u64::MAX if content is protected.
     * @returns {bigint}
     */
    timeUntilDecay() {
        const ret = wasm.wasmdecaystate_timeUntilDecay(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Current "heat" value (survival probability, 0.0 to 1.0)
     * @returns {number}
     */
    get currentHeat() {
        const ret = wasm.__wbg_get_wasmdecaystate_currentHeat(this.__wbg_ptr);
        return ret;
    }
    /**
     * Current "heat" value (survival probability, 0.0 to 1.0)
     * @param {number} arg0
     */
    set currentHeat(arg0) {
        wasm.__wbg_set_wasmdecaystate_currentHeat(this.__wbg_ptr, arg0);
    }
    /**
     * Whether the content has decayed below threshold
     * @returns {boolean}
     */
    get isDecayed() {
        const ret = wasm.__wbg_get_wasmdecaystate_isDecayed(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Whether the content has decayed below threshold
     * @param {boolean} arg0
     */
    set isDecayed(arg0) {
        wasm.__wbg_set_wasmdecaystate_isDecayed(this.__wbg_ptr, arg0);
    }
    /**
     * Whether the content is protected (within floor period or pinned)
     * @returns {boolean}
     */
    get isProtected() {
        const ret = wasm.__wbg_get_wasmdecaystate_isProtected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Whether the content is protected (within floor period or pinned)
     * @param {boolean} arg0
     */
    set isProtected(arg0) {
        wasm.__wbg_set_wasmdecaystate_isProtected(this.__wbg_ptr, arg0);
    }
    /**
     * Number of half-lives elapsed since last engagement
     * @returns {number}
     */
    get halfLivesElapsed() {
        const ret = wasm.__wbg_get_wasmdecaystate_halfLivesElapsed(this.__wbg_ptr);
        return ret;
    }
    /**
     * Number of half-lives elapsed since last engagement
     * @param {number} arg0
     */
    set halfLivesElapsed(arg0) {
        wasm.__wbg_set_wasmdecaystate_halfLivesElapsed(this.__wbg_ptr, arg0);
    }
    /**
     * Content age in seconds
     * @returns {bigint}
     */
    get ageSeconds() {
        const ret = wasm.__wbg_get_wasmdecaystate_ageSeconds(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Content age in seconds
     * @param {bigint} arg0
     */
    set ageSeconds(arg0) {
        wasm.__wbg_set_wasmdecaystate_ageSeconds(this.__wbg_ptr, arg0);
    }
    /**
     * Seconds since last engagement
     * @returns {bigint}
     */
    get timeSinceEngagement() {
        const ret = wasm.__wbg_get_wasmdecaystate_timeSinceEngagement(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Seconds since last engagement
     * @param {bigint} arg0
     */
    set timeSinceEngagement(arg0) {
        wasm.__wbg_set_wasmdecaystate_timeSinceEngagement(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) WasmDecayState.prototype[Symbol.dispose] = WasmDecayState.prototype.free;

/**
 * Ed25519 keypair for identity operations
 *
 * Provides key generation, signing, and address derivation.
 * The secret key is stored internally and cannot be exported directly
 * for security reasons.
 */
export class WasmKeypair {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmKeypair.prototype);
        obj.__wbg_ptr = ptr;
        WasmKeypairFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmKeypairFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmkeypair_free(ptr, 0);
    }
    /**
     * Get the public key as a 32-byte array
     *
     * # Returns
     * 32-byte Ed25519 public key
     * @returns {Uint8Array}
     */
    publicKey() {
        const ret = wasm.wasmkeypair_publicKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
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
    constructor() {
        const ret = wasm.wasmkeypair_new();
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmKeypairFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
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
     * @param {Uint8Array} message
     * @returns {Uint8Array}
     */
    sign(message) {
        const ptr0 = passArray8ToWasm0(message, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmkeypair_sign(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Get the Bech32m address for this keypair
     *
     * Returns an address in the format "cs1..." (ChainSocial addresses).
     *
     * # Returns
     * Bech32m-encoded address string
     *
     * # Example (JavaScript)
     * ```js
     * const keypair = new WasmKeypair();
     * const addr = keypair.address();
     * console.log(addr.startsWith("cs1")); // true
     * ```
     * @returns {string}
     */
    address() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmkeypair_address(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
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
     * @param {Uint8Array} seed
     * @returns {WasmKeypair}
     */
    static fromSeed(seed) {
        const ptr0 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmkeypair_fromSeed(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmKeypair.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmKeypair.prototype[Symbol.dispose] = WasmKeypair.prototype.free;

/**
 * Result of successful PoW mining
 */
export class WasmPowSolution {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmPowSolution.prototype);
        obj.__wbg_ptr = ptr;
        WasmPowSolutionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPowSolutionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpowsolution_free(ptr, 0);
    }
    /**
     * Get the number of leading zeros in the hash
     * @returns {number}
     */
    leadingZeros() {
        const ret = wasm.wasmpowsolution_leadingZeros(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the resulting hash
     * @returns {Uint8Array}
     */
    hash() {
        const ret = wasm.wasmpowsolution_hash(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Get the nonce value
     * @returns {bigint}
     */
    get nonce() {
        const ret = wasm.wasmpowsolution_nonce(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the number of attempts made
     * @returns {bigint}
     */
    get attempts() {
        const ret = wasm.wasmpowsolution_attempts(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get hash rate (hashes per second)
     * @returns {number}
     */
    hashRate() {
        const ret = wasm.wasmpowsolution_hashRate(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the timestamp used
     * @returns {bigint}
     */
    get timestamp() {
        const ret = wasm.wasmpowsolution_timestamp(this.__wbg_ptr);
        return ret;
    }
    /**
     * Time elapsed in milliseconds
     * @returns {number}
     */
    get elapsedMs() {
        const ret = wasm.__wbg_get_wasmpowsolution_elapsedMs(this.__wbg_ptr);
        return ret;
    }
    /**
     * Time elapsed in milliseconds
     * @param {number} arg0
     */
    set elapsedMs(arg0) {
        wasm.__wbg_set_wasmpowsolution_elapsedMs(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) WasmPowSolution.prototype[Symbol.dispose] = WasmPowSolution.prototype.free;

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
 * @param {bigint} created_at_secs
 * @param {bigint} last_engagement_secs
 * @param {bigint} now_secs
 * @param {bigint | null} [half_life_secs]
 * @returns {WasmDecayState}
 */
export function calculateDecayWithHalfLife(created_at_secs, last_engagement_secs, now_secs, half_life_secs) {
    const ret = wasm.calculateDecayWithHalfLife(created_at_secs, last_engagement_secs, now_secs, !isLikeNone(half_life_secs), isLikeNone(half_life_secs) ? BigInt(0) : half_life_secs);
    return WasmDecayState.__wrap(ret);
}

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
 * @param {bigint} created_at_secs
 * @param {bigint} last_engagement_secs
 * @param {bigint} now_secs
 * @returns {WasmDecayState}
 */
export function calculate_decay(created_at_secs, last_engagement_secs, now_secs) {
    const ret = wasm.calculate_decay(created_at_secs, last_engagement_secs, now_secs);
    return WasmDecayState.__wrap(ret);
}

/**
 * Compute content ID from data
 *
 * Returns a content ID in the format "sha256:<hex_hash>".
 * This matches the content addressing scheme used by ChainSocial.
 *
 * # Example (JavaScript)
 * ```js
 * const data = new TextEncoder().encode("Hello, World!");
 * const id = content_id(data);
 * console.log(id.startsWith("sha256:")); // true
 * ```
 * @param {Uint8Array} data
 * @returns {string}
 */
export function content_id(data) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.content_id(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

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
 * @param {string} address
 * @returns {Uint8Array}
 */
export function decode_address(address) {
    const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decode_address(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Compute double SHA-256 (SHA-256 of SHA-256)
 *
 * Used in some Bitcoin-style protocols for additional security.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function double_sha256(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.double_sha256(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Encode a public key as a Bech32m address
 *
 * # Arguments
 * * `public_key` - 32-byte Ed25519 public key
 *
 * # Returns
 * Bech32m-encoded address string starting with "cs1"
 *
 * # Example (JavaScript)
 * ```js
 * const pubkey = keypair.publicKey();
 * const address = encode_address(pubkey);
 * console.log(address.startsWith("cs1")); // true
 * ```
 * @param {Uint8Array} public_key
 * @returns {string}
 */
export function encode_address(public_key) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(public_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.encode_address(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

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
 * @param {number} difficulty
 * @param {number | null} [hash_rate]
 * @returns {number}
 */
export function estimateMiningTime(difficulty, hash_rate) {
    const ret = wasm.estimateMiningTime(difficulty, !isLikeNone(hash_rate), isLikeNone(hash_rate) ? 0 : hash_rate);
    return ret;
}

/**
 * Get the default decay floor in seconds (48 hours)
 * @returns {bigint}
 */
export function getDecayFloorSecs() {
    const ret = wasm.getDecayFloorSecs();
    return BigInt.asUintN(64, ret);
}

/**
 * Get the decay threshold (6.25%)
 * @returns {number}
 */
export function getDecayThreshold() {
    const ret = wasm.getDecayThreshold();
    return ret;
}

/**
 * Get the default identity PoW difficulty
 * @returns {number}
 */
export function getDefaultIdentityPowDifficulty() {
    const ret = wasm.getDefaultIdentityPowDifficulty();
    return ret;
}

/**
 * Get the default half-life in seconds (7 days)
 * @returns {bigint}
 */
export function getHalfLifeSecs() {
    const ret = wasm.getHalfLifeSecs();
    return BigInt.asUintN(64, ret);
}

/**
 * Initialize the WASM module
 *
 * Sets up panic hook for better error messages in browser console.
 * This is called automatically when the module loads.
 */
export function init() {
    wasm.init();
}

/**
 * Check if a string is a valid ChainSocial address
 *
 * # Arguments
 * * `address` - The address string to validate
 *
 * # Returns
 * `true` if the address is valid, `false` otherwise
 * @param {string} address
 * @returns {boolean}
 */
export function is_valid_address(address) {
    const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.is_valid_address(ptr0, len0);
    return ret !== 0;
}

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
 * @param {Uint8Array} hash
 * @returns {number}
 */
export function leading_zeros(hash) {
    const ptr0 = passArray8ToWasm0(hash, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.leading_zeros(ptr0, len0);
    return ret >>> 0;
}

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
 * @param {Uint8Array} public_key
 * @param {number} difficulty
 * @param {bigint} max_attempts
 * @returns {WasmPowSolution}
 */
export function mineIdentityPowWithLimit(public_key, difficulty, max_attempts) {
    const ptr0 = passArray8ToWasm0(public_key, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.mineIdentityPowWithLimit(ptr0, len0, difficulty, max_attempts);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmPowSolution.__wrap(ret[0]);
}

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
 * @param {Uint8Array} public_key
 * @param {number} difficulty
 * @returns {WasmPowSolution}
 */
export function mine_identity_pow(public_key, difficulty) {
    const ptr0 = passArray8ToWasm0(public_key, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.mine_identity_pow(ptr0, len0, difficulty);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmPowSolution.__wrap(ret[0]);
}

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
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function sha256(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sha256(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Verify identity proof-of-work and return the hash
 *
 * Same as `verify_identity_pow` but also returns the computed hash.
 *
 * # Returns
 * The hash if valid, null otherwise
 * @param {Uint8Array} pubkey
 * @param {bigint} timestamp
 * @param {bigint} nonce
 * @param {number} difficulty
 * @returns {Uint8Array | undefined}
 */
export function verifyIdentityPowWithHash(pubkey, timestamp, nonce, difficulty) {
    const ptr0 = passArray8ToWasm0(pubkey, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.verifyIdentityPowWithHash(ptr0, len0, timestamp, nonce, difficulty);
    let v2;
    if (ret[0] !== 0) {
        v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v2;
}

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
 * @param {Uint8Array} pubkey
 * @param {bigint} timestamp
 * @param {bigint} nonce
 * @param {number} difficulty
 * @returns {boolean}
 */
export function verify_identity_pow(pubkey, timestamp, nonce, difficulty) {
    const ptr0 = passArray8ToWasm0(pubkey, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.verify_identity_pow(ptr0, len0, timestamp, nonce, difficulty);
    return ret !== 0;
}

/**
 * Verify that a hash meets the required PoW difficulty
 *
 * Returns true if the hash has at least `difficulty` leading zero bits.
 * @param {Uint8Array} hash
 * @param {number} difficulty
 * @returns {boolean}
 */
export function verify_pow_difficulty(hash, difficulty) {
    const ptr0 = passArray8ToWasm0(hash, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.verify_pow_difficulty(ptr0, len0, difficulty);
    return ret !== 0;
}

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
 * @param {Uint8Array} pubkey
 * @param {Uint8Array} message
 * @param {Uint8Array} signature
 * @returns {boolean}
 */
export function verify_signature(pubkey, message, signature) {
    const ptr0 = passArray8ToWasm0(pubkey, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(message, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(signature, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.verify_signature(ptr0, len0, ptr1, len1, ptr2, len2);
    return ret !== 0;
}

/**
 * Get the library version
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_is_function_8d400b8b1af978cd = function(arg0) {
        const ret = typeof(arg0) === 'function';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_object_ce774f3490692386 = function(arg0) {
        const val = arg0;
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_string_704ef9c8fc131030 = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_undefined_f6b95eab589e0269 = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_call_3020136f7a2d6e44 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_abb4ff46ce38be40 = function() { return handleError(function (arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_crypto_574e78ad8b13b65f = function(arg0) {
        const ret = arg0.crypto;
        return ret;
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_getRandomValues_b8f5dbd5f3995a9e = function() { return handleError(function (arg0, arg1) {
        arg0.getRandomValues(arg1);
    }, arguments) };
    imports.wbg.__wbg_length_22ac23eaec9d8053 = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_msCrypto_a61aeb35a24c1329 = function(arg0) {
        const ret = arg0.msCrypto;
        return ret;
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return ret;
    };
    imports.wbg.__wbg_new_no_args_cb138f77cf6151ee = function(arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_new_with_length_aa5eaf41d35235e5 = function(arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_node_905d3e251edff8a2 = function(arg0) {
        const ret = arg0.node;
        return ret;
    };
    imports.wbg.__wbg_now_69d776cd24f5215b = function() {
        const ret = Date.now();
        return ret;
    };
    imports.wbg.__wbg_process_dc0fbacc7c1c06f7 = function(arg0) {
        const ret = arg0.process;
        return ret;
    };
    imports.wbg.__wbg_prototypesetcall_dfe9b766cdc1f1fd = function(arg0, arg1, arg2) {
        Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
    };
    imports.wbg.__wbg_randomFillSync_ac0988aba3254290 = function() { return handleError(function (arg0, arg1) {
        arg0.randomFillSync(arg1);
    }, arguments) };
    imports.wbg.__wbg_require_60cc747a6bc5215a = function() { return handleError(function () {
        const ret = module.require;
        return ret;
    }, arguments) };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_769e6b65d6557335 = function() {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_60cf02db4de8e1c1 = function() {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_08f5a74c69739274 = function() {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_a8924b26aa92d024 = function() {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_subarray_845f2f5bce7d061a = function(arg0, arg1, arg2) {
        const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_versions_c01dfd4722a88165 = function(arg0) {
        const ret = arg0.versions;
        return ret;
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_4625c577ab2ec9ee = function(arg0) {
        // Cast intrinsic for `U64 -> Externref`.
        const ret = BigInt.asUintN(64, arg0);
        return ret;
    };
    imports.wbg.__wbindgen_cast_cb9088102bce6b30 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
        const ret = getArrayU8FromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('chainsocial_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
