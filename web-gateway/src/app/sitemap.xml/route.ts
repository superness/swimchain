import { getConfig } from '@/lib/config/gateway';
import { fetchSitemapEntries, type SitemapEntry } from '@/lib/node-service';

export const dynamic = 'force-dynamic';

/**
 * Dynamic sitemap generation for SEO
 *
 * Lists all indexable content on the gateway:
 * - Static pages (about, spaces listing)
 * - Active spaces (live from list_spaces)
 * - Active posts above the decay threshold (live from list_space_content)
 * - Active author profiles
 *
 * When the node is unreachable, only the static routes are emitted.
 */
export async function GET(): Promise<Response> {
  let baseUrl = 'https://gateway.swimchain.network';
  try {
    const config = getConfig();
    baseUrl = config.publicUrl;
  } catch {
    // Use env/default if config not available
    baseUrl = process.env.GATEWAY_PUBLIC_URL || baseUrl;
  }
  // Strip trailing slash so joined paths stay canonical
  baseUrl = baseUrl.replace(/\/+$/, '');

  const entries = await fetchSitemapEntries(baseUrl);
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
