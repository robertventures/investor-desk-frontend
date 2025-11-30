'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { apiClient } from '../../lib/apiClient'
import { useUser } from '../contexts/UserContext'
import styles from './PortfolioSummary.module.css'
import TransactionsList from './TransactionsList'
import { calculateInvestmentValue, formatCurrency, formatDate, getInvestmentStatus } from '../../lib/investmentCalculations.js'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className={styles.customTooltip}>
        <p className={styles.tooltipDate}>{new Date(label).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        <p className={styles.tooltipValue}>
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    )
  }
  return null
}

export default function PortfolioSummary() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const { userData, refreshUser } = useUser()
  const [portfolioData, setPortfolioData] = useState({
    totalInvested: 0,
    totalPending: 0,
    totalEarnings: 0,
    compoundingEarnings: 0,
    monthlyEarnings: 0,
    investments: []
  })
  const [appTime, setAppTime] = useState(null)

  const loadData = useCallback(async () => {
    if (typeof window === 'undefined') return
    
    const userId = localStorage.getItem('currentUserId')
    if (!userId) return

    try {
      // PERFORMANCE FIX: Only run transaction migration when explicitly needed (not on every load)
      // Migration will be triggered by:
      // 1. Admin time machine changes
      // 2. Manual admin action in Operations tab
      // 3. Background job (if implemented)
      
      // Get current app time for calculations
      const fresh = searchParams.get('from') === 'finalize'
      
      // Refresh user data if needed (e.g., coming from finalize page)
      if (fresh && refreshUser) {
        await refreshUser()
      }
      
      // Fetch app time (only for admin users, regular users use system time)
      let timeData = { success: false }
      if (userData?.isAdmin) {
        try {
          timeData = await apiClient.getAppTime()
        } catch (err) {
          console.warn('Failed to get app time, using system time:', err)
        }
      }
      
      // Calculate currentAppTime in a way consistent between server and client for initial render if possible
      // For hydration safety, rely on mounted state for date-dependent rendering
      const currentAppTime = (timeData?.success && timeData.appTime) ? timeData.appTime : new Date().toISOString()
      setAppTime(currentAppTime)
      
      if (userData) {
        
        // Calculate portfolio metrics from investments using the new calculation functions
        const investments = userData.investments || []
        
        console.log('[PortfolioSummary] Calculating metrics for investments:', {
          count: investments.length,
          statuses: investments.map(i => i.status)
        })

        // Include active, withdrawal_notice, and withdrawn investments in the dashboard
        // Investors should see all their investment history
        const confirmedInvestments = investments.filter(inv => 
          inv.status === 'active' || 
          inv.status === 'withdrawal_notice' || 
          inv.status === 'withdrawn'
        )
        const pendingInvestments = investments.filter(inv => inv.status === 'pending')
          const draftInvestments = investments.filter(inv => inv.status === 'draft')
          // Calculate totals using the precise calculation functions - only for confirmed investments
          let totalInvested = 0
          let totalEarnings = 0
          let compoundingEarnings = 0
          let monthlyEarnings = 0
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
            const investmentTransactions = Array.isArray(inv.transactions) ? inv.transactions : []
            const status = getInvestmentStatus(invWithConfirmedAt, currentAppTime)
            
            // Calculate earnings for ALL investments (including withdrawn)
            // Total Earnings represents lifetime earnings across all investments
            let investmentEarnings = 0
            if (inv.status === 'withdrawn') {
              // For withdrawn investments, use the stored final earnings value
              investmentEarnings = inv.totalEarnings || 0
            } else if (inv.status === 'active' || inv.status === 'withdrawal_notice') {
              // For active investments, use calculated earnings (standardized for both types)
              // This ensures consistency with the investments list view
              investmentEarnings = calculation.totalEarnings
            }
            
            totalEarnings += investmentEarnings
            
            // Split earnings into compounding vs monthly
            if (inv.paymentFrequency === 'monthly') {
              monthlyEarnings += investmentEarnings
            } else {
              compoundingEarnings += investmentEarnings
            }
            
            // Only include active and withdrawal_notice investments in portfolio totals
            // Withdrawn investments don't count toward current invested amount
            if (inv.status === 'active' || inv.status === 'withdrawal_notice') {
              totalInvested += Number(inv.amount || 0)
            }
            
            investmentDetails.push({
              ...inv,
              confirmedAt,  // Use the fallback value
              calculation,
              status
            })
          })
          
          // Pending investments (waiting for admin confirmation) + drafts
          const totalPending = [...pendingInvestments, ...draftInvestments].reduce((sum, inv) => sum + Number(inv.amount || 0), 0)
          
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

          const nextPortfolio = {
            totalInvested,
            totalPending,
            totalEarnings,
            compoundingEarnings,
            monthlyEarnings,
            investments: investmentDetails
          }
          setPortfolioData(nextPortfolio)
        
        // NOTE: Chart series calculation moved to useMemo for performance
      }
    } catch (e) {
      console.error('Failed to load portfolio data:', e)
      // Set error state so user knows something went wrong
      alert('Failed to load portfolio data. Please refresh the page. If the problem persists, contact support.')
    }
  }, [searchParams, userData, refreshUser])

  // PERFORMANCE FIX: Memoize chart series calculation to avoid recalculating on every render
  // Only recalculate when appTime or portfolioData.investments change
  const chartSeries = useMemo(() => {
    if (!appTime || !portfolioData.investments || portfolioData.investments.length === 0) {
      return []
    }

    try {
      const confirmedInvestments = portfolioData.investments.filter(inv => {
        const statusStr = inv.status?.status || inv.status
        return statusStr === 'active' || 
               statusStr === 'withdrawal_notice' || 
               statusStr === 'withdrawn'
      })

      console.log('[PortfolioSummary] Chart Series Calculation:', { 
        appTime, 
        investmentsCount: portfolioData.investments?.length,
        confirmedCount: confirmedInvestments.length 
      })

      if (confirmedInvestments.length === 0) {
        console.log('[PortfolioSummary] No confirmed investments for chart')
        return []
      }

      // Build earnings series for last 23 month-ends plus current app time as the final point
      const end = new Date(appTime)
      if (isNaN(end.getTime())) {
        console.error('Invalid date for chart calculation:', appTime)
        return []
      }
      
      const start = new Date(end)
      start.setDate(1) // Set to 1st of month to avoid overflow when subtracting months
      start.setMonth(start.getMonth() - 23)

      const points = []
      
      // 23 historical month-end points
      for (let i = 0; i < 23; i++) {
        const d = new Date(start)
        d.setMonth(start.getMonth() + i)
        const asOf = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        const asOfIso = asOf.toISOString()
        let totalEarnings = 0
        
        confirmedInvestments.forEach(inv => {
          // Normalize status and payment frequency for consistent handling
          const statusStr = inv.status?.status || inv.status
          const paymentFrequency = (inv.paymentFrequency || '').toLowerCase()
          // Create a normalized investment object for calculations that expects status as string
          const normalizedInv = { ...inv, status: statusStr }

          if (inv.confirmedAt && new Date(inv.confirmedAt) <= asOf) {
            const investmentTransactions = Array.isArray(inv.transactions) ? inv.transactions : []
            
            // Include withdrawn investments in historical earnings
            // If withdrawn before this point, use final earnings; otherwise calculate as of this point
            if (statusStr === 'withdrawn' && inv.withdrawalNoticeStartAt && new Date(inv.withdrawalNoticeStartAt) <= asOf) {
              // Investment was withdrawn by this point - use stored final earnings
              totalEarnings += inv.totalEarnings || 0
            } else {
              // For both compounding and monthly investments, use calculated earnings
              // This ensures the chart matches the total earnings shown in the metrics
              // IMPORTANT: Pass normalizedInv (with string status) so calculateInvestmentValue works correctly
              const calc = calculateInvestmentValue(normalizedInv, asOfIso)
              totalEarnings += calc.totalEarnings
            }
          }
        })
        points.push({ date: asOf.toISOString(), value: totalEarnings })
      }
      
      // Final point at current app time to match current investment info
      {
        const asOf = new Date(end)
        const asOfIso = asOf.toISOString()
        let totalEarnings = 0
        
        confirmedInvestments.forEach(inv => {
          const statusStr = inv.status?.status || inv.status
          const paymentFrequency = (inv.paymentFrequency || '').toLowerCase()
          const normalizedInv = { ...inv, status: statusStr }

          if (inv.confirmedAt && new Date(inv.confirmedAt) <= asOf) {
            const investmentTransactions = Array.isArray(inv.transactions) ? inv.transactions : []
            
            // Include withdrawn investments in current earnings
            if (statusStr === 'withdrawn') {
              // Investment was withdrawn - use stored final earnings
              totalEarnings += inv.totalEarnings || 0
            } else {
              // For both compounding and monthly investments, use calculated earnings
              // This ensures the chart matches the total earnings shown in the metrics
              const calc = calculateInvestmentValue(normalizedInv, asOfIso)
              totalEarnings += calc.totalEarnings
            }
          }
        })
        points.push({ date: asOf.toISOString(), value: totalEarnings })
      }
      
      console.log('[PortfolioSummary] Generated chart points:', points.length, points)
      return points
    } catch (e) {
      console.error('Error calculating chart series:', e)
      return []
    }
  }, [appTime, portfolioData.investments])

  useEffect(() => {
    setMounted(true)
    loadData()
  }, [loadData])

  // Prevent hydration mismatch by not rendering until mounted on client
  if (!mounted || !userData) {
    return <div className={styles.loading}>Loading portfolio...</div>
  }

  return (
    <div className={styles.portfolioSection}>
      <div className={styles.welcomeSection}>
        <h2 className={styles.welcomeText}>WELCOME BACK, {userData.firstName?.toUpperCase()} {userData.lastName?.toUpperCase()}</h2>
        <h1 className={styles.portfolioTitle}>YOUR PORTFOLIO</h1>
      </div>
      
      <div className={styles.content}>
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>
              {portfolioData.totalInvested === 0 && portfolioData.totalPending > 0 ? 'PENDING INVESTMENT' : 'TOTAL INVESTED'}
            </span>
            <span className={styles.metricValue}>
              {formatCurrency(portfolioData.totalInvested === 0 && portfolioData.totalPending > 0 ? portfolioData.totalPending : portfolioData.totalInvested)}
            </span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>COMPOUNDING INTEREST</span>
            <span className={styles.metricValue}>{formatCurrency(portfolioData.compoundingEarnings)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>MONTHLY PAYOUTS</span>
            <span className={styles.metricValue}>{formatCurrency(portfolioData.monthlyEarnings)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>TOTAL EARNINGS</span>
            <span className={styles.metricValue}>{formatCurrency(portfolioData.totalEarnings)}</span>
          </div>
        </div>
        
        <div className={styles.chartSection}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}>
              <span className={styles.dollarIcon}>$</span>
              <span className={styles.chartTitleText}>TOTAL EARNINGS</span>
            </div>
            <div className={styles.chartLegend}>
              <div className={styles.legendItem}>
                <div className={styles.legendColor}></div>
                <span>Total Earnings</span>
              </div>
            </div>
          </div>
          <div className={styles.chartPlaceholder}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartSeries}
                margin={{
                  top: 10,
                  right: 10,
                  left: 0,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short' })}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorEarnings)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* Activity embedded on main dashboard with pagination */}
      <div className={styles.transactionsWrapper}>
        <h2 className={styles.investmentsTitle}>ACTIVITY</h2>
        <TransactionsList limit={null} showViewAll={false} expandable={true} />
      </div>
    </div>
  )
}
