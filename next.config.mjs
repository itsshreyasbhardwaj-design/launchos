/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // node:sqlite and the crawler must stay on the Node runtime, never bundled
  // for the edge. The core package is server-only by construction.
  serverExternalPackages: ['node:sqlite'],
  experimental: { typedRoutes: false },
};
export default nextConfig;
