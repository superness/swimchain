/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve under a subpath (e.g. /browse behind nginx). Must match the
  // NEXT_PUBLIC_BASE_PATH used by src/lib/base-path.ts at build time.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Disable x-powered-by header for security
  poweredByHeader: false,

  // Enable strict mode for development
  reactStrictMode: true,

  // Configure headers for security and caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        // Static assets can be cached longer
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // No redirects - we have a proper homepage now
};

module.exports = nextConfig;
