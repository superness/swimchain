import lunr from 'lunr';
import type { ContentResponse, ContentEvent, PoolSummary } from '@/types/gateway';
import type { IndexedDocument, SearchResult, ScoreBreakdown } from '@/types/search';
import { calculateScore } from './ranking';

/**
 * Extract title from content body.
 * Uses first line or first 100 characters.
 */
function extractTitle(body: string | null): string {
  if (!body) {
    return '[No content]';
  }

  // Try to get first line
  const firstLine = body.split('\n')[0]?.trim() ?? '';

  if (firstLine.length > 0 && firstLine.length <= 100) {
    return firstLine;
  }

  // Fall back to first 100 chars
  if (body.length <= 100) {
    return body.trim();
  }

  return body.slice(0, 97).trim() + '...';
}

/**
 * Create a snippet from body content.
 * Returns max 200 characters.
 */
function createSnippet(body: string | null): string {
  if (!body) {
    return '';
  }

  if (body.length <= 200) {
    return body.trim();
  }

  return body.slice(0, 197).trim() + '...';
}

/**
 * Strip a leading title line from body text (bodies often use the
 * "Title\n\nBody" inline format), so snippets don't repeat the title.
 */
function stripTitle(body: string | null, title: string): string | null {
  if (!body) return body;
  if (title && body.startsWith(title)) {
    return body.slice(title.length).replace(/^\n+/, '');
  }
  return body;
}

/**
 * Format address for display (short format).
 * cs1q9x7...2k4m
 */
