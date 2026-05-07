/** @type {import('next').NextConfig} */
const nextConfig = {
  // Drop the "X-Powered-By: Next.js" response header + the auto-injected
  // <meta name="generator" content="Next.js"> tag so the framework isn't
  // advertised on every request / page-source view.
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};
module.exports = nextConfig;
