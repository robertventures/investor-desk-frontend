const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router is enabled by default in Next.js 13.4+
  reactStrictMode: true,
  
  // Proxy API requests to backend to avoid CORS/cookie issues
  async rewrites() {
    // Get backend URL from env; when not set, no proxy is applied
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || ''
    
    if (!apiUrl) {
      return []
    }
    
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },

  
  // Suppress hydration warnings for browser extensions
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Configure webpack
  webpack: (config, { isServer }) => {
    // Provide path alias so imports like '@/lib/...' resolve to project root
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(process.cwd())
    }
    
    return config
  }
}

module.exports = nextConfig

