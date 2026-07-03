# Swimchain QA Program

**North star:** *"As easy as sending it to my mom, and she's online without my help."*
Every round reports one headline number first: **unassisted time-to-first-message for the
P0 persona (Diane)**. Target: under 10 minutes, zero external help, zero crypto vocabulary.
Until that passes, nothing else in a round can call the release "ready".

A **QA round** has four tracks, run in order. Cheap gates run before expensive judgment.

---

## Track 0 — Static gates (minutes, automated, block everything downstream)

Run before spending anything on reviews or personas:

1. `npx tsc --noEmit` in every client + `cargo check` — zero new errors vs baseline.
2. `cd tests/e2e-write-paths && npm test` — 19+ tests vs a live regtest node (~25s).
   This is the "a real node accepted it" gate; it has already caught 5 dead write paths.
3. **Encoding/serving lint** — the mojibake gate (born 2026-07-02 when the live site served
   `Â·` for `·`): every served HTML page must carry `<meta charset="utf-8">`, every
   `Content-Type` must include `charset=utf-8`, and neither repo nor deployed pages may
   contain the bytes `Ã`, `Â`, `â€` in text content. One-liner against the live site:
   `curl -s <url> | grep -c 'Ã\|Â\|â€'` must be 0, and `curl -sI <url>` must show charset.
4. Link check on swimchain.io pages (no dead internal links).

A Track 0 failure stops the round: fix, re-gate, then proceed.

## Track 1 — Visual capture + vision review

- **Capture:** every persona lane screenshots every task to
  `docs/qa/rounds/<round>/shots/<persona>-T<n>-<label>.png` (full viewport). Fresh shots
  every round — stale screenshots lie about shipped changes.
- **Review:** a **vision-capable Claude session reads the key frames** (landing, onboarding,
  the core flow per client, one empty/gated state, one 125%-zoom frame). The text personas
  are blind; the operator's eyes are a first-class role, not an afterthought. The review
  judges layout, hierarchy, empty-state honesty ("locked vs broken"), contrast, and anything
  that contradicts the personas' text claims.
- Output: a Design Review section in the round findings, written from pixels, never from
  an agent's description of pixels.

## Track 2 — Feature-owner review

Eight standing owners, each reviewing **their domain across all clients** every round,
against the parity matrix in `docs/STATE_OF_SWIMCHAIN.md` and the current lane specs:

| Owner | Domain | Watches for |
|---|---|---|
| Identity-Owner | keys, addresses, names, backup | seed exposure, backup prompts, address display drift |
| Content-Owner | create/display/decay/PoW | PoW byte contracts (see Q2 postmortem), decay honesty |
| Sponsorship-Owner | offers, claims, approvals | onboarding friction — this owner co-owns the Mom metric |
| Navigation-Owner | routes, guards, empty states | dead routes, silent redirects, fake data on disconnect |
| PrivateSpace-Owner | E2E, invites, DMs, key rotation | plaintext leaks, kicked-member access, key loss |
| Moderation-Owner | report, attest, blocklist | fail-open checks, report flows that lie |
| Realtime-Owner | WS events, polling fallbacks | silent socket death, event/filter drift |
| Packaging-Owner | desktop bundle, installer, site | binary bloat, port/config drift, serving bugs (charset!) |

Owner output: findings filed as board lanes (`QA-<round>-<owner>-<n>`), each with
file:line evidence and a reproduction. "It looks done" is not a finding; "this call sends
X and the node requires Y" is.

## Track 3 — Persona user study

- Panel: `docs/qa/personas.json` — 9 named user types (P0 Diane through AXIOM the machine).
  Run at minimum Diane + 2 rotating P1s per round; full panel before a release.
- Dispatch: `post_qa_study_dag.py` posts one lane per persona + one operator `SYNTHESIS`
  lane gated on all of them (checkpoint-tagged: arms cannot claim or complete it).
- Each browser persona operates the LIVE clients in character, screenshots every task
  (feeding Track 1), records real timings, and reports marks /10 + frictions + verdict.
- AXIOM (method: api) probes RPC + gateway HTTP with curl timings.

## The synthesis (operator-only, the step that gets skipped)

The round is NOT done when the persona lanes go green. The operator must then:
1. Read the key screenshots (Track 1 review).
2. Build the performance table from own measurements (`curl -w`, cold + warm).
3. Fuse personas + owners + visuals + perf into `docs/qa/rounds/<round>/FINDINGS.md`.
4. **Compare to the prior round** — marks up/down, frictions closed, regressions.
   (Text personas rationalize regressions away; the cross-round diff catches them.)
5. Lead with: the Diane number, the single biggest issue, and a ranked fix list.
6. Only then mark the SYNTHESIS lane done.

## Cadence

- **Gate rounds** (Track 0 only): on every merge wave. Minutes.
- **Study rounds** (all tracks): before publishing any installer/site change, and after
  any multi-lane program. Diane runs in every study round without exception.
- Round artifacts live in `docs/qa/rounds/<YYYY-MM-DD>/`; findings feed fix lanes back
  onto the board, and the next round's cross-comparison closes the loop.
