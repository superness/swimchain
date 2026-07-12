'use client';

import { withBase } from '@/lib/base-path';
import { DownloadCTA } from '@/components/DownloadCTA';

export function HomePageContent() {
  return (
    <div className="home-page">
      <section className="hero">
        <h1>Welcome to Swimchain</h1>
        <p className="hero-tagline">
          Decentralized forums where content persists through engagement, not moderators.
        </p>
        <div className="hero-actions">
          <a href={withBase('/search')} className="button-primary">
            Search Content
          </a>
          <a href={withBase('/spaces')} className="button-secondary">
            Browse Spaces
          </a>
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <h3>Organic Moderation</h3>
          <p>
            Content naturally decays over time. Community engagement keeps valuable
            discussions alive while low-quality content fades away.
          </p>
          <a href={withBase('/about#decay')}>Learn about content decay</a>
        </div>

        <div className="feature">
          <h3>Transparent Ranking</h3>
          <p>
            No hidden algorithms. Search results are ranked using a fixed, public formula.
            You can verify how every result is scored.
          </p>
          <a href={withBase('/docs/search-ranking')}>See the ranking formula</a>
        </div>

        <div className="feature">
          <h3>Cryptographic Identity</h3>
          <p>
            No email or phone required. Your identity is a cryptographic keypair.
            Persistent pseudonymity with no central authority.
          </p>
          <a href={withBase('/about#identity')}>Learn about identities</a>
        </div>
      </section>

      <section className="trending">
        <h2>Spaces</h2>
        <p>
          Browse the spaces this gateway currently sees on the network &mdash;
          communities are created and named by their participants, not
          pre-seeded here.
        </p>
        <a href={withBase('/spaces')} className="view-all">Browse all spaces</a>
      </section>

      <section className="cta-section">
        <DownloadCTA variant="banner" context="generic" />
      </section>

      <section className="read-only-notice">
        <h3>This is a Read-Only Gateway</h3>
        <p>
          You can browse and search all public Swimchain content, but this gateway
          does not support posting, replying, or engaging with content. To participate
          fully, download the Swimchain client.
        </p>
      </section>

      <style jsx>{`
        .home-page {
          max-width: 900px;
          margin: 0 auto;
        }

        .hero {
          text-align: center;
          padding: 3rem 0;
          border-bottom: 1px solid var(--color-border);
          margin-bottom: 3rem;
        }

        .hero h1 {
          font-size: 2.5rem;
          margin-bottom: 1rem;
        }

        .hero-tagline {
          font-size: 1.25rem;
          color: var(--color-text-muted);
          max-width: 600px;
          margin: 0 auto 2rem;
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .button-primary {
          background: var(--color-primary);
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-weight: 500;
          text-decoration: none;
        }

        .button-primary:hover {
          background: var(--color-primary-hover);
          text-decoration: none;
        }

        .button-secondary {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-weight: 500;
          text-decoration: none;
        }

        .button-secondary:hover {
          border-color: var(--color-text-muted);
          text-decoration: none;
        }

        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 2rem;
          margin-bottom: 3rem;
        }

        .feature {
          padding: 1.5rem;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 8px;
        }

        .feature h3 {
          font-size: 1.1rem;
          margin-bottom: 0.75rem;
        }

        .feature p {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          line-height: 1.6;
          margin-bottom: 0.75rem;
        }

        .feature a {
          font-size: 0.85rem;
        }

        .trending {
          margin-bottom: 3rem;
        }

        .trending h2 {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .space-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .space-preview {
          display: block;
          padding: 1rem;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          text-decoration: none;
        }

        .space-preview:hover {
          border-color: var(--color-primary);
          text-decoration: none;
        }

        .space-preview strong {
          display: block;
          color: var(--color-text);
          margin-bottom: 0.25rem;
        }

        .space-preview span {
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }

        .view-all {
          font-size: 0.9rem;
        }

        .cta-section {
          margin-bottom: 3rem;
        }

        .read-only-notice {
          text-align: center;
          padding: 2rem;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 8px;
        }

        .read-only-notice h3 {
          font-size: 1.1rem;
          margin-bottom: 0.75rem;
        }

        .read-only-notice p {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
