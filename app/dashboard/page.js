'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import logger from '@/lib/logger'
import { useUser } from '../contexts/UserContext'
import DashboardHeader from '../components/DashboardHeader'
import PortfolioSummary from '../components/PortfolioSummary'
import InvestmentsView from '../components/InvestmentsView'
import ProfileView from '../components/ProfileView'
import DocumentsView from '../components/DocumentsView'
import ContactView from '../components/ContactView'
import FixedInvestButton from '../components/FixedInvestButton'
import styles from './page.module.css'

function DashboardPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [activeView, setActiveView] = useState('portfolio')
  const { userData, loading, loadInvestments, loadActivity } = useUser()

  // Guard against missing/removed account
  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    
    const verify = async () => {
      const userId = localStorage.getItem('currentUserId')
      if (!userId) { 
        router.push('/')
        return 
      }

      // Wait for user data to load
      if (loading) return

      // Check if user data loaded successfully
      if (!userData) {
        localStorage.removeItem('currentUserId')
        localStorage.removeItem('signupEmail')
        localStorage.removeItem('currentInvestmentId')
        router.push('/')
        return
      }
      
      // Note: No automatic redirect to onboarding
      // Onboarding is only accessed via direct link with token (for imported users)
    }
    verify()
  }, [router, searchParams, userData, loading])

  // Lazy load investments and activity once user is available
  // These calls fail gracefully - if endpoints aren't ready, app continues to work
  useEffect(() => {
    if (!loading && userData) {
      // Load investments asynchronously - fails gracefully
      loadInvestments().catch((err) => {
        console.log('Investments endpoint not available yet:', err.message)
      })
      
      // Load activity asynchronously - fails gracefully
      loadActivity().catch((err) => {
        console.log('Activity endpoint not available yet:', err.message)
      })
    }
  }, [loading, userData, loadInvestments, loadActivity])

  // Initialize activeView from URL params and sync URL with activeView
  useEffect(() => {
    const section = searchParams.get('section')
    if (section && ['portfolio', 'investments', 'profile', 'documents', 'contact'].includes(section)) {
      setActiveView(section)
    }
    
    // Clean up temporary query params like 'from' after initial load
    const from = searchParams.get('from')
    if (from) {
      const newSearchParams = new URLSearchParams(searchParams.toString())
      newSearchParams.delete('from')
      const section = newSearchParams.get('section') || 'portfolio'
      router.replace(`/dashboard?section=${section}`, { scroll: false })
    }
  }, [searchParams, router])

  const handleViewChange = (view) => {
    setActiveView(view)
    // Only keep the section parameter, clean URL
    router.replace(`/dashboard?section=${view}`, { scroll: false })
  }

  const renderContent = () => {
    switch (activeView) {
      case 'investments':
        return <InvestmentsView />
      case 'profile':
        return <ProfileView />
      case 'documents':
        return <DocumentsView />
      case 'contact':
        return <ContactView />
      case 'portfolio':
      default:
        return <PortfolioSummary />
    }
  }

  // Prevent hydration mismatch - don't render until mounted and user data loaded
  if (!mounted || loading) {
    return (
      <div className={styles.main}>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className={styles.main}>
      <DashboardHeader onViewChange={handleViewChange} activeView={activeView} />
      <div className={styles.container}>
        {renderContent()}
      </div>
      <FixedInvestButton />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className={styles.main}>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          Loading...
        </div>
      </div>
    }>
      <DashboardPageContent />
    </Suspense>
  )
}
