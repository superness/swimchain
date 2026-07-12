import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Run Your Own Gateway',
  description: 'Learn how to deploy and operate your own Swimchain web gateway. Complete guide with Docker setup, configuration, and monitoring.',
  openGraph: {
    title: 'Run Your Own Gateway - Swimchain',
    description: 'Deploy your own Swimchain web gateway',
    url: '/docs/gateway-operation',
  },
};

export default function GatewayOperationDocsPage() {
  return (
    <div className="docs-page">
      <header className="docs-header">
        <h1>Run Your Own Gateway</h1>
        <p className="docs-intro">
          Anyone can run a Swimchain web gateway. This guide covers deployment,
          configuration, and monitoring for gateway operators.
        </p>
      </header>

      <section className="docs-section">
        <h2>What is a Gateway?</h2>
        <p>
          A web gateway provides read-only HTTP access to Swimchain content. It connects
          to one or more Swimchain nodes and serves content to web browsers. Gateways:
        </p>
        <ul>
          <li>Index content for full-text search</li>
          <li>Render content as SEO-friendly HTML</li>
          <li>Apply rate limiting to prevent abuse</li>
          <li>Provide a familiar web browsing experience</li>
        </ul>
        <p>
          Gateways do <strong>not</strong> allow posting, replying, or engaging with content.
          That requires a full Swimchain client.
        </p>
      </section>

      <section className="docs-section">
        <h2>Why run a gateway?</h2>
        <p>
          Keeping the network open and readable is reason enough &mdash; a public gateway is
          community infrastructure, like running a Bitcoin node. But a gateway doesn&apos;t
          have to mirror all of Swimchain. It&apos;s just a node plus a rendering layer, and{' '}
          <strong>you choose the slice</strong>: one space, a curated set, or your own
          namespace. That makes Swimchain a <strong>headless, self-moderating content
          backend</strong> &mdash; think Contentful or Sanity, but decentralized, un-censorable,
          and with identity and anti-spam already built in. You point a bespoke frontend at the
          slice you care about and ship a product with <strong>no database and no server of
          your own</strong>.
        </p>

        <h3>Example: a news site with no backend</h3>
        <p>
          Say you want to run a news site. On the network you create a space for it &mdash;
          public, private, or its own app namespace &mdash; and your editors publish articles
          into it from a normal Swimchain client. Your website runs a gateway pointed at just
          that space and renders the articles as a clean, branded feed at your domain. Readers
          see a news site; they never know or care that the &ldquo;CMS&rdquo; is a P2P network.
          There is no content database to run, back up, or get breached, and nobody &mdash; not
          even you &mdash; can quietly rewrite what was published, because the record lives on
          the chain.
        </p>
        <p>
          This is <em>publishing</em>, not social media: readers just read, no one needs an
          account, and the whole thing is a thin frontend over a slice of the network. The
          existing <strong>wiki client</strong> already works exactly this way &mdash; it&apos;s
          a gateway-shaped frontend scoped to wiki spaces, presented as an ordinary wiki.
        </p>

        <h3>Adding interaction, when you want it</h3>
        <p>
          A read-only gateway is deliberately read-only &mdash; that&apos;s what makes it safe
          to expose publicly. When you do want visitors to participate, you have options:
        </p>
        <ul>
          <li>
            <strong>Let readers bring their own identity.</strong> A visitor who runs a
            Swimchain client can comment or reply as themselves &mdash; you just link the
            thread. Their keys stay on their device; you host nothing.
          </li>
          <li>
            <strong>Proxy identities for visitors (advanced).</strong> With some work your site
            can post on a visitor&apos;s behalf through a node&apos;s JSON-RPC &mdash; e.g. a
            comment box under each article. Just know the tradeoff: if your server holds the
            keys, you&apos;ve taken on custody, so scope those identities narrowly. Posting is
            still sponsorship- and proof-of-work-gated, so you inherit spam resistance for free.
          </li>
          <li>
            <strong>Ship a full client instead.</strong> If the goal is real many-user
            interaction, distribute an app where each user runs their own node and owns their
            keys &mdash; see the <a href="https://swimchain.io/developers.html">developer
            docs</a> for the node RPC surface.
          </li>
        </ul>
        <p>
          The through-line: you decide the slice and the presentation; the network is the
          invisible, un-censorable, self-moderating database. &ldquo;No servers&rdquo; stops
          being a constraint and becomes &ldquo;I shipped a content product with zero backend
          and zero moderation code.&rdquo;
        </p>
      </section>

      <section className="docs-section">
        <h2>Quick Start with Docker</h2>
        <p>The fastest way to run a gateway:</p>

        <h3>1. Clone the repository</h3>
        <pre className="code-block">
{`git clone https://github.com/superness/swimchain.git
cd swimchain/web-gateway`}
        </pre>

        <h3>2. Configure environment</h3>
        <p>Create a <code>.env</code> file:</p>
        <pre className="code-block">
{`# Gateway identity
GATEWAY_NAME="My Swimchain Gateway"
GATEWAY_OPERATOR="Your Name or Organization"
GATEWAY_URL="https://your-domain.com"

# Node connection
NODE_URL="ws://your-swimchain-node:8765"

# Rate limiting (requests per minute per IP)
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000`}
        </pre>

        <h3>3. Start the gateway</h3>
        <pre className="code-block">
{`docker-compose up -d`}
        </pre>

        <p>Your gateway will be available at <code>http://localhost:3000</code>.</p>
      </section>

      <section className="docs-section">
        <h2>Configuration Options</h2>

        <table className="config-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Default</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>GATEWAY_NAME</code></td>
              <td>Swimchain Gateway</td>
              <td>Display name for your gateway</td>
            </tr>
            <tr>
              <td><code>GATEWAY_OPERATOR</code></td>
              <td>(none)</td>
              <td>Your name or organization</td>
            </tr>
            <tr>
              <td><code>GATEWAY_URL</code></td>
              <td>http://localhost:3000</td>
              <td>Public URL of your gateway</td>
            </tr>
            <tr>
              <td><code>NODE_URL</code></td>
              <td>ws://localhost:8765</td>
              <td>WebSocket URL of Swimchain node</td>
            </tr>
            <tr>
              <td><code>NODE_RECONNECT_INTERVAL</code></td>
              <td>5000</td>
              <td>Reconnection interval in ms</td>
            </tr>
            <tr>
              <td><code>RATE_LIMIT_REQUESTS</code></td>
              <td>100</td>
              <td>Max requests per window per IP</td>
            </tr>
            <tr>
              <td><code>RATE_LIMIT_WINDOW</code></td>
              <td>60000</td>
              <td>Rate limit window in ms</td>
            </tr>
            <tr>
              <td><code>LOG_LEVEL</code></td>
              <td>info</td>
              <td>Logging verbosity</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="docs-section">
        <h2>Node Requirements</h2>
        <p>
          Your gateway needs to connect to at least one Swimchain node. The node
          should have:
        </p>
        <ul>
          <li>WebSocket API enabled</li>
          <li>Public content sync enabled</li>
          <li>Sufficient storage for content you want to serve</li>
        </ul>
        <p>
          For high availability, configure multiple nodes:
        </p>
        <pre className="code-block">
{`NODE_URL="ws://node1:8765,ws://node2:8765,ws://node3:8765"`}
        </pre>
      </section>

      <section className="docs-section">
        <h2>Health Monitoring</h2>
        <p>
          The gateway exposes a health endpoint at <code>/api/health</code>:
        </p>
        <pre className="code-block">
{`curl http://localhost:3000/api/health

{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "gateway": {
    "name": "My Swimchain Gateway",
    "operator": "Your Name"
  },
  "node": {
    "connected": true,
    "chainHeight": 12345
  },
  "uptime": 86400
}`}
        </pre>

        <h3>Response Status Codes</h3>
        <ul>
          <li><strong>200 OK</strong> - Gateway is healthy</li>
          <li><strong>503 Service Unavailable</strong> - Gateway is unhealthy (node disconnected)</li>
        </ul>

        <p>Use this endpoint for:</p>
        <ul>
          <li>Kubernetes/Docker health checks</li>
          <li>Load balancer health probes</li>
          <li>Uptime monitoring services</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2>Production Deployment</h2>

        <h3>SSL/TLS with Nginx</h3>
        <p>
          For production, use Nginx as a reverse proxy to handle SSL termination:
        </p>
        <pre className="code-block">
{`# nginx.conf
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://gateway:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`}
        </pre>

        <h3>Resource Limits</h3>
        <p>Recommended resources per gateway instance:</p>
        <ul>
          <li>Memory: 256MB minimum, 512MB recommended</li>
          <li>CPU: 0.5 cores minimum</li>
          <li>Disk: Minimal (search index is memory-based)</li>
        </ul>

        <h3>Scaling</h3>
        <p>
          Gateways are stateless and can be horizontally scaled. Use a load balancer
          to distribute traffic across multiple instances.
        </p>
      </section>

      <section className="docs-section">
        <h2>Rate Limiting</h2>
        <p>
          Built-in rate limiting protects your gateway from abuse:
        </p>
        <ul>
          <li>Default: 100 requests per minute per IP</li>
          <li>Configurable via environment variables</li>
          <li>Returns HTTP 429 when limit exceeded</li>
          <li>Rate limit headers included in responses</li>
        </ul>

        <h3>Rate Limit Headers</h3>
        <pre className="code-block">
{`X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312200`}
        </pre>
      </section>

      <section className="docs-section">
        <h2>Troubleshooting</h2>

        <h3>Gateway not connecting to node</h3>
        <ul>
          <li>Verify <code>NODE_URL</code> is correct</li>
          <li>Check node is running and WebSocket API is enabled</li>
          <li>Ensure network connectivity between gateway and node</li>
          <li>Check firewall rules allow WebSocket connections</li>
        </ul>

        <h3>High memory usage</h3>
        <ul>
          <li>Search index grows with content volume</li>
          <li>Consider increasing memory limit</li>
          <li>Configure content retention policies on your node</li>
        </ul>

        <h3>Rate limit issues</h3>
        <ul>
          <li>Adjust <code>RATE_LIMIT_REQUESTS</code> if too restrictive</li>
          <li>Use Nginx rate limiting for more sophisticated rules</li>
          <li>Consider per-route rate limits for API endpoints</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2>Support</h2>
        <p>
          For help operating a gateway:
        </p>
        <ul>
          <li><a href="https://github.com/superness/swimchain/issues">GitHub Issues</a></li>
          <li><a href="https://github.com/superness/swimchain/discussions">GitHub Discussions</a></li>
        </ul>
      </section>
    </div>
  );
}
