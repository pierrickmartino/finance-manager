import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `pg` uses Node built-ins; keep it out of the server bundle.
  serverExternalPackages: ['pg'],
  // Memoizes components at build time, so new code needn't write `useMemo`/`useCallback` by hand.
  reactCompiler: true,
  experimental: {
    // Bank files are uploaded through a server action. The service caps a file at 5 MB
    // (MAX_IMPORT_FILE_BYTES); this leaves room for the multipart overhead.
    serverActions: { bodySizeLimit: '6mb' },
  },
  // The Reports pages became Widgets (GLOSSARY: Widget); old links and bookmarks keep working.
  // Next carries the query string over on a redirect.
  async redirects() {
    return [
      { source: '/reports', destination: '/widgets', permanent: true },
      { source: '/reports/builder', destination: '/widgets/new', permanent: true },
      { source: '/reports/:path*', destination: '/widgets/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
