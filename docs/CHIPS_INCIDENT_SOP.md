# SOP: debugging a live chips report, and shipping the fix

Written 2026-08-05 after an overnight session that shipped eleven fixes and had
to correct four of them in front of the operator. Everything here is a rule that
was paid for. Where a step has a cost attached, that cost is real and dated.

The single sentence version:

> **Every correct call came from reading an artifact first. Every wrong call
> came from reasoning forward from a mechanism.**

---

## 1. Triage: read the artifact before forming a theory

**Do not answer "what's happening" from the symptom.** The player's description
is where to look, never what to conclude. On 2026-08-04 the same symptom ("I'm
not getting crumbs") had four different causes across one night.

Pull the report first:

```bash
ssh root@167.71.241.252 '
  find /var/lib/swimchain-mainnet/sync_blobs/ -type f -mmin -15 | while read f; do
    h=$(head -1 "$f"); case "$h" in *"chips report"*) echo "$(stat -c %y "$f"|cut -c12-19)  $h  ${f#*/sync_blobs/}";; esac
  done | sort'
```

A report is now ONE post (~10 KB). A title with `(1/4)` means an old build or an
oversized session — parts after the first are frequently lost, so treat a
multipart report as partial evidence and say so.

### Read it in this order. The order is the point.

| # | Field | The question it answers |
|---|---|---|
| 1 | `regressions` with `movesFrom > movesTo` | **history got SHORTER — a move was DELETED.** Named four bugs in one night. Always read first. |
| 2 | `unpaidDips` | a dip the client paid for that the chain disagrees with, with the fold's own verdict |
| 3 | `lostMoves` | moves that hit the 610s TTL and had their credit deleted |
| 4 | `rejects` | why a buy did not stick — a refused buy is SILENT in the UI |
| 5 | `queueDupes` | the same jar queued twice, burning a PoW to be thrown away |
| 6 | `queue` (`sentAt`) | what is in flight vs never sent |
| 7 | `fold` + `rack` + `tuning` | the state, and the chip pots — the two most-missed fields |
| 8 | `dips` ring | per-dip `credited` / `spilled` / `crumbsBefore` |

### The strongest move is not the report — re-fold the chain

```bash
ssh root@167.71.241.252 'echo "[\"<table-content-id>\",5000]" | /root/rpcq.sh get_replies' > replies.json
```

Then run the real engine over it from a file inside `chips-client/src/`:

```ts
import { foldChips } from './lib/chipsEngine';
const st = foldChips({v:1,kind:'chips-table',name:'x',owner:ME}, TABLE, replies, new Map());
```

**The limit matters.** 500 silently truncated an 886-move table and folded a
WRONG state. Use 5000.

Diff that against the report's `fold`. Divergence is either a real bug or a
pending move, and the `queue` says which.

---

## 2. Things that look like bugs and are not

Ruling these out cost roughly two hours in one night. Check them before
diagnosing anything.

- **A tip.** Clears `owned`, zeroes `crumbs` and `lifetimeChips`, resets
  `broken`. Every "my upgrades reset" report so far has been a tip. Look for a
  `tip <keep>` body — the keep proves the picker was used.
- **`route: 'jar'` / `'boss'` / `'hermit'` in the dips ring.** A chip fed to a
  vendor or a boss forfeits its pot BY DESIGN. `wireMs: null` + `queuedId: null`
  is the tell. These credit 0 correctly.
- **A full spill.** `credited: 0, spilled: N` on a brim-full bowl is honest.
  **Spill pins you AT the cap** — if crumbs are BELOW the cap, spill is not your
  explanation. (Operator killed a wrong theory of mine in one line with this.)
- **A fresh bowl paying less.** After a tip, seasoning is 1/1 and fryers 1, so
  the same tap pays ~1/100th. Not a crediting failure.
- **`rejected-owned` on a jar you own.** If the same jar was queued twice, the
  first buy SUCCEEDS and the second correctly bounces. A successful purchase can
  therefore appear in `rejects`. Cross-check against `owned`.

---

## 3. The three design laws this codebase keeps re-learning

Each was violated at least twice.

**A key with no timestamp cannot answer a question about a specific attempt.**
It can only answer "has this EVER happened", which is almost never what the
caller meant. Five bugs in one night: `bossHp` re-derived from a growing
lifetime; `buy:<table>:<me>:<jar>` matching a jar bought in a previous bowl
(twice — unsent path and sent path); an in-flight guard freed by a
`rejected-order` from nine hours earlier.

**Presence on chain is not effect in the fold.** A buy can be on chain and still
fold `rejected-order` / `rejected-cost` / `rejected-owned` — most easily right
after a tip, which re-scores the whole run. Retiring a pending move because a
reply merely EXISTS deletes the grant the pending copy was holding. Six jars
vanished one per poll this way.

**Optimistic is not authoritative.** The client credits at the tap; the chain
decides. Anything that DELETES optimistic credit (a TTL, a reconcile) is taking
away something the player already watched arrive, and must be certain.

---

## 4. Ship checklist

Run every line. The ones with dates are ones that were skipped and cost
something.

```bash
cd chips-client
node scripts/test-all.mjs     # behaviour
npm run build                 # tsc -b + vite  <-- SEPARATE STEP, SEE BELOW
```

- **`test-all.mjs` DOES NOT TYPECHECK.** It runs each file through `tsx`, which
  strips types without checking them. A signature mismatch passed 65 suites and
  died at `tsc -b` during deploy (2026-08-05). Green tests are not a green build.
- **MUTATION-TEST every load-bearing test.** Reintroduce the bug the test names,
  prove the test FAILS, restore. A test that passes against its own bug is
  worthless and this repo ships them constantly.
- **Verify the mutation actually applied.** A `str.replace` that silently does
  not match produces a fake mutation AND a fake pass. Happened twice in one
  night. `assert old in s` before writing, and `grep` the file after.
- **Never chain a deploy with `;`.** Use `&&`. A failing suite followed by `;`
  deployed a red build (2026-08-05).
- **Cut a fresh branch off `origin/main` after every merge.** The operator
  squash-merges fast; a push to a merged branch is blocked by a hook.
- **Do not delete a field to save bytes without reading why it exists.** Three
  incident-driven assertions (`cookedForMs`, `raw`, `room`) caught exactly this
  in one night — each records a past wrong diagnosis.

### Deploy

```bash
bash scripts/deploy-web-clients.sh chips     # builds, VERIFIES baked env, deploys, re-verifies
```

Never a bare `npm run build` + manual copy: Vite bakes `import.meta.env` at
build time and a bundle without it dials localhost (2026-07-16 incident). The
script refuses to deploy one that is missing them.

### APK

```
tauri android build --apk --target aarch64      # WILL fail at the symlink step on Windows
cp target/aarch64-linux-android/release/libsurf_app_lib.so gen/android/app/src/main/jniLibs/arm64-v8a/
cd gen/android && ANDROID_HOME=... NDK_HOME=... JAVA_HOME=... ./gradlew.bat assembleArm64Release -x rustBuildArm64Release
```

**Never trust the tauri exit code** — it ships the PREVIOUS APK silently. Always:

```bash
aapt2 dump badging app-arm64-release.apk | grep -oE "versionCode='[0-9]+' versionName='[^']+'"
apksigner verify --print-certs app-arm64-release.apk | grep "SHA-256 digest"   # must be f75030048f82cfcb...
```

A different signing cert means existing installs cannot update.

**Verify the payload with a literal that survives minification** — a string like
`'reconciled'` or `queueDupes`, never a variable or constant name. A grep for
`TWIN_SKEW_MS` "passed" against a file that could not contain it.

---

## 5. Node-side deploys

- **Prove the health probe returns success on a KNOWN-GOOD node before arming a
  rollback on it.** A probe calling `get_chain_info` (not a method — it is
  `get_chain_stats`) would have false-rolled-back a healthy seed.
- `systemctl restart`, never `stop` — `stop` takes `PartOf` dependents
  (showcase-keeper, gateway) down with it.
- `pkill -f "<pattern>"` over ssh **matches your own ssh command line** and kills
  the connection. Use `pkill -f "[p]attern"`.
- Worktrees are cut from COMMITTED state. Uncommitted files are invisible to a
  subagent working in one — commit briefs before dispatching work that reads them.

---

## 6. When you are stuck

In order:

1. **Say what is certain and what is suspected, separately.** Do not present a
   theory as a finding. Every wrong call in the source session was a suspicion
   delivered in the voice of a fact.
2. **Ask the operator for one observation that splits the hypothesis space.** He
   is holding the device. "Tap X and tell me if Y moves" beats twenty minutes of
   inference.
3. **Suspect your own most recent change first**, especially if it touched the
   thing that is now broken. Then go read it rather than reverting blind — twice
   the read found a deeper, older defect the revert would have hidden.
4. **If the artifact cannot settle it, say so** and add the missing field to the
   report rather than guessing. `bossHpFrozen`, `deepest`, `rejects` and
   `queueDupes` were all added mid-incident for exactly this reason, and each
   answered the next one.
