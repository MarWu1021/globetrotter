import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow local browser checks when the dev server binds to 0.0.0.0.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
