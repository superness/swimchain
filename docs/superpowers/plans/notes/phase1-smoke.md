# Phase 1 launcher — e2e smoke procedure

## Procedure

1. Start the node via the launcher (or `sw --testnet --data-dir <DD> node start`) so
   <DD>/.rpc_addr and <DD>/.cookie exist.
2. Run: launcher-apps/feed/feed-app.exe --data-dir <DD>
3. Expect: a window titled "Swimchain Feed" showing the feed UI (not the browser-keypair
   onboarding) — i.e. it received SWIMCHAIN_RPC_CONFIG and is in node mode.
4. In the feed UI, confirm the node identity/address shows and a feed load succeeds
   (an authenticated list_spaces round-trip).
5. Stop the node; feed-app should show the "node not ready" state and recover when
   restarted (embed.js retries for 10s).

If node mode doesn't engage, check: iframe `src` resolves to `./client/index.html`,
`get_rpc_config` returns a valid endpoint, and the client origin is allowed by
`useParentRpcConfig`'s `ALLOWED_ORIGINS`.

## Smoke result (2026-07-12)

Ran in the worktree on Windows (`C:\github\swimchain\.claude\worktrees\launcher-phase1`),
headless (no interactive desktop session to view the rendered window), so this is a
**best-effort automated verification of the process/RPC wiring only** — steps 3-5 above
require an operator with eyes on the actual window and were NOT performed here.

**Node reachability (prerequisite for Step 1):** an existing testnet node data dir at
`%APPDATA%\swimchain-testnet` had a live `.rpc_addr` (`127.0.0.1:19736`) and `.cookie`.
Queried it directly:

```
curl -s -m 5 -H "Authorization: Basic <cookie b64>" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"get_info","params":{},"id":1}' http://127.0.0.1:19736
=> {"jsonrpc":"2.0","result":{"block_height":4,"network":"testnet","node_id":"1ec64e...",
    "p2p_port":19735,"peer_count":2,"rpc_port":19736,"uptime_seconds":1298,
    "version":"0.1.0"},"id":1}
```

Node RPC was reachable and responding — no throwaway regtest node was needed.

**Step 2 (launch):** ran `launcher-apps\feed\feed-app.exe --data-dir %APPDATA%\swimchain-testnet`
in the background, waited ~12s, then checked the process list:

```
ProcessName    Id StartTime
-----------    -- ---------
feed-app    85304 7/12/2026 3:10:30 PM
```

`feed-app.exe` launched and was still running after 12s (did not crash on startup). No
stdout/stderr was captured (log file empty — Tauri app doesn't log to the console by
default). The process was then terminated (`Stop-Process -Name feed-app -Force`) and
confirmed gone.

**What this run confirms:**
- `.rpc_addr` / `.cookie` handoff files exist and the node they point at is live and
  answers authenticated JSON-RPC (`get_info`).
- `feed-app.exe --data-dir <DD>` starts a process and it survives past initial webview
  bring-up (no immediate crash/exit).

**What this run does NOT confirm (requires a human with a visible desktop session):**
- Whether a window titled "Swimchain Feed" actually appeared (Step 3).
- Whether the feed UI rendered in node mode (vs. falling back to browser-keypair
  onboarding) — i.e. whether `get_rpc_config`/`SWIMCHAIN_RPC_CONFIG` actually reached the
  iframe and `useParentRpcConfig` accepted the origin.
- Whether the identity/address display and an authenticated `list_spaces` feed load
  succeeded in the UI (Step 4).
- The node-stop/restart recovery behavior and the "node not ready" state / 10s retry in
  embed.js (Step 5).

**Verdict:** process-launch and node-RPC-reachability smoke passes. Visual/UI-level
confirmation (Steps 3-5) is still the operator's manual check, per the procedure above —
no GUI e2e framework exists in this repo to automate it.
