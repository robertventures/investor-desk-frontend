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
  const { userData, loading, loadInvestments, loadActivity } = useUser()
  const [ready, setReady] = useState(false)
  const hasRedirectedRef = useRef(false)

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
