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
        // Verify authentication via API using apiClient
        const data = await apiClient.getCurrentUser()

        const isLoggedIn = data && data.success && data.user

        if (isLoggedIn) {
          // Store user ID in localStorage for backward compatibility
          localStorage.setItem('currentUserId', data.user.id)
          localStorage.setItem('signupEmail', data.user.email)
          
          console.log('[AuthWrapper] Auth check - isAdmin:', data.user.isAdmin, 'currentPath:', pathname)
          
          // If admin is on onboarding page, redirect to admin dashboard
          if (data.user.isAdmin && isOnboardingRoute) {
            console.log('[AuthWrapper] Admin on onboarding page, redirecting to admin dashboard')
            router.push('/admin')
            return
          }
          
          // If user completed onboarding but is on onboarding page, redirect to appropriate dashboard
          if (!data.user.needsOnboarding && isOnboardingRoute) {
            logger.log('User onboarding complete, redirecting to dashboard...')
            // Check if user is admin and redirect accordingly
            if (data.user.isAdmin) {
              router.push('/admin')
            } else {
              router.push('/dashboard')
            }
            return
          }
        } else {
          // Clear localStorage if not authenticated
          localStorage.removeItem('currentUserId')
          localStorage.removeItem('signupEmail')
        }
        
        setIsAuthenticated(isLoggedIn)
        setIsLoading(false)

        // If user is not logged in and trying to access protected route
        if (!isLoggedIn && !isPublicRoute) {
          router.push('/sign-in')
          return
        }

        // If user is logged in and on sign-in route, redirect to appropriate dashboard
        if (isLoggedIn && pathname === '/sign-in') {
          // Check if user is admin and redirect accordingly
          if (data.user.isAdmin) {
            router.push('/admin')
          } else {
            router.push('/dashboard')
          }
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

  // Show loading state while checking authentication
  // For public routes, always render to avoid blocking
  if (isLoading && isPublicRoute) {
    return children
  }
  
  if (isLoading) {
    return null // Return null instead of loading UI to avoid hydration issues
  }

  // Don't render protected content if not authenticated and not on public route
  if (!isAuthenticated && !isPublicRoute) {
    return null
  }

  // Wrap children with UserProvider for authenticated users
  if (isAuthenticated) {
    return <UserProvider>{children}</UserProvider>
  }

  return children
}
