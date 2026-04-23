/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [],
  },
  async redirects() {
    return [
      {
        source: '/news/:path*',
        destination: '/',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig