import type { NextConfig } from 'next';

/**
 * Next.js configuration.
 * Turbopack-specific settings are intentionally omitted because this project
 * runs development and production builds with Webpack for lower laptop load.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
