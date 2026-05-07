import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tlclandscapemanagement.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
