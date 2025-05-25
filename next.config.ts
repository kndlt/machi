import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  webpack(cfg) {
    cfg.output.workerChunkFilename = 'static/worker/[name].[contenthash].js';
    return cfg;
  },
  experimental: { workerThreads: true, esmExternals: true },
};

export default nextConfig;
