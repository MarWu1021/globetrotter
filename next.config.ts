import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow local browser checks when the dev server binds to 0.0.0.0.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ] }];
  },
};

export default nextConfig;
