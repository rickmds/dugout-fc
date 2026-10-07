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
      // Superseded by the shorter /t/[clubSlug] route. A redirect() inside
      // app/tryout-registration/page.tsx looked right but actually served
      // a 200 with a client-side meta-refresh instead of a real HTTP
      // redirect (searchParams forces this route into Next's streaming
      // render path, and per Next's own docs redirect() in a streaming
      // context "inserts a meta tag to emit the redirect on the client
      // side" rather than a 3xx) — confirmed via curl, no Location header,
      // status 200. A config-level redirect runs before any page renders
      // at all, so it's a real 308 that curl/crawlers/old-link-unfurlers
      // follow immediately.
      {
        source: '/tryout-registration',
        has: [{ type: 'query', key: 'club', value: '(?<club>.*)' }],
        destination: '/t/:club',
        permanent: true,
      },
      {
        source: '/tryout-registration',
        destination: '/',
        permanent: false,
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
