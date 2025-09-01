import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permitir llamadas server-side en desarrollo a dominios externos específicos
  allowedDevOrigins: [
    "https://generativelanguage.googleapis.com",
  ],
};

export default nextConfig;
