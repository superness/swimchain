# Design threads — captured 2026-07-15 (reef testing + profile idea)

Notes from a live reef play-testing session (phone vs PC) plus one platform
idea. Three reef things and one big profile idea. Nothing here is decided —
these are open threads with the analysis already done so we can pick them up
cold.

---

## Reef — already fixed this session (context)

These shipped and are live at swimchain.io/reef; listed so we don't re-debug.

- **Rubberband on shared regions** (`App.tsx` poll guard) — gated the
  optimistic-hold on the LOCAL player's move count instead of the global
  count, so another player's move can't evict our in-flight cells.
- **Moves place-then-revert** (dedup collision) — reef move bodies were keyed
  on `seq (= moves.length)` + author slice, which is NOT collision-proof
  (same identity on two devices, or fast clicks, produced byte-identical
  bodies → content-address dedup → the move silently never sealed). Fixed by
  appending a per-submission random nonce so distinct clicks always get
  distinct bodies. Added a stale-hold escape so the grid can never stick on a
  phantom. (`reefEngine.ts submitReefMove`, `App.tsx`)
- **Full-tab freeze while mining** — action PoW (difficulty-8 Argon2id, 8 MiB,
  several seconds) ran on the main thread. Moved it to a Web Worker
  (`reef-client/src/lib/pow.worker.ts` + `minePow` in `reefEngine.ts`). The
  shared `usePow`/`PowWorker` only cover IDENTITY PoW (SHA-256); this is the
  ACTION-PoW (Argon2id) worker, kept local to reef.

---

## Reef thread 1 — confirmation-depth buffer (recommended next)

**Problem.** The fold renders the raw canonical chain tip. Tip-frontier moves
are unstable: they flicker under (a) optimistic-vs-poll reconciliation and
(b) tip reorgs that re-order/re-seal recent moves. Playing phone-vs-PC makes
two nodes race blocks, so reorgs are routine and the last block or two churns.
Observed as cells "swapping" owner and budget flickering within seconds.

**It is NOT a correctness bug** — the fold is deterministic; all clients
converge once moves are buried. It's a UX artifact of showing the unconfirmed
frontier as if it were final.

**Fix.** Introduce a confirmation depth `N` (blocks). A move `N` blocks below
the tip is *confirmed* (reorg-safe) and rendered with a solid owner. Moves
within the last `N` blocks are the *contested frontier*: render them visibly
tentative — striped/pulsing cell, "settling…" affordance — and do NOT commit a
hard owner-swap until the deciding move confirms. This kills the flicker for
both the placing device and spectators, and it's the correct model for a
chain-folded game. The engine already carries scaffolding for this
(`ReefState.tentative`, `confirmedEpoch`; comments reference a
"confirmed/tentative reorg frontier").

**Scope.** `foldReef` already knows block heights + tip; compute a
`confirmedHeight = tip - N` and mark moves above it tentative. Client renders
tentative cells distinctly. Pick `N` from observed reorg depth (tip reorgs
seen this session were depth 1 — `N = 2..3` is ample).

---

## Reef thread 2 — same-tile tie semantics (a game-design call, not a bug)

