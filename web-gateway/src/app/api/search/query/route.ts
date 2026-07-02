import { NextRequest, NextResponse } from 'next/server';
import { getSearchIndexer } from '@/lib/search/indexer';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') || '';
  const space = searchParams.get('space');
  const minHeat = searchParams.get('minHeat');
  const time = searchParams.get('time');
  const decaying = searchParams.get('decaying') === 'true';
  const sort = searchParams.get('sort') || 'relevance';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  try {
    const indexer = getSearchIndexer();
    let results = q ? indexer.search(q, 200) : indexer.getAllDocuments(200, 0);
    if (space) results = results.filter(r => r.spaceName === space || r.spaceId === space);
    if (minHeat) { const th = parseInt(minHeat, 10) / 100; results = results.filter(r => r.survivalProbability >= th); }
    if (time && time !== 'all') { const maxAge: Record<string, number> = { day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 }; const cutoff = maxAge[time]; if (cutoff) { const now = Date.now(); results = results.filter(r => now - r.createdAt <= cutoff); } }
    if (!decaying) results = results.filter(r => r.survivalProbability >= 0.2 && !r.isDecayed);
    switch (sort) {
      case 'heat': results.sort((a, b) => b.survivalProbability - a.survivalProbability); break;
      case 'newest': results.sort((a, b) => b.createdAt - a.createdAt); break;
      case 'replies': results.sort((a, b) => b.replyCount - a.replyCount); break;
      default: results.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);
    }
    const total = results.length;
    const offset = (page - 1) * pageSize;
    return NextResponse.json({ results: results.slice(offset, offset + pageSize), total, page, pageSize, hasMore: offset + pageSize < total });
  } catch (err) {
    return NextResponse.json({ results: [], total: 0, page, pageSize, hasMore: false, error: err instanceof Error ? err.message : 'Search failed' }, { status: 500 });
  }
}
