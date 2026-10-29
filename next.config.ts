import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  // The scorecard import posts the whole saved page; Vercel accepts request bodies up to 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Pages can't be framed by other sites (clickjacking) or sniffed as another content type.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // the bio PDF reads its fonts from disk at runtime
  outputFileTracingIncludes: { "/trainers/[id]/bio": ["./src/fonts/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
