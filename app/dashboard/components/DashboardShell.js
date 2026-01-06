'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/app/contexts/UserContext'
import BankReconnectOverlay from '@/app/components/ui/BankReconnectOverlay'
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
  const { userData, loading, loadInvestments, loadActivity, refreshUser } = useUser()
  const [ready, setReady] = useState(false)
  const hasRedirectedRef = useRef(false)
  
  // Bank reconnection overlay - controlled by backend-provided hasBankConnectionIssue field
  const [showBankReconnectOverlay, setShowBankReconnectOverlay] = useState(false)

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
      router.push('/login')
      return
    }

    if (!userData) {
      // Authentication failed - redirect to login as fallback
      localStorage.removeItem('currentUserId')
      localStorage.removeItem('signupEmail')
      localStorage.removeItem('currentInvestmentId')
      router.push('/login')
      return
    }

    // NOTE: Onboarding redirect has been removed.
    // Onboarding is ONLY triggered via admin-sent email links with a token.
    // Users who haven't completed onboarding can still access the dashboard.
    // The onboarding flow is specifically for importing investors from the previous app.

    setReady(true)
  }, [loading, router, userData])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userData?.id])

  // Sync bank reconnection overlay with backend-provided hasBankConnectionIssue field
  // Opens overlay when issue detected, closes when resolved (e.g., after refreshUser)
  // Note: We intentionally exclude `userData` from deps to prevent reopening after user dismisses
  useEffect(() => {
    if (!ready || !userData) return
    
    if (userData.hasBankConnectionIssue) {
      console.log('[DashboardShell] Bank connection issue detected:', userData.disconnectedBankName)
      setShowBankReconnectOverlay(true)
    } else {
      // Close overlay if issue has been resolved (e.g., after successful reconnection)
      setShowBankReconnectOverlay(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userData?.hasBankConnectionIssue])
  
  // Handler for dismissing the overlay without reconnecting
  const handleDismissOverlay = useCallback(() => {
    console.log('[DashboardShell] User dismissed bank reconnection overlay')
    setShowBankReconnectOverlay(false)
  }, [])

  // Handler for successful bank reconnection
  const handleBankReconnected = useCallback(async (method) => {
    console.log('[DashboardShell] Bank reconnected successfully:', method)
    
    // Refresh user data to get updated hasBankConnectionIssue from backend
    try {
      await refreshUser?.()
      // The overlay will automatically close when userData.hasBankConnectionIssue becomes false
      // But we also close it immediately for better UX
      setShowBankReconnectOverlay(false)
    } catch (err) {
      console.error('[DashboardShell] Failed to refresh user after reconnection:', err)
      // Assume success and close overlay anyway
      setShowBankReconnectOverlay(false)
    }
  }, [refreshUser])

  if (!ready || loading) {
    return (
      <div className={styles.main}>
        <div className={styles.loading}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
      <BankReconnectOverlay
        isOpen={showBankReconnectOverlay}
        onReconnected={handleBankReconnected}
        onDismiss={handleDismissOverlay}
        bankName={userData?.disconnectedBankName}
      />
    </>
  )
}
