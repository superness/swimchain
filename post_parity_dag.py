"""Post the swimchain frontend-parity work DAG to the Overmind board (:9200).

Lanes come from docs/STATE_OF_SWIMCHAIN.md (2026-07-01 audit). Titles carry a
SWIM-<id> prefix so docs/parity-dashboard.html can merge live states back in.

Board items are append-only (no edit/delete). Safe to re-run: lanes whose
SWIM-<id> prefix already exists on the board (any state) are skipped.
"""

import json
import sys
import urllib.request

BASE = "http://localhost:9200"
POSTED_BY = "claude-swimchain"
TAGS = ["swimchain-parity"]

# (id, title, size, depends_on local ids)
LANES = [
    # Phase 0 - Foundations
    ("F1", "Commit wiki-client + swimchain-frontend to git; delete reddit-client husk", "S", []),
    ("F2", "Node RPC enablers: implement contribute_to_pool, add network broadcast to private-space actions (invite/accept/leave/kick), add blocklist list/manage RPC, prune 15 phantom allowlist entries (src/rpc/server.rs:460-503)", "L", []),
    ("F3", "SDK unification: make @swimchain/frontend the single shared package - absorb swimchain-react action-pow/encryption/DM utils, add parent-RPC postMessage handshake, rename chainsocial_wasm artifacts, add crypto tests", "L", []),
    # Phase 1 - Fix broken
    ("B1", "forum-client: replace 3 phantom RPC calls - ChatView.tsx:93 post_to_private_space -> submit_reply w/ PoW; Profile.tsx post_to_space -> submit_post, upload_content -> upload_media", "M", []),
    ("B2", "forum-client: wire leave-space (SpaceSettings.tsx:119 -> useLeaveSpace), delete dead src/mocks/data.ts, wire keyboard engagement no-op", "S", []),
    ("B3", "chat-client: delete dead SpaceChatPage UI stack + fake hooks (useReactions setTimeout PoW, useRealTimeUpdates Math.random heat, MessageStream/Bubble/ThreadPanel/etc)", "M", []),
    ("B4", "feed-client: wire followed-user posts into feed via existing get_user_posts RPC (useFeed.ts:239); remove fabricated local-space fallback in CreatePrivateSpace.tsx:130-142", "M", []),
    ("B5", "search-client: delete MacroRegimeCard (foreign trading widget) + dead footer routes; unify deep-link target (forum vs feed)", "S", []),
    ("B6", "archiver-client: actually submit mined PoW - add submit_engagement to lib/rpc.ts, wire AutoEngageEngine.engage() to post solution, replace locally-fabricated pool status with authoritative re-poll. Core feature is currently a no-op.", "L", []),
    ("B7", "bridge-client: ship/document IRC WebSocket proxy (external dep, IRC dead without it); queue instead of drop messages during mining; thread inbound as submit_reply", "M", []),
    ("B8", "web-gateway: real read-only RPC data layer (port wiki-client rpc.ts read subset), delete all MOCK_* across 5 route files, feed lunr index + sitemap from live node, real health check", "L", []),
    ("B9", "mobile-client: real Ed25519 signing (useKeypair returns 64 zero bytes), real Argon2id on Android (argon2kt) + iOS (Argon2Swift) replacing SHA-256 placeholders, on-device identity generation", "L", []),
    ("B10", "desktop-app: chat-client parent-RPC handshake via shared SDK, strip debug screenshot scaffolding, prune 32MB stale/foreign binaries, real Bech32m in check_identity", "M", ["F3"]),
    # Phase 2 - Parity
    ("P1", "chat-client: accept-invite UI + list-my-private-channels + member list/kick (node RPCs exist: accept_invite, get_my_invites, get_my_private_spaces, get_space_members, kick_member)", "M", ["F2"]),
    ("P2", "chat-client: DMs (request/accept/decline), sponsorship UI, decay indicators in message stream, server-side search", "L", ["B3"]),
    ("P3", "feed-client: user discovery (Discover users tab is empty state) + DM inbox UI for already-wired DM RPCs", "M", ["B4"]),
    ("P4", "search-client: report/spam-attestation parity (port feed-client submit_spam_attestation flow)", "M", []),
    ("P5", "wiki-client: real revision model (currently faked by sorting list_space_content), verify writes mine PoW, moderation/report flow, remove orphaned search-client leftovers", "M", ["F1"]),
    ("P6", "real-time: adopt node WebSocket events (content_new, content_engaged, sync_status...) in shared SDK; wire into chat messages + feed new-content first. Zero clients use WS today.", "L", ["F3"]),
    ("P7", "analytics-client: real engagementsLast24h metric, on-chain attestation from moderation page, real active-swimmer metric (currently peers.length)", "M", ["F2"]),
    ("P8", "desktop-app: network selection UI (testnet hardcoded), unified identity story across iframes, consider bundling wiki-client", "L", ["B10"]),
    # Phase 3 - Harden
    ("Q1", "tests: unit tests for analytics/archiver/bridge (currently zero despite vitest config) + SDK crypto test coverage", "M", ["F3"]),
    ("Q2", "e2e: validate every client write path against a regtest node (post -> PoW -> sign -> accepted on chain)", "M", ["B1", "B4", "B6", "B8", "B9"]),
    ("Q3", "CHECKPOINT: cross-client re-audit, refresh docs/STATE_OF_SWIMCHAIN.md + parity-dashboard, desktop packaged-app release candidate", "M", ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "Q1", "Q2"]),
]


def board(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req, timeout=10))


def main():
    try:
        existing = board("GET", "/board")["board"]
    except Exception as e:
        print(f"Overmind board unreachable at {BASE}: {e}")
        print("Start the board, then re-run this script.")
        sys.exit(1)

    have = {}
    for it in existing:
        title = it.get("title", "")
        if title.startswith("SWIM-") and it.get("state") != "done":
            have[title.split(":", 1)[0].removeprefix("SWIM-")] = it["id"]

    board_ids = dict(have)  # local id -> board id
    posted = skipped = 0
    for lane_id, title, size, deps in LANES:  # LANES is already topologically ordered
        if lane_id in board_ids:
            print(f"  skip {lane_id} (already on board as {board_ids[lane_id]})")
            skipped += 1
            continue
        dep_board_ids = []
        for d in deps:
            if d not in board_ids:
                print(f"  ERROR: {lane_id} depends on {d} which is not posted; aborting")
                sys.exit(1)
            dep_board_ids.append(board_ids[d])
        # Q3 is the operator gate: the board rejects arm claims/completions on
        # 'checkpoint'-tagged lanes, so only the operator can close the program.
        extra = ["checkpoint"] if lane_id == "Q3" else []
        item = board("POST", "/board", {
            "title": f"SWIM-{lane_id}: {title}",
            "detail": f"Size {size}. From docs/STATE_OF_SWIMCHAIN.md (2026-07-01 parity audit). "
                      f"Branch from main, open a GitHub PR, then mark this lane done.",
            "tags": TAGS + [f"size-{size}"] + extra,
            "posted_by": POSTED_BY,
            "depends_on": dep_board_ids,
        })["item"]
        board_ids[lane_id] = item["id"]
        print(f"  posted {lane_id} -> {item['id']}" + (f" (gated on {deps})" if deps else ""))
        posted += 1

    print(f"\n{posted} lanes posted, {skipped} skipped (already present). "
          f"Dashboard: docs/parity-dashboard.html merges live states by SWIM-<id> prefix.")


if __name__ == "__main__":
    main()
