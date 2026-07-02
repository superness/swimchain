import { getNodeRpc } from '@/lib/node-rpc';

interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

/**
 * Dynamic sitemap generation for SEO
 *
 * Lists all indexable content on the gateway:
 * - Static pages (about, spaces listing)
 * - Active spaces (fetched live from node)
 * - Recent/active posts (fetched live from node)
 */
export async function GET(): Promise<Response> {
  let baseUrl = 'https://gateway.swimchain.network';
  try {
    const config = (await import('@/lib/config/gateway')).getConfig();
    baseUrl = config.publicUrl;
  } catch {
    // Use default if config not available
  }

  const entries: SitemapEntry[] = [];

  // Static pages
  entries.push({
    url: `${baseUrl}/`,
    changefreq: 'daily',
    priority: 1.0,
  });

  entries.push({
    url: `${baseUrl}/about`,
    changefreq: 'monthly',
    priority: 0.8,
  });

  entries.push({
    url: `${baseUrl}/spaces`,
    changefreq: 'hourly',
    priority: 0.9,
  });

  entries.push({
    url: `${baseUrl}/search`,
    changefreq: 'always',
    priority: 0.7,
  });

  entries.push({
    url: `${baseUrl}/docs/search-ranking`,
    changefreq: 'monthly',
    priority: 0.6,
  });

  entries.push({
    url: `${baseUrl}/docs/gateway-operation`,
    changefreq: 'monthly',
    priority: 0.5,
  });

  // Dynamic spaces from node
  // We only add a few spaces to keep the sitemap manageable
  try {
    const rpc = getNodeRpc();
    const spaces = await rpc.getAllSpaces();

    // Limit to top 20 spaces by activity
    const topSpaces = spaces
      .sort((a, b) => b.active_posts - a.active_posts)
      .slice(0, 20);

    for (const space of topSpaces) {
      entries.push({
        url: `${baseUrl}/spaces/${encodeURIComponent(space.space_id)}`,
        lastmod: space.last_activity ? new Date(space.last_activity).toISOString() : undefined,
        changefreq: 'hourly',
        priority: 0.7,
      });

      // Fetch recent posts for each space (limit to 10 per space)
      try {
        const posts = await rpc.getSpaceContent(space.space_id, 10, 0);
        for (const post of posts) {
          entries.push({
            url: `${baseUrl}/s/${encodeURIComponent(space.space_id)}/${encodeURIComponent(post.item.content_id)}`,
            lastmod: new Date(post.item.last_engagement).toISOString(),
            changefreq: 'daily',
            priority: Math.min(0.9, 0.5 + post.survival_probability * 0.4),
          });
        }
      } catch {
        // Skip posts for this space if it fails
      }
    }
  } catch {
    // Node unavailable — sitemap still works with static pages
  }

  // Generate XML
  const xml = generateSitemapXml(entries);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

function generateSitemapXml(entries: SitemapEntry[]): string {
  const urlElements = entries.map(entry => {
    let urlXml = `  <url>\n    <loc>${escapeXml(entry.url)}</loc>`;

    if (entry.lastmod) {
      urlXml += `\n    <lastmod>${entry.lastmod}</lastmod>`;
    }

    if (entry.changefreq) {
      urlXml += `\n    <changefreq>${entry.changefreq}</changefreq>`;
    }

    if (entry.priority !== undefined) {
      urlXml += `\n    <priority>${entry.priority.toFixed(1)}</priority>`;
    }

    urlXml += '\n  </url>';
    return urlXml;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements.join('\n')}
</urlset>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
