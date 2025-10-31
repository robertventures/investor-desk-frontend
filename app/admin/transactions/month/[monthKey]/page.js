'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { apiClient } from '../../../../../lib/apiClient'
import { fetchWithCsrf } from '../../../../../lib/csrfClient'
import AdminHeader from '../../../../components/AdminHeader'
import styles from './page.module.css'
import { formatCurrency } from '../../../../../lib/formatters.js'

export default function MonthTransactionsPage() {
  const router = useRouter()
  const params = useParams()
  const monthKey = params?.monthKey
  
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [timeMachineData, setTimeMachineData] = useState({ appTime: null, isActive: false })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await apiClient.getAllUsers()
        if (data && data.success) {
          setUsers(data.users || [])
          setTimeMachineData(data.timeMachine || { appTime: null, isActive: false })
        }
      } catch (error) {
        console.error('Error fetching users:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchUsers()
  }, [])

  // Get the current app time from time machine
  const currentAppTime = timeMachineData?.appTime 
    ? new Date(timeMachineData.appTime).getTime() 
    : new Date().getTime()

  // Collect all transactions
  const allTransactions = useMemo(() => {
    const events = []
    
    users.forEach(user => {
      const investments = Array.isArray(user.investments) ? user.investments : []
      investments.forEach(investment => {
        // Add investment as a transaction
        if (investment.status === 'active') {
          const investmentDate = investment.confirmedAt || investment.createdAt
          const investmentTime = investmentDate ? new Date(investmentDate).getTime() : 0
          
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
          if (tx.type === 'distribution' || tx.type === 'contribution') {
            const txDate = tx.date
            const txTime = txDate ? new Date(txDate).getTime() : 0
            
            if (txTime <= currentAppTime) {
              events.push({
                ...tx,
                userId: user.id,
                userEmail: user.email,
                userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                investmentId: investment.id,
                lockupPeriod: investment.lockupPeriod || tx.lockupPeriod,
                paymentFrequency: investment.paymentFrequency || tx.paymentFrequency
              })
            }
          }
        })
      })
    })

    return events
  }, [users, currentAppTime])

  // Filter transactions for the selected month
  const monthTransactions = useMemo(() => {
    if (!monthKey) return []

    return allTransactions.filter(event => {
      if (!event.date) return false
      const date = new Date(event.date)
      // Use UTC methods to match how monthKey is generated in the main transactions page
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      const eventMonthKey = `${year}-${month}`
      return eventMonthKey === monthKey
    })
  }, [allTransactions, monthKey])

  // Filter by search term and type
  const filteredTransactions = useMemo(() => {
    let filtered = monthTransactions

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(event => event.type === filterType)
    }

    // Filter by pending status
    if (showPendingOnly) {
      filtered = filtered.filter(event => event.status === 'pending')
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(event => {
        return (
          event.userName?.toLowerCase().includes(term) ||
          event.userEmail?.toLowerCase().includes(term) ||
          event.userId?.toLowerCase().includes(term) ||
          event.investmentId?.toLowerCase().includes(term) ||
          event.id?.toLowerCase().includes(term)
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
  }, [monthTransactions, searchTerm, filterType, showPendingOnly])

  // Calculate summary
  const summary = useMemo(() => {
    const payouts = filteredTransactions.filter(e => e.type === 'distribution')
    const compounded = filteredTransactions.filter(e => e.type === 'contribution')
    const investments = filteredTransactions.filter(e => e.type === 'investment')
    const pending = filteredTransactions.filter(e => e.status === 'pending')
    
    return {
      totalAll: filteredTransactions.reduce((sum, e) => sum + (e.amount || 0), 0),
      totalPayouts: payouts.reduce((sum, e) => sum + (e.amount || 0), 0),
      totalCompounded: compounded.reduce((sum, e) => sum + (e.amount || 0), 0),
      totalInvestments: investments.reduce((sum, e) => sum + (e.amount || 0), 0),
      payoutCount: payouts.length,
      compoundedCount: compounded.length,
      investmentCount: investments.length,
      totalCount: filteredTransactions.length,
      pendingCount: pending.length
    }
  }, [filteredTransactions])

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
    if (eventType === 'distribution') return '💸'
    if (eventType === 'contribution') return '📈'
    if (eventType === 'investment') return '💰'
    return '📊'
  }

  const getEventTitle = (eventType) => {
    if (eventType === 'distribution') return 'Distribution'
    if (eventType === 'contribution') return 'Contribution'
    if (eventType === 'investment') return 'Investment'
    return eventType
  }

  const getEventColor = (eventType) => {
    if (eventType === 'distribution') return '#5b21b6'
    if (eventType === 'contribution') return '#0369a1'
    if (eventType === 'investment') return '#059669'
    return '#6b7280'
  }

  // Process all pending payouts
  const handleApproveAllPending = async () => {
    const pendingTransactions = filteredTransactions.filter(tx => tx.status === 'pending')
    
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
      
      // Refresh users data
      const data = await apiClient.getAllUsers()
      if (data && data.success) {
        setUsers(data.users || [])
        setTimeMachineData(data.timeMachine || { appTime: null, isActive: false })
      }
    } catch (error) {
      console.error('Error processing payouts:', error)
      alert('An error occurred while processing payouts')
    } finally {
      setIsProcessing(false)
    }
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
            <p className={styles.subtitle}>
              {summary.totalCount} transaction{summary.totalCount !== 1 ? 's' : ''} • Total: {formatCurrency(summary.totalAll)}
            </p>
          </div>

          {/* Summary Cards */}
          <div className={styles.summaryGrid}>
            {(filterType === 'all' || filterType === 'investment') && (
              <div className={styles.summaryCard}>
                <div className={styles.summaryLabel}>💰 Investments</div>
                <div className={styles.summaryValue}>{formatCurrency(summary.totalInvestments)}</div>
                <div className={styles.summarySubtext}>{summary.investmentCount} investments</div>
              </div>
            )}
            
            {(filterType === 'all' || filterType === 'distribution') && (
              <div className={styles.summaryCard}>
                <div className={styles.summaryLabel}>💸 Distributions</div>
                <div className={styles.summaryValue}>{formatCurrency(summary.totalPayouts)}</div>
                <div className={styles.summarySubtext}>{summary.payoutCount} distributions</div>
              </div>
            )}
            
            {(filterType === 'all' || filterType === 'contribution') && (
              <div className={styles.summaryCard}>
                <div className={styles.summaryLabel}>📈 Contributions</div>
                <div className={styles.summaryValue}>{formatCurrency(summary.totalCompounded)}</div>
                <div className={styles.summarySubtext}>{summary.compoundedCount} contributions</div>
              </div>
            )}
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
              <button
                className={`${styles.filterButton} ${showPendingOnly ? styles.active : ''}`}
                onClick={() => setShowPendingOnly(!showPendingOnly)}
              >
                ⏳ Pending Only
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

          {/* Approve All Button */}
          {showPendingOnly && summary.pendingCount > 0 && (
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
              <div className={styles.emptyIcon}>📊</div>
              <div className={styles.emptyTitle}>No transactions found</div>
              <div className={styles.emptyText}>
                {searchTerm ? `No transactions found matching "${searchTerm}"` : 'No transactions for this month'}
              </div>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
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
  )
}

