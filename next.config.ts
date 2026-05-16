import type { NextConfig } from 'next';

/**
 * Next.js configuration.
 * Standalone output packages only production files needed by cPanel Node.js hosting.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  output: 'standalone',
};

export default nextConfig;
