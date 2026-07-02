import { NextResponse } from 'next/server';
import { feedSearchIndexer } from '@/lib/node-service';

export async function POST(): Promise<NextResponse> {
  try {
    const total = await feedSearchIndexer();
    return NextResponse.json({ success: true, total, searched: total, message: 'Search index populated with ' + total + ' documents' });
  } catch (err) {
    return NextResponse.json({ success: false, total: 0, searched: 0, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
