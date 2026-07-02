/**
 * Node Data Service - typed methods wrapping SwimchainRpc for pages
 */

import { getRpc, type ContentItem, type IdentityInfo, type SpaceInfo } from './rpc';
import { getSearchIndexer } from './search/indexer';

export interface SpaceSummary {
  space_id: string; space_name: string; description?: string; post_count: number; active_posts: number;
  unique_participants: number; last_activity: number; decay_health: number; created_at: number;
}
export interface PostSummary {
  contentId: string; spaceId: string; spaceName: string; authorId: string; title: string; body: string;
  createdAt: number; lastEngagement: number; replyCount: number; survivalProbability: number;
  isDecayed: boolean; isProtected: boolean; hoursUntilDecay: number | null;
  pool: { poolId: string; contributedSeconds: number; requiredSeconds: number; contributorCount: number; timeRemainingMs: number | null; progressPercentage: number; } | null;
  scoreBreakdown: { textRelevance: number; heatDecay: number; engagementPool: number; recency: number; totalScore: number; contributions: { textRelevance: number; heatDecay: number; engagementPool: number; recency: number; }; };
}

function computeDecayHealth(content: ContentItem): number { return Math.round((content.survival_probability ?? 0) * 100); }
function computeHeatDecay(sp: number): number { return Math.round(sp * 100); }
function computeRecency(ca: number): number { const h = (Date.now() - ca) / 3_600_000; return h <= 0 ? 100 : Math.max(0, Math.round(100 * Math.exp(-h / 24))); }
function extractTitle(body: string | null): string { if (!body) return '[No content]'; const fl = body.split('\n')[0]?.trim() ?? ''; if (fl.length > 0 && fl.length <= 100) return fl; return body.length <= 100 ? body.trim() : body.slice(0, 97).trim() + '...'; }
function createSnippet(body: string): string { return body.length <= 200 ? body.trim() : body.slice(0, 197).trim() + '...'; }

function contentToPostSummary(content: ContentItem, spaceName?: string): PostSummary {
  const title = content.title || extractTitle(content.body);
  const body = content.body ? createSnippet(content.body) : '';
  const heat = computeHeatDecay(content.survival_probability);
  const pool = { poolId: 'pool-' + content.content_id, contributedSeconds: Math.min(60, content.engagement_count * 5), requiredSeconds: 60, contributorCount: content.engagement_count, timeRemainingMs: null, progressPercentage: Math.min(100, Math.round((content.engagement_count * 5 / 60) * 100)) };
  return {
    contentId: content.content_id, spaceId: content.space_id, spaceName: spaceName || content.space_id,
    authorId: content.author_id, title, body, createdAt: content.created_at, lastEngagement: content.last_engagement || content.created_at,
    replyCount: content.reply_count || 0, survivalProbability: content.survival_probability, isDecayed: content.is_decayed,
    isProtected: false, hoursUntilDecay: content.is_decayed ? null : Math.round(heat / 6.25) * 24,
    pool, scoreBreakdown: { textRelevance: 0, heatDecay: heat, engagementPool: pool.progressPercentage, recency: computeRecency(content.created_at), totalScore: heat * 0.25 + pool.progressPercentage * 0.20 + computeRecency(content.created_at) * 0.15, contributions: { textRelevance: 0, heatDecay: heat * 0.25, engagementPool: pool.progressPercentage * 0.20, recency: computeRecency(content.created_at) * 0.15 } },
  };
}

export async function fetchAllSpaces(): Promise<SpaceSummary[]> {
  try {
    const rpc = getRpc();
    const spaces: SpaceInfo[] = await rpc.getAllSpaces();
    return await Promise.all(spaces.map(async (space) => {
      let activePosts = 0, uniqueParticipants = 0, decayHealth = 0;
      try {
        const content = await rpc.getSpaceContent(space.space_id, 100);
        activePosts = content.filter(c => !c.is_decayed).length;
        uniqueParticipants = new Set(content.map(c => c.author_id)).size;
        decayHealth = content.length > 0 ? Math.round(content.reduce((s, c) => s + computeDecayHealth(c), 0) / content.length) : 0;
      } catch { /* empty */ }
      return { space_id: space.space_id, space_name: space.name, description: space.description, post_count: space.post_count, active_posts: activePosts, unique_participants: uniqueParticipants, last_activity: space.last_activity ?? 0, decay_health: decayHealth, created_at: 0 };
    }));
  } catch { return []; }
}

export async function fetchSpaceWithPosts(spaceId: string): Promise<{ space: SpaceSummary; posts: PostSummary[] } | null> {
  try {
    const rpc = getRpc();
    const [spaceInfo, contentItems] = await Promise.all([rpc.getSpaceInfo(spaceId), rpc.getSpaceContent(spaceId, 100)]);
    const space: SpaceSummary = {
      space_id: spaceInfo.space_id, space_name: spaceInfo.name, description: spaceInfo.description, post_count: spaceInfo.post_count,
      active_posts: contentItems.filter(c => !c.is_decayed).length, unique_participants: new Set(contentItems.map(c => c.author_id)).size,
      last_activity: spaceInfo.last_activity ?? 0, decay_health: contentItems.length > 0 ? Math.round(contentItems.reduce((s, c) => s + computeDecayHealth(c), 0) / contentItems.length) : 0, created_at: 0,
    };
    return { space, posts: contentItems.map(c => contentToPostSummary(c, spaceInfo.name)) };
  } catch { return null; }
}

