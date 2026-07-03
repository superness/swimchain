/**
 * Polite MediaWiki Action API client.
 *
 * - Identifies itself with a User-Agent (MediaWiki etiquette:
 *   https://meta.wikimedia.org/wiki/User-Agent_policy)
 * - Throttles to at most 1 request/second
 * - Fetches ONLY the requested pages / one category listing.
 *   It never crawls beyond the requested set.
 */

const DEFAULT_USER_AGENT =
  'swimchain-wiki-import/0.1 (https://github.com/superness/swimchain; wiki seeding tool)';

export class MediaWikiClient {
  /**
   * @param {string} baseUrl - Wiki base URL, e.g. https://en.wikipedia.org
   * @param {{ userAgent?: string, throttleMs?: number }} [opts]
   */
  constructor(baseUrl, opts = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.throttleMs = opts.throttleMs ?? 1000;
    this.apiUrl = null;
    this.lastRequestAt = 0;
  }

  /** Wait so that requests are spaced at least `throttleMs` apart. */
  async throttle() {
    const now = Date.now();
    const wait = this.lastRequestAt + this.throttleMs - now;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestAt = Date.now();
  }

  /**
   * Locate api.php. Wikipedia-family wikis use /w/api.php, Fandom and many
   * self-hosted wikis use /api.php.
   */
  async resolveApi() {
    if (this.apiUrl) return this.apiUrl;
    const candidates = [`${this.baseUrl}/w/api.php`, `${this.baseUrl}/api.php`];
    for (const candidate of candidates) {
      await this.throttle();
      try {
        const res = await fetch(`${candidate}?action=query&meta=siteinfo&format=json`, {
          headers: { 'User-Agent': this.userAgent },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) continue;
        const json = await res.json();
        if (json?.query?.general) {
          this.apiUrl = candidate;
          return candidate;
        }
      } catch {
        // try next candidate
      }
    }
    throw new Error(
      `Could not locate a MediaWiki Action API at ${this.baseUrl} (tried /w/api.php and /api.php)`,
    );
  }

  /** Throttled GET against api.php. `params` is a plain object. */
  async request(params) {
    const api = await this.resolveApi();
    const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    await this.throttle();
    const res = await fetch(`${api}?${qs}`, {
      headers: { 'User-Agent': this.userAgent },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`MediaWiki API HTTP ${res.status} for ${api}?${qs}`);
    }
    const json = await res.json();
    if (json.error) {
      throw new Error(`MediaWiki API error: ${json.error.code}: ${json.error.info}`);
    }
    return json;
  }

  /**
   * Site metadata + declared license.
   * @returns {Promise<{sitename: string, server: string, articlePath: string,
   *                    license: {text: string, url: string}}>}
   */
  async getSiteInfo() {
    const json = await this.request({
      action: 'query',
      meta: 'siteinfo',
      siprop: 'general|rightsinfo',
    });
    const general = json.query.general;
    const rights = json.query.rightsinfo ?? {};
    let server = general.server ?? this.baseUrl;
    if (server.startsWith('//')) server = `https:${server}`;
    return {
      sitename: general.sitename,
      server,
      articlePath: general.articlepath ?? '/wiki/$1',
      license: {
        text: rights.text ?? '',
        url: rights.url ?? '',
      },
    };
  }

  /** Canonical URL of an article on the source wiki. */
  articleUrl(siteInfo, title) {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'))
      .replace(/%2F/g, '/')
      .replace(/%3A/g, ':');
    return siteInfo.server + siteInfo.articlePath.replace('$1', encoded);
  }

  /**
   * Fetch the current wikitext of one page (follows redirects).
   * @returns {Promise<{title: string, wikitext: string} | null>} null if missing
   */
  async getPageWikitext(title) {
    const json = await this.request({
      action: 'query',
      titles: title,
      prop: 'revisions',
      rvslots: 'main',
      rvprop: 'content',
      redirects: '1',
    });
    const page = json.query?.pages?.[0];
    if (!page || page.missing || page.invalid) return null;
    const content = page.revisions?.[0]?.slots?.main?.content;
    if (typeof content !== 'string') return null;
    return { title: page.title, wikitext: content };
  }

  /**
   * List page titles in a category (single listing, capped — no crawling).
   * @param {string} category - e.g. "Category:Distributed algorithms"
   * @param {number} [limit=50]
   * @returns {Promise<string[]>}
   */
  async getCategoryMembers(category, limit = 50) {
    const name = category.startsWith('Category:') ? category : `Category:${category}`;
    const titles = [];
    let cmcontinue;
    while (titles.length < limit) {
      const params = {
        action: 'query',
        list: 'categorymembers',
        cmtitle: name,
        cmtype: 'page',
        cmlimit: String(Math.min(50, limit - titles.length)),
      };
      if (cmcontinue) params.cmcontinue = cmcontinue;
      const json = await this.request(params);
      for (const m of json.query?.categorymembers ?? []) {
        titles.push(m.title);
      }
      cmcontinue = json.continue?.cmcontinue;
      if (!cmcontinue) break;
    }
    return titles.slice(0, limit);
  }
}

/**
 * License gate: the whole point of this tool. Only CC BY-SA sources may be
 * imported (Wikipedia, most Fandom wikis). Everything else is rejected.
 */
export function assertCcBySa(license) {
  const text = `${license.text} ${license.url}`;
  const ok = /CC[\s_-]?BY[\s_-]?SA|Creative\s+Commons\s+Attribution[\s-]?Share[\s-]?Alike|creativecommons\.org\/licenses\/by-sa/i.test(
    text,
  );
  if (!ok) {
    throw new Error(
      `License gate: source wiki license is "${license.text || 'unknown'}" (${license.url || 'no url'}) — ` +
        'not CC BY-SA. Import refused. This tool only imports from CC BY-SA wikis.',
    );
  }
}
