/**
 * Node-hosted images in wiki markdown.
 *
 * Swimchain is serverless — image bytes live in the node's blob store, fetched via the
 * `get_media` RPC (there is no HTTP media route). So a markdown image that points at node
 * media is written as `![alt](swim:<64-hex-hash>)` (the `get_media` hash from `upload_media`).
 * `sha256:<hash>` is also accepted.
 *
 * `renderMarkdown` turns that into `<img src="swim:<hash>">`, which the browser can't load.
 * `markMediaImages` rewrites those to `<img data-swim="<hash>">` (no src, so no broken-image
 * flash), and `resolveMediaImages` fetches the bytes and sets a `data:` URL once mounted.
 */

const MEDIA_SRC = /<img\s+src="(?:swim:|sha256:)?([0-9a-fA-F]{64})"/g;

/** Rewrite node-media `<img src>` to `<img data-swim>` so the browser doesn't try to load
 *  the unresolved ref. Run on the rendered HTML string before injecting it. */
export function markMediaImages(html: string): string {
  return html.replace(MEDIA_SRC, '<img data-swim="$1"');
}

/** Resolve every `<img data-swim>` in `container` by fetching its bytes via `getMediaUrl`
 *  and setting the real `data:` URL. Idempotent (skips already-resolved images). */
export async function resolveMediaImages(
  container: HTMLElement,
  getMediaUrl: (hash: string) => Promise<string | null>,
): Promise<void> {
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img[data-swim]'));
  await Promise.all(
    imgs.map(async (img) => {
      if (img.dataset.swimDone) return;
      img.dataset.swimDone = '1';
      const hash = img.getAttribute('data-swim');
      if (!hash) return;
      const url = await getMediaUrl(hash.toLowerCase());
      if (url) img.setAttribute('src', url);
    }),
  );
}