**Current rule.** Confirmed moves fold in `(block_height, then content_id)`
order. Two players grabbing the same tile in the SAME block are resolved by
**content-id hash order** — deterministic but arbitrary (not first-click, not
most-effort). First-applied grows/owns; the later one lands on an enemy cell
(inert, or a single −2 contest that doesn't capture a fresh vitality-6 cell).

Verified on-chain: tile (2,7) had two grows from two identities both at
height 151; the lower content-id owns it, stably, on every client.

**Note:** "grow on your own cell = tend" (`classify`), so the SAME identity
grabbing a tile twice is a no-conflict vitality refresh. The conflict only
arises between DISTINCT identities (and the reef auto-generates one identity
per browser, so "phone vs PC" is two players, not one).

**Options if we want a meaningful tiebreak instead of hash:**
- Keep hash order — simple, unpredictable, un-gameable by timing. Defensible.
- **Higher PoW wins the tie** — rewards effort; needs the fold to read each
  move's pow_difficulty/work (available on the action).
- **True contest** — nobody owns a contested tile until someone genuinely
  captures it via repeated contest; a same-block double-grab leaves it neutral
  /contested. More "game," more complexity.

Recommendation: do thread 1 (visualize contested frontier) first; it makes the
hash-tiebreak feel intentional ("it was contested, it settled"). Only change
the *rule* if playtesting says hash-order feels unfair.

---

## Reef thread 3 — time-based epochs (enforceable ONLY via block timestamp)

**Question:** can epochs be time-based instead of block-height based?

- **Client wall-clock — NO.** Breaks determinism: each viewer would compute
  different decay depending on when they look. The fold must be a pure
  function of the log.
- **Move `created_at` — NO.** Author-set, not consensus-verified; a player
  could backdate/postdate to skip epochs or dodge decay.
- **Block timestamp — YES, enforceable.** Block timestamps ARE consensus-
  validated (within tolerance; leader election + difficulty adjustment already
  rely on them). `epoch = floor((block.timestamp − base.timestamp) /
  EPOCH_SECONDS)`, derived from canonical block timestamps, is deterministic
  across clients AND consensus-grounded.

**Why you'd want it.** Height-based epochs (current: `BLOCKS_PER_EPOCH=2`) tick
with *activity* — a busy reef decays fast, an idle one barely. Block-timestamp
epochs tick with *real elapsed time* — a reef decays over hours/days regardless
of traffic. For a deliberately "slow world," block-timestamp is the better
mental model.

**Caveat.** Block timestamps have wiggle room (a leader can nudge within the
tolerance window), so decay pace is "enforceable enough," not exact. Trustless
true wall-clock is impossible without an oracle; block timestamp is the ceiling.

**Scope.** `foldReef` currently keys epochs to `block_height`/`tipHeight`; swap
to block timestamps (needs the block timestamp per confirmed move + the tip
block's timestamp — the node exposes block timestamps). Otherwise the fold
shape is unchanged.

---

## Platform idea — MySpace-level custom profile pages

**Vision.** Elevate the profile description to a full "build your own page" —
custom HTML/CSS/embeds, Geocities/MySpace/Neocities energy. On-thesis for
self-sovereign social ("you shape your own space").

**Danger is real and specific — the canonical failure is the precedent.** The
2005 MySpace Samy worm was exactly this: user profile HTML+JS ran in *viewers'*
browsers, added the author as a friend, and self-copied onto the viewer's
profile (1M in ~20h). On this platform it's worse — a viewer's context may hold
their identity/signing capability, so a malicious profile could sign as the
viewer, phish, deanonymize (beacon IP on a pseudonymous net), or worm through
the sponsorship graph.

**The modern web solves what MySpace couldn't: the hard sandbox.**
- Render profiles in a **null-origin sandboxed iframe** — `sandbox="allow-
  scripts"` WITHOUT `allow-same-origin` (that combination defeats the sandbox;
  never grant both).
- **Strict CSP: no external network at all** — no fetch/XHR/WebSocket, no
  external scripts/fonts/images/beacons. Forces fully self-contained pages.
- This is exactly the **Artifact model** (self-contained HTML, strict CSP,
  inline everything, no external hosts) — a proven-safe pattern. Inside the
  jail: canvas, WebGL, SVG/CSS animation, `<audio>`, even WASM — "literally
  whatever you want," but it can't touch the app, the node RPC, the user's
  keys, the viewer's DOM, or phone home. (Flash/SWF is dead — no runtime — but
  the spirit survives entirely.)

**Decentralization cuts both ways:**
- *Helps moderation:* every profile is signed → malicious pages are provably
  (pseudonymously) attributable, and the existing blocklist + spam-attestation
  + reputation + sponsorship-penalty stack is the decentralized takedown lever.
- *The hard part:* you cannot force every client to sandbox. The protocol
  stores signed HTML; a rogue/lazy client that dumps it into its own DOM
  re-opens the whole Samy hole. Safety lives in **client conformance**, not the
  protocol. Mitigation: make the sandboxed path the obvious default — nail it
  in the reference clients, spec the render contract explicitly, have the
  content format itself signal "render me isolated." Accept that a malicious
  client can only hurt *its own* users (already true of any decentralized
  system); design so a *conformant* client is safe against any *content*.

**Residual risks sandboxing does NOT cover:**
- Visual phishing (a page that *looks* like a login prompt, no script needed) →
  persistent, unremovable "untrusted profile content" chrome the page can't
  paint over.
- Illegal/abusive content → content-moderation problem, handled by
  blocklist/attestation, not the sandbox.
- Economics: a rich HTML blob is big + durable — how does it fit the PoW-cost +
  content-decay model? Profiles likely want a different durability/cost tier
  than a decaying post.

**Verdict.** Not crazy, and not dangerous *if* "profile content is untrusted,
rendered in a hard sandbox, zero ambient authority" is a non-negotiable
invariant baked into the reference clients + format spec, with the existing
social-moderation stack covering the deception/abuse layer sandboxing can't
reach. Worth a proper brainstorm before building: safe-HTML subset for inline
previews vs. full-sandbox "unleashed" mode, the render-contract spec, the
storage/cost tier, the anti-phishing chrome.
