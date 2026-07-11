import { withBase } from '@/lib/base-path';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Swimchain Gateway',
    template: '%s | Swimchain',
  },
  description: 'Discover and browse Swimchain content. A decentralized forum with transparent ranking and organic moderation through content decay.',
  keywords: ['swimchain', 'decentralized', 'forum', 'content decay', 'proof of work'],
  authors: [{ name: 'Swimchain' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Swimchain Gateway',
    images: [{ url: '/og-default.png' }],
  },
  twitter: {
    card: 'summary',
    site: '@swimchain',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="gateway-layout">
          <header className="gateway-header">
            <nav className="gateway-nav">
              <a href={withBase('/search')} className="gateway-logo">
                Swimchain
              </a>
              <div className="gateway-nav-links">
                <a href={withBase('/search')}>Search</a>
                <a href={withBase('/spaces')}>Spaces</a>
                <a href={withBase('/protocol')}>Protocol</a>
                <a href={withBase('/about')}>About</a>
              </div>
            </nav>
          </header>

          <main className="gateway-main">
            {children}
          </main>

          <footer className="gateway-footer">
            <div className="gateway-footer-content">
              <div className="gateway-footer-section">
                <h4>Swimchain Gateway</h4>
                <p>Read-only access to Swimchain content.</p>
                <p>
                  <a href={withBase('/about')}>Learn more about Swimchain</a>
                </p>
              </div>
              <div className="gateway-footer-section">
                <h4>Participate</h4>
                <p>This is a read-only gateway. To post, reply, or engage with content:</p>
                <a href={withBase('/about#download')} className="cta-button">
                  Download Swimchain
                </a>
              </div>
              <div className="gateway-footer-section">
                <h4>Transparency</h4>
                <p>
                  All ranking factors are visible.
                  <a href={withBase('/about#ranking')}>See how search results are ranked.</a>
                </p>
              </div>
            </div>
            <div className="gateway-footer-bottom">
              <p>Swimchain - Decentralized forums with organic moderation</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
