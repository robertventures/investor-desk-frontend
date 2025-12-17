'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import logger from '../../lib/logger'
import { UserProvider } from '../contexts/UserContext'
import { useTokenRefresh } from '../../lib/hooks/useTokenRefresh'

export default function AuthWrapper({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/forgot-password', '/password-change', '/confirmation', '/onboarding', '/email-confirmation']
  
  // Routes that don't require onboarding check
  const noOnboardingCheckRoutes = ['/onboarding']
  
  // Check if current route is public
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/password-change')
  const isOnboardingRoute = noOnboardingCheckRoutes.includes(pathname)

  // Handle token refresh failure by logging out and redirecting to login
  const handleRefreshFailure = useCallback(() => {
    logger.warn('[AuthWrapper] Token refresh failed, logging out')
    apiClient.clearTokens()
    localStorage.removeItem('currentUserId')
    localStorage.removeItem('signupEmail')
    setIsAuthenticated(false)
    router.push('/login')
  }, [router])

  // Activity-based token refresh (only active when authenticated)
  useTokenRefresh(isAuthenticated, handleRefreshFailure)

  useEffect(() => {
    
    if (typeof window === 'undefined') return
    
    const checkAuth = async () => {
      try {
        apiClient.ensureTokensLoaded()
        let hasToken = apiClient.isAuthenticated()

        // Attempt to refresh access token if only refresh token is present
        if (!hasToken && apiClient.refreshToken) {
          try {
            await apiClient.refreshAccessToken()
            hasToken = apiClient.isAuthenticated()
          } catch (refreshError) {
            logger.warn('Token refresh failed:', refreshError)
            apiClient.clearTokens()
            hasToken = false
          }
        }

        if (!hasToken) {
          // Clear localStorage if not authenticated
          localStorage.removeItem('currentUserId')
          localStorage.removeItem('signupEmail')
        }

        setIsAuthenticated(hasToken)
        setIsLoading(false)

        // If user is not logged in and trying to access protected route
        if (!hasToken && !isPublicRoute) {
          router.push('/login')
          return
        }
      } catch (error) {
        logger.error('Auth check error:', error)
        setIsAuthenticated(false)
        setIsLoading(false)
        
        if (!isPublicRoute) {
          router.push('/login')
        }
      }
    }

    checkAuth()

    // Listen for storage changes (logout from another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'currentUserId' && !e.newValue) {
        setIsAuthenticated(false)
        if (!isPublicRoute) {
          router.push('/login')
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [pathname, router, isPublicRoute])

  const userProviderKey = isAuthenticated ? 'auth' : 'guest'

  // Show loading state while checking authentication
  // For public routes, still provide UserContext so pages can safely call useUser
  if (isLoading && isPublicRoute) {
    return <UserProvider key={`${userProviderKey}-loading`}>{children}</UserProvider>
  }
  
  if (isLoading) {
    return null // Return null instead of loading UI to avoid hydration issues
  }

  // Don't render protected content if not authenticated and not on public route
  if (!isAuthenticated && !isPublicRoute) {
    return null
  }

  // Always provide UserContext; protected routes are still blocked above
  return <UserProvider key={`${userProviderKey}-ready`}>{children}</UserProvider>
}
