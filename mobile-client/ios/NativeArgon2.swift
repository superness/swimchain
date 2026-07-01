/**
 * NativeArgon2 - iOS Native Module for Argon2id PoW
 * Per SPEC_03: 64 MiB memory, 3 iterations, parallelism 2
 */

import Foundation
import React

@objc(NativeArgon2)
class NativeArgon2: RCTEventEmitter {

  // MARK: - Properties

  private var isCancelled: Bool = false
  private let miningQueue = DispatchQueue(label: "com.swimchain.argon2.mining", qos: .userInitiated)
  private var hasListeners = false

  // MARK: - RCTEventEmitter

  override static func moduleName() -> String! {
    return "NativeArgon2"
  }

  override func supportedEvents() -> [String]! {
    return ["miningProgress"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  // MARK: - Public Methods

  @objc
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    // Check if Argon2 library is available
    resolve(true)
  }

  @objc
  func hash(_ inputBase64: String,
            saltBase64: String,
            memoryKib: Int,
            iterations: Int,
            parallelism: Int,
            hashLength: Int,
            resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {

    miningQueue.async {
      do {
        guard let input = Data(base64Encoded: inputBase64),
              let salt = Data(base64Encoded: saltBase64) else {
          reject("INVALID_INPUT", "Invalid base64 input", nil)
          return
        }

        // Call Argon2id implementation
        let hash = try self.computeArgon2id(
          input: input,
          salt: salt,
          memoryKib: memoryKib,
          iterations: iterations,
          parallelism: parallelism,
          hashLength: hashLength
        )

        resolve(hash.base64EncodedString())
      } catch {
        reject("HASH_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func mine(_ challengeBase64: String,
            difficulty: Int,
            memoryKib: Int,
            iterations: Int,
            parallelism: Int,
            hashLength: Int,
            startNonce: String,
            resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {

    isCancelled = false
    let startTime = Date()

    miningQueue.async {
      do {
        guard let challenge = Data(base64Encoded: challengeBase64) else {
          reject("INVALID_CHALLENGE", "Invalid base64 challenge", nil)
          return
        }

        var nonce = UInt64(startNonce) ?? 0
        var attempts: UInt64 = 0
        let target = self.calculateTarget(difficulty: difficulty)
        var lastProgressTime = Date()

        while !self.isCancelled {
          // Compute hash for current nonce
          let input = challenge + self.nonceToData(nonce)
          let salt = Data(repeating: 0, count: 16) // Fixed salt for PoW

          let hash = try self.computeArgon2id(
            input: input,
            salt: salt,
            memoryKib: memoryKib,
            iterations: iterations,
            parallelism: parallelism,
            hashLength: hashLength
          )

          attempts += 1

          // Check if hash meets difficulty target
          if self.meetsTarget(hash: hash, target: target) {
            let elapsedMs = Int(Date().timeIntervalSince(startTime) * 1000)

            let result: [String: Any] = [
              "nonce": String(nonce),
              "hash": hash.map { String(format: "%02x", $0) }.joined(),
              "attempts": attempts,
              "elapsedMs": elapsedMs
            ]

            resolve(result)
            return
          }

          // Send progress update every 100ms
          let now = Date()
          if now.timeIntervalSince(lastProgressTime) >= 0.1 && self.hasListeners {
            let elapsedMs = Int(now.timeIntervalSince(startTime) * 1000)
            let hashesPerSecond = Double(attempts) / (Double(elapsedMs) / 1000.0)
            let expectedAttempts = Double(1 << difficulty)
            let remainingAttempts = max(0, expectedAttempts - Double(attempts))
            let estimatedRemainingMs = hashesPerSecond > 0
              ? Int(remainingAttempts / hashesPerSecond * 1000)
              : 0

            let progress: [String: Any] = [
              "currentNonce": String(nonce),
              "hashesPerSecond": hashesPerSecond,
              "elapsedMs": elapsedMs,
              "estimatedRemainingMs": estimatedRemainingMs
            ]

            self.sendEvent(withName: "miningProgress", body: progress)
            lastProgressTime = now
          }

          nonce += 1
        }

        reject("CANCELLED", "Mining was cancelled", nil)

      } catch {
        reject("MINING_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func cancel() {
    isCancelled = true
  }

  // MARK: - Private Helpers

  private func computeArgon2id(input: Data, salt: Data,
                                memoryKib: Int, iterations: Int,
                                parallelism: Int, hashLength: Int) throws -> Data {
    // Use Argon2Swift library for actual implementation
    // This is a placeholder that uses a simplified hash for development
    // In production, integrate with Argon2Swift pod

    #if DEBUG
    // Development placeholder using SHA256
    // TODO: Replace with actual Argon2id implementation
    var hasher = Data()
    hasher.append(input)
    hasher.append(salt)
    hasher.append(withUnsafeBytes(of: memoryKib.littleEndian) { Data($0) })
    hasher.append(withUnsafeBytes(of: iterations.littleEndian) { Data($0) })

    // Use CommonCrypto SHA256 as placeholder
    var hash = [UInt8](repeating: 0, count: hashLength)
    hasher.withUnsafeBytes { ptr in
      CC_SHA256(ptr.baseAddress, CC_LONG(hasher.count), &hash)
    }
    return Data(hash)
    #else
    // Production: Use Argon2Swift
    // let argon2 = Argon2Swift()
    // return try argon2.hash(
    //   password: input,
    //   salt: salt,
    //   iterations: iterations,
    //   memory: memoryKib,
    //   parallelism: parallelism,
    //   length: hashLength,
    //   type: .id
    // )
    fatalError("Production Argon2id not yet integrated")
    #endif
  }

  private func calculateTarget(difficulty: Int) -> Data {
    // Target = max_hash / 2^difficulty
    // For difficulty d, hash must have d leading zero bits
    var target = Data(repeating: 0xFF, count: 32)
    let fullBytes = difficulty / 8
    let remainingBits = difficulty % 8

    for i in 0..<fullBytes {
      target[i] = 0x00
    }

    if remainingBits > 0 && fullBytes < 32 {
      target[fullBytes] = 0xFF >> remainingBits
    }

    return target
  }

  private func meetsTarget(hash: Data, target: Data) -> Bool {
    // Compare hash to target (hash must be less than target)
    for i in 0..<min(hash.count, target.count) {
      if hash[i] < target[i] {
        return true
      }
      if hash[i] > target[i] {
        return false
      }
    }
    return true
  }

  private func nonceToData(_ nonce: UInt64) -> Data {
    var n = nonce.littleEndian
    return Data(bytes: &n, count: 8)
  }
}

// Import CommonCrypto for SHA256 placeholder
import CommonCrypto
