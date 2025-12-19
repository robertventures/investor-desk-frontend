/**
 * Next.js Middleware
 *
 * Runs before every request to apply:
 * - HTTPS enforcement (redirect HTTP to HTTPS in production)
 * - Security headers (HSTS, CSP, etc.)
 *
 * Note: API routes are handled by the external backend.
 * This middleware only applies security for frontend pages.
 */

import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files and internal routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next()
  }

  // HTTPS Enforcement (Production only)
  if (process.env.NODE_ENV === 'production') {
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host')

    if (protocol === 'http') {
      const httpsUrl = `https://${host}${pathname}${request.nextUrl.search}`
      return NextResponse.redirect(httpsUrl, {
        status: 301,
        headers: {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
        }
      })
    }
  }

  // Add comprehensive security headers for all pages
  const response = NextResponse.next()
  
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

  // Content Security Policy (CSP) - balanced security with Next.js compatibility
  // Build CSP with dynamic API backend URL and Plaid support
  // Note: 'unsafe-inline' and 'unsafe-hashes' are required for Next.js error pages and development
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || ''
  
  // Build connect-src directive to allow connections to backend and Plaid
  let connectSrc = `'self' https://cdn.plaid.com https://production.plaid.com https://sandbox.plaid.com https://development.plaid.com`
  if (apiUrl) connectSrc += ` ${apiUrl}`
  
  {
    const isProd = process.env.NODE_ENV === 'production'
    // Allow Plaid CDN scripts
    const scriptSrc = isProd
      ? "script-src 'self' https://cdn.plaid.com https://plaid.com; "
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.plaid.com https://plaid.com; "

    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; " +
      scriptSrc +
      "style-src 'self' 'unsafe-inline' 'unsafe-hashes' https://fonts.googleapis.com https://cdn.plaid.com; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.plaid.com; " +
      `connect-src ${connectSrc}; ` +
      "frame-src 'self' https://cdn.plaid.com; " +
      "frame-ancestors 'self'; " +
      "base-uri 'self'; " +
      "form-action 'self'"
    )
  }

  // Permissions Policy (disable unnecessary browser features)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()'
  )

  // HSTS header (production only)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  return response
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
