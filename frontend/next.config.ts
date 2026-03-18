import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        'lib/shims/async-storage.ts',
      ),
    };

    return config;
  },
};

export default nextConfig;
