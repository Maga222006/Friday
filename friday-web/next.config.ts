import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // this app is the workspace root, not the Python project above it
  turbopack: { root: __dirname },
  // lets you open the UI from your phone on the LAN during development
  allowedDevOrigins: ["192.168.1.240"],
};

export default nextConfig;
