'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { initCsrfToken } from '../../lib/csrfClient'
import { apiClient } from '../../lib/apiClient'
import logger from '../../lib/logger'
import { UserProvider } from '../contexts/UserContext'

export default function AuthWrapper({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/sign-in', '/forgot-password', '/reset-password', '/confirmation']
  
  // Routes that don't require onboarding check
  const noOnboardingCheckRoutes = ['/onboarding']
  
  // Check if current route is public
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/reset-password')
  const isOnboardingRoute = noOnboardingCheckRoutes.includes(pathname)

  useEffect(() => {
    // Initialize CSRF token on app load
    initCsrfToken()
    
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
          router.push('/sign-in')
          return
        }
      } catch (error) {
        logger.error('Auth check error:', error)
        setIsAuthenticated(false)
        setIsLoading(false)
        
        if (!isPublicRoute) {
          router.push('/sign-in')
        }
      }
    }

    checkAuth()

    // Listen for storage changes (logout from another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'currentUserId' && !e.newValue) {
        setIsAuthenticated(false)
        if (!isPublicRoute) {
          router.push('/sign-in')
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
