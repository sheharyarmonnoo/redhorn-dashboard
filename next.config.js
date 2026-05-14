/** @type {import('next').NextConfig} */
const nextConfig = {
  // Drop the "X-Powered-By: Next.js" response header + the auto-injected
  // <meta name="generator" content="Next.js"> tag so the framework isn't
  // advertised on every request / page-source view.
  poweredByHeader: false,
  // CI runs `tsc --noEmit` and `next lint` on every PR (see
  // .github/workflows/ci.yml) so we no longer hide build-time errors here.
  // If you need to ship a hotfix past a transient type error, gate it
  // intentionally rather than turning these back on globally.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};
module.exports = nextConfig;
