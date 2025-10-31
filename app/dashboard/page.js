'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import logger from '@/lib/logger'
import { UserProvider, useUser } from '../contexts/UserContext'
import DashboardHeader from '../components/DashboardHeader'
import PortfolioSummary from '../components/PortfolioSummary'
import InvestmentsView from '../components/InvestmentsView'
import ProfileView from '../components/ProfileView'
import DocumentsView from '../components/DocumentsView'
import FixedInvestButton from '../components/FixedInvestButton'
import styles from './page.module.css'

function DashboardPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [activeView, setActiveView] = useState('portfolio')
  const { userData, loading } = useUser()

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
      
      // Redirect to onboarding if user needs to complete setup
      if (userData.needsOnboarding) {
        logger.log('User needs onboarding, redirecting...')
        router.push('/onboarding')
        return
      }
    }
    verify()
  }, [router, searchParams, userData, loading])

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
        return (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <h2>Contact Us</h2>
            <p>Get in touch with our team for any questions or support.</p>
            {/* Add contact form/content here later */}
          </div>
        )
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
    <UserProvider>
      <Suspense fallback={
        <div className={styles.main}>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            Loading...
          </div>
        </div>
      }>
        <DashboardPageContent />
      </Suspense>
    </UserProvider>
  )
}
