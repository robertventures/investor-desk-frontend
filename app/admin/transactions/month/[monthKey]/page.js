'use client'
import { useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { fetchWithCsrf } from '../../../../../lib/csrfClient'
import AdminHeader from '../../../../components/AdminHeader'
import { useAdminData } from '../../../hooks/useAdminData'
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
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState({ key: 'userName', direction: 'asc' })

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
    
    // Debug: Log contribution breakdown for this month page
    const contributions = filtered.filter(e => e.type === 'contribution' || e.type === 'monthly_compounded')
    const contributionTotal = contributions.reduce((sum, e) => sum + safeAmount(e.amount), 0)
    
    console.log(`[MonthPage] monthKey=${monthKey}, filtered ${filtered.length} from ${allTransactions.length} transactions`)
    console.log(`[MonthPage] Contributions for ${monthKey}: ${contributions.length} items, Total: ${formatCurrency(contributionTotal)}`)
    
    if (contributions.length > 0) {
      // Log raw dates for first few items to check boundaries
      console.log(`[MonthPage] Sample contribution dates for ${monthKey}:`, 
        contributions.slice(0, 5).map(c => ({ id: c.id, date: c.date, amount: c.amount }))
      )
    }
    
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

  // Handle sort request
  const requestSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Filter by search term and pending status, then sort
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

    // Sort transactions
    filtered.sort((a, b) => {
      if (sortConfig.key === 'amount') {
        const amountA = safeAmount(a.amount)
        const amountB = safeAmount(b.amount)
        return sortConfig.direction === 'asc' ? amountA - amountB : amountB - amountA
      } else if (sortConfig.key === 'userName') {
        const nameA = a.userName || ''
        const nameB = b.userName || ''
        return sortConfig.direction === 'asc' 
          ? nameA.localeCompare(nameB) 
          : nameB.localeCompare(nameA)
      } else if (sortConfig.key === 'id') {
        const idA = a.id || ''
        const idB = b.id || ''
        return sortConfig.direction === 'asc' 
          ? idA.localeCompare(idB) 
          : idB.localeCompare(idA)
      } else if (sortConfig.key === 'status') {
        const statusA = a.status || ''
        const statusB = b.status || ''
        return sortConfig.direction === 'asc' 
          ? statusA.localeCompare(statusB) 
          : statusB.localeCompare(statusA)
      }
      
      // Default to date sort if key is unknown or as secondary sort logic implicitly via return 0 if equal
      return 0
    })

    // Secondary sort: Always sort by date (most recent first) within the primary sort groups
    // If primary sort values are equal, this ensures stable and logical ordering
    // Note: Javascript sort is stable in modern browsers
    if (sortConfig.key !== 'date') { // Only if we aren't explicitly sorting by date (which isn't in the requirements but good for completeness)
       // We do a custom sort here to preserve the primary sort order
       // Since we just sorted by primary key, we only need to fix the order for equal elements.
       // However, Array.prototype.sort is stable. So if we sort by Date first, then by Primary Key, it should work.
       // BUT, the original code sorted by date.
       
       // Let's try a combined comparator instead for robustness
       filtered.sort((a, b) => {
          // Primary Sort
          let comparison = 0
          if (sortConfig.key === 'amount') {
             comparison = safeAmount(a.amount) - safeAmount(b.amount)
          } else if (sortConfig.key === 'userName') {
             comparison = (a.userName || '').localeCompare(b.userName || '')
          } else if (sortConfig.key === 'id') {
             comparison = (a.id || '').localeCompare(b.id || '')
          } else if (sortConfig.key === 'status') {
             comparison = (a.status || '').localeCompare(b.status || '')
          }

          if (comparison !== 0) {
             return sortConfig.direction === 'asc' ? comparison : -comparison
          }

          // Secondary Sort: Date Descending
          const dateA = a.date ? new Date(a.date).getTime() : 0
          const dateB = b.date ? new Date(b.date).getTime() : 0
          return dateB - dateA
       })
    }

    return filtered
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTransactions, searchTerm, activeTab, showPendingOnly, investmentTransactions, distributionTransactions, contributionTransactions, sortConfig])

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
  
  // Helper for sort indicator
  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return null
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

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
          </div>

          {/* Filter Cards - Unified navigation and summary */}
          <div className={styles.filterCards}>
            <button
              className={`${styles.filterCard} ${styles.filterCardAll} ${activeTab === 'all' ? styles.filterCardActive : ''}`}
              onClick={() => { setActiveTab('all'); setShowPendingOnly(false); }}
            >
              <div className={styles.filterCardIcon}>📊</div>
              <div className={styles.filterCardLabel}>All</div>
              <div className={styles.filterCardAmount}>{formatCurrency(summary.totalAll)}</div>
              <div className={styles.filterCardCount}>{summary.totalCount} transactions</div>
            </button>

            <button
              className={`${styles.filterCard} ${styles.filterCardInvestment} ${activeTab === 'investment' ? styles.filterCardActive : ''}`}
              onClick={() => { setActiveTab('investment'); setShowPendingOnly(false); }}
            >
              <div className={styles.filterCardIcon}>💰</div>
              <div className={styles.filterCardLabel}>Investments</div>
              <div className={styles.filterCardAmount}>{formatCurrency(summary.totalInvestments)}</div>
              <div className={styles.filterCardCount}>{summary.investmentCount} investments</div>
            </button>

            <button
              className={`${styles.filterCard} ${styles.filterCardDistribution} ${activeTab === 'distribution' ? styles.filterCardActive : ''}`}
              onClick={() => setActiveTab('distribution')}
            >
              <div className={styles.filterCardIcon}>💸</div>
              <div className={styles.filterCardLabel}>Distributions</div>
              <div className={styles.filterCardAmount}>{formatCurrency(summary.totalPayouts)}</div>
              <div className={styles.filterCardCount}>{summary.payoutCount} distributions</div>
            </button>

            <button
              className={`${styles.filterCard} ${styles.filterCardContribution} ${activeTab === 'contribution' ? styles.filterCardActive : ''}`}
              onClick={() => { setActiveTab('contribution'); setShowPendingOnly(false); }}
            >
              <div className={styles.filterCardIcon}>📈</div>
              <div className={styles.filterCardLabel}>Contributions</div>
              <div className={styles.filterCardAmount}>{formatCurrency(summary.totalCompounded)}</div>
              <div className={styles.filterCardCount}>{summary.compoundedCount} contributions</div>
            </button>
          </div>

          {/* Tab Panel */}
          <div className={styles.tabPanel}>

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
                      <th 
                        className={styles.sortableHeader} 
                        onClick={() => requestSort('id')}
                      >
                        Transaction ID {getSortIndicator('id')}
                      </th>
                      <th 
                        className={styles.sortableHeader} 
                        onClick={() => requestSort('userName')}
                      >
                        User {getSortIndicator('userName')}
                      </th>
                      <th>Email</th>
                      <th>Investment ID</th>
                      <th 
                        className={styles.sortableHeader} 
                        onClick={() => requestSort('amount')}
                      >
                        Amount {getSortIndicator('amount')}
                      </th>
                      <th>Date</th>
                      <th 
                        className={styles.sortableHeader} 
                        onClick={() => requestSort('status')}
                      >
                        Status {getSortIndicator('status')}
                      </th>
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
                              <code>{event.id}</code>
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