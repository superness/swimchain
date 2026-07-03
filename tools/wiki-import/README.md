# wiki-import

Seed a swimchain wiki namespace with real content from an existing MediaWiki
wiki — "your wiki, without the ads, because we host it."

## Licensing is the point

- Imports are only allowed from wikis whose Action API declares a **CC BY-SA**
  license (`meta=siteinfo&siprop=rightsinfo`) — Wikipedia and most Fandom
  wikis qualify. Anything else is refused before a single page is fetched.
- Every imported page ends with a mandatory attribution footer: source page
  URL, source wiki name, the license the source declares (linked), and the
  import date you pass via `--date`. **No attribution, no import.**

## Usage

```bash
cd tools/wiki-import && npm install   # one dependency: hash-wasm (Argon2id PoW)

# Review first (writes markdown to --out, publishes nothing):
node import.js \
  --wiki https://en.wikipedia.org \
  --pages "Proof of work,Distributed hash table,Gossip protocol" \
  --date 2026-07-02 \
  --dry-run --out ./out

# Publish into a node (regtest example):
node import.js \
  --wiki https://en.wikipedia.org \
  --pages "Proof of work,Distributed hash table,Gossip protocol" \
  --space imported-wiki \
  --rpc http://127.0.0.1:29736 \
  --network regtest \
  --date 2026-07-02
```

Options: `--category <name>` instead of `--pages` (single capped listing —
the tool never crawls beyond the requested set), `--limit <n>` category cap,
`--seed <hex>` author identity, `--user-agent <ua>`, `--network regtest|testnet`.
A `manifest.json` (source, license, page -> content_id) is written to `--out`.

## How it publishes (wiki-client's own write contract)

A wiki page is a `submit_post` into the namespace space, exactly as
`wiki-client/src/pages/WikiPageEdit.tsx` submits it (and as
`tests/e2e-write-paths/tests/wiki.test.ts` proves):

- Action PoW (SPEC_03 Argon2id) is mined over the **exact node bytes**
  `` `${title}\n\n${body}` `` — the PR #45 byte contract.
- The post is signed `post:${space_id}:${title}:${body}:${timestamp}`.
- RPC transport auth uses the same header scheme as `wiki-client/src/lib/rpc.ts`
  (`X-CS-Identity` / `X-CS-Timestamp` / `X-CS-Signature` over
  `swimchain-rpc:{method}:{sha256(params)}:{timestamp}`).

**Identity:** the wiki write path validates the `signature` param against
`author_id` — i.e. against the submitting keypair itself, not against the
node's identity. So the importer signs locally with an Ed25519 seed
(`--seed`, hex). Without `--seed` an ephemeral identity is generated and
printed; save it if you want to edit the imported pages later. (The node's
`sign_message` remote-signing path is not used because the page author must
be the keypair that signs the `post:` message.) On regtest, level checks are
bypassed; on testnet the seed's identity must satisfy the usual
sponsorship/level requirements to post.

## Conversion fidelity (deliberately lossy)

Kept: headings, paragraphs, bold/italic, ordered/unordered lists (nested),
external links, code blocks (`<syntaxhighlight>`/`<pre>`/`<code>`),
blockquotes. Internal wiki links become swimchain `[[wikilinks]]` when the
target is in the same import batch, otherwise external links back to the
source wiki.

Stripped: `{{templates}}`/infoboxes, `{| wikitables |}`, `<ref>` citations,
`<gallery>`, `[[File:]]`/`[[Image:]]`/`[[Category:]]`, magic words. `<math>`
becomes inline code.

## End-to-end proof

```bash
npm run e2e     # boots a scratch regtest node, dry-runs + real-imports
                # 3 Wikipedia pages, verifies get_content + attribution
                # footer, renders bodies through wiki-client's markdown.ts
```

Requires the `sw` binary (`cargo build --release`, or `SW_BIN=<path>`),
Node >= 22.7 (imports `wiki-client/src/lib/markdown.ts` via type stripping),
and network access to en.wikipedia.org.

## Politeness

Identifies with a User-Agent, throttles to 1 request/second, and fetches
only the requested pages (or one category listing) — no crawling.