function formatAddressShort(address: string): string {
  if (!address || address.length < 15) {
    return address;
  }
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

/**
 * Search indexer using lunr.js
 *
 * Field boosting from CLIENT_DESIGN.md:
 * - title: 3.0 (highest priority)
 * - body: 1.0 (standard)
 * - spaceName: 1.5 (medium)
 * - authorAddress: 0.5 (for identity search)
 */
export class SearchIndexer {
  private documents: Map<string, IndexedDocument>;
  private contentResponses: Map<string, ContentResponse>;
  private index: lunr.Index | null = null;
  private needsRebuild = true;

  constructor() {
    this.documents = new Map();
    this.contentResponses = new Map();
  }

  /**
   * Add or update a document in the index
   *
   * @param content - Content from the node
   * @param spaceName - Optional human-readable space name (defaults to space_id)
   */
  addDocument(content: ContentResponse, spaceName?: string): void {
    const doc = this.contentResponseToDocument(content, spaceName);
    this.documents.set(doc.contentId, doc);
    this.contentResponses.set(doc.contentId, content);
    this.needsRebuild = true;
  }

  /**
   * Remove a document from the index
   */
  removeDocument(contentId: string): void {
    this.documents.delete(contentId);
    this.contentResponses.delete(contentId);
    this.needsRebuild = true;
  }

  /**
   * Handle content events from the node
   */
  onContentEvent(event: ContentEvent): void {
    switch (event.kind) {
      case 'NewPost':
      case 'NewReply':
        // We'd need to fetch the full content here
        // For now, just log the event
        console.log(`[SearchIndexer] New content: ${event.content_id}`);
        break;

      case 'ContentDecayed':
        this.removeDocument(event.content_id);
        break;

      case 'ContentDecaying':
        // Update decay state if we have the document
        // In production, we'd fetch updated state
        console.log(`[SearchIndexer] Content decaying: ${event.content_id}, ${event.hours_remaining}h remaining`);
        break;
    }
  }

  /**
   * Get the current index size
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Search the index
   *
   * @param query - Lunr.js query string
   * @param limit - Maximum results to return
   * @returns Array of search results with scores
   */
  search(query: string, limit = 50): SearchResult[] {
    this.rebuildIfNeeded();

    if (!this.index || !query.trim()) {
      return [];
    }

    const nowMs = Date.now();
    const results: SearchResult[] = [];

    try {
      const lunrResults = this.index.search(query);

      for (const lunrResult of lunrResults.slice(0, limit)) {
        const doc = this.documents.get(lunrResult.ref);
        const content = this.contentResponses.get(lunrResult.ref);

        if (!doc || !content) {
          continue;
        }

        // Convert lunr score (typically 0-20+) to 0-100
        const textScore = Math.min(100, lunrResult.score * 10);

        const scoreBreakdown = calculateScore(textScore, content, nowMs);

        results.push({
          contentId: doc.contentId,
          spaceId: content.item.space_id,
          spaceName: doc.spaceName,
          authorId: content.item.author_id,
          title: doc.title,
          body: createSnippet(stripTitle(content.item.body_inline, doc.title)),
          createdAt: doc.createdAt,
          lastEngagement: content.item.last_engagement,
          replyCount: doc.replyCount,
          survivalProbability: doc.survivalProbability,
          isDecayed: doc.isDecayed,
          isProtected: content.is_protected,
          hoursUntilDecay: content.hours_until_decay,
          pool: doc.pool,
          scoreBreakdown,
        });
      }
    } catch (error) {
      console.error('[SearchIndexer] Search error:', error);
    }

    return results;
  }

  /**
   * Get all documents (for browsing without search query)
   */
  getAllDocuments(limit = 50, offset = 0): SearchResult[] {
    const nowMs = Date.now();
    const results: SearchResult[] = [];

    const entries = Array.from(this.documents.entries()).slice(offset, offset + limit);

    for (const [contentId, doc] of entries) {
      const content = this.contentResponses.get(contentId);
      if (!content) continue;

      // No text search, so text relevance is 0
      const scoreBreakdown = calculateScore(0, content, nowMs);

      results.push({
        contentId: doc.contentId,
        spaceId: content.item.space_id,
        spaceName: doc.spaceName,
        authorId: content.item.author_id,
        title: doc.title,
        body: createSnippet(stripTitle(content.item.body_inline, doc.title)),
        createdAt: doc.createdAt,
        lastEngagement: content.item.last_engagement,
        replyCount: doc.replyCount,
        survivalProbability: doc.survivalProbability,
        isDecayed: doc.isDecayed,
        isProtected: content.is_protected,
        hoursUntilDecay: content.hours_until_decay,
        pool: doc.pool,
        scoreBreakdown,
      });
    }

    return results;
  }

  /**
   * Rebuild the lunr index if needed
   */
  private rebuildIfNeeded(): void {
    if (!this.needsRebuild) {
      return;
    }

    const docs = Array.from(this.documents.values());

    // lunr.js indexes are immutable - we have to rebuild
    this.index = lunr(function () {
      this.ref('contentId');

      // Field weights from CLIENT_DESIGN.md
      this.field('title', { boost: 3 });
      this.field('body', { boost: 1 });
      this.field('spaceName', { boost: 1.5 });
      this.field('authorAddress', { boost: 0.5 });

      // Enable position metadata for highlighting
      this.metadataWhitelist = ['position'];

      for (const doc of docs) {
        this.add(doc);
      }
    });

    this.needsRebuild = false;
    console.log(`[SearchIndexer] Index rebuilt with ${docs.length} documents`);
  }

  /**
   * Convert ContentResponse to IndexedDocument
   */
  private contentResponseToDocument(content: ContentResponse, spaceName?: string): IndexedDocument {
    const body = content.item.body_inline || '';
    return {
      contentId: content.item.content_id,
      title: extractTitle(content.item.body_inline),
      body,
      spaceName: spaceName || content.item.space_id,
      authorAddress: formatAddressShort(content.item.author_id),
      createdAt: content.item.created_at,
      survivalProbability: content.survival_probability,
      isDecayed: content.is_decayed,
      pool: content.pool,
      replyCount: content.children?.length ?? 0,
    };
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
    this.contentResponses.clear();
    this.index = null;
    this.needsRebuild = true;
  }
}

// Singleton indexer instance
let _indexer: SearchIndexer | null = null;

/**
 * Get the search indexer singleton
 */
export function getSearchIndexer(): SearchIndexer {
  if (_indexer === null) {
    _indexer = new SearchIndexer();
  }
  return _indexer;
}

/**
 * Reset the indexer (for testing)
 */
export function resetSearchIndexer(): void {
  if (_indexer) {
    _indexer.clear();
  }
  _indexer = null;
}