export async function fetchIdentityWithPosts(address: string): Promise<{ identity: IdentityInfo; posts: PostSummary[] } | null> {
  try {
    const rpc = getRpc();
    const [identityInfo, contentItems] = await Promise.all([rpc.getIdentityInfo(address), rpc.getContentByIdentity(address, 100)]);
    return { identity: identityInfo, posts: contentItems.map(c => contentToPostSummary(c)) };
  } catch { return null; }
}

export async function searchContent(query: string, limit = 50, offset = 0): Promise<PostSummary[]> {
  try {
    const r = await getRpc().search({ query, limit, offset });
    return r.results.map(r => ({
      contentId: r.content_id, spaceId: r.space_id, spaceName: r.space_name || r.space_id, authorId: r.author_id,
      title: r.title || extractTitle(r.body), body: createSnippet(r.body || ''), createdAt: r.created_at,
      lastEngagement: r.last_engagement, replyCount: r.reply_count, survivalProbability: r.survival_probability,
      isDecayed: r.is_decayed, isProtected: false, hoursUntilDecay: r.is_decayed ? null : Math.round((r.survival_probability / 6.25) * 24),
      pool: { poolId: 'pool-' + r.content_id, contributedSeconds: Math.min(60, r.engagement_count * 5), requiredSeconds: 60, contributorCount: r.engagement_count, timeRemainingMs: null, progressPercentage: Math.min(100, Math.round((r.engagement_count * 5 / 60) * 100)) },
      scoreBreakdown: { textRelevance: Math.round(r.score * 100) / 100, heatDecay: computeHeatDecay(r.survival_probability), engagementPool: Math.min(100, r.engagement_count * 5), recency: computeRecency(r.created_at), totalScore: r.score, contributions: { textRelevance: 0, heatDecay: 0, engagementPool: 0, recency: 0 } },
    }));
  } catch { return []; }
}

export async function fetchSitemapEntries(): Promise<Array<{ url: string; lastmod?: string; changefreq?: string; priority?: number }>> {
  const baseUrl = process.env.GATEWAY_PUBLIC_URL || 'https://gateway.swimchain.network';
  const entries: Array<{ url: string; lastmod?: string; changefreq?: string; priority?: number }> = [
    { url: baseUrl + '/', changefreq: 'daily', priority: 1.0 },
    { url: baseUrl + '/about', changefreq: 'monthly', priority: 0.8 },
    { url: baseUrl + '/spaces', changefreq: 'hourly', priority: 0.9 },
    { url: baseUrl + '/search', changefreq: 'always', priority: 0.7 },
    { url: baseUrl + '/docs/search-ranking', changefreq: 'monthly', priority: 0.6 },
    { url: baseUrl + '/docs/gateway-operation', changefreq: 'monthly', priority: 0.5 },
  ];
  try {
    const rpc = getRpc();
    const spaces = await rpc.getAllSpaces();
    for (const space of spaces) { entries.push({ url: baseUrl + '/spaces/' + space.space_id, lastmod: space.last_activity ? new Date(space.last_activity).toISOString() : undefined, changefreq: 'hourly', priority: 0.7 }); }
    const allContent = await rpc.listAllContent(200, 0);
    for (const item of allContent) { if (item.is_decayed) continue; entries.push({ url: baseUrl + '/s/' + item.space_id + '/' + item.content_id, lastmod: new Date(item.last_engagement || item.created_at).toISOString(), changefreq: 'daily', priority: Math.min(0.9, 0.5 + item.survival_probability * 0.4) }); }
    const authorIds = new Set(allContent.map(c => c.author_id));
    for (const a of authorIds) { entries.push({ url: baseUrl + '/u/' + a, changefreq: 'weekly', priority: 0.5 }); }
  } catch { /* static-only fallback */ }
  return entries;
}

export async function feedSearchIndexer(): Promise<number> {
  try {
    const rpc = getRpc();
    const indexer = getSearchIndexer();
    indexer.clear();
    let offset = 0, total = 0;
    while (true) {
      const batch = await rpc.listAllContent(100, offset);
      if (batch.length === 0) break;
      for (const item of batch) {
        if (item.is_decayed) continue;
        indexer.addDocument({
          item: { content_id: item.content_id, author_id: item.author_id, signature: '', created_at: item.created_at, last_engagement: item.last_engagement || item.created_at, content_type: (item.content_type || 'POST') as 'POST' | 'REPLY' | 'QUOTE', parent_id: item.parent_id, space_id: item.space_id, body_inline: item.body, content_hash: null, content_size: item.body ? item.body.length : null, pow_nonce: 0, pow_difficulty: 0, engagement_count: item.engagement_count },
          survival_probability: item.survival_probability, is_decayed: item.is_decayed, is_protected: false, hours_until_decay: item.is_decayed ? null : Math.round((item.survival_probability / 6.25) * 24), pool: null,
        });
        total++;
      }
      offset += batch.length;
      if (batch.length < 100) break;
    }
    return total;
  } catch { return 0; }
}
