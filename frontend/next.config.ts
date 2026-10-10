import type { NextConfig } from "next";

// Rewrites are compiled into the build: set BACKEND_URL (frontend/.env.local)
// before `npm run dev` or `npm run build`.
const backendUrl = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
// LAN testing (`npm run dev:lan`): comma-separated hosts allowed to load dev resources,
// e.g. LAN_DEV_ORIGINS=10.75.129.195 in .env.local. Empty = localhost only.
const lanDevOrigins = (process.env.LAN_DEV_ORIGINS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", ...lanDevOrigins],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The /api rewrite proxy gives up after 30 s by default. A local-AI memory draft of a
    // full 60 s conversation measured ~36 s while the camera loop was running (2026-10-10).
    // Backend calls keep their own bounded timeouts (Ollama 90 s, Scribe 60 s).
    proxyTimeout: 120_000,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // One FastAPI backend serves every /api route; do not add Next.js route handlers.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
