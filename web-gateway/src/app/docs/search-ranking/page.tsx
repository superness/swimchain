import type { Metadata } from 'next';
import { RANKING_WEIGHTS, DECAY_THRESHOLD } from '@/types/search';

export const metadata: Metadata = {
  title: 'Search Ranking Documentation',
  description: 'Complete documentation of Swimchain\'s transparent search ranking algorithm. Learn how results are scored and ranked.',
  openGraph: {
    title: 'Search Ranking - Swimchain',
    description: 'Transparent ranking algorithm documentation',
    url: '/docs/search-ranking',
  },
};

export default function SearchRankingDocsPage() {
  return (
    <div className="docs-page">
      <header className="docs-header">
        <h1>Search Ranking Documentation</h1>
        <p className="docs-intro">
          Swimchain uses a transparent, fixed ranking algorithm with no personalization.
          Every user sees the same results for the same query. This document explains
          exactly how search results are ranked.
        </p>
      </header>

      <section className="docs-section">
        <h2>Ranking Formula</h2>
        <p>
          The final score for each search result is calculated as a weighted sum of
          four normalized factors:
        </p>

        <div className="formula">
          <code>
            score = (TEXT_RELEVANCE × {RANKING_WEIGHTS.TEXT_RELEVANCE}) +
                    (HEAT_DECAY × {RANKING_WEIGHTS.HEAT_DECAY}) +
                    (ENGAGEMENT_POOL × {RANKING_WEIGHTS.ENGAGEMENT_POOL}) +
                    (RECENCY × {RANKING_WEIGHTS.RECENCY})
          </code>
        </div>

        <table className="weights-table">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Weight</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Text Relevance</td>
              <td>{(RANKING_WEIGHTS.TEXT_RELEVANCE * 100).toFixed(0)}%</td>
              <td>How well the content matches your search query</td>
            </tr>
            <tr>
              <td>Heat (Decay)</td>
              <td>{(RANKING_WEIGHTS.HEAT_DECAY * 100).toFixed(0)}%</td>
              <td>Content&apos;s survival probability based on decay</td>
            </tr>
            <tr>
              <td>Engagement Pool</td>
              <td>{(RANKING_WEIGHTS.ENGAGEMENT_POOL * 100).toFixed(0)}%</td>
              <td>Progress toward engagement threshold (0-60 seconds)</td>
            </tr>
            <tr>
              <td>Recency</td>
              <td>{(RANKING_WEIGHTS.RECENCY * 100).toFixed(0)}%</td>
              <td>How recently the content was created</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="docs-section">
        <h2>Factor Normalization</h2>

        <h3>Text Relevance (0-1)</h3>
        <p>
          Raw scores from the search engine (lunr.js) are normalized using a
          logarithmic scale to prevent outliers from dominating:
        </p>
        <code className="code-block">
          normalized = log(1 + rawScore) / log(1 + MAX_EXPECTED_SCORE)
        </code>
        <p>Where MAX_EXPECTED_SCORE = 100. Values are clamped to [0, 1].</p>

        <h3>Heat/Decay (0-1)</h3>
        <p>
          Survival probability is used directly. Content below the decay threshold
          ({(DECAY_THRESHOLD * 100).toFixed(2)}%) receives a score of 0:
        </p>
        <code className="code-block">
          if (survivalProbability &lt; {DECAY_THRESHOLD}) return 0;
          return survivalProbability;
        </code>

        <h3>Engagement Pool (0-1)</h3>
        <p>
          Pool progress is normalized as a percentage of the 60-second requirement:
        </p>
        <code className="code-block">
          normalized = min(1, contributedSeconds / 60)
        </code>
        <p>Content with no active pool returns 0.</p>

        <h3>Recency (0-1)</h3>
        <p>
          Exponential decay based on content age, with a 7-day half-life matching
          the heat decay model:
        </p>
        <code className="code-block">
          HALF_LIFE = 7 × 24 × 60 × 60 × 1000 ms
          ageMs = now - createdAt
          normalized = 2^(-ageMs / HALF_LIFE)
        </code>
      </section>

      <section className="docs-section">
        <h2>Why These Weights?</h2>

        <h3>Text Relevance (40%)</h3>
        <p>
          Search should primarily return relevant results. If you search for &quot;rust async&quot;,
          content about Rust async programming should rank higher than unrelated content,
          even if that content has more engagement.
        </p>

        <h3>Heat/Decay (25%)</h3>
        <p>
          Content that the community values (keeps alive through engagement) should
          rank higher. This reflects the core Swimchain principle: valuable content
          persists, low-quality content fades.
        </p>

        <h3>Engagement Pool (20%)</h3>
        <p>
          Active engagement is a signal of current interest. Content being actively
          preserved right now is likely valuable to searchers.
        </p>

        <h3>Recency (15%)</h3>
        <p>
          Newer content gets a small boost, balancing freshness against the other
          quality signals. This prevents search results from becoming stale.
        </p>
      </section>

      <section className="docs-section">
        <h2>No Personalization</h2>
        <p>
          Unlike traditional search engines, Swimchain does not personalize results.
          There is no:
        </p>
        <ul>
          <li>User history tracking</li>
          <li>Behavioral profiling</li>
          <li>A/B testing of rankings</li>
          <li>Advertiser influence</li>
          <li>Editorial boosting or suppression</li>
        </ul>
        <p>
          The ranking algorithm is deterministic: given the same query and the same
          content state, every user sees the same results.
        </p>
      </section>

      <section className="docs-section">
        <h2>Score Visibility</h2>
        <p>
          Every search result displays its score breakdown, showing exactly how it
          was ranked. This transparency allows you to:
        </p>
        <ul>
          <li>Understand why results appear in a certain order</li>
          <li>Verify the algorithm is working as documented</li>
          <li>Make informed decisions about content quality</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2>Source Code</h2>
        <p>
          The ranking algorithm is open source. You can review the implementation:
        </p>
        <ul>
          <li>
            <a href="https://github.com/swimchain/web-gateway/blob/main/src/lib/search/ranking.ts">
              ranking.ts - Score calculation
            </a>
          </li>
          <li>
            <a href="https://github.com/swimchain/web-gateway/blob/main/src/lib/search/normalize.ts">
              normalize.ts - Factor normalization
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
