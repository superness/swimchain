import { getConfig } from '@/lib/config/gateway';

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
 * - Active spaces
 * - Recent/active posts (above decay threshold)
 * - Active user profiles
 */
export async function GET(): Promise<Response> {
  let baseUrl = 'https://gateway.swimchain.network';
  try {
    const config = getConfig();
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

  // TODO: Fetch dynamic content from node when connected
  // For now, add mock entries to demonstrate structure

  // Active spaces
  const mockSpaces = ['rust', 'python', 'javascript', 'golang', 'crypto'];
  for (const space of mockSpaces) {
    entries.push({
      url: `${baseUrl}/spaces/${space}`,
      lastmod: new Date().toISOString(),
      changefreq: 'hourly',
      priority: 0.7,
    });
  }

  // Recent active posts (would be fetched from node)
  // Posts with high heat get higher priority
  const mockPosts = [
    { space: 'rust', id: 'async-traits-stable', heat: 0.85 },
    { space: 'python', id: 'gil-removal-progress', heat: 0.72 },
    { space: 'javascript', id: 'deno-2-release', heat: 0.68 },
  ];

  for (const post of mockPosts) {
    entries.push({
      url: `${baseUrl}/s/${post.space}/${post.id}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: Math.min(0.9, 0.5 + post.heat * 0.4),
    });
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
