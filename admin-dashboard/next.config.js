/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_TLDRAW_API_URL: process.env.NEXT_PUBLIC_TLDRAW_API_URL || 'https://tldraw-worker.010-carpe-diem.workers.dev',
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_TLDRAW_API_URL || 'https://www.iflowone.com'
    return [
      {
        source: '/api/admin/:path*',
        destination: `${apiUrl}/api/admin/:path*`,
      },
    ]
  },
}

module.exports = nextConfig