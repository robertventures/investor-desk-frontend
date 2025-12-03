'use client'
import { useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { fetchWithCsrf } from '../../../../../lib/csrfClient'
import AdminHeader from '../../../../components/AdminHeader'
import { useAdminData } from '../../../../hooks/useAdminData'
import styles from './page.module.css'
import { formatCurrency } from '../../../../../lib/formatters.js'

/**
 * Helper function to safely convert amount to number
 */
function safeAmount(amount) {
  if (amount === null || amount === undefined) return 0
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  return isNaN(num) ? 0 : num
}

export default function MonthTransactionsPage() {
  const router = useRouter()
  const params = useParams()
  const monthKey = params?.monthKey
  
  // Use centralized data hook - this ensures we use the exact same data as the main list
  // and handles authentication/tokens automatically
  const { 
    users, 
    allTransactions: apiTransactions, 
    isLoading, 
    refreshUsers 
  } = useAdminData()

  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all') // 'all', 'investment', 'distribution', 'contribution'
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Create user lookup map for enriching transactions
  const userMap = useMemo(() => {
    const map = new Map()
    users.forEach(user => {
      const userIdStr = user.id.toString()
      map.set(userIdStr, user)
      // Also map by numeric part (e.g., "USR-1025" -> "1025")
      const numericMatch = userIdStr.match(/\d+$/)
      if (numericMatch) {
        map.set(numericMatch[0], user)
      }
    })
    return map
  }, [users])

  // Collect all transactions (investments from users + distributions/contributions from API)
  const allTransactions = useMemo(() => {
    const events = []
    
    // Add investments from users
    let investmentCount = 0
    users.forEach(user => {
      const investments = Array.isArray(user.investments) ? user.investments : []
      investments.forEach(investment => {
        // Add investment as a transaction (only active investments)
        if (investment.status === 'active') {
          investmentCount++
          const investmentDate = investment.confirmedAt || investment.createdAt
          events.push({
            id: `inv-${investment.id}`,
            type: 'investment',
            amount: safeAmount(investment.amount),
            date: investmentDate,
            userId: user.id,
            userEmail: user.email,
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            investmentId: investment.id,
            lockupPeriod: investment.lockupPeriod,
            paymentFrequency: investment.paymentFrequency,
            status: investment.status
          })
        }
      })
    })
    
    // Add distributions and contributions from API transactions
    let distCount = 0, contribCount = 0, skippedCount = 0
    apiTransactions.forEach(tx => {
      const txType = tx.type
      if (txType === 'distribution' || txType === 'contribution' || txType === 'monthly_distribution' || txType === 'monthly_compounded') {
        if (txType === 'distribution' || txType === 'monthly_distribution') distCount++
        if (txType === 'contribution' || txType === 'monthly_compounded') contribCount++
        
        // Find user info
        const userId = tx.userId?.toString() || ''
        let user = userMap.get(userId)
        if (!user) {
          const numericMatch = userId.match(/\d+$/)
          if (numericMatch) {
            user = userMap.get(numericMatch[0])
          }
        }
        
        events.push({
          ...tx,
          amount: safeAmount(tx.amount),
          userId: tx.userId,
          userEmail: user?.email || tx.userEmail || null,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : tx.userName || `User #${tx.userId}`,
          investmentId: tx.investmentId
        })
      } else {
        skippedCount++
      }
    })
    
    console.log(`[MonthPage] allTransactions: ${events.length} total (${investmentCount} investments, ${distCount} distributions, ${contribCount} contributions, ${skippedCount} skipped)`)

    return events
  }, [users, apiTransactions, userMap])

  // Filter transactions for the selected month
  const monthTransactions = useMemo(() => {
    if (!monthKey) {
      console.log('[MonthPage] No monthKey provided')
      return []
    }

    const filtered = allTransactions.filter(event => {
      if (!event.date) return false
      const date = new Date(event.date)
      // Use UTC methods to match how monthKey is generated in the main transactions page
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      const eventMonthKey = `${year}-${month}`
      return eventMonthKey === monthKey
    })
    
    console.log(`[MonthPage] monthKey=${monthKey}, filtered ${filtered.length} from ${allTransactions.length} transactions`)
    
    return filtered
  }, [allTransactions, monthKey])

  // Separate transactions by type
  const investmentTransactions = useMemo(() => 
    monthTransactions.filter(e => e.type === 'investment'),
    [monthTransactions]
  )
  
  const distributionTransactions = useMemo(() => 
    monthTransactions.filter(e => e.type === 'distribution' || e.type === 'monthly_distribution'),
    [monthTransactions]
  )
  
  const contributionTransactions = useMemo(() => 
    monthTransactions.filter(e => e.type === 'contribution' || e.type === 'monthly_compounded'),
    [monthTransactions]
  )

  // Get transactions for active tab
  const getTabTransactions = () => {
    switch (activeTab) {
      case 'investment':
        return investmentTransactions
      case 'distribution':
        return distributionTransactions
      case 'contribution':
        return contributionTransactions
      default:
        return monthTransactions
    }
  }

  // Filter by search term and pending status
  const filteredTransactions = useMemo(() => {
    let filtered = getTabTransactions()

    // Filter by pending status (only applicable for distributions)
    if (showPendingOnly && activeTab === 'distribution') {
      filtered = filtered.filter(event => event.status === 'pending')
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(event => {
        return (
          event.userName?.toLowerCase().includes(term) ||
          event.userEmail?.toLowerCase().includes(term) ||
          event.userId?.toString().toLowerCase().includes(term) ||
          event.investmentId?.toString().toLowerCase().includes(term) ||
          event.id?.toString().toLowerCase().includes(term)
        )
      })
    }

    // Sort by date (most recent first)
    filtered.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })

    return filtered
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTransactions, searchTerm, activeTab, showPendingOnly, investmentTransactions, distributionTransactions, contributionTransactions])

  // Calculate summary for each tab
  const summary = useMemo(() => {
    const investments = investmentTransactions
    const payouts = distributionTransactions
    const compounded = contributionTransactions
    const pending = payouts.filter(e => e.status === 'pending')
    
    return {
      totalAll: monthTransactions.reduce((sum, e) => sum + (e.amount || 0), 0),
      totalPayouts: payouts.reduce((sum, e) => sum + (e.amount || 0), 0),
      totalCompounded: compounded.reduce((sum, e) => sum + (e.amount || 0), 0),
      totalInvestments: investments.reduce((sum, e) => sum + (e.amount || 0), 0),
      payoutCount: payouts.length,
      compoundedCount: compounded.length,
      investmentCount: investments.length,
      totalCount: monthTransactions.length,
      pendingCount: pending.length
    }
  }, [monthTransactions, investmentTransactions, distributionTransactions, contributionTransactions])

  // Get display month name
  const displayMonth = useMemo(() => {
    if (!monthKey) return ''
    const [year, month] = monthKey.split('-')
    const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1))
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    })
  }, [monthKey])

  const getEventIcon = (eventType) => {
    if (eventType === 'distribution' || eventType === 'monthly_distribution') return '💸'
    if (eventType === 'contribution' || eventType === 'monthly_compounded') return '📈'
    if (eventType === 'investment') return '💰'
    return '📊'
  }

  const getEventTitle = (eventType) => {
    if (eventType === 'distribution' || eventType === 'monthly_distribution') return 'Distribution'
    if (eventType === 'contribution' || eventType === 'monthly_compounded') return 'Contribution'
    if (eventType === 'investment') return 'Investment'
    return eventType
  }

  const getEventColor = (eventType) => {
    if (eventType === 'distribution' || eventType === 'monthly_distribution') return '#5b21b6'
    if (eventType === 'contribution' || eventType === 'monthly_compounded') return '#0369a1'
    if (eventType === 'investment') return '#059669'
    return '#6b7280'
  }

  // Process all pending payouts
  const handleApproveAllPending = async () => {
    const pendingTransactions = distributionTransactions.filter(tx => tx.status === 'pending')
    
    if (pendingTransactions.length === 0) {
      alert('No pending transactions to process')
      return
    }
    
    if (!confirm(`Approve and process ${pendingTransactions.length} pending payout(s)?`)) return
    
    setIsProcessing(true)
    
    try {
      let successCount = 0
      let errorCount = 0
      
      for (const transaction of pendingTransactions) {
        const res = await fetchWithCsrf('/api/admin/pending-payouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve',
            userId: transaction.userId,
            transactionId: transaction.id
          })
        })
        
        const data = await res.json()
        if (data.success) {
          successCount++
        } else {
          errorCount++
          console.error(`Failed to process ${transaction.id}:`, data.error)
        }
      }
      
      alert(`Processed ${successCount} payout(s) successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`)
      
      // Refresh data using the hook
      await refreshUsers(true)
      
    } catch (error) {
      console.error('Error processing payouts:', error)
      alert('An error occurred while processing payouts')
    } finally {
      setIsProcessing(false)
    }
  }

  // Get tab-specific summary card content
  const getTabSummary = () => {
    switch (activeTab) {
      case 'investment':
        return {
          icon: '💰',
          label: 'Investments',
          amount: summary.totalInvestments,
          count: summary.investmentCount,
          countLabel: 'investments'
        }
      case 'distribution':
        return {
          icon: '💸',
          label: 'Distributions',
          amount: summary.totalPayouts,
          count: summary.payoutCount,
          countLabel: 'distributions'
        }
      case 'contribution':
        return {
          icon: '📈',
          label: 'Contributions',
          amount: summary.totalCompounded,
          count: summary.compoundedCount,
          countLabel: 'contributions'
        }
      default:
        return null
    }
  }

  const tabSummary = getTabSummary()

  if (isLoading) {
    return (
      <div className={styles.main}>
        <AdminHeader activeTab="distributions" />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.loadingState}>Loading transactions...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.main}>
      <AdminHeader activeTab="distributions" />
      <div className={styles.container}>
        <div className={styles.content}>
          {/* Header */}
          <div className={styles.headerRow}>
            <button 
              className={styles.backButton}
              onClick={() => router.push('/admin?tab=distributions')}
            >
              ← Back to Transactions
            </button>
          </div>

          <div className={styles.titleRow}>
            <h1 className={styles.title}>{displayMonth}</h1>
            <p className={styles.subtitle}>
              {summary.totalCount} transaction{summary.totalCount !== 1 ? 's' : ''} • Total: {formatCurrency(summary.totalAll)}
            </p>
          </div>

          {/* Tab Navigation */}
          <div className={styles.tabNavigation}>
            <button
              className={`${styles.tab} ${activeTab === 'all' ? styles.activeTab : ''}`}
              onClick={() => { setActiveTab('all'); setShowPendingOnly(false); }}
            >
              <span className={styles.tabIcon}>📊</span>
              <span className={styles.tabLabel}>All</span>
              <span className={styles.tabCount}>{summary.totalCount}</span>
            </button>
            <button
              className={`${styles.tab} ${styles.tabInvestment} ${activeTab === 'investment' ? styles.activeTab : ''}`}
              onClick={() => { setActiveTab('investment'); setShowPendingOnly(false); }}
            >
              <span className={styles.tabIcon}>💰</span>
              <span className={styles.tabLabel}>Investments</span>
              <span className={styles.tabCount}>{summary.investmentCount}</span>
            </button>
            <button
              className={`${styles.tab} ${styles.tabDistribution} ${activeTab === 'distribution' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('distribution')}
            >
              <span className={styles.tabIcon}>💸</span>
              <span className={styles.tabLabel}>Distributions</span>
              <span className={styles.tabCount}>{summary.payoutCount}</span>
            </button>
            <button
              className={`${styles.tab} ${styles.tabContribution} ${activeTab === 'contribution' ? styles.activeTab : ''}`}
              onClick={() => { setActiveTab('contribution'); setShowPendingOnly(false); }}
            >
              <span className={styles.tabIcon}>📈</span>
              <span className={styles.tabLabel}>Contributions</span>
              <span className={styles.tabCount}>{summary.compoundedCount}</span>
            </button>
          </div>

          {/* Tab Panel */}
          <div className={styles.tabPanel}>
            {/* Tab Summary Card - Only show for specific tabs */}
            {tabSummary && (
              <div className={`${styles.tabSummaryCard} ${styles[`tabSummary${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`]}`}>
                <div className={styles.tabSummaryIcon}>{tabSummary.icon}</div>
                <div className={styles.tabSummaryContent}>
                  <div className={styles.tabSummaryLabel}>{tabSummary.label}</div>
                  <div className={styles.tabSummaryAmount}>{formatCurrency(tabSummary.amount)}</div>
                  <div className={styles.tabSummaryCount}>{tabSummary.count} {tabSummary.countLabel}</div>
                </div>
              </div>
            )}

            {/* All Tab - Summary Cards Grid */}
            {activeTab === 'all' && (
              <div className={styles.summaryGrid}>
                <div className={`${styles.summaryCard} ${styles.summaryCardInvestment}`}>
                  <div className={styles.summaryLabel}>💰 Investments</div>
                  <div className={styles.summaryValue}>{formatCurrency(summary.totalInvestments)}</div>
                  <div className={styles.summarySubtext}>{summary.investmentCount} investments</div>
                </div>
                
                <div className={`${styles.summaryCard} ${styles.summaryCardDistribution}`}>
                  <div className={styles.summaryLabel}>💸 Distributions</div>
                  <div className={styles.summaryValue}>{formatCurrency(summary.totalPayouts)}</div>
                  <div className={styles.summarySubtext}>{summary.payoutCount} distributions</div>
                </div>
                
                <div className={`${styles.summaryCard} ${styles.summaryCardContribution}`}>
                  <div className={styles.summaryLabel}>📈 Contributions</div>
                  <div className={styles.summaryValue}>{formatCurrency(summary.totalCompounded)}</div>
                  <div className={styles.summarySubtext}>{summary.compoundedCount} contributions</div>
                </div>
              </div>
            )}

            {/* Search and Filters */}
            <div className={styles.filtersContainer}>
              <div className={styles.searchContainer}>
                <input
                  type="text"
                  placeholder="Search by user, email, transaction ID, investment ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                />
                {searchTerm && (
                  <button 
                    className={styles.clearButton} 
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Pending Only filter - Only for distributions tab */}
              {activeTab === 'distribution' && summary.pendingCount > 0 && (
                <button
                  className={`${styles.pendingFilter} ${showPendingOnly ? styles.active : ''}`}
                  onClick={() => setShowPendingOnly(!showPendingOnly)}
                >
                  ⏳ Pending Only ({summary.pendingCount})
                </button>
              )}
            </div>

            {/* Approve All Button - Only for distributions with pending */}
            {activeTab === 'distribution' && showPendingOnly && summary.pendingCount > 0 && (
              <div className={styles.approveAllContainer}>
                <button
                  className={styles.approveAllButton}
                  onClick={handleApproveAllPending}
                  disabled={isProcessing}
                >
                  {isProcessing 
                    ? 'Processing...' 
                    : `✓ Approve & Process ${summary.pendingCount} Pending Payout${summary.pendingCount !== 1 ? 's' : ''}`
                  }
                </button>
              </div>
            )}

            {/* Transactions Table */}
            {filteredTransactions.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  {activeTab === 'investment' ? '💰' : activeTab === 'distribution' ? '💸' : activeTab === 'contribution' ? '📈' : '📊'}
                </div>
                <div className={styles.emptyTitle}>No {activeTab === 'all' ? 'transactions' : `${activeTab}s`} found</div>
                <div className={styles.emptyText}>
                  {searchTerm 
                    ? `No ${activeTab === 'all' ? 'transactions' : `${activeTab}s`} found matching "${searchTerm}"` 
                    : `No ${activeTab === 'all' ? 'transactions' : `${activeTab}s`} for this month`}
                </div>
              </div>
            ) : (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {activeTab === 'all' && <th>Type</th>}
                      <th>Transaction ID</th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Investment ID</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map(event => {
                      const dateValue = event.displayDate || event.date
                      const date = dateValue ? new Date(dateValue).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'America/New_York'
                      }) : '-'
                      
                      return (
                        <tr key={event.id} className={styles.eventRow}>
                          {activeTab === 'all' && (
                            <td>
                              <div className={styles.eventTypeCell}>
                                <span 
                                  className={styles.eventIcon} 
                                  style={{ color: getEventColor(event.type) }}
                                >
                                  {getEventIcon(event.type)}
                                </span>
                                <span className={styles.eventLabel}>{getEventTitle(event.type)}</span>
                              </div>
                            </td>
                          )}
                          <td className={styles.transactionIdCell}>
                            {event.id ? (
                              <button
                                className={styles.transactionIdButton}
                                onClick={() => router.push(`/admin/transactions/${event.id}`)}
                                title="View transaction details"
                              >
                                <code>{event.id}</code>
                              </button>
                            ) : (
                              <code>-</code>
                            )}
                          </td>
                          <td>
                            <button
                              className={styles.linkButton}
                              onClick={() => router.push(`/admin/users/${event.userId}`)}
                            >
                              {event.userName}
                            </button>
                          </td>
                          <td className={styles.emailCell}>{event.userEmail}</td>
                          <td>
                            {event.investmentId ? (
                              <button
                                className={styles.linkButton}
                                onClick={() => router.push(`/admin/investments/${event.investmentId}`)}
                              >
                                {event.investmentId}
                              </button>
                            ) : (
                              <span className={styles.naText}>-</span>
                            )}
                          </td>
                          <td>
                            <strong className={styles.amount}>{formatCurrency(event.amount)}</strong>
                          </td>
                          <td className={styles.dateCell}>{date}</td>
                          <td>
                            <span className={styles.statusBadge} data-status={event.status || 'received'}>
                              {event.status || 'Received'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}