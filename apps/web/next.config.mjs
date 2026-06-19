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

export default nextConfig;
