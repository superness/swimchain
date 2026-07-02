import { NextResponse } from 'next/server';
import { feedSearchIndexer } from '@/lib/node-service';

/**
 * POST /api/search/feed
 *
 * Repopulate the server-side search index from the connected node.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const total = await feedSearchIndexer();
    if (total === null) {
      return NextResponse.json(
        {
          success: false,
          total: 0,
          error: 'Node unreachable - search index not updated',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({
      success: true,
      total,
      message: `Search index populated with ${total} documents`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        total: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
