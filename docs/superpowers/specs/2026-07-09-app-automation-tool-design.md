# swim-auto — Swimchain App Automation Tool

**Date:** 2026-07-09
**Status:** Approved for implementation

## Purpose

A single tool a Claude session can drive to validate swimchain frontend functionality end-to-end: run the testnet node, serve the bundled clients, **see the UI via screenshots**, manipulate it (click/type/navigate), and read console logs / JS errors. Replaces the fragmented `browser-control.js` (external claudeplus-proxy dependency), one-off Puppeteer screenshot scripts, and per-round Playwright scripts with one self-contained interface.

**Primary consumer:** a Claude Code session issuing successive CLI commands. Screenshots and manual UI manipulation are the critical capabilities — the tool must let the agent *see* the app and act on what it sees.

## Architecture

Daemon + thin CLI. A background daemon owns all stateful pieces; a thin CLI sends it commands over localhost HTTP. The browser survives across CLI invocations, and console output is captured continuously so nothing emitted between commands is lost.

**Location:** `tools/app-automation/` — plain-JS Node package (no build step), Playwright as the only runtime dependency.

### Components

**1. Daemon (`daemon.js`)** — one detached background process owning:

- **Playwright Chromium** — headless by default, `--headed` supported for watching live.
- **Static client server** (default port **8899**) — serves `desktop-app/dist/clients/` so `http://localhost:8899/forum-client/` loads the bundled forum client. Per-client SPA fallback: unknown paths under `/{name}-client/` rewrite to that client's `index.html`. Loaded standalone (not in the Tauri iframe), clients fall back to their local testnet RPC config (`useRpc.tsx` priority chain), so they connect to the node with no config injection.
- **Continuous capture** on the active page, into a capped ring buffer (~2000 entries, each `{ts, kind, type, text, location}`):
  - `page.on('console')` — all console messages
  - `page.on('pageerror')` — uncaught JS exceptions
  - `page.on('requestfailed')` — failed network requests
  Buffer persists across navigations and client switches; re-attached to any new page.
- **Control API** (default port **8897**, localhost only) — JSON over HTTP: `{ok, result}` or `{ok: false, error}`.

**2. CLI (`cli.js`, bin name `swim-auto`)** — thin parser/dispatcher:

- Auto-spawns the daemon (detached, PID at `.daemon-pids/swim-auto.pid`) on first browser command if the control port doesn't answer; clears stale pidfiles.
- **Node lifecycle delegates to existing `scripts/daemon-control.js`** (testnet genesis config, P2P 19735 / RPC 19736) — no reimplementation.
- **Client registry:** `forum, chat, feed, search, wiki` → `/{name}-client/`. Matches `desktop-app/scripts/build-clients.js` CLIENTS list.

## Command Surface

```
swim-auto node start|stop|status      # delegates to scripts/daemon-control.js (testnet genesis)
swim-auto clients build               # shells out to desktop-app/scripts/build-clients.js
swim-auto open <client> [path]        # launch/reuse browser, navigate to client (optionally a route)
swim-auto goto <path|url>             # navigate within current client, or absolute URL
swim-auto click <selector> [--shot]   # Playwright selector (css, text=, role=...)
swim-auto type <selector> <text> [--shot]
swim-auto press <key> [--shot]        # e.g. Enter, Escape
swim-auto wait <selector> [--timeout ms]
swim-auto eval <js>                   # evaluate in page, print JSON result
swim-auto screenshot [selector] [--out file] [--full]
swim-auto ui [selector]               # accessibility snapshot: visible interactive elements
swim-auto logs [--errors] [--tail N] [--clear]
swim-auto status                      # node health + static server + browser session + current URL
swim-auto stop [--all]                # stop browser+daemon; --all also stops the node
```

### Seeing the UI (critical requirements)

- **`screenshot`** writes a PNG and prints its **absolute path** as the last output line, so the calling Claude session can immediately `Read` the image. Default output `tools/app-automation/shots/<client>-<timestamp>.png`; `--out` overrides; optional `[selector]` captures just that element; `--full` captures full page height.
- **`--shot` on `click`/`type`/`press`/`open`/`goto`** auto-captures a screenshot after the action settles (auto-wait + short render delay), printing the path — act-then-look in one command.
- **`ui`** prints the page's ARIA snapshot (`locator.ariaSnapshot()`): roles, accessible names, and structure of visible elements — so the agent discovers real selectors instead of guessing, then clicks precisely.

### Console / JS introspection

- `logs` prints the buffered entries (newest last): console messages with type (log/warn/error), uncaught exceptions with stack, failed requests with URL and failure reason. `--errors` filters to pageerror + console.error + requestfailed. `--tail N` limits. `--clear` empties the buffer.
- `eval` runs arbitrary JS in the page context and prints the JSON-serialized result (for reading app state, localStorage, React roots, etc.).

## Error Handling

- Playwright auto-waiting everywhere; default action timeout 15 s (`--timeout` overrides on `wait`).
- CLI exits non-zero with the daemon's error message on any failure (element not found, timeout, no session).
- Daemon spawn probes the control port first; a live port with no matching PID is reported, not clobbered.
- `open` before `clients build` has run → clear error telling the user to run `swim-auto clients build`.

## Testing

`smoke.js` — the acceptance check, runnable as `node tools/app-automation/smoke.js`:

1. `node start` → wait for RPC health
2. `open forum` → `wait` for root render
3. `screenshot` → assert file exists and is non-trivial size
4. `logs` → assert buffer contains entries (the clients log `[RPC] ...` on boot)
5. `open chat` → `screenshot` → assert switch worked (URL + file)
6. `stop`

## Risks / Verification Points

- **Vite `base` under subpath:** built clients must tolerate being served at `/{name}-client/`. The desktop app already serves them from that exact subpath in iframes, so this should hold; verify with forum-client first during implementation.
- **Standalone RPC fallback:** confirm `LOCAL_CONFIG` in the built clients points at the testnet RPC port the genesis node uses (19736). If a client requires iframe `postMessage` config, the static server can inject a small config shim — only if proven necessary.

## Out of Scope

- Dev-server (Vite HMR) client management — the tool targets the bundled build specifically.
- Tauri webview automation — the desktop shell itself is not driven; the same client bundles are driven in Chromium.
- Scenario-file replay — interactive CLI only (can be layered on later).
- Identity seeding helpers — `eval` can write localStorage if a flow needs a pre-made identity; the Identity page UI is drivable directly.
