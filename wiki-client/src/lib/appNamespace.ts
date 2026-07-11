/**
 * App-namespaced spaces — a general, self-describing space-naming convention shared with
 * the node (see `parse_app_space_name` in src/rpc/methods.rs). A space whose on-chain name
 * is `@<app>:<display>` belongs to a specialized client "app": the general social clients
 * (forum/feed/chat/search) hide ALL app spaces, and the matching app client shows only its
 * own. The node returns the parsed `app` tag and the CLEAN display name in list_spaces.
 *
 * This client is the "wiki" app.
 */

export const WIKI_APP = 'wiki';

/**
 * Build the on-chain space name for a wiki namespace from a clean display name.
 * The node derives the shared space id from (app, display) and returns the clean name back.
 */
export function wikiSpaceName(display: string): string {
  return `@${WIKI_APP}:${display.trim()}`;
}
