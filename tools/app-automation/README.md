# swim-auto

App automation for swimchain: run the testnet node, serve the bundled clients,
drive the UI in a real Chromium, take screenshots, and read console logs / JS
errors. Built for Claude sessions validating frontend functionality.

Spec: `docs/superpowers/specs/2026-07-09-app-automation-tool-design.md`

## Setup (once)

    cd tools/app-automation
    npm install
    npx playwright install chromium

Clients must be built: `node tools/app-automation/cli.js clients build`
(wraps `desktop-app/scripts/build-clients.js`).

## Typical session

    node tools/app-automation/cli.js node start        # testnet genesis node
    node tools/app-automation/cli.js open forum        # daemon + browser start automatically
    node tools/app-automation/cli.js ui                # ARIA snapshot: find selectors
    node tools/app-automation/cli.js click "text=New Thread" --shot
    node tools/app-automation/cli.js type "#title" "hello world"
    node tools/app-automation/cli.js screenshot        # prints absolute PNG path (Read it)
    node tools/app-automation/cli.js logs --errors
    node tools/app-automation/cli.js open chat         # switch client, same browser
    node tools/app-automation/cli.js stop --all        # stop browser, daemon, node

Run `node tools/app-automation/cli.js help` for the full command list.

## How it works

- A detached **daemon** (`daemon.js`) owns a Playwright Chromium, a static
  server on :8899 for `desktop-app/dist/clients/`, and a 2000-entry ring
  buffer capturing every console message, uncaught exception, and failed
  request — nothing between CLI calls is lost.
- The **CLI** (`cli.js`) talks to the daemon on :8897 and auto-starts it.
  `--headed` launches a visible browser. `--shot` on any action command
  screenshots after acting.
- The control API on :8897 is unauthenticated and includes `/eval` (arbitrary
  JS execution in the page) — it binds 127.0.0.1 only and must never be
  exposed beyond localhost.
- Clients are served standalone (not in the Tauri iframe) and fall back to
  `http://127.0.0.1:19736` (local testnet RPC) per `useRpc.tsx`.
- Node lifecycle delegates to `scripts/daemon-control.js`.

## Tests

    npm test        # unit + daemon integration (needs Chromium, no node)
    npm run smoke   # full loop (starts the testnet node, opens clients)
