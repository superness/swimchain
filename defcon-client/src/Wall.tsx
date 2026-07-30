import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRpc, useStoredKeypair } from '@swimchain/react';
import { DEFCON_SPACE } from './lib/config';
import {
  submitMinedPost,
  submitMinedReply,
  toWallPost,
  toWallReply,
  normalizeNetwork,
  type WallPost,
  type WallReply,
} from './lib/wallNet';

const POLL_MS = 10_000;
const POST_LIMIT = 50;
const REPLY_LIMIT = 200;

/** The copy the brief specifies verbatim — a mining spinner alone reads as a
 *  slow/broken page; this names what's actually happening (and why). */
const MINING_COPY = "mining Argon2id — this is the protocol's spam price, not your machine being slow";

function truncateAuthor(hex: string): string {
  if (hex.length <= 14) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

function formatRelative(createdAtMs: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * One coherent guard against the poll/optimistic-write race, used
 * identically by both lists this file polls (the post list in `Wall()`,
 * the reply list in `PostReplies`):
 *
 * A poll can be in flight when a submit's optimistic write lands (mining
 * takes real time — seconds on testnet/mainnet). If that poll's RESULT
 * predates the submit (it queried the server before the new post/reply
 * existed there) but doesn't RESOLVE until after the optimistic write,
 * applying it wholesale overwrites/erases the just-written entry until the
 * next poll — invisible in regtest, where mining is near-instant, but real
 * on testnet/mainnet.
 *
 * A boolean "submission in flight" flag (the previous approach here) only
 * catches the case where the stale poll resolves WHILE the flag is still
 * true. It misses the case where the poll started before the submission,
 * the whole submission finishes (mining + submit + optimistic write) faster
 * than that poll's own round trip, and the poll resolves afterward with the
 * flag already back to false — the flag alone can't tell "this fetch is
 * older than the write that just landed."
 *
 * A monotonic epoch closes that gap: every fetch stamps itself with the
 * CURRENT epoch when it starts; a submission bumps the epoch exactly once,
 * right after its own optimistic write (in `finally`, same synchronous tick
 * as the write — nothing else can run in between, so the write and the bump
 * are effectively atomic). A fetch whose stamp no longer matches the epoch
 * by the time it resolves is unconditionally stale — dropped — regardless
 * of how the timing lined up. A fetch that resolves before any bump is
 * always safe to apply: nothing has been written yet for it to clobber.
 */
function useEpochGuard() {
  const epochRef = useRef(0);
  const stamp = useCallback(() => epochRef.current, []);
  const isCurrent = useCallback((mark: number) => epochRef.current === mark, []);
  const bump = useCallback(() => {
    epochRef.current += 1;
  }, []);
  return { stamp, isCurrent, bump };
}

/** Progress readout shown while a post/reply mines — same three numbers for
 *  both composers, kept as one component so the copy can't drift between them. */
function MiningStatus({ attempts, elapsedMs }: { attempts: number; elapsedMs: number }) {
  return (
    <p className="wall-mining">
      {MINING_COPY}
      <br />
      <span className="wall-mining-stats">
        {attempts} attempts &middot; {(elapsedMs / 1000).toFixed(1)}s
      </span>
    </p>
  );
}

/** One post's expandable reply thread: toggle → fetch → list → composer.
 *  Kept as its own component so each post's reply state (draft text, mining
 *  progress, load/submit errors) is independent of every other post's. */
function PostReplies({
  post,
  network,
  publicKeyHex,
  sign,
}: {
  post: WallPost;
  network: ReturnType<typeof normalizeNetwork>;
  publicKeyHex: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
}) {
  const { rpc, connected } = useRpc();
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<WallReply[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ attempts: number; elapsedMs: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const repliesEpoch = useEpochGuard();

  const load = useCallback(async () => {
    if (!rpc || !connected) return;
    const mark = repliesEpoch.stamp();
    setLoading(true);
    try {
      const result = await rpc.getReplies(post.id, { limit: REPLY_LIMIT });
      // A reply submit finished (and wrote its own optimistic entry) while
      // this fetch was in flight — its result may predate that entry. Drop
      // it rather than overwrite.
      if (!repliesEpoch.isCurrent(mark)) return;
      setReplies(result.replies.map(toWallReply).sort((a, b) => a.createdAtMs - b.createdAtMs));
      setLoadError(null);
    } catch (err) {
      if (!repliesEpoch.isCurrent(mark)) return;
      setLoadError(err instanceof Error ? err.message : 'Failed to load replies');
    } finally {
      if (repliesEpoch.isCurrent(mark)) setLoading(false);
    }
  }, [rpc, connected, post.id, repliesEpoch.stamp, repliesEpoch.isCurrent]);

  // Load on first expand, and keep an OPEN panel fresh on the same 10s beat
  // as the post list — otherwise a second browser's reply only ever shows up
  // after the viewer manually collapses/reopens the thread.
  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rpc || !connected || !publicKeyHex) return;
    const body = draft.trim();
    if (!body) return;

    setSubmitting(true);
    setSubmitError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });
    try {
      const contentId = await submitMinedReply(
        rpc,
        network,
        publicKeyHex,
        sign,
        post.id,
        body,
        (attempts, elapsedMs) => setProgress({ attempts, elapsedMs })
      );
      setReplies((prev) => [
        ...(prev ?? []),
        { id: contentId, author: publicKeyHex, body, createdAtMs: Date.now() },
      ]);
      setDraft('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      // Bump immediately after the optimistic write above (same synchronous
      // tick — see useEpochGuard's doc comment) so any reply-list fetch
      // already in flight, whenever it resolves, is recognized as stale.
      repliesEpoch.bump();
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div className="wall-post-replies-block">
      <button
        type="button"
        className="link-btn wall-replies-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide replies' : `Replies (${replies?.length ?? post.replyCount})`}
      </button>

      {open && (
        <div className="wall-replies">
          {loading && replies === null && <p className="status">Loading replies…</p>}
          {loadError && <p className="status error">{loadError}</p>}
          {replies?.length === 0 && <p className="status">No replies yet.</p>}
          {replies?.map((r) => (
            <div className="wall-reply" key={r.id}>
              <div className="wall-reply-meta">
                <span className="wall-author">{truncateAuthor(r.author)}</span>
                <span className="wall-time">{formatRelative(r.createdAtMs)}</span>
              </div>
              <p className="wall-reply-body">{r.body}</p>
            </div>
          ))}

          <form className="wall-reply-form" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a reply…"
              rows={2}
              maxLength={2000}
              disabled={submitting || !publicKeyHex}
            />
            <button
              className="btn"
              type="submit"
              disabled={submitting || !draft.trim() || !publicKeyHex}
            >
              {submitting ? 'Mining…' : 'Reply'}
            </button>
            {progress && <MiningStatus {...progress} />}
            {submitError && <p className="status error">{submitError}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * The minimal wall: `list_space_posts` on mount + every 10s, a plain-text
 * composer that mines Argon2id PoW off-thread before submitting, and a
 * per-post expandable reply thread. No reactions, no media, no editing —
 * deliberately, per the brief; the point is that a DEF CON attendee can
 * write somewhere within a minute of joining.
 */
export function Wall() {
  const { rpc, connected, nodeInfo, setAuth } = useRpc();
  const { keypair, publicKeyHex, sign } = useStoredKeypair();
  const network = normalizeNetwork(nodeInfo?.network);

  // Re-establish RPC signature auth from THIS component's own live keypair.
  // `BrowserJoin` sets auth too, from its OWN `useStoredKeypair()` instance —
  // but that instance's WASM `Keypair` is freed the moment `BrowserJoin`
  // unmounts (its cleanup effect calls `keypair.free()`), which happens
  // exactly when `<Wall/>` replaces it. `useRpc()`'s `signatureAuth.sign`
  // closure still points at that now-freed object, and `SwimchainRpc.call()`
  // signs unconditionally on every call once auth is set — so the FIRST RPC
  // call Wall makes (the initial `list_space_posts`) tries to sign with a
  // freed wasm-bindgen object and throws "null pointer passed to rust"
  // (reproduced live: Task 6's stub Wall never called RPC at all, so this
  // never surfaced until a real Wall did). Re-running the same
  // publicKey/sign wiring here, bound to Wall's OWN keypair instance (which
  // stays alive for Wall's own lifetime), fixes it.
  useEffect(() => {
    if (keypair && publicKeyHex) {
      setAuth({
        publicKey: publicKeyHex,
        sign: (m: Uint8Array) => {
          const s = keypair.sign(m);
          if (!s) throw new Error('signing failed');
          return s;
        },
      });
    }
  }, [keypair, publicKeyHex, setAuth]);

  const [posts, setPosts] = useState<WallPost[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [composerBody, setComposerBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postProgress, setPostProgress] = useState<{ attempts: number; elapsedMs: number } | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  const postsEpoch = useEpochGuard();

  const fetchPosts = useCallback(async () => {
    if (!rpc || !connected) return;
    const mark = postsEpoch.stamp();
    try {
      const result = await rpc.listSpacePosts(DEFCON_SPACE, { limit: POST_LIMIT });
      // A post submit finished (and wrote its own optimistic entry) while
      // this fetch was in flight — its result may predate that entry. Drop
      // it rather than overwrite (see useEpochGuard's doc comment).
      if (!postsEpoch.isCurrent(mark)) return;
      setPosts(result.items.map(toWallPost));
      setListError(null);
    } catch (err) {
      if (!postsEpoch.isCurrent(mark)) return;
      setListError(err instanceof Error ? err.message : 'Could not reach the wall.');
    }
  }, [rpc, connected, postsEpoch.stamp, postsEpoch.isCurrent]);

  useEffect(() => {
    fetchPosts();
    const t = setInterval(fetchPosts, POLL_MS);
    return () => clearInterval(t);
  }, [fetchPosts]);

  async function handleSubmitPost(e: FormEvent) {
    e.preventDefault();
    if (!rpc || !connected || !publicKeyHex) return;
    const body = composerBody.trim();
    if (!body) return;

    setPosting(true);
    setPostError(null);
    setPostProgress({ attempts: 0, elapsedMs: 0 });
    try {
      const contentId = await submitMinedPost(
        rpc,
        network,
        publicKeyHex,
        sign,
        DEFCON_SPACE,
        '',
        body,
        (attempts, elapsedMs) => setPostProgress({ attempts, elapsedMs })
      );
      setPosts((prev) => [
        { id: contentId, author: publicKeyHex, title: '', body, createdAtMs: Date.now(), replyCount: 0 },
        ...(prev ?? []),
      ]);
      setComposerBody('');
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      // Bump immediately after the optimistic write above (same synchronous
      // tick — see useEpochGuard's doc comment) so any post-list fetch
      // already in flight, whenever it resolves, is recognized as stale.
      postsEpoch.bump();
      setPosting(false);
      setPostProgress(null);
    }
  }

  return (
    <section className="wall">
      <p className="eyebrow">@defcon34</p>
      <h2>The wall.</h2>
      <p className="lede">
        Post whatever you break, find, or want to say. Everyone sandboxed to
        this space sees it — same as anyone running a full node.
      </p>

      <form className="wall-composer" onSubmit={handleSubmitPost}>
        <textarea
          value={composerBody}
          onChange={(e) => setComposerBody(e.target.value)}
          placeholder="Write something…"
          rows={3}
          maxLength={4000}
          disabled={posting || !publicKeyHex}
        />
        <button
          className="btn primary"
          type="submit"
          disabled={posting || !composerBody.trim() || !publicKeyHex}
        >
          {posting ? 'Mining…' : 'Post'}
        </button>
        {postProgress && <MiningStatus {...postProgress} />}
        {postError && <p className="status error">{postError}</p>}
      </form>

      {listError && <p className="status error">{listError}</p>}

      {posts === null && !listError && <p className="status">Loading the wall…</p>}
      {posts !== null && posts.length === 0 && (
        <p className="status wall-empty">Nothing here yet — be the first to post.</p>
      )}

      <div className="wall-posts">
        {posts?.map((post) => (
          <article className="wall-post" key={post.id}>
            <div className="wall-post-meta">
              <span className="wall-author">{truncateAuthor(post.author)}</span>
              <span className="wall-time">{formatRelative(post.createdAtMs)}</span>
            </div>
            {post.title && <h3 className="wall-post-title">{post.title}</h3>}
            <p className="wall-post-body">{post.body}</p>
            <PostReplies post={post} network={network} publicKeyHex={publicKeyHex} sign={sign} />
          </article>
        ))}
      </div>
    </section>
  );
}
