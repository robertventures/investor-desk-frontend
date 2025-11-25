'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/app/contexts/UserContext'
import styles from '../page.module.css'

const SECTION_ROUTES = {
  portfolio: '/dashboard',
  investments: '/dashboard/investments',
  profile: '/dashboard/profile',
  documents: '/dashboard/documents',
  contact: '/dashboard/contact'
}

export default function DashboardShell({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { userData, loading, loadInvestments, loadActivity, investments, refreshUser } = useUser()
  const [ready, setReady] = useState(false)
  const hasRedirectedRef = useRef(false)
  const hasRefreshedRef = useRef(false)
  const lastUserIdRef = useRef(userData?.id)

  // Reset refresh flag if user changes
  if (userData?.id !== lastUserIdRef.current) {
    hasRefreshedRef.current = false
    lastUserIdRef.current = userData?.id
  }

  // Backward compatibility for legacy query parameters (?section=profile&tab=banking)
  useEffect(() => {
    const section = searchParams.get('section')
    const from = searchParams.get('from')

    if (!section && !from) {
      return
    }

    const normalizedSection = section && SECTION_ROUTES[section] ? section : 'portfolio'
    const targetPath = section ? SECTION_ROUTES[normalizedSection] : pathname

    const nextParams = new URLSearchParams(searchParams.toString())
    if (section) nextParams.delete('section')
    if (from) nextParams.delete('from')
    if (section && normalizedSection !== 'profile') {
      nextParams.delete('tab')
    }

    const queryString = nextParams.toString()
    const nextUrl = queryString ? `${targetPath}?${queryString}` : targetPath

    if (!hasRedirectedRef.current || section || from) {
      hasRedirectedRef.current = true
      router.replace(nextUrl, { scroll: false })
    }
  }, [pathname, router, searchParams])

  // Verify session information before rendering the dashboard shell
  useEffect(() => {
    if (loading) return
    if (typeof window === 'undefined') return

    const userId = localStorage.getItem('currentUserId')
    if (!userId) {
      router.push('/')
      return
    }

    if (!userData) {
      localStorage.removeItem('currentUserId')
      localStorage.removeItem('signupEmail')
      localStorage.removeItem('currentInvestmentId')
      router.push('/')
      return
    }

    // Check if user needs to complete onboarding (bank connection)
    if (userData.needsOnboarding) {
      // Force a refresh of user data once to ensure we have the latest state
      // This handles the case where user just completed onboarding and navigated back here
      if (!hasRefreshedRef.current) {
        hasRefreshedRef.current = true
        refreshUser()
        return // Wait for refresh
      }

      // Wait for investments to load
      if (!investments) {
        return
      }

      // Check for monthly payment investments
      const hasMonthlyInvestment = investments.some(inv => 
        inv.paymentFrequency === 'monthly'
      )

      if (hasMonthlyInvestment) {
        router.push('/onboarding')
        return
      }
    }

    setReady(true)
  }, [loading, router, userData, investments, refreshUser])

  // Lazy load investments and activity when the user data becomes available
  useEffect(() => {
    console.log('[DashboardShell] Effect triggered:', { 
      loading, 
      hasUserData: !!userData, 
      userId: userData?.id 
    })

    if (!loading && userData) {
      console.log('[DashboardShell] Triggering lazy loads')
      loadInvestments?.().catch(err => console.error('[DashboardShell] loadInvestments failed:', err))
      loadActivity?.().catch(err => console.error('[DashboardShell] loadActivity failed:', err))
    }
    // Use userData.id to prevent infinite loops
    // If we used userData, loading investments would update userData, triggering this again
  }, [loading, userData?.id, loadInvestments, loadActivity])

  if (!ready || loading) {
    return (
      <div className={styles.main}>
        <div className={styles.loading}>
          Loading...
        </div>
      </div>
    )
  }

  return children
}
