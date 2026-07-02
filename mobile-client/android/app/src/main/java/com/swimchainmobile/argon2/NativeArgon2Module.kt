/**
 * NativeArgon2Module - Android Native Module for Argon2id hashing, PoW, and password hashing
 *
 * Per SPEC_03 (docs/STATE_OF_SWIMCHAIN.md 2026-07-01 parity audit):
 *   - Salt length: 16 bytes
 *   - Memory cost: 64 MiB (65536 KiB)
 *   - Iterations:  3
 *   - Parallelism: 2
 *   - Hash length: 32 bytes
 *
 * Uses argon2kt library for real Argon2id computation.
 * Replaces previous SHA-256 placeholder with real Argon2id via argon2kt.
 *
 * Platform-conditional: Android/JVM builds only; iOS has equivalent via Argon2Swift.
 */

package com.swimchainmobile.argon2

import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.lambdapioneer.argon2kt.Argon2Kt
import com.lambdapioneer.argon2kt.Argon2Mode
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class NativeArgon2Module(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()
    private val isCancelled = AtomicBoolean(false)
    private val argon2Kt = Argon2Kt()

    companion object {
        // SPEC_03 parameters from STATE_OF_SWIMCHAIN.md (2026-07-01 parity audit)
        const val DEFAULT_SALT_LENGTH = 16
        const val DEFAULT_MEMORY_KIB = 64 * 1024  // 64 MiB
        const val DEFAULT_ITERATIONS = 3
        const val DEFAULT_PARALLELISM = 2
        const val DEFAULT_HASH_LENGTH = 32
    }

    override fun getName(): String = "NativeArgon2"

    // ──────────────────────────────────────────────
    // Password Hashing API (hash + verify)
    // ──────────────────────────────────────────────

    /**
     * Hash a plaintext password with Argon2id using SPEC_03 parameters.
     * Generates a random 16-byte salt per call.
     *
     * Returns a standard Argon2 encoded hash string:
     *   $argon2id$v=19$m=65536,t=3,p=2$<base64-salt>$<base64-hash>
     *
     * This uses the argon2kt JVM library (Android/JVM platform path).
     * iOS counterpart uses Argon2Swift.
     */
    @ReactMethod
    fun hashPassword(password: String, promise: Promise) {
        executor.execute {
            try {
                val passwordBytes = password.toByteArray(Charsets.UTF_8)
                val salt = ByteArray(DEFAULT_SALT_LENGTH)
                SecureRandom().nextBytes(salt)

                val hash = argon2Kt.hash(
                    mode = Argon2Mode.Argon2id,
                    password = passwordBytes,
                    salt = salt,
                    memoryCostInKib = DEFAULT_MEMORY_KIB,
                    iterationCost = DEFAULT_ITERATIONS,
                    parallelism = DEFAULT_PARALLELISM,
                    hashLengthInBytes = DEFAULT_HASH_LENGTH
                )

                val encoded = buildEncodedString(salt, hash.rawHash)
                promise.resolve(encoded)
            } catch (e: Exception) {
                promise.reject("HASH_ERROR", e.message, e)
            }
        }
    }

    /**
     * Verify a password against an Argon2 encoded hash string.
     * Parses the salt and parameters from the encoded string, re-derives
     * the hash, and compares in constant time.
     *
     * Returns boolean via promise.
     */
    @ReactMethod
    fun verifyPassword(password: String, encodedHash: String, promise: Promise) {
        executor.execute {
            try {
                val result = verifyArgon2Hash(password, encodedHash)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }
    }

    // ──────────────────────────────────────────────
    // PoW Mining API
    // ──────────────────────────────────────────────

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun hash(
        inputBase64: String,
        saltBase64: String,
        memoryKib: Int,
        iterations: Int,
        parallelism: Int,
        hashLength: Int,
        promise: Promise
    ) {
        executor.execute {
            try {
                val input = Base64.decode(inputBase64, Base64.DEFAULT)
                val salt = Base64.decode(saltBase64, Base64.DEFAULT)

                val hash = argon2Kt.hash(
                    mode = Argon2Mode.Argon2id,
                    password = input,
                    salt = salt,
                    memoryCostInKib = memoryKib,
                    iterationCost = iterations,
                    parallelism = parallelism,
                    hashLengthInBytes = hashLength
                )

                val resultBase64 = Base64.encodeToString(hash.rawHash, Base64.NO_WRAP)
                promise.resolve(resultBase64)
            } catch (e: Exception) {
                promise.reject("HASH_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun mine(
        challengeBase64: String,
        difficulty: Int,
        memoryKib: Int,
        iterations: Int,
        parallelism: Int,
        hashLength: Int,
        startNonce: String,
        promise: Promise
    ) {
        isCancelled.set(false)
        val startTime = System.currentTimeMillis()

        executor.execute {
            try {
                val challenge = Base64.decode(challengeBase64, Base64.DEFAULT)
                var nonce = startNonce.toLongOrNull() ?: 0L
                var attempts = 0L
                val target = calculateTarget(difficulty)
                var lastProgressTime = System.currentTimeMillis()

                while (!isCancelled.get()) {
                    // Build input: challenge + nonce (8 bytes LE)
                    val input = challenge + nonceToBytes(nonce)
                    // Fixed salt for PoW
                    val salt = ByteArray(16)

                    val hash = argon2Kt.hash(
                        mode = Argon2Mode.Argon2id,
                        password = input,
                        salt = salt,
                        memoryCostInKib = memoryKib,
                        iterationCost = iterations,
                        parallelism = parallelism,
                        hashLengthInBytes = hashLength
                    )

                    attempts++

                    if (meetsTarget(hash.rawHash, target)) {
                        val elapsedMs = System.currentTimeMillis() - startTime

                        val result = Arguments.createMap().apply {
                            putString("nonce", nonce.toString())
                            putString("hash", hash.rawHash.joinToString("") { "%02x".format(it) })
                            putDouble("attempts", attempts.toDouble())
                            putDouble("elapsedMs", elapsedMs.toDouble())
                        }

                        promise.resolve(result)
                        return@execute
                    }

                    val now = System.currentTimeMillis()
                    if (now - lastProgressTime >= 100) {
                        val elapsedMs = now - startTime
                        val hashesPerSecond = if (elapsedMs > 0) {
                            attempts.toDouble() / (elapsedMs / 1000.0)
                        } else 0.0
                        val expectedAttempts = (1L shl difficulty).toDouble()
                        val remainingAttempts = maxOf(0.0, expectedAttempts - attempts)
                        val estimatedRemainingMs = if (hashesPerSecond > 0) {
                            (remainingAttempts / hashesPerSecond * 1000).toLong()
                        } else 0L

                        sendProgressEvent(
                            nonce = nonce,
                            hashesPerSecond = hashesPerSecond,
                            elapsedMs = elapsedMs,
                            estimatedRemainingMs = estimatedRemainingMs
                        )
                        lastProgressTime = now
                    }

                    nonce++
                }

                promise.reject("CANCELLED", "Mining was cancelled", null)

            } catch (e: Exception) {
                promise.reject("MINING_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun cancel() {
        isCancelled.set(true)
    }

    // Required for NativeEventEmitter
    @ReactMethod
    fun addListener(eventName: String) {
    }

    @ReactMethod
    fun removeListeners(count: Int) {
    }

    // ──────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────

    private fun sendProgressEvent(
        nonce: Long,
        hashesPerSecond: Double,
        elapsedMs: Long,
        estimatedRemainingMs: Long
    ) {
        val params = Arguments.createMap().apply {
            putString("currentNonce", nonce.toString())
            putDouble("hashesPerSecond", hashesPerSecond)
            putDouble("elapsedMs", elapsedMs.toDouble())
            putDouble("estimatedRemainingMs", estimatedRemainingMs.toDouble())
        }

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("miningProgress", params)
    }

    /**
     * Build the standard Argon2 encoded string:
     * $argon2id$v=19$m=<memory>,t=<iters>,p=<parallelism>$<base64-salt>$<base64-hash>
     */
    private fun buildEncodedString(salt: ByteArray, hash: ByteArray): String {
        val saltB64 = Base64.encodeToString(salt, Base64.NO_WRAP or Base64.NO_PADDING)
        val hashB64 = Base64.encodeToString(hash, Base64.NO_WRAP or Base64.NO_PADDING)
        return "\$argon2id\$v=19\$m=${DEFAULT_MEMORY_KIB},t=${DEFAULT_ITERATIONS},p=${DEFAULT_PARALLELISM}\$${saltB64}\$${hashB64}"
    }

    /**
     * Parse an Argon2 encoded hash string and verify a password against it.
     * Format: $argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>
     */
    private fun verifyArgon2Hash(password: String, encodedHash: String): Boolean {
        // Parse the encoded string
        val parts = encodedHash.split("$")
        // parts[0] = "" (leading $), parts[1] = "argon2id", parts[2] = "v=19",
        // parts[3] = "m=65536,t=3,p=2", parts[4] = salt (base64), parts[5] = hash (base64)
        if (parts.size < 6) return false
        if (parts[1] != "argon2id") return false

        // Parse parameters
        val params = parts[3].split(",")
        var memoryKib = DEFAULT_MEMORY_KIB
        var iterations = DEFAULT_ITERATIONS
        var parallelism = DEFAULT_PARALLELISM
        for (param in params) {
            when {
                param.startsWith("m=") -> memoryKib = param.substring(2).toIntOrNull() ?: DEFAULT_MEMORY_KIB
                param.startsWith("t=") -> iterations = param.substring(2).toIntOrNull() ?: DEFAULT_ITERATIONS
                param.startsWith("p=") -> parallelism = param.substring(2).toIntOrNull() ?: DEFAULT_PARALLELISM
            }
        }

        val salt = Base64.decode(parts[4], Base64.NO_WRAP or Base64.NO_PADDING)
        val expectedHash = Base64.decode(parts[5], Base64.NO_WRAP or Base64.NO_PADDING)

        val passwordBytes = password.toByteArray(Charsets.UTF_8)

        val actualHash = argon2Kt.hash(
            mode = Argon2Mode.Argon2id,
            password = passwordBytes,
            salt = salt,
            memoryCostInKib = memoryKib,
            iterationCost = iterations,
            parallelism = parallelism,
            hashLengthInBytes = expectedHash.size
        )

        // Constant-time comparison
        return constantTimeEquals(actualHash.rawHash, expectedHash)
    }

    private fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean {
        if (a.size != b.size) return false
        var diff = 0
        for (i in a.indices) {
            diff = diff or (a[i].toInt() xor b[i].toInt())
        }
        return diff == 0
    }

    private fun calculateTarget(difficulty: Int): ByteArray {
        val target = ByteArray(32) { 0xFF.toByte() }
        val fullBytes = difficulty / 8
        val remainingBits = difficulty % 8
        for (i in 0 until fullBytes) {
            target[i] = 0x00
        }
        if (remainingBits > 0 && fullBytes < 32) {
            target[fullBytes] = (0xFF shr remainingBits).toByte()
        }
        return target
    }

    private fun meetsTarget(hash: ByteArray, target: ByteArray): Boolean {
        for (i in 0 until minOf(hash.size, target.size)) {
            val h = hash[i].toInt() and 0xFF
            val t = target[i].toInt() and 0xFF
            if (h < t) return true
            if (h > t) return false
        }
        return true
    }

    private fun nonceToBytes(nonce: Long): ByteArray {
        return ByteArray(8) { i -> ((nonce shr (i * 8)) and 0xFF).toByte() }
    }
}
