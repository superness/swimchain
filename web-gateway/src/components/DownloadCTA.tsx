'use client';

type CTAVariant = 'banner' | 'inline' | 'footer';
type CTAContext = 'postView' | 'spaceView' | 'search' | 'generic';

interface DownloadCTAProps {
  variant?: CTAVariant;
  context?: CTAContext;
}

const CTA_MESSAGES = {
  postView: {
    title: 'Want to reply or engage?',
    body: 'This is a read-only gateway. To participate:',
    actions: ['Reply to posts', 'Engage content (help it persist)', 'Create your own posts'],
  },
  spaceView: {
    title: 'Want to post in this space?',
    body: 'Download Swimchain to become a full participant:',
    actions: ['Create posts', 'Reply to discussions', 'Help preserve valuable content'],
  },
  search: {
    title: 'Found something interesting?',
    body: 'Download to engage and keep it alive:',
    actions: ['Engage to prevent decay', 'Reply with your thoughts', 'Join the community'],
  },
  generic: {
    title: 'Join Swimchain',
    body: 'Decentralized forums with organic moderation:',
    actions: ['No moderators - content persists through engagement', 'No algorithms - transparent ranking', 'No central servers - truly decentralized'],
  },
};

/**
 * Download client call-to-action component
 *
 * Variants:
 * - banner: Full-width at top/bottom of content pages
 * - inline: Compact CTA within content area
 * - footer: Site-wide footer CTA
 */
export function DownloadCTA({
  variant = 'inline',
  context = 'generic',
}: DownloadCTAProps) {
  const messages = CTA_MESSAGES[context];

  if (variant === 'banner') {
    return (
      <div className="cta-banner">
        <div className="cta-content">
          <h2 className="cta-title">{messages.title}</h2>
          <p className="cta-body">{messages.body}</p>
          <ul className="cta-actions">
            {messages.actions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
          <a href="/about#download" className="cta-button">
            Download Swimchain
          </a>
        </div>

        <style jsx>{`
          .cta-banner {
            background: linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg) 100%);
            border: 1px solid var(--color-primary);
            border-radius: 8px;
            padding: 2rem;
            text-align: center;
            margin: 1.5rem 0;
          }

          .cta-title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
          }

          .cta-body {
            color: var(--color-text-muted);
            margin-bottom: 1rem;
          }

          .cta-actions {
            list-style: none;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
            color: var(--color-text-muted);
          }

          .cta-actions li::before {
            content: "\\2713";
            color: var(--color-success);
            margin-right: 0.5rem;
          }

          .cta-button {
            display: inline-block;
            background: var(--color-primary);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-weight: 500;
            text-decoration: none;
            transition: background 0.15s;
          }

          .cta-button:hover {
            background: var(--color-primary-hover);
            text-decoration: none;
          }
        `}</style>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="cta-inline">
        <span className="cta-icon">📱</span>
        <div className="cta-text">
          <strong>{messages.title}</strong>
          <a href="/about#download">Download Swimchain</a>
        </div>

        <style jsx>{`
          .cta-inline {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            background: var(--color-bg-elevated);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            font-size: 0.9rem;
          }

          .cta-icon {
            font-size: 1.25rem;
          }

          .cta-text {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }

          .cta-text strong {
            font-size: 0.85rem;
          }

          .cta-text a {
            font-size: 0.85rem;
          }
        `}</style>
      </div>
    );
  }

  // Footer variant
  return (
    <div className="cta-footer">
      <h3 className="cta-title">{messages.title}</h3>
      <p className="cta-body">{messages.body}</p>
      <a href="/about#download" className="cta-button">
        Download Swimchain
      </a>

      <style jsx>{`
        .cta-footer {
          text-align: center;
        }

        .cta-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .cta-body {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          margin-bottom: 1rem;
        }

        .cta-button {
          display: inline-block;
          background: var(--color-primary);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 500;
          text-decoration: none;
          transition: background 0.15s;
        }

        .cta-button:hover {
          background: var(--color-primary-hover);
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}
