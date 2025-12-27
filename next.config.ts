import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Aumentar limite de body para uploads grandes (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;


