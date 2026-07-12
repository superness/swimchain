import { NextRequest } from 'next/server';
import { getRpc } from '@/lib/rpc';

/**
 * Media proxy: resolve a content-addressed `swim:<hash>` media ref to real
 * bytes the browser can render. Post bodies reference images by hash; the node
 * holds the blob (view-to-host) and `get_media` returns it base64-encoded, so
 * we decode and stream it with the node-reported content type.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;
  const clean = decodeURIComponent(hash)
    .replace(/^swim:/, '')
    .replace(/^sha256:/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    return new Response('Invalid media hash', { status: 400 });
  }

  try {
    const rpc = getRpc();
    const media = await rpc.getMedia(clean);
    const bytes = Buffer.from(media.data, 'base64');
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': media.media_type || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        // Content-addressed: the bytes for a hash never change → cache hard.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    // Node offline, or the blob isn't held / retrievable right now.
    return new Response('Media not available', { status: 404 });
  }
}
