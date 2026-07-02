/**
 * NativeArgon2Module - Android Native Module for Argon2id PoW
 * Per SPEC_03: 64 MiB memory, 3 iterations, parallelism 2
 *
 * Uses argon2kt library for real Argon2id computation.
 * Replaces the previous SHA-256 placeholder.
 */

package com.swimchainmobile.argon2

import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.lambdapioneer.argon2kt.Argon2Kt
import com.lambdapioneer.argon2kt.Argon2Mode
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class NativeArgon2Module(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()
    private val isCancelled = AtomicBoolean(false)
    private val argon2Kt = Argon2Kt()

    override fun getName(): String = "NativeArgon2"

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

                val hash = computeArgon2id(
                    input = input,
                    salt = salt,
                    memoryKib = memoryKib,
                    iterations = iterations,
                    parallelism = parallelism,
                    hashLength = hashLength
                )

                val resultBase64 = Base64.encodeToString(hash, Base64.NO_WRAP)
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

                    val hash = computeArgon2id(
                        input = input,
                        salt = salt,
                        memoryKib = memoryKib,
                        iterations = iterations,
                        parallelism = parallelism,
                        hashLength = hashLength
                    )

                    attempts++

                    if (meetsTarget(hash, target)) {
                        val elapsedMs = System.currentTimeMillis() - startTime

                        val result = Arguments.createMap().apply {
                            putString("nonce", nonce.toString())
                            putString("hash", hash.joinToString("") { "%02x".format(it) })
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
     * Compute real Argon2id hash using the argon2kt library.
     * Per SPEC_03: Argon2id with 64 MiB, 3 iterations, parallelism 2.
     */
    private fun computeArgon2id(
        input: ByteArray,
        salt: ByteArray,
        memoryKib: Int,
        iterations: Int,
        parallelism: Int,
        hashLength: Int
    ): ByteArray {
        val hash = argon2Kt.hash(
            mode = Argon2Mode.Argon2id,
            password = input,
            salt = salt,
            memoryCostInKib = memoryKib,
            iterationCost = iterations,
            parallelism = parallelism,
            hashLength = hashLength
        )
        return hash.rawHash
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
