'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '../../../contexts/UserContext'
import { INVESTMENTS_PAUSED } from '../../../../lib/featureFlags'
import styles from './InvestmentsView.module.css'
import InvestmentCard from '../../ui/InvestmentCard'
import { calculateInvestmentValue, formatCurrency, formatDate, getInvestmentStatus } from '../../../../lib/investmentCalculations.js'

export default function InvestmentsView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const { userData, refreshUser } = useUser()
  const [portfolioData, setPortfolioData] = useState({
    investments: []
  })
  const [appTime, setAppTime] = useState(null)

  const loadData = useCallback(async () => {
    if (typeof window === 'undefined') return
    
    const userId = localStorage.getItem('currentUserId')
    if (!userId) return

    try {
      // Get current app time for calculations
      const fresh = searchParams.get('from') === 'finalize'
      
      // Refresh user data if needed (e.g., coming from finalize page)
      if (fresh && refreshUser) {
        await refreshUser()
      }
      
      // Fetch current app time (Time Machine) from server - only if user is admin
      let currentAppTime = new Date().toISOString()
      if (userData?.isAdmin) {
        try {
          const timeData = await apiClient.getAppTime()
          currentAppTime = timeData?.success ? timeData.appTime : currentAppTime
        } catch (err) {
          console.warn('Failed to get app time, using system time:', err)
        }
      }
      setAppTime(currentAppTime)
      
      if (userData) {
        
        // Calculate portfolio metrics from investments using the new calculation functions
        const investments = userData.investments || []
        // Include active, withdrawal_notice, and withdrawn investments in the dashboard
        const confirmedInvestments = investments.filter(inv => 
          inv.status === 'active' || 
          inv.status === 'withdrawal_notice' || 
          inv.status === 'withdrawn'
        )
        const pendingInvestments = investments.filter(inv => inv.status === 'pending')
        const draftInvestments = investments.filter(inv => inv.status === 'draft')
        
        const investmentDetails = []
        
        confirmedInvestments.forEach(inv => {
          // Fallback: If confirmedAt is not set, try to get it from activity log
          let confirmedAt = inv.confirmedAt
          if (!confirmedAt && (inv.status === 'active' || inv.status === 'withdrawal_notice' || inv.status === 'withdrawn')) {
            const activity = userData.activity || []
            const confirmEvent = activity.find(a => a.type === 'investment_confirmed' && a.investmentId === inv.id)
            if (confirmEvent && confirmEvent.date) {
              confirmedAt = confirmEvent.date
            }
          }
          
          // Use enriched investment object for calculations
          const invWithConfirmedAt = confirmedAt ? { ...inv, confirmedAt } : inv
          
          const calculation = calculateInvestmentValue(invWithConfirmedAt, currentAppTime)
          const status = getInvestmentStatus(invWithConfirmedAt, currentAppTime)
          
          investmentDetails.push({
            ...inv,
            confirmedAt,
            calculation,
            status
          })
        })
        
        // Add pending investments to display (but without earnings calculations)
        pendingInvestments.forEach(inv => {
          investmentDetails.push({
            ...inv,
            calculation: {
              currentValue: inv.amount,
              totalEarnings: 0,
              monthsElapsed: 0,
              isWithdrawable: false,
              lockupEndDate: null
            },
            status: {
              status: 'pending',
              statusLabel: 'Pending',
              isActive: false,
              isLocked: true
            }
          })
        })
        
        // Add draft investments to display to allow resuming
        draftInvestments.forEach(inv => {
          investmentDetails.push({
            ...inv,
            calculation: {
              currentValue: inv.amount,
              totalEarnings: 0,
              monthsElapsed: 0,
              isWithdrawable: false,
              lockupEndDate: null
            },
            status: {
              status: 'draft',
              statusLabel: 'Draft',
              isActive: false,
              isLocked: false
            }
          })
        })
        
        // Sort investments: drafts first, then by creation date (most recent first)
        investmentDetails.sort((a, b) => {
          // Drafts always come first
          if (a.status.status === 'draft' && b.status.status !== 'draft') return -1
          if (a.status.status !== 'draft' && b.status.status === 'draft') return 1
          // Within same status group, sort by creation date (most recent first)
          const dateA = new Date(a.createdAt || 0)
          const dateB = new Date(b.createdAt || 0)
          return dateB - dateA
        })

        setPortfolioData({
          investments: investmentDetails
        })
      }
    } catch (e) {
      console.error('Failed to load investments data:', e)
      alert('Failed to load investments data. Please refresh the page. If the problem persists, contact support.')
    }
  }, [searchParams, userData, refreshUser])

  useEffect(() => {
    setMounted(true)
    loadData()
  }, [loadData])

  // Prevent hydration mismatch by not rendering until mounted on client
  if (!mounted || !userData) {
    return <div className={styles.loading}>Loading investments...</div>
  }

  return (
    <div className={styles.investmentsView}>
      <div className={styles.investmentsContainer}>
        <div className={styles.header}>
          <h1 className={styles.title}>YOUR INVESTMENTS</h1>
          <p className={styles.subtitle}>View and manage all your investments</p>
        </div>

        {/* Investments Section - Always visible with empty state */}
        <div className={styles.investmentsSection}>
        {portfolioData.investments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No investments yet</div>
            <div className={styles.emptySubtitle}>
              {INVESTMENTS_PAUSED 
                ? 'New investments are temporarily paused' 
                : 'Start your first investment to begin earning'}
            </div>
            {!INVESTMENTS_PAUSED && (
              <button 
                className={styles.startButton}
                onClick={() => {
                  try { localStorage.removeItem('currentInvestmentId') } catch {}
                  router.push('/investment?context=new')
                }}
              >
                Start an Investment →
              </button>
            )}
          </div>
        ) : (
          <div className={styles.investmentsList}>
            {portfolioData.investments.map(inv => (
              <InvestmentCard 
                key={inv.id} 
                investment={inv} 
                onDelete={loadData}
              />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

