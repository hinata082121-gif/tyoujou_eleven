import type { NextConfig } from "next";

// 静的書き出しのみで動かす（SPEC 2章）。API Routes・SSR・Server Actions は使わない。
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
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
