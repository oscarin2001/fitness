import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permitir llamadas server-side en desarrollo a dominios externos específicos
  allowedDevOrigins: [
    "https://generativelanguage.googleapis.com",
  ],
  webpack: (config) => {
    // Evitar que Webpack intente parsear README.md / LICENSE de paquetes libsql que se resuelven vía exports
    // Opción 1: tratarlos como 'asset/source'
    config.module.rules.push({
      test: /node_modules\\\\@?(libsql|prisma).*\\\\(README|LICENSE).*$/i,
      type: 'asset/source'
    });
    // Opción 2: ignora patrones específicos (por seguridad adicional)
    const IgnorePlugin = require('webpack').IgnorePlugin;
    config.plugins.push(new IgnorePlugin({
      resourceRegExp: /(README\.md|LICENSE)$/,
      contextRegExp: /@libsql/
    }));
    return config;
  }
};

export default nextConfig;
