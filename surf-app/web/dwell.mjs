// Dwell-engage (Surf Phase B, Task 3): "watching is feeding." Pure — no DOM,
// no real timers; timer scheduling is injected (setTimer/clearTimer) so this
// module is fully unit-testable with a fake clock. See task-3-brief.md B2.
//
// Design law honored here (brief's review-hardened requirements):
//   - "Rendered" is a SNAPSHOT taken at tune() time, not a fire-time
//     re-fetch. tuned() fetches list_space_content once per space and
//     stores the concatenated result in `snapshot`; fire() only ever reads
//     that closed-over snapshot. An item that starts existing on the
//     channel's spaces AFTER tuned() was called is never seen by fire().
//   - selectForEngage filters `.filter(it => it.body)` BEFORE the ledger
//     filter — body-null rows are content whose bytes were never fetched
//     (see shell.mjs's localItemCount comment), definitionally not
//     displayable, so they can never count as "rendered".
//   - The receive-only latch (`receiveOnly` Set, keyed by channelId) is
//     checked at the top of fire() — not just inside the mining loop — so
//     it persists across an entire NEW tuned()->timer->fire() cycle on the
//     same channel, not just the remainder of the fire() call where the
//     rejection happened.
import { DWELL_SECONDS, DWELL_K, ENGAGE_LEDGER_HOURS } from './policy.mjs';

const LKEY = (id) => `engage:${id}`;

export function ledgerHas(store, id, now) {
  const raw = store.getItem(LKEY(id));
  if (!raw) return false;
  return now - Number(raw) < ENGAGE_LEDGER_HOURS * 3600_000;
}

export function ledgerMark(store, id, now) {
  store.setItem(LKEY(id), String(now));
}

// Pure selection: body-present, newest-first, ledger-fresh, capped at K.
// Item shape is ContentSummary (src/rpc/types.rs:818-843): `created_at` is
// already milliseconds (despite the name not saying so) — same unit the
// ledger timestamps use, confirmed against the node's field doc comment
// ("Creation timestamp (milliseconds)"), so no unit conversion is needed
// even though this value is never compared directly against `now` (only
// used for relative newest-first ordering).
export function selectForEngage(items, store, now) {
  return items
    .slice()
    .filter((it) => it.body)
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .filter((it) => !ledgerHas(store, it.content_id, now))
    .slice(0, DWELL_K)
    .map((it) => it.content_id);
}

export function createDwell({
  rpc,
  engageOne,
  store,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onEngaged,
}) {
  let handle = null;
  let current = null;
  const receiveOnly = new Set();
  let snapshot = [];

  async function fire(channelId, items) {
    // Session-persistent latch: checked here (not only inside the loop
    // below), so a LATER tuned()->fire() cycle on the same channel is also
    // a no-op once this channel has latched receive-only, not just the
    // remainder of the fire() call where the rejection first happened.
    if (receiveOnly.has(channelId)) return;
    const targets = selectForEngage(items, store, now());
    for (const id of targets) {
      const r = await engageOne(id);
      if (!r.ok && r.receiveOnly) {
        receiveOnly.add(channelId); // marks receive-only for the session
        return; // no error propagates; remaining items in this fire are skipped
      }
      if (r.ok) {
        ledgerMark(store, id, now());
        onEngaged?.(id);
      }
      // r.ok === false && !r.receiveOnly: a non-latching failure (mining
      // error, transient RPC failure, ...) — move on to the next item.
    }
  }

  return {
    // Snapshot the listing AT TUNE TIME — reuse tuneDriver's already-fetched
    // list_space_content results if the caller has them, or fetch once here.
    // fire() consumes this snapshot; it never re-fetches at fire time (an
    // item first listed after tuned() is not engaged).
    async tuned(channelId, spaces) {
      if (handle) clearTimer(handle);
      current = channelId;
      let items = [];
      for (const s of spaces ?? []) {
        try {
          items = items.concat((await rpc('list_space_content', { space_id: s, limit: 5 }))?.items ?? []);
        } catch {
          /* keep going — best-effort snapshot from whichever spaces answered */
        }
      }
      snapshot = items;
      // Returning fire()'s promise (rather than a bare statement) is a
      // deliberate, minimal addition over the reference sketch: a real
      // setTimeout ignores a callback's return value, so this is a no-op in
      // the browser, but it gives an injected fake timer a promise to await
      // for deterministic tests instead of racing fire()'s internal awaits.
      handle = setTimer(() => {
        if (current === channelId) return fire(channelId, snapshot);
      }, DWELL_SECONDS * 1000);
    },
    untuned() {
      if (handle) clearTimer(handle);
      handle = null;
      current = null;
    },
    isReceiveOnly(channelId) {
      return receiveOnly.has(channelId);
    },
  };
}
