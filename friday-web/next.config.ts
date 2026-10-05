import type { NextConfig } from "next";

// Where this server forwards /aegra/* and /friday/*. The browser only ever talks
// to this app's own origin, so the UI works from any device on the network
// (no CORS, Aegra and the bot can stay private). Docker sets the service names.
const AEGRA_INTERNAL_URL = process.env.AEGRA_INTERNAL_URL ?? "http://localhost:2026";
const FRIDAY_INTERNAL_URL = process.env.FRIDAY_INTERNAL_URL ?? "http://localhost:8100";

const nextConfig: NextConfig = {
  // this app is the workspace root, not the Python project above it
  turbopack: { root: __dirname },
  // lets you open the dev server (npm run dev) from your phone on the LAN
  allowedDevOrigins: ["192.168.1.240", "*.local"],
  async rewrites() {
    return [
      { source: "/aegra/:path*", destination: `${AEGRA_INTERNAL_URL}/:path*` },
      { source: "/friday/:path*", destination: `${FRIDAY_INTERNAL_URL}/:path*` },
    ];
  },
};

export default nextConfig;
