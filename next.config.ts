import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  experimental: {
    // Raise the body-size limit so 50 MB PDF uploads aren't rejected
    // before they reach the route handler.
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
