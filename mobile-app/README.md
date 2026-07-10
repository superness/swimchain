# mobile-app

Tauri v2 Android (and desktop-dev) shell that runs a swimchain node
in-process on testnet and embeds `feed-client` in a WebView, wiring it up
with the node's RPC endpoint, auth, and identity address via a
`SWIMCHAIN_RPC_CONFIG` postMessage (the same contract `desktop-app`'s
`ClientFrame` uses). A Kotlin foreground service (`NodeForegroundService`)
keeps the process — and the node running inside it — alive when the app is
backgrounded on Android; on desktop dev there is no equivalent, the node
just runs for as long as the window is open.

## Desktop dev

```bash
cd mobile-app
npm install
npm run tauri dev
```

This opens a native window hosting the shell + node on the default testnet
ports (P2P `19735`, RPC `19736`).

**Port collision warning:** the node autostarts on testnet's *default*
ports. If you already have a local testnet node running — the CLI
(`cargo run -- --testnet node start`), `desktop-app`, or another instance of
this app — `npm run tauri dev` will fail to bind and the shell will sit on
"starting node…" forever. Stop the other node first, or don't run more than
one testnet node on the same machine at a time.

## Android build

Standard route (works out of the box on a machine with **Windows Developer
Mode enabled**, or on macOS/Linux):

```bash
npm run tauri android init   # first time only
npm run tauri android build -- --debug --target x86_64
```

### Windows without Developer Mode

The Tauri CLI's Android build needs to symlink the compiled `.so` into
`gen/android/app/src/main/jniLibs/`, which requires `SeCreateSymbolicLinkPrivilege`
— granted by Developer Mode, which itself needs an elevated HKLM registry
write. If that's not available (e.g. on a locked-down machine), use this
manual recipe instead (documented in detail in
`.superpowers/sdd/mobile-task-6-report.md`):

```powershell
# Use the Android Studio JBR, not whatever `java` resolves to by default -
# a newer JDK on PATH breaks gradle/buildSrc.
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

cd mobile-app

# This still cross-compiles the Rust lib successfully (Tauri's mobile CLI
# shells out through cargo-ndk with the right NDK toolchain/linker env - the
# part that doesn't need Developer Mode). It dies at the very last pre-gradle
# step, symlinking the built .so into gen/android/app/src/main/jniLibs/, which
# needs SeCreateSymbolicLinkPrivilege:
#   Error failed to build Android app: Failed to create a symbolic link ...
#   For Windows 10 or newer: You should use developer mode.
npm run tauri android build -- --debug --target x86_64

# Finish the two steps the CLI didn't reach manually. A plain copy of the .so
# is byte-identical to what gradle would package from a symlink.
Copy-Item src-tauri\target\x86_64-linux-android\debug\libswimchain_mobile_lib.so `
  src-tauri\gen\android\app\src\main\jniLibs\x86_64\ -Force
Copy-Item src-tauri\tauri.conf.json `
  src-tauri\gen\android\app\src\main\assets\tauri.conf.json -Force

# Build the APK directly with gradle, skipping the rust-build task (already
# done above) so it doesn't retry the symlink step.
cd src-tauri\gen\android
.\gradlew.bat assembleX86_64Debug -x rustBuildX86_64Debug
```

The resulting APK lands at
`mobile-app/src-tauri/gen/android/app/build/outputs/apk/x86_64/debug/app-x86_64-debug.apk`.
Install with `adb install -r <path>`.

### `tauri android dev` cleartext caveat

`npm run tauri android dev` may fail with a cleartext-traffic error even
though the app talks only to `127.0.0.1`. The app's
`network_security_config.xml` scopes cleartext to loopback only (not a blanket
`usesCleartextTraffic="true"`), and the `tauri android dev` dev-server flow
tries to reach the dev machine's LAN IP, which isn't loopback and so gets
blocked by that same config. This doesn't affect `tauri android build`/an
installed APK, since those talk to the truly-local in-process node. If you
need live-reload `android dev`, enabling Windows Developer Mode and using the
normal `tauri android build` path first is the more reliable route.
