'use client'
import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './DistributionsTab.module.css'
import { formatCurrency } from '../../../lib/formatters.js'

/**
 * Helper function to safely convert amount to number
 * Handles null, undefined, strings, and NaN values
 */
function safeAmount(amount) {
  if (amount === null || amount === undefined) return 0
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  return isNaN(num) ? 0 : num
}

/**
 * Transactions tab showing all transactions: investments, monthly payments and compounding calculations
 */
export default function DistributionsTab({ users, timeMachineData }) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all', 'distribution', 'contribution', 'investment'
  const [groupBy, setGroupBy] = useState('date') // 'date', 'user', 'investment'
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Get the current app time from time machine (or current time if not active)
  const currentAppTime = timeMachineData?.appTime 
    ? new Date(timeMachineData.appTime).getTime() 
    : new Date().getTime()

  // Collect all transaction events from all users (investments + distributions + contributions)
  const allDistributions = useMemo(() => {
    const events = []
    
    users.forEach(user => {
      const investments = Array.isArray(user.investments) ? user.investments : []
      investments.forEach(investment => {
        // Add investment as a transaction
        if (investment.status === 'active') {
          const investmentDate = investment.confirmedAt || investment.createdAt
          const investmentTime = investmentDate ? new Date(investmentDate).getTime() : 0
          
          // Only include if investment date is at or before current app time
          if (investmentTime <= currentAppTime) {
            events.push({
              id: `inv-${investment.id}`,
              type: 'investment',
              amount: investment.amount,
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
        }
        
        // Add distribution and contribution transactions
        const transactions = Array.isArray(investment.transactions) ? investment.transactions : []
        transactions.forEach(tx => {
          if (tx.type === 'distribution' || tx.type === 'contribution' || tx.type === 'monthly_distribution' || tx.type === 'monthly_compounded') {
            const txDate = tx.date
            const txTime = txDate ? new Date(txDate).getTime() : 0
            
            // Only include if transaction date is at or before current app time
            if (txTime <= currentAppTime) {
              events.push({
                ...tx,
                // Extract metadata fields if they exist in JSONB
                monthIndex: tx.monthIndex || tx.metadata?.monthIndex,
                lockupPeriod: tx.lockupPeriod || tx.metadata?.lockupPeriod || investment.lockupPeriod,
                paymentFrequency: tx.paymentFrequency || tx.metadata?.paymentFrequency || investment.paymentFrequency,
                userId: user.id,
                userEmail: user.email,
                userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                investmentId: investment.id
              })
            }
          }
        })
      })
    })

    // Sort by date (most recent first)
    events.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })

    return events
  }, [users, currentAppTime])

  // Filter distributions based on search term and filter type
  const filteredDistributions = useMemo(() => {
    let filtered = allDistributions

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(event => {
        // Group similar transaction types together
        if (filterType === 'distribution') {
          return event.type === 'distribution' || event.type === 'monthly_distribution'
        }
        if (filterType === 'contribution') {
          return event.type === 'contribution' || event.type === 'monthly_compounded'
        }
        return event.type === filterType
      })
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

    return filtered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDistributions, searchTerm, filterType])

  // Calculate summary statistics from ALL distributions (not filtered)
  // This ensures the summary cards always show accurate totals
  const summary = useMemo(() => {
    const payouts = allDistributions.filter(e => e.type === 'distribution' || e.type === 'monthly_distribution')
    const compounded = allDistributions.filter(e => e.type === 'contribution' || e.type === 'monthly_compounded')
    const investments = allDistributions.filter(e => e.type === 'investment')
    
    const totalPayouts = payouts.reduce((sum, e) => sum + safeAmount(e.amount), 0)
    const totalCompounded = compounded.reduce((sum, e) => sum + safeAmount(e.amount), 0)
    const totalInvestments = investments.reduce((sum, e) => sum + safeAmount(e.amount), 0)
    const totalAll = totalPayouts + totalCompounded + totalInvestments

    return {
      totalAll,
      totalPayouts,
      totalCompounded,
      totalInvestments,
      payoutCount: payouts.length,
      compoundedCount: compounded.length,
      investmentCount: investments.length,
      totalCount: allDistributions.length
    }
  }, [allDistributions])

  // Group distributions by month
  const groupedByMonth = useMemo(() => {
    const groups = {}
    
    filteredDistributions.forEach(event => {
      if (!event.date) return
      
      const date = new Date(event.date)
      // Use YYYY-MM format for proper sorting (using UTC to avoid timezone issues)
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      const monthKey = `${year}-${month}`
      
      if (!groups[monthKey]) {
        groups[monthKey] = {
          monthKey,
          displayMonth: date.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
          }),
          events: [],
          totalAmount: 0,
          payoutAmount: 0,
          compoundedAmount: 0,
          investmentAmount: 0
        }
      }
      
      const amount = safeAmount(event.amount)
      groups[monthKey].events.push(event)
      groups[monthKey].totalAmount += amount
      
      if (event.type === 'distribution' || event.type === 'monthly_distribution') {
        groups[monthKey].payoutAmount += amount
      } else if (event.type === 'contribution' || event.type === 'monthly_compounded') {
        groups[monthKey].compoundedAmount += amount
      } else if (event.type === 'investment') {
        groups[monthKey].investmentAmount += amount
      }
    })

    // Sort by monthKey in descending order (most recent first)
    return Object.values(groups).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
  }, [filteredDistributions])

  // Paginate month groups
  const paginatedMonthGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return groupedByMonth.slice(startIndex, endIndex)
  }, [groupedByMonth, currentPage, itemsPerPage])

  const totalPages = Math.ceil(groupedByMonth.length / itemsPerPage)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterType])

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

  return (
    <div className={styles.distributionsTab}>
      {/* Summary Cards - Always show all 4 cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Transactions</div>
          <div className={styles.summaryValue}>{formatCurrency(summary.totalAll)}</div>
          <div className={styles.summarySubtext}>{summary.totalCount} transactions</div>
        </div>
        
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>💰 Investments</div>
          <div className={styles.summaryValue}>{formatCurrency(summary.totalInvestments)}</div>
          <div className={styles.summarySubtext}>{summary.investmentCount} investments</div>
        </div>
        
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>💸 Distributions</div>
          <div className={styles.summaryValue}>{formatCurrency(summary.totalPayouts)}</div>
          <div className={styles.summarySubtext}>{summary.payoutCount} distributions</div>
        </div>
        
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>📈 Contributions</div>
          <div className={styles.summaryValue}>{formatCurrency(summary.totalCompounded)}</div>
          <div className={styles.summarySubtext}>{summary.compoundedCount} contributions</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className={styles.filtersContainer}>
        <div className={styles.filterButtons}>
          <button
            className={`${styles.filterButton} ${filterType === 'all' ? styles.active : ''}`}
            onClick={() => setFilterType('all')}
          >
            All Transactions
          </button>
          <button
            className={`${styles.filterButton} ${filterType === 'investment' ? styles.active : ''}`}
            onClick={() => setFilterType('investment')}
          >
            💰 Investments
          </button>
          <button
            className={`${styles.filterButton} ${filterType === 'distribution' ? styles.active : ''}`}
            onClick={() => setFilterType('distribution')}
          >
            💸 Distributions
          </button>
          <button
            className={`${styles.filterButton} ${filterType === 'contribution' ? styles.active : ''}`}
            onClick={() => setFilterType('contribution')}
          >
            📈 Contributions
          </button>
        </div>

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
      </div>

      {/* Grouped by Month View */}
      <div className={styles.monthlyGroups}>
        {groupedByMonth.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📊</div>
            <div className={styles.emptyTitle}>No transactions found</div>
            <div className={styles.emptyText}>
              {searchTerm ? `No transactions found matching "${searchTerm}"` : 'No transactions have been processed yet'}
            </div>
          </div>
        ) : (
          <>
            {paginatedMonthGroups.map(monthGroup => {
              return (
                <div 
                  key={monthGroup.monthKey} 
                  className={styles.monthGroup}
                  onClick={() => router.push(`/admin/transactions/month/${monthGroup.monthKey}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.monthHeader}>
                    <div className={styles.monthTitle}>
                      <span className={styles.monthName}>{monthGroup.displayMonth}</span>
                      <span className={styles.monthCount}>({monthGroup.events.length} transactions)</span>
                    </div>
                    <div className={styles.monthSummary}>
                      <span className={styles.monthBreakdown}>
                        <span className={styles.breakdownLabel}>Investments:</span>
                        <span className={styles.breakdownValue}>{formatCurrency(monthGroup.investmentAmount)}</span>
                      </span>
                      <span className={styles.monthBreakdown}>
                        <span className={styles.breakdownLabel}>Distributions:</span>
                        <span className={styles.breakdownValue}>{formatCurrency(monthGroup.payoutAmount)}</span>
                      </span>
                      <span className={styles.monthBreakdown}>
                        <span className={styles.breakdownLabel}>Contributions:</span>
                        <span className={styles.breakdownValue}>{formatCurrency(monthGroup.compoundedAmount)}</span>
                      </span>
                      <span className={styles.viewMonthIcon}>→</span>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className={styles.paginationContainer}>
                <button
                  className={styles.paginationButton}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  ← Previous
                </button>
                
                <div className={styles.paginationInfo}>
                  Page {currentPage} of {totalPages}
                  <span className={styles.paginationCount}>
                    ({groupedByMonth.length} month{groupedByMonth.length !== 1 ? 's' : ''})
                  </span>
                </div>
                
                <button
                  className={styles.paginationButton}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
