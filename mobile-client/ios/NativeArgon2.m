/**
 * NativeArgon2 - Objective-C Bridge for React Native
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(NativeArgon2, RCTEventEmitter)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deriveKey:(NSString *)password
                  salt:(NSString *)salt
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(hash:(NSString *)inputBase64
                  saltBase64:(NSString *)saltBase64
                  memoryKib:(int)memoryKib
                  iterations:(int)iterations
                  parallelism:(int)parallelism
                  hashLength:(int)hashLength
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(mine:(NSString *)challengeBase64
                  difficulty:(int)difficulty
                  memoryKib:(int)memoryKib
                  iterations:(int)iterations
                  parallelism:(int)parallelism
                  hashLength:(int)hashLength
                  startNonce:(NSString *)startNonce
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancel)

@end
