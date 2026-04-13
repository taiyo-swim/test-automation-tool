import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Required for Docker multi-stage build
  async rewrites() {
    return [
      // Proxy /api/* and /internal/* to the API server
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:4000"}/api/:path*`,
      },
      {
        source: "/ws",
        destination: `${process.env.API_URL ?? "http://localhost:4000"}/ws`,
      },
    ];
  },
};

export default nextConfig;
