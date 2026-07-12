import { withBase } from '@/lib/base-path';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Swimchain',
  description: 'Learn about Swimchain - decentralized forums with organic moderation through content decay, transparent ranking, and no central authority.',
  openGraph: {
    title: 'About Swimchain',
    description: 'Decentralized forums with organic moderation',
    url: '/about',
  },
};

export default function AboutPage() {
  return (
    <div className="about-page">
      <header className="page-header">
        <h1>About Swimchain</h1>
        <p className="tagline">
          Decentralized forums with organic moderation
        </p>
      </header>

      <section className="section">
        <h2>What is Swimchain?</h2>
        <p>
          Swimchain is a decentralized social platform where content persistence
          is determined by community engagement, not moderator decisions or
          algorithmic curation.
        </p>
        <p>
          Unlike traditional platforms, Swimchain has:
        </p>
        <ul>
          <li><strong>No central servers</strong> - Run your own node</li>
          <li><strong>No moderators</strong> - Content persists through engagement</li>
          <li><strong>No algorithms</strong> - Transparent, fixed ranking</li>
          <li><strong>No advertising</strong> - Proof-of-work prevents spam</li>
        </ul>
      </section>

      <section className="section" id="why">
        <h2>Why Swimchain?</h2>
        <p>
          We wanted a place to socialize online without being the product.
          Modern platforms eventually optimize for extraction: your attention
          sold to advertisers, your emotions farmed for engagement, your
          communities shaped by algorithms you can&apos;t see. Swimchain
          exists so that a few simple promises can actually hold &mdash;
          enforced by the protocol&apos;s design, not by a company&apos;s
          goodwill:
        </p>
        <ul>
          <li>
            <strong>No central authority</strong> &mdash; No one owns the
            network or the data, so no one can manipulate it. The chain is
            replicated across every node and protocol rules apply equally to
            everyone. There is no server to seize, no admin to pressure, no
            company to acquire &mdash; and if a community is ever captured,
            it can fork away and leave the attacker an empty chain.
          </li>
          <li>
            <strong>No advertisement</strong> &mdash; Advertising here
            isn&apos;t forbidden; it&apos;s economically pointless. There is
            no feed to inject into, no placement to buy, no targeting, and no
            metrics to prove an ad was ever seen. Posting costs proof-of-work
            instead of being paid for by ads, so nothing in the system needs
            to farm your attention or keep you scrolling.
          </li>
          <li>
            <strong>No political influence</strong> &mdash; There is no
            algorithm to buy and no amplification to capture. Everyone sees
            the same content, ranked by the same fixed, transparent formula
            &mdash; a shared experience, not fragments tailored to manipulate
            each person individually. Propagandists can speak, but they
            can&apos;t force anyone to listen: without organic engagement,
            their content simply decays away.
          </li>
          <li>
            <strong>No profiling data to sell</strong> &mdash; Your identity
            is a keypair, not an email or phone number. Every user runs a
            node, so there is no central server watching what you read,
            building a profile, or warehousing behavior data. There is
            nothing to collect and no one to sell it to.
          </li>
          <li>
            <strong>Just social media</strong> &mdash; People, spaces, and
            conversations &mdash; for participants, not consumers. Content
            lives while the community engages with it and drifts away when it
            stops mattering. The network is its users; if every developer
            disappeared tomorrow, the pool keeps swimming.
          </li>
        </ul>
      </section>

      <section className="section" id="decay">
        <h2>Content Decay</h2>
        <p>
          Content on Swimchain naturally decays over time unless the community
          engages with it. This creates &ldquo;organic moderation&rdquo;:
        </p>
        <ul>
          <li>New content starts at 100% heat</li>
          <li>Heat decays with a 7-day half-life</li>
          <li>Engagement resets the decay timer</li>
          <li>Below 6.25%, content is pruned</li>
        </ul>
        <p>
          This means valuable content persists because people engage with it,
          while low-quality content naturally fades away.
        </p>
      </section>

      <section className="section" id="ranking">
        <h2>Transparent Ranking</h2>
        <p>
          Search results are ranked using a fixed, transparent formula with
          no personalization:
        </p>
        <table className="ranking-table">
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
              <td>45%</td>
              <td>How well content matches your search</td>
            </tr>
            <tr>
              <td>Heat (Decay)</td>
              <td>30%</td>
              <td>Content&rsquo;s survival probability</td>
            </tr>
            <tr>
              <td>Engagement</td>
              <td>10%</td>
              <td>How many times content was engaged and how recently</td>
            </tr>
            <tr>
              <td>Recency</td>
              <td>15%</td>
              <td>How recently content was created</td>
            </tr>
          </tbody>
        </table>
        <p>
          <a href={withBase('/docs/search-ranking')}>Read the full ranking documentation</a>
        </p>
      </section>

      <section className="section" id="identity">
        <h2>Cryptographic Identity</h2>
        <p>
          Swimchain uses persistent pseudonymity:
        </p>
        <ul>
          <li>Your identity is a cryptographic keypair</li>
          <li>No email, no phone number, no real name required</li>
          <li>Reputation accumulates to your identity over time</li>
          <li>No password recovery - you own your keys</li>
        </ul>
        <p>
          This provides accountability (persistent identity) without surveillance
          (no real-world identity link).
        </p>
      </section>

      <section className="section" id="download">
        <h2>Download Swimchain</h2>
        <p>
          This web gateway provides read-only access. To participate fully:
        </p>
        <div className="download-options">
          <div className="download-option">
            <h3>Desktop (Full Node)</h3>
            <p>Run a full node on your computer. Best experience.</p>
            <ul>
              <li>Windows today &mdash; macOS and Linux next</li>
              <li>Full chain sync</li>
              <li>Forum, chat, feed, search, and wiki built in</li>
            </ul>
            <a href="https://swimchain.io/download" className="download-button">
              Download for Windows
            </a>
          </div>

          <div className="download-option">
            <h3>Mobile</h3>
            <p>Light client for on-the-go access.</p>
            <ul>
              <li>iOS and Android</li>
              <li>Light sync mode</li>
              <li>Touch-optimized</li>
            </ul>
            <span className="coming-soon">Coming Soon</span>
          </div>

          <div className="download-option">
            <h3>CLI / Build from source</h3>
            <p>For power users and automation.</p>
            <ul>
              <li>All platforms</li>
              <li>Scriptable</li>
              <li>Full feature access</li>
            </ul>
            <a href="https://swimchain.io/developers.html" className="download-button">
              Build instructions
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Learn More</h2>
        <ul className="link-list">
          <li><a href={withBase('/protocol')}>The Swimchain Protocol &mdash; how the mechanics work</a></li>
          <li><a href="https://github.com/superness/swimchain">GitHub Repository</a></li>
          <li><a href={withBase('/docs/search-ranking')}>Search Ranking Documentation</a></li>
          <li><a href={withBase('/docs/gateway-operation')}>Run Your Own Gateway</a></li>
        </ul>
      </section>
    </div>
  );
}