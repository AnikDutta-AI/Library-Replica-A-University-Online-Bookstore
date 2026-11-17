import type { NextConfig } from "next";

/**
 * LibraryReplica is a static vanilla-JS site living in /public (the spec's
 * "LibraryReplica/" root). Next.js only serves it and exposes /api/health.
 * The rewrite below maps "/" to the landing page.
 */
const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
