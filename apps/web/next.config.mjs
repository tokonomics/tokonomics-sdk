import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tokonomics/shared", "@tokonomics/db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "tokonomics",
  project: "web",
  silent: true,           // suppress CLI output in CI
  disableLogger: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,   // don't expose source maps in production bundle
  automaticVercelMonitors: true,
});
