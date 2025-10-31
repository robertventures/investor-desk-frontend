'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import { useUser } from '../contexts/UserContext'
import styles from './PortfolioSummary.module.css'
import TransactionsList from './TransactionsList'
import { calculateInvestmentValue, formatCurrency, formatDate, getInvestmentStatus } from '../../lib/investmentCalculations.js'

export default function PortfolioSummary() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const { userData, refreshUser } = useUser()
  const [portfolioData, setPortfolioData] = useState({
    totalInvested: 0,
    totalPending: 0,
    totalEarnings: 0,
    totalCurrentValue: 0,
    investments: []
  })
  const [appTime, setAppTime] = useState(null)
  const [chartWidth, setChartWidth] = useState(600)
  const chartAreaRef = useRef(null)

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
      
      // Fetch app time
      let timeData
      try {
        timeData = await apiClient.getAppTime()
      } catch (err) {
        console.warn('Failed to get app time, using system time:', err)
        timeData = { success: false }
      }
      
      const currentAppTime = (timeData?.success && timeData.appTime) ? timeData.appTime : new Date().toISOString()
      setAppTime(currentAppTime)
      
      if (userData) {
        
        // Calculate portfolio metrics from investments using the new calculation functions
        const investments = userData.investments || []
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
          let totalCurrentValue = 0
          const investmentDetails = []
          
          confirmedInvestments.forEach(inv => {
            const calculation = calculateInvestmentValue(inv, currentAppTime)
            const investmentTransactions = Array.isArray(inv.transactions) ? inv.transactions : []
            const status = getInvestmentStatus(inv, currentAppTime)
            
            // Fallback: If confirmedAt is not set, try to get it from activity log
            let confirmedAt = inv.confirmedAt
            if (!confirmedAt && (inv.status === 'active' || inv.status === 'withdrawal_notice' || inv.status === 'withdrawn')) {
              const activity = userData.activity || []
              const confirmEvent = activity.find(a => a.type === 'investment_confirmed' && a.investmentId === inv.id)
              if (confirmEvent && confirmEvent.date) {
                confirmedAt = confirmEvent.date
              }
            }
            
            // Calculate earnings for ALL investments (including withdrawn)
            // Total Earnings represents lifetime earnings across all investments
            if (inv.status === 'withdrawn') {
              // For withdrawn investments, use the stored final earnings value
              totalEarnings += inv.totalEarnings || 0
            } else if (inv.status === 'active' || inv.status === 'withdrawal_notice') {
              // For active investments, calculate current earnings
              if (inv.paymentFrequency === 'monthly') {
                // For monthly payout investments, sum paid distributions from transactions
                const paid = investmentTransactions
                  .filter(tx => tx.type === 'distribution' && new Date(tx.date || 0) <= new Date(currentAppTime) && tx.status !== 'rejected')
                  .reduce((sum, ev) => sum + (Number(ev.amount) || 0), 0)
                totalEarnings += Math.round(paid * 100) / 100
              } else {
                // For compounding investments, use calculated earnings
                totalEarnings += calculation.totalEarnings
              }
            }
            
            // Only include active and withdrawal_notice investments in portfolio totals
            // Withdrawn investments don't count toward current invested amount or current value
            if (inv.status === 'active' || inv.status === 'withdrawal_notice') {
              totalInvested += inv.amount || 0
              // Portfolio current value only includes compounding growth
              if (inv.paymentFrequency === 'monthly') {
                // Monthly payout investments: keep principal only
                totalCurrentValue += inv.amount || 0
              } else {
                // Compounding investments: include accrued value
                totalCurrentValue += calculation.currentValue
              }
            }
            
            investmentDetails.push({
              ...inv,
              confirmedAt,  // Use the fallback value
              calculation,
              status
            })
          })
          
          // Pending investments (waiting for admin confirmation) + drafts
          const totalPending = [...pendingInvestments, ...draftInvestments].reduce((sum, inv) => sum + (inv.amount || 0), 0)
          
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
            totalCurrentValue,
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
      const confirmedInvestments = portfolioData.investments.filter(inv => 
        inv.status === 'active' || 
        inv.status === 'withdrawal_notice' || 
        inv.status === 'withdrawn'
      )

      if (confirmedInvestments.length === 0) {
        return []
      }

      // Build earnings series for last 23 month-ends plus current app time as the final point
      const end = new Date(appTime)
      if (isNaN(end.getTime())) {
        console.error('Invalid date for chart calculation:', appTime)
        return []
      }
      
      const start = new Date(end)
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
          if (inv.confirmedAt && new Date(inv.confirmedAt) <= asOf) {
            const investmentTransactions = Array.isArray(inv.transactions) ? inv.transactions : []
            // Include withdrawn investments in historical earnings
            // If withdrawn before this point, use final earnings; otherwise calculate as of this point
            if (inv.status === 'withdrawn' && inv.withdrawalNoticeStartAt && new Date(inv.withdrawalNoticeStartAt) <= asOf) {
              // Investment was withdrawn by this point - use stored final earnings
              totalEarnings += inv.totalEarnings || 0
            } else if (inv.paymentFrequency === 'monthly') {
              // For monthly payout investments, sum paid distributions from transactions
              const paidDistributions = investmentTransactions
                .filter(tx => tx.type === 'distribution' && new Date(tx.date || 0) <= asOf && tx.status !== 'rejected')
                .reduce((sum, ev) => sum + (Number(ev.amount) || 0), 0)
              totalEarnings += Math.round(paidDistributions * 100) / 100
            } else {
              // For compounding investments, use calculated earnings
              const calc = calculateInvestmentValue(inv, asOfIso)
              totalEarnings += calc.totalEarnings
            }
          }
        })
        points.push({ date: asOf, value: totalEarnings })
      }
      
      // Final point at current app time to match current investment info
      {
        const asOf = new Date(end)
        const asOfIso = asOf.toISOString()
        let totalEarnings = 0
        
        confirmedInvestments.forEach(inv => {
          if (inv.confirmedAt && new Date(inv.confirmedAt) <= asOf) {
            const investmentTransactions = Array.isArray(inv.transactions) ? inv.transactions : []
            // Include withdrawn investments in current earnings
            if (inv.status === 'withdrawn') {
              // Investment was withdrawn - use stored final earnings
              totalEarnings += inv.totalEarnings || 0
            } else if (inv.paymentFrequency === 'monthly') {
              // For monthly payout investments, sum paid distributions from transactions
              const paidDistributions = investmentTransactions
                .filter(tx => tx.type === 'distribution' && new Date(tx.date || 0) <= asOf && tx.status !== 'rejected')
                .reduce((sum, ev) => sum + (Number(ev.amount) || 0), 0)
              totalEarnings += Math.round(paidDistributions * 100) / 100
            } else {
              // For compounding investments, use calculated earnings
              const calc = calculateInvestmentValue(inv, asOfIso)
              totalEarnings += calc.totalEarnings
            }
          }
        })
        points.push({ date: asOf, value: totalEarnings })
      }
      
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

  // Observe width of chart area for responsiveness
  useEffect(() => {
    if (!chartAreaRef.current) return
    const el = chartAreaRef.current
    const ro = new ResizeObserver(entries => {
      if (!entries || !entries[0]) return
      const w = Math.max(320, Math.floor(entries[0].contentRect.width))
      setChartWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
            <span className={styles.metricLabel}>TOTAL INVESTED</span>
            <span className={styles.metricValue}>{formatCurrency(portfolioData.totalInvested)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>CURRENT VALUE</span>
            <span className={styles.metricValue}>{formatCurrency(portfolioData.totalCurrentValue)}</span>
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
            <div className={styles.chartGrid}>
              <div className={styles.yAxisLabel}>Valuation</div>
              <div className={styles.chartArea} ref={chartAreaRef}>
                {chartSeries.length > 0 && (() => {
                  const width = Math.max(320, chartWidth)
                  const height = 240
                  const padding = 28
                  const values = chartSeries.map(p => p.value)
                  const minV = Math.min(...values)
                  const maxV = Math.max(...values)
                  const range = Math.max(1, maxV - minV)
                  const xStep = (width - padding * 2) / Math.max(1, chartSeries.length - 1)
                  const points = chartSeries.map((p, i) => {
                    const x = padding + i * xStep
                    const y = padding + (1 - (p.value - minV) / range) * (height - padding * 2)
                    return { x, y }
                  })
                  const path = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
                  const areaPath = `${path} L ${padding + (chartSeries.length - 1) * xStep} ${height - padding} L ${padding} ${height - padding} Z`
                  // Y-axis ticks (min to max)
                  const yTickCount = 4
                  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => {
                    const v = minV + (range * (i / yTickCount))
                    const y = padding + (1 - (v - minV) / range) * (height - padding * 2)
                    return { v, y }
                  })
                  // X-axis labels (evenly spaced)
                  const xLabelCount = width < 480 ? 4 : 7
                  const lastIdx = chartSeries.length - 1
                  const step = Math.max(1, Math.round(lastIdx / (xLabelCount - 1)))
                  const labelIndices = Array.from({ length: xLabelCount }, (_, i) => Math.min(i * step, lastIdx))
                  
                  return (
                    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
                      <defs>
                        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* Gridlines */}
                      {yTicks.map((t, i) => (
                        <line key={`grid-${i}`} x1={padding} y1={t.y} x2={width - padding} y2={t.y} stroke="#e5e7eb" strokeDasharray="3,3" />
                      ))}
                      {/* Axes */}
                      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#9ca3af" strokeWidth="1" />
                      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#9ca3af" strokeWidth="1" />
                      {/* Y-axis labels */}
                      {yTicks.map((t, i) => (
                        <text key={`ylabel-${i}`} x={padding - 8} y={t.y} textAnchor="end" dominantBaseline="middle" fill="#6b7280" fontSize="10">
                          {formatCurrency(Math.round(t.v))}
                        </text>
                      ))}
                      {/* X-axis labels */}
                      {labelIndices.map((idx) => {
                        const p = points[idx]
                        const d = chartSeries[idx].date
                        const label = new Date(d).toLocaleString('en-US', { month: 'short' })
                        return (
                          <text key={`xlabel-${idx}`} x={p.x} y={height - padding + 14} textAnchor="middle" fill="#6b7280" fontSize="10">
                            {label}
                          </text>
                        )
                      })}
                      {/* Series */}
                      <path d={areaPath} fill="url(#grad)" stroke="none" />
                      <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2" />
                      {points.map((pt, i) => (
                        <circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill="#3b82f6" />
                      ))}
                    </svg>
                  )
                })()}
              </div>
            </div>
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
