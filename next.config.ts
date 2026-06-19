import type { NextConfig } from 'next';

/**
 * Next.js configuration.
 *
 * - `output: 'standalone'` packages only the production files needed by
 *   cPanel Node.js hosting.
 * - `outputFileTracingRoot` keeps the standalone trace anchored to this
 *   workspace so Next doesn't pull in files from sibling projects.
 * - `experimental.optimizePackageImports` rewrites barrel-style imports
 *   from the listed packages to use named subpath imports during build.
 *   For `lucide-react` (38+ call sites) this prevents pulling the entire
 *   icon set into a chunk; for `@tanstack/react-query` it keeps unused
 *   utilities out of the bundle.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  outputFileTracingRoot: __dirname,
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react', '@tanstack/react-query'],
  },
  /**
   * Baseline browser security headers. CSP is intentionally deferred because
   * Next.js runtime/script requirements need a dedicated nonce/hash pass.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
