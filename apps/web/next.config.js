/** @type {import('next').NextConfig} */
function normalizeApiProxyTarget(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

const apiProxyTarget = normalizeApiProxyTarget(process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL);
const staticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

const nextConfig = {
  transpilePackages: ['@pillcount/shared', '@pillcount/ui'],
  output: staticExport ? 'export' : undefined,
  trailingSlash: staticExport,
  images: staticExport
    ? {
        unoptimized: true
      }
    : undefined,
  experimental: {
    typedRoutes: false
  }
};

if (!staticExport) {
  nextConfig.rewrites = async () => {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`
      }
    ];
  };
}

module.exports = nextConfig;
