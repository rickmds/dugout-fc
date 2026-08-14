import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/dugout-vs-teamsnap',
        destination: '/pulse-fc-vs-teamsnap',
        permanent: true,
      },
      {
        source: '/dugout-vs-sportsengine',
        destination: '/pulse-fc-vs-sportsengine',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
        ],
      },
    ];
  },
};

export default nextConfig;
