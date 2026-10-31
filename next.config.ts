import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `pg` uses Node built-ins; keep it out of the server bundle.
  serverExternalPackages: ['pg'],
  experimental: {
    // Bank files are uploaded through a server action. The service caps a file at 5 MB
    // (MAX_IMPORT_FILE_BYTES); this leaves room for the multipart overhead.
    serverActions: { bodySizeLimit: '6mb' },
  },
};

export default nextConfig;
