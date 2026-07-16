import { useCallback, useEffect, useState } from 'react';

/**
 * Keep the currently-open room id in the URL query (`?<param>=<id>`) so that:
 *  - opening a room pushes a history entry → the browser Back button returns to
 *    the lobby (and Forward re-opens the room) instead of leaving the app, and
 *  - the URL is a shareable deep link — pasting `…/?<param>=<id>` opens straight
 *    into that room.
 *
 * Drop-in replacement for `const [openId, setOpenId] = useState<string|null>(null)`:
 * `setOpenId(id)` navigates (pushes history + updates the URL); Back/Forward and
 * a fresh deep-link load are reflected back into the returned id.
 */
export function useUrlRoom(param: string): [string | null, (id: string | null) => void] {
  const read = () => new URLSearchParams(window.location.search).get(param);
  const [id, setId] = useState<string | null>(read);

  const setOpenId = useCallback(
    (next: string | null) => {
      setId(next);
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(param, next);
      else url.searchParams.delete(param);
      // Same URL (e.g. re-selecting the current room) → don't stack history.
      if (url.toString() !== window.location.href) {
        window.history.pushState({ room: next }, '', url.toString());
      }
    },
    [param]
  );

  // Back/Forward (and any external history change) re-reads the id from the URL.
  useEffect(() => {
    const onPop = () => setId(new URLSearchParams(window.location.search).get(param));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [param]);

  return [id, setOpenId];
}

/** Build a shareable deep link to a room on the current page. */
export function roomLink(param: string, id: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(param, id);
  return url.toString();
}
