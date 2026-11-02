import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  // standalone server for Docker (Linux). Skipped on Vercel (own output) and on Windows, where
  // copying the pnpm symlinks needs admin rights (EPERM).
  // also skipped for the E2E build, which is served with `next start`
  ...(process.env.VERCEL || process.platform === 'win32' || process.env.NEXT_DIST_DIR ? {} : { output: 'standalone' as const }),
  // monorepo: trace workspace packages into the standalone bundle
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // the E2E stack builds into its own folder (other API port baked into the rewrites)
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@goalbet/ui'],
  // styles arrive inside the HTML: no render-blocking stylesheet request before the first paint
  // (Tailwind keeps the CSS small enough to inline)
  experimental: { inlineCss: true },
  // Club badges come from API-Football as large PNGs with short cache headers. next/image fetches
  // each one once, serves it resized to the displayed size as AVIF/WebP, and caches it for 30 days.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'media.api-sports.io' }],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2_592_000,
  },
  poweredByHeader: false,
  // The browser talks to the API through this origin, so auth cookies stay first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(config);
