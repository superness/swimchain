/**
 * DmConversation — a flat 1:1 direct-message view.
 *
 * A DM is a 2-member private space (set up by the request/accept handshake). Inside it
 * we keep a single "channel" (a top-level post); messages are encrypted REPLIES to that
 * channel. (Replies store their body verbatim, whereas a top-level post's body is stored
 * as `${title}\n\n${body}` — which would corrupt ciphertext — so messages must be replies.)
 * Cross-node delivery rides on normal block/mempool sync (proven end-to-end at the node
 * layer). The node holds the space key and does encrypt/decrypt; the browser never sees it.
 *
 * Deliberately self-contained (no server→channel chrome) so the shared Chat surface is
 * untouched.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { hexToBytes, solutionToRpcParams, sha256 } from '@swimchain/frontend';
import { useRpc, usePostSubmit, usePrivateContent } from '../hooks/useRpc';
import { usePostPow, useReplyPow } from '../hooks/useActionPow';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { useToast } from '../components/Toast';
import { loadDmList, truncateAddress } from '../lib/dm';
import './DmConversation.css';

const PRIVATE_PREFIX = '[PRIVATE:v1:';
const CHANNEL_TITLE = 'messages';
const POLL_MS = 4000;

interface DmMessage {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  mine: boolean;
  pending?: boolean;
}

const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');

export function DmConversation(): JSX.Element {
  const { spaceId = '' } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { rpc, connected } = useRpc();
  const { identity, publicKeyBytes, sign: signAsync } = useChatIdentity();
  const { encryptForSpace, decryptForSpace } = usePrivateContent();
  const { submitPost } = usePostSubmit();
  const { minePost } = usePostPow();
  const { mineReply } = useReplyPow();
  const toast = useToast();

  const myPk = identity?.publicKey ?? null;

  // The other participant, from the local DM registry (for the header).
  const otherPk = useRef<string>('');
  if (!otherPk.current) {
    const entry = loadDmList().find(e => e.spaceId.toLowerCase() === spaceId.toLowerCase());
    if (entry) otherPk.current = entry.otherPk;
  }

  const [channelId, setChannelId] = useState<string | null>(null);
  const [otherAddress, setOtherAddress] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const decryptedCache = useRef<Record<string, string>>({});
  const creatingChannel = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const authorBytes = useCallback(
    () => publicKeyBytes ?? (myPk ? hexToBytes(myPk) : new Uint8Array()),
    [publicKeyBytes, myPk]
  );

  // Resolve (or lazily create) the DM's single channel thread. Canonical = the
  // lowest content_id among top-level posts, so both sides converge even if a
  // creation raced.
  const resolveChannel = useCallback(async (): Promise<string | null> => {
    if (!rpc || !connected || !spaceId || !myPk || !publicKeyBytes) return null;
    try {
      const res = await rpc.listSpaceContent(spaceId, { limit: 200, sort: 'recent' });
      const posts = res.items
        .filter(it => it.content_type === 'Post' || !it.parent_id)
        .map(it => it.content_id)
        .sort();
      if (posts.length > 0) return posts[0]!;

      // None yet — create the channel thread once.
      if (creatingChannel.current) return null;
      creatingChannel.current = true;
      const solution = await minePost(`${CHANNEL_TITLE}\n\n`, publicKeyBytes, true);
      const powParams = solutionToRpcParams(solution);
      const created = await submitPost(spaceId, CHANNEL_TITLE, '', myPk, signAsync, powParams);
      creatingChannel.current = false;
      return created.success ? created.contentId : null;
    } catch {
      creatingChannel.current = false;
      return null;
    }
  }, [rpc, connected, spaceId, myPk, publicKeyBytes, minePost, submitPost, signAsync]);

  // Load + decrypt the DM messages (replies to the channel).
  const load = useCallback(async () => {
    if (!rpc || !connected || !myPk) return;
    let ch = channelId;
    if (!ch) {
      ch = await resolveChannel();
      if (ch) setChannelId(ch);
      else return;
    }
    try {
      const res = await rpc.getReplies(ch);
      const replies = res.replies ?? [];
      const out: DmMessage[] = [];
      for (const r of replies) {
        const raw = r.body ?? '';
        if (!raw) continue;
        let text: string;
        if (raw.startsWith(PRIVATE_PREFIX)) {
          const cached = decryptedCache.current[r.content_id];
          if (cached !== undefined) {
            text = cached;
          } else {
            const plain = await decryptForSpace(spaceId, raw);
            if (plain === null) continue;
            decryptedCache.current[r.content_id] = plain;
            text = plain;
          }
        } else {
          text = raw;
        }
        out.push({
          id: r.content_id,
          authorId: r.author_id,
          text,
          createdAt: r.created_at,
          mine: r.author_id.toLowerCase() === myPk.toLowerCase(),
        });
      }
      out.sort((a, b) => a.createdAt - b.createdAt);
      setMessages(prev => {
        const confirmed = new Set(out.map(m => m.id));
        const stillPending = prev.filter(m => m.pending && !confirmed.has(m.id));
        return [...out, ...stillPending];
      });
    } catch {
      // transient; retry on next poll
    }
  }, [rpc, connected, myPk, channelId, resolveChannel, decryptForSpace, spaceId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  // Resolve the other participant's cs1… address for a friendlier header/composer
  // (we only track them by pubkey). The node encodes it authoritatively.
  useEffect(() => {
    if (!rpc || !connected || !otherPk.current) return;
    let cancelled = false;
    rpc
      .encodeAddress({ pubkey: otherPk.current })
      .then(r => { if (!cancelled) setOtherAddress(r.address); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rpc, connected]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!rpc || !connected || !myPk || !publicKeyBytes) return;

    // Make sure the channel exists before spending PoW.
    let ch = channelId;
    if (!ch) {
      ch = await resolveChannel();
      if (!ch) {
        toast.error('Could not open the conversation thread. Try again in a moment.');
        return;
      }
      setChannelId(ch);
    }

    setSending(true);
    const tempId = `pending-${Date.now()}-${text.length}`;
    setMessages(prev => [
      ...prev,
      { id: tempId, authorId: myPk, text, createdAt: Math.floor(Date.now() / 1000), mine: true, pending: true },
    ]);
    setInput('');

    try {
      const cipher = await encryptForSpace(spaceId, text);
      if (!cipher) {
        toast.error('Could not encrypt your message. Nothing was sent.');
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }
      const solution = await mineReply(cipher, authorBytes(), true);
      const powParams = solutionToRpcParams(solution);
      // Sign the canonical action preimage the node verifies (validate_action_signature):
      //   content_hash(32) || timestamp_LE(8) || private(1)  = 41 bytes
      // This is a private-space (DM) REPLY: content_hash = sha256(cipher) and the body is
      // a [PRIVATE:v1:] envelope, so the private byte is 1.
      const contentHash = await sha256(new TextEncoder().encode(cipher));
      const preimage = new Uint8Array(41);
      preimage.set(contentHash, 0);
      new DataView(preimage.buffer).setBigUint64(32, BigInt(powParams.timestamp), true);
      preimage[40] = cipher.startsWith(PRIVATE_PREFIX) ? 1 : 0;
      const sig = await signAsync(preimage);
      if (!sig) throw new Error('sign failed');
      const result = await rpc.submitReply({
        parentId: ch,
        body: cipher,
        authorId: myPk,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: toHex(sig),
        timestamp: powParams.timestamp,
      });
      if (result?.content_id) {
        decryptedCache.current[result.content_id] = text;
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, id: result.content_id, pending: false } : m)));
      } else {
        toast.error('Failed to send.');
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch {
      toast.error('Failed to send. Posting requires a sponsor — redeem an invite if you have none.');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }, [input, sending, rpc, connected, myPk, publicKeyBytes, channelId, resolveChannel, encryptForSpace, spaceId, mineReply, authorBytes, signAsync, toast]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  const title = otherAddress
    ? truncateAddress(otherAddress)
    : otherPk.current
      ? truncateAddress(otherPk.current)
      : 'Direct message';

  return (
    <div className="dm-conv">
      <header className="dm-conv__header">
        <button className="dm-conv__back" onClick={() => navigate('/channels/@me')} aria-label="Back">
          ‹
        </button>
        <span className="dm-conv__title">@ {title}</span>
      </header>

      <div className="dm-conv__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="dm-conv__empty">
            No messages yet. Say hello — messages are end-to-end encrypted to this DM.
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            className={`dm-conv__msg${m.mine ? ' dm-conv__msg--mine' : ''}${m.pending ? ' dm-conv__msg--pending' : ''}`}
          >
            <div className="dm-conv__bubble">{m.text}</div>
          </div>
        ))}
      </div>

      <div className="dm-conv__composer">
        <textarea
          className="dm-conv__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${title}…`}
          rows={1}
          disabled={sending}
        />
        <button className="dm-conv__send" onClick={send} disabled={sending || !input.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default DmConversation;
