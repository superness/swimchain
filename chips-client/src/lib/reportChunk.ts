/**
 * SPLIT A REPORT ACROSS POSTS INSTEAD OF LOSING ITS TAIL.
 *
 * WHY. 2026-07-29: a ⚑ report was posted truncated at 12,000 bytes, mid-array.
 * The head survived and happened to contain the regressions, which is the only
 * reason that evening's diagnosis was possible at all — the journal and the dip
 * ring, the two things added that same day precisely to record what the client
 * DID, were both in the discarded tail. Operator: "we want the whole report for
 * sure."
 *
 * A truncating diagnostic is worse than a missing one, because it looks
 * complete. `[clipped N chars]` at the bottom is easy to skim past, and every
 * consumer downstream (including a JSON parser) treats the fragment as the
 * whole thing.
 *
 * PURE, no I/O. The caller does the posting.
 */

/**
 * Split `text` into parts of at most `max` characters, breaking on NEWLINES
 * where possible.
 *
 * Line-aligned rather than a blind `slice` for one reason: a report is pretty-
 * printed JSON, and a part that ends mid-token is unreadable on its own AND
 * unrepairable without also knowing where the next part begins. Cut between
 * lines and every part is independently skimmable — which matters because the
 * parts arrive as separate posts and may be read out of order.
 *
 * A single line longer than `max` (a giant user agent, one enormous error
 * string) is hard-split, because the alternative is a part that exceeds the
 * limit and fails to post — the exact failure this exists to prevent.
 */
export function chunkReport(text: string, max: number): string[] {
  if (max <= 0) return [text];
  if (text.length <= max) return [text];

  const parts: string[] = [];
  let cur = '';

  const flush = () => { if (cur.length > 0) { parts.push(cur); cur = ''; } };

  // `split('\n')` then re-adding the newline keeps the reassembled join exactly
  // equal to the input — the round-trip property the test pins, and the reason
  // a reader can concatenate the parts and get valid JSON back.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Every line but the last carries its newline into the chunk.
    let line = i < lines.length - 1 ? `${lines[i]}\n` : lines[i];

    // A single line that cannot fit at all: emit it in max-sized bites. The
    // first bite may need to start a fresh part.
    if (line.length > max) {
      flush();
      while (line.length > max) {
        parts.push(line.slice(0, max));
        line = line.slice(max);
      }
      cur = line;
      continue;
    }

    if (cur.length + line.length > max) flush();
    cur += line;
  }
  flush();
  // An input that is entirely empty lines could produce nothing; never return
  // an empty set, or the caller posts no report at all and reports success.
  return parts.length > 0 ? parts : [text];
}
