/**
 * Thread list component displaying threads in a virtualized list
 * Uses react-window for efficient rendering of large lists
 */

import { useMemo, useState, useEffect, useRef, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { List, RowComponentProps } from 'react-window';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { useBlocklist } from '../hooks/useBlocklist';
import { usePassphraseStore } from '../hooks/usePassphraseStore';
import { BlockButton } from './BlockButton';
import { EncryptedBadge, DecryptedBadge } from './EncryptedContent';
import { ImageGallery } from './ImageGallery';
import { decryptPost } from '../lib/encryption';
import { truncateAddress } from './AddressDisplay';
import { formatRelativeTime } from '../utils/time';
import type { Thread } from '../types';
import './ThreadList.css';

interface ThreadListProps {
  threads: Thread[];
  spaceId: string;
}

// Row height in pixels (includes padding and border)
const ROW_HEIGHT = 80;
// Virtualization threshold - use native rendering below this count
const VIRTUALIZATION_THRESHOLD = 50;

// Props passed to the row component by List + our custom rowProps
interface ThreadRowRendererProps {
  threads: Thread[];
  spaceId: string;
  selectedIndex: number;
}

// Row component for react-window v2
function ThreadRowRenderer(
  props: RowComponentProps<ThreadRowRendererProps>
): ReactElement | null {
  const { index, style, threads, spaceId, selectedIndex } = props;
  const thread = threads[index];
  if (!thread) return null;
  const isSelected = index === selectedIndex;

  return (
    <div style={style}>
      <ThreadRow
        thread={thread}
        spaceId={spaceId}
        isSelected={isSelected}
      />
    </div>
  );
}

export function ThreadList({ threads, spaceId }: ThreadListProps): JSX.Element {
  const { selectedIndex } = useKeyboardNavigation();
  const { isPostBlocked, isUserBlocked } = useBlocklist();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  // Filter out blocked threads and threads from blocked users
  const visibleThreads = useMemo(() => {
    return threads.filter(thread => {
      if (isPostBlocked(thread.id)) return false;
      if (isUserBlocked(thread.author)) return false;
      return true;
    });
  }, [threads, isPostBlocked, isUserBlocked]);

  // Measure container height for virtualization
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Row props for react-window (memoized to prevent unnecessary re-renders)
  const rowProps = useMemo<ThreadRowRendererProps>(() => ({
    threads: visibleThreads,
    spaceId,
    selectedIndex,
  }), [visibleThreads, spaceId, selectedIndex]);

  // Calculate list height - use available space or limit by item count
  const listHeight = useMemo(() => {
    const totalHeight = visibleThreads.length * ROW_HEIGHT;
    return Math.min(containerHeight, totalHeight);
  }, [visibleThreads.length, containerHeight]);

  if (visibleThreads.length === 0 && threads.length > 0) {
    return (
      <div className="thread-list-empty">
        <p>All threads are hidden by your blocklist.</p>
      </div>
    );
  }

  // Use native rendering for small lists (avoids virtualization overhead)
  const useVirtualization = visibleThreads.length >= VIRTUALIZATION_THRESHOLD;

  return (
    <div className="thread-list" role="grid" aria-label="Threads">
      <div className="thread-list-header" role="row">
        <div className="col-thread" role="columnheader">Thread</div>
        <div className="col-replies" role="columnheader">Replies</div>
        <div className="col-activity" role="columnheader">Activity</div>
        <div className="col-actions" role="columnheader"></div>
      </div>
      <div
        ref={containerRef}
        className="thread-list-body"
        role="rowgroup"
      >
        {useVirtualization ? (
          <List
            style={{ height: listHeight }}
            rowCount={visibleThreads.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={ThreadRowRenderer}
            rowProps={rowProps}
            overscanCount={5}
          />
        ) : (
          visibleThreads.map((thread, index) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              spaceId={spaceId}
              isSelected={index === selectedIndex}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ThreadRowProps {
  thread: Thread;
  spaceId: string;
  isSelected: boolean;
}

function ThreadRow({ thread, spaceId, isSelected }: ThreadRowProps): JSX.Element {
  const { getPassphrasesToTry } = usePassphraseStore();
  const [decryptedTitle, setDecryptedTitle] = useState<string | null>(null);
  const [activePassphrase, setActivePassphrase] = useState<string | null>(null);

  // Check if thread is encrypted (title will be "[Encrypted Post]")
  const isEncryptedPost = thread.title === '[Encrypted Post]';
  // Content may have title prepended, so check if encryption marker exists anywhere
  const contentIsEncrypted = thread.content ? thread.content.includes('[ENCRYPTED:v1:') : false;

  // Try to auto-decrypt if encrypted and we have passphrases
  useEffect(() => {
    if (!isEncryptedPost || !contentIsEncrypted || !thread.content) {
      return;
    }

    const tryDecrypt = async () => {
      const passphrases = getPassphrasesToTry(thread.id);

      // Extract the encrypted portion (content may have title prepended)
      const encryptedStart = thread.content.indexOf('[ENCRYPTED:v1:');
      const encryptedBody = encryptedStart >= 0
        ? thread.content.substring(encryptedStart)
        : thread.content;

      for (const pass of passphrases) {
        try {
          const result = await decryptPost(encryptedBody, pass);
          if (result) {
            setDecryptedTitle(result.title);
            // Save the working passphrase for image decryption
            setActivePassphrase(pass);
            return;
          }
        } catch {
          // Continue to next passphrase
        }
      }
    };

    tryDecrypt();
  }, [thread.id, thread.content, isEncryptedPost, contentIsEncrypted, getPassphrasesToTry]);

  // Display title - use decrypted if available, otherwise show badge for encrypted
  const displayTitle = decryptedTitle || (isEncryptedPost ? null : thread.title);
  const showEncryptedBadge = isEncryptedPost && !decryptedTitle;
  const showDecryptedBadge = isEncryptedPost && !!decryptedTitle;

  return (
    <div
      className={`thread-row ${isSelected ? 'selected' : ''}`}
      data-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      role="row"
    >
      <div className="col-thread" role="gridcell">
        <Link
          to={`/spaces/${spaceId}/thread/${thread.id}`}
          className="thread-link"
        >
          <span className="thread-title">
            {showDecryptedBadge && <DecryptedBadge />}
            {displayTitle}
            {showEncryptedBadge && <EncryptedBadge />}
          </span>
          <span className="thread-author">
            by {truncateAddress(thread.author)}
          </span>
        </Link>
        {thread.mediaRefs && thread.mediaRefs.length > 0 && (
          <ImageGallery
            mediaRefs={thread.mediaRefs}
            thumbnailMode
            maxThumbnails={3}
            encryptionPassphrase={isEncryptedPost ? activePassphrase ?? undefined : undefined}
          />
        )}
      </div>
      <div className="col-replies" role="gridcell">
        <span className="reply-count">{thread.replyCount}</span>
      </div>
      <div className="col-activity" role="gridcell">
        <time dateTime={new Date(thread.lastEngagement * 1000).toISOString()}>
          {formatRelativeTime(thread.lastEngagement)}
        </time>
      </div>
      <div className="col-actions" role="gridcell">
        <BlockButton id={thread.id} type="post" authorId={thread.author} />
      </div>
    </div>
  );
}
