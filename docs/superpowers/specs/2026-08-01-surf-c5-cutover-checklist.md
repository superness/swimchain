# Surf C5 — cutover checklist (release-gated runbook)

**Status:** staged, NOT executed. Every step below needs the operator's real
release keystore (C4) and a hands-on release build; none of it has run yet.
This doc is the ordered runbook for finishing the cutover once that keystore
exists. See `surf-app/README.md`, "Release signing (C4)" for the full signing
recipe this checklist calls into (`keytool` command, `keystore.properties`
resolution order, CI env vars).

**What "the cutover" means:** today `website/download-android.html` and the
Android card on `website/download.html` both ship `mobile-app`
(`com.swimchain.mobile`) as *the* Android download, and both pages are
consistently "Swimchain"-branded end to end. The cutover repoints both pages
at a signed **Surf** (`com.swimchain.surf`) release APK and rewrites their
copy to Surf's channel/deck framing, atomically — link, meta, hero prose,
walkthrough body text, and screenshots all flip together. C5 (task 3) drafted
Surf's hero copy, then deliberately kept it **out** of the live file (round-1
review: a Surf-branded hero above a mobile-app download button + a
"Launch Swimchain" walkthrough was a self-contradictory, half-migrated page —
a landmine if `website/` deploys before the real cutover). That drafted copy
lives below under step (g)'s "Paste-ready Surf copy," ready to paste in
during the same edit that fills the link/meta. Today the only trace of C5 in
`download-android.html` is the `<!-- C5 TODO -->` HTML comment immediately
above the download `<a>` — everything else in that file reads exactly as it
did before C5. Do not skip steps or reorder (g) ahead of (f) — that would 404
real users. Do not paste the Surf copy in ahead of (f)/(g) either — that
would recreate the half-migrated state this runbook exists to avoid.

## Steps

### (a) Operator generates + vaults the release keystore

One-time, ever — the same key must sign every future Surf update or Android
refuses the update.

```bash
keytool -genkeypair -v -keystore surf-release.jks -alias surf \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12
```

Store the resulting `.jks` and its passwords in the vault. There is no
recovery if either is lost. (`surf-app/README.md`, "Release signing (C4)".)

### (b) Drop `keystore.properties`

