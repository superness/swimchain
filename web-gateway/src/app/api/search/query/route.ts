import { NextRequest, NextResponse } from 'next/server';
import { getSearchIndexer } from '@/lib/search/indexer';
import { ensureSearchIndex } from '@/lib/node-service';
import { DECAY_THRESHOLD } from '@/types/search';

/**
 * GET /api/search/query
 *
 * Search live node content via the server-side index.
 * The index is lazily populated (and periodically refreshed) from the node.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') || '';
  const space = searchParams.get('space');
  const author = searchParams.get('author');
  const minHeat = searchParams.get('minHeat');
  const minEngagement = searchParams.get('minEngagement');
  const time = searchParams.get('time');
  const includeDecaying = searchParams.get('decaying') === 'true';
  const sort = searchParams.get('sort') || 'relevance';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20)
  );

  try {
    const { nodeOffline } = await ensureSearchIndex();
    const indexer = getSearchIndexer();

    let results = q ? indexer.search(q, 200) : indexer.getAllDocuments(200, 0);

    if (space) {
      results = results.filter(
        r => r.spaceName === space || r.spaceId === space
      );
    }
    if (author) {
      results = results.filter(r => r.authorId === author);
    }
    if (minHeat) {
      const threshold = parseInt(minHeat, 10);
      if (!isNaN(threshold)) {
        results = results.filter(
          r => r.survivalProbability * 100 >= threshold
        );
      }
    }
    if (minEngagement) {
      const threshold = parseInt(minEngagement, 10);
      if (!isNaN(threshold)) {
        results = results.filter(
          r => r.scoreBreakdown.engagement >= threshold
        );
      }
    }
    if (time && time !== 'all') {
      const maxAge: Record<string, number> = {
        day: 86_400_000,
        week: 604_800_000,
        month: 2_592_000_000,
        year: 31_536_000_000,
      };
      const cutoff = maxAge[time];
      if (cutoff) {
        const now = Date.now();
        results = results.filter(r => now - r.createdAt <= cutoff);
      }
    }
    if (!includeDecaying) {
      results = results.filter(
        r => !r.isDecayed && r.survivalProbability >= DECAY_THRESHOLD
      );
    }

    switch (sort) {
      case 'heat':
        results.sort((a, b) => b.survivalProbability - a.survivalProbability);
        break;
      case 'newest':
        results.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'replies':
        results.sort((a, b) => b.replyCount - a.replyCount);
        break;
      case 'engagement':
        results.sort(
          (a, b) =>
            b.scoreBreakdown.engagement - a.scoreBreakdown.engagement
        );
        break;
      default:
        results.sort(
          (a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore
        );
    }

    const total = results.length;
    const offset = (page - 1) * pageSize;
    return NextResponse.json({
      results: results.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
      nodeOffline,
    });
  } catch (err) {
    return NextResponse.json(
      {
        results: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
        nodeOffline: true,
        error: err instanceof Error ? err.message : 'Search failed',
      },
      { status: 500 }
    );
  }
}
