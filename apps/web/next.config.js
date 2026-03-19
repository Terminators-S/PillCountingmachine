/** @type {import('next').NextConfig} */
function normalizeApiProxyTarget(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

const apiProxyTarget = normalizeApiProxyTarget(process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL);

const nextConfig = {
  transpilePackages: ['@pillcount/shared', '@pillcount/ui'],
  experimental: {
    typedRoutes: false
  },
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