Copy `surf-app/src-tauri/gen/android/keystore.properties.example` to
`surf-app/src-tauri/gen/android/app/keystore.properties` (gitignored, next to
`app/build.gradle.kts` — confirm with `git check-ignore -v` if unsure) and
fill in the 4 keys (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`)
with the real keystore's path and passwords. CI builds may instead set
`SURF_KEYSTORE_FILE` / `SURF_KEYSTORE_PASSWORD` / `SURF_KEY_ALIAS` /
`SURF_KEY_PASSWORD` and skip the file.

### (c) Bake the channels

```bash
cd surf-app
npm install
npm run build:channels
```

Same step every debug build already runs — bakes FEED/WIKI/REEF/CHESS/CHIPS
against the loopback RPC endpoint and fails the build if a production gateway
URL leaks into the bundle. Must run before every APK build, debug or release.

### (d) Release build

```bash
npm run tauri android build --target aarch64
```

No `--debug` flag — that's what selects the release variant. Gradle will
refuse to produce an unsigned release APK: if `keystore.properties`/env vars
are missing, the build fails fast with a `GradleException` naming the two
remediation paths, rather than silently shipping something unsigned that
looks releasable.

Confirm the version baked into the artifact matches
`surf-app/src-tauri/tauri.conf.json`'s `version` field (bumped to
`0.2.0-alpha` in C5 task 3 — the first public-alpha version; bump again here
if more work landed on `main` since).

### (e) Verify the APK is actually signed

```bash
apksigner verify --verbose --print-certs path/to/app-arm64-release.apk
```

(`apksigner` ships in the Android SDK build-tools directory,
`$ANDROID_HOME/build-tools/<version>/apksigner`.) Confirm the printed
certificate fingerprint matches the release keystore from step (a) — this is
the check that would have caught an accidentally-debug-signed "release" APK.
Do not proceed to (f) without a passing `apksigner verify`.

### (f) Create the GitHub Release and upload the APK

Tag scheme mirrors `mobile-app`'s (`mobile-v0.1.0-alpha` …
`mobile-v0.1.10-alpha`): use `surf-v0.2.0-alpha` (or whatever version actually
shipped from step (d)).

```bash
gh release create surf-v0.2.0-alpha path/to/app-arm64-release.apk \
  --title "Surf v0.2.0-alpha" \
  --notes "First public alpha of Surf — channel-surfing Android front end for Swimchain."
```

Record, from the uploaded asset: the exact download URL, the tag, the file
size in MB, and its SHA-256 (`certutil -hashfile <apk> SHA256` on Windows,
`shasum -a 256 <apk>` on macOS/Linux). These four values are what step (g)
fills in.

### (g) Fill the `download-android.html` TODO

Open `website/download-android.html` and find the `<!-- C5 TODO (gated on C4
keystore): repoint to the signed Surf release... -->` comment immediately
above the `<a class="btn primary" href="...">Download the APK</a>` line.
Using the values recorded in (f):

- Replace the `<a>`'s `href` with the real release-asset URL.
- Update the `<div class="meta">` block just below (`Version:`, `Size:`,
  `SHA-256:`) with the real values.
- Update the `release notes` link (currently
  `.../releases/tag/mobile-v0.1.10-alpha`) to the new `surf-v...` tag.
- Delete the TODO comment once every field is filled and verified against the
  actual uploaded asset (re-download and re-hash it — don't trust a copy-paste
  of what `gh release create` printed).
- **Also flip the prose at this step, atomically with the link.** C5 task 3
  drafted Surf's hero copy but then reverted it out of the live file (round-1
  review finding: a Surf-branded hero above a mobile-app download button +
  "Launch Swimchain" walkthrough was a self-contradictory, half-migrated page
  — a landmine if `website/` ever deployed before the real cutover). The
  drafted copy is preserved below in "Paste-ready Surf copy" — paste it back
  in at this step, in the same edit that fills the link/meta, so the page
  never spends any time in a half-Surf/half-Swimchain state. Today (pre-C5)
  `download-android.html` is 100% "Swimchain"; post-(g) it should be 100%
  "Surf" — never a mix.

### Paste-ready Surf copy (drafted in C5 task 3, held here until (g) lands)

**`<title>`** (line 1):
```html
<title>Install Surf on Android</title>
```

**`<meta name="description">`** (line 2):
```html
<meta name="description" content="Install Surf, Swimchain's channel-surfing app for Android — flip between FEED, WIKI, REEF, CHIPS, and CHESS like a TV, with your own node running behind it. Step-by-step sideload guide for the APK.">
```

**`.eyebrow` / `<h1>` / `.lede`** (inside `.page-hero`):
```html
<span class="eyebrow">Android · Surf</span>
<h1>Install Surf on Android</h1>
<p class="lede">
  Surf turns Swimchain into <strong>a TV you flip through</strong> — FEED, WIKI,
  REEF, CHIPS, CHESS — each channel a live client talking straight to
  <strong>your own node</strong>, running in your pocket, no server, no account.
  Because it's distributed as a sideloaded APK (not through the Play Store),
  installing takes a few extra taps. Here's the whole thing.
</p>
```

**Everything else in the file that says "Swimchain" and must ALSO flip to
"Surf" at this same step** (catalogued by `grep -n -i swimchain
website/download-android.html` against the pre-C5 file — the walkthrough body
was deliberately left untouched by C5 task 3, so all of this is still
pending):

| Location | Current text | Change to |
|---|---|---|
| Play Protect screenshot alt (`/img/android-play-protect.png`) | `alt="Google Play Protect 'App scan recommended' dialog for Swimchain"` | `...for Surf` |
| Scan-safe screenshot alt (`/img/android-scan-safe.png`) | `alt="Google Play Protect result: 'This app looks safe' for Swimchain, with an Install button"` | `...for Surf, with an Install button` |
| "Open the app & allow notifications" step body | `Launch Swimchain and tap **Allow** on the notification prompt.` | `Launch Surf and tap **Allow**...` |
| Notifications screenshot alt (`/img/android-notifications.png`) | `alt="Swimchain running (node synced, 1 peer) with the 'Allow Swimchain to send you notifications?' prompt"` | `alt="Surf running (node synced, 1 peer) with the 'Allow Surf to send you notifications?' prompt"` |
| Reassurance paragraph | `...These warnings appear for **any** app installed outside the Play Store — they're not specific to Swimchain.` | `...specific to Surf.` |

**Important — the screenshots are real OS dialogs, not just alt-text.** The
three `<img>` sources (`android-play-protect.png`, `android-scan-safe.png`,
`android-notifications.png`) are actual photos/captures of a device installing
and running **mobile-app** — the OS-level Play Protect and notification
dialogs literally render the app's display name ("Swimchain") on-screen, not
just this page's alt-text. Swapping the alt-text alone would make the alt-text
lie about what the screenshot shows. These three screenshots must be **retaken
against a real Surf release build** (same install walkthrough, same device,
same steps, but with Surf installed) before or as part of this step — treat
stale screenshots the same as a stale download link: don't ship them.

The `<a class="mark" href="/">swimchain<span class="tld">.io</span></a>` site
mark, the footer's `swimchain.io — content that earns its place`, and the
GitHub org link (`github.com/superness/swimchain`) are the **site's** brand,
not the app's — these do not change; only app-identity copy does.

### (h) Flip `download.html`'s Android card

`website/download.html:162-174` — the Android card currently reads:

```html
<span class="stat">Android 8.0+ &middot; full node</span>
<h2>Android <span class="tag">Alpha</span></h2>
<p>Run a full Swimchain node in your pocket &mdash; not a light client.</p>
<ul>
  <li>Full node, in-process</li>
  <li>Private spaces &amp; E2E encryption</li>
  <li>Touch-optimized</li>
</ul>
```

Update the `<span class="stat">` and `<p>` copy to Surf's channel/deck
framing (mirroring the rewritten `download-android.html` hero — e.g. "Android
8.0+ · channel surfing" / "Flip through FEED, WIKI, REEF, CHIPS, CHESS like a
TV — your own node running behind it."). The `<a href="/download/android">`
link itself does not need to change (same URL, now serving the cut-over
page). Do this only after (g) — don't advertise Surf from the fleet page
while `/download/android` still serves mobile's artifact.

### (i) FLAG — Surf's icon is still mobile-app's placeholder

`surf-app/src-tauri/tauri.conf.json`'s `bundle.icon` points at
`icons/icon.png`, which is mobile-app's icon reused as a placeholder (per C
recon). A public release should not ship with another app's icon — commission
or generate a Surf-specific icon set (all the Android density buckets under
`gen/android/app/src/main/res/mipmap-*/`, regenerable via `tauri icon` from a
source image) before or shortly after this cutover. Not a hard blocker for an
alpha release, but flag it loudly in the release notes / to the operator; do
not let it go unnoticed past the first cutover.

### (j) Side-by-side install caveat — force-stop/uninstall mobile-app

`com.swimchain.surf` and `com.swimchain.mobile` are different package IDs, so
Android will happily install both side-by-side — but they are two independent
processes each trying to run an in-process mainnet node on the **same fixed
ports** (P2P `9735`, RPC `9736`; confirmed in both `mobile-app/src-tauri/src/
node_host.rs` and `surf-app/README.md`, "Fixed default mainnet ports (9735/
9736), no port scan" — D2). Whichever app starts its node second will fail to
bind and either error or silently run without a node, depending on how each
app's `node_host` handles the bind failure. Anyone testing the cutover on a
device that already has `mobile-app` installed must **force-stop or uninstall
mobile-app first** (`Settings → Apps → Swimchain → Force stop`, or uninstall
outright) before launching Surf, and should not run both at once. Call this
out explicitly in the release notes / getting-started copy for anyone
upgrading from the old sideloaded mobile-app APK.

### (k) Optional — deprecation note on mobile-app

Once Surf's release is live and confirmed working, consider adding a small
"this app is being replaced by Surf" banner or note to `mobile-app`'s own
`README.md` / in-app UI, and/or a note on its last GitHub Release, pointing
existing sideload users at the new download page. Not required for the
cutover itself (mobile-app keeps working exactly as it does today; nothing
here removes or breaks it) — purely a courtesy to reduce confusion for anyone
who finds the old release page. Explicitly optional per the C5 brief; do not
block the cutover on writing this.

## Non-goals

This checklist does not cover: the APK size gate, sourcemap stripping, or
Play Store distribution (all still open per `surf-app/README.md`'s "Accepted
debt" table, tracked outside C5); a macOS/Linux Surf build; or any node-side
protocol change (Surf and mobile-app both run the same unmodified mainnet
node — this is purely a client/distribution cutover).
