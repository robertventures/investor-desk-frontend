'use client'
import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './ActivityTab.module.css'
import { formatCurrency } from '../../../lib/formatters.js'

/**
 * Helper function to safely convert amount to number
 */
function safeAmount(amount) {
  if (amount === null || amount === undefined) return 0
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  return isNaN(num) ? 0 : num
}

/**
 * Activity tab showing all platform-wide activity events
 * Refactored to use transactions (ledger of record) as the primary data source
 */
export default function ActivityTab({ users, isLoading, onRefresh }) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // Extract all activity events from user transactions + investment creation events
  const allActivity = useMemo(() => {
    const events = []
    
    users.forEach(user => {
      const investments = Array.isArray(user.investments) ? user.investments : []
      
      investments.forEach(investment => {
        // 1. Add investment creation event
        if (investment.createdAt) {
          events.push({
            id: `inv-created-${investment.id}`,
            type: 'investment_created',
            status: investment.status === 'pending' ? 'pending' : 'completed',
            userId: user.id,
            userEmail: user.email,
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            investmentId: investment.id,
            amount: safeAmount(investment.amount),
            date: investment.createdAt,
            displayDate: investment.createdAt,
            title: 'Investment Created',
            description: `Investment created for ${formatCurrency(safeAmount(investment.amount))}`
          })
        }
        
        // 2. Add transaction events (distributions, contributions, etc)
        const transactions = Array.isArray(investment.transactions) ? investment.transactions : []
        transactions.forEach(tx => {
          events.push({
            id: tx.id,
            type: tx.type, // 'investment', 'distribution', 'contribution', 'monthly_distribution', etc.
            status: tx.status || 'completed', // pending, approved, rejected, received
            userId: user.id,
            userEmail: user.email,
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            investmentId: investment.id,
            amount: safeAmount(tx.amount),
            date: tx.date,
            displayDate: tx.date,
            title: getEventTitle(tx.type),
            description: tx.description || `${getEventTitle(tx.type)} of ${formatCurrency(safeAmount(tx.amount))}`,
            metadata: tx.metadata
          })
        })
      })
      
      // 3. Add account creation event
      if (user.createdAt || user.created_at) {
        const createdDate = user.createdAt || user.created_at
        events.push({
          id: `user-created-${user.id}`,
          type: 'account_created',
          status: 'completed',
          userId: user.id,
          userEmail: user.email,
          userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          investmentId: null,
          amount: null,
          date: createdDate,
          displayDate: createdDate,
          title: 'Account Created',
          description: 'User account created'
        })
      }
    })

    // Sort by date (most recent first)
    events.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })

    return events
  }, [users])

  // Filter activity based on search term
  const filteredActivity = useMemo(() => {
    if (!searchTerm.trim()) return allActivity

    const term = searchTerm.toLowerCase()
    return allActivity.filter(event => {
      return (
        event.type?.toLowerCase().includes(term) ||
        event.userName?.toLowerCase().includes(term) ||
        event.userEmail?.toLowerCase().includes(term) ||
        event.userId?.toString().toLowerCase().includes(term) ||
        event.investmentId?.toString().toLowerCase().includes(term) ||
        event.id?.toString().toLowerCase().includes(term) ||
        event.status?.toLowerCase().includes(term)
      )
    })
  }, [allActivity, searchTerm])

  // Paginate filtered activity
  const paginatedActivity = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredActivity.slice(startIndex, endIndex)
  }, [filteredActivity, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredActivity.length / itemsPerPage)

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // Helper functions for display
  const getEventTitle = (eventType) => {
    switch (eventType) {
      case 'account_created': return 'Account Created'
      case 'investment_created': return 'Investment Created'
      case 'investment_submitted': return 'Investment Submitted'
      case 'investment_confirmed': return 'Investment Confirmed'
      case 'investment_rejected': return 'Investment Rejected'
      case 'investment': return 'Investment Transaction'
      case 'distribution': return 'Distribution'
      case 'monthly_distribution': return 'Distribution'
      case 'monthly_contribution': return 'Contribution'
      case 'contribution': return 'Contribution'
      case 'monthly_compounded': return 'Monthly Compounded'
      case 'withdrawal_requested': return 'Withdrawal Requested'
      case 'withdrawal_notice_started': return 'Withdrawal Notice Started'
      case 'withdrawal_approved': return 'Withdrawal Processed'
      case 'withdrawal_rejected': return 'Withdrawal Rejected'
      case 'redemption': return 'Redemption'
      default: return eventType || 'Unknown Event'
    }
  }

  // Get event metadata (icon, color)
  const getEventMeta = (eventType) => {
    switch (eventType) {
      case 'account_created':
        return { icon: '👤', color: '#0369a1' }
      case 'investment_created':
      case 'investment_submitted':
      case 'investment':
        return { icon: '🧾', color: '#0369a1' }
      case 'investment_confirmed':
      case 'withdrawal_approved':
        return { icon: '✅', color: '#065f46' }
      case 'investment_rejected':
      case 'withdrawal_rejected':
        return { icon: '❌', color: '#991b1b' }
      case 'distribution':
      case 'monthly_distribution':
        return { icon: '💸', color: '#5b21b6' }
      case 'contribution':
      case 'monthly_contribution':
      case 'monthly_compounded':
        return { icon: '📈', color: '#5b21b6' }
      case 'withdrawal_requested':
      case 'withdrawal_notice_started':
      case 'redemption':
        return { icon: '🏦', color: '#ca8a04' }
      default:
        return { icon: '•', color: '#6b7280' }
    }
  }

  return (
    <div className={styles.activityTab}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Platform Activity</h2>
          <p className={styles.subtitle}>
            All financial activity and events ({filteredActivity.length} total)
            {totalPages > 1 && ` - Page ${currentPage} of ${totalPages}`}
          </p>
        </div>
        <button
          className={styles.refreshButton}
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? '⟳ Loading...' : '↻ Refresh'}
        </button>
      </div>

      {/* Search Bar */}
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search by user, email, investment ID, event type, status..."
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

      {/* Activity Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Event</th>
              <th>Status</th>
              <th>User</th>
              <th>Email</th>
              <th>Investment ID</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Event ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="9" className={styles.emptyState}>
                  Loading activity events...
                </td>
              </tr>
            ) : filteredActivity.length === 0 ? (
              <tr>
                <td colSpan="9" className={styles.emptyState}>
                  {searchTerm ? `No activity events found matching "${searchTerm}"` : 'No activity events yet'}
                </td>
              </tr>
            ) : (
              paginatedActivity.map(event => {
                const meta = getEventMeta(event.type)
                const dateValue = event.displayDate || event.date
                const date = dateValue
                  ? new Date(dateValue).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'America/New_York'
                    })
                  : '-'
                
                return (
                  <tr key={event.id} className={styles.eventRow}>
                    <td>
                      <div className={styles.eventCell}>
                        <span className={styles.eventIcon} style={{ color: meta.color }}>
                          {meta.icon}
                        </span>
                        <span className={styles.eventTitle}>{event.title}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[event.status?.toLowerCase()] || styles.defaultBadge}`}>
                        {event.status || '-'}
                      </span>
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
                      {event.amount != null ? (
                        <strong className={styles.amount}>{formatCurrency(event.amount)}</strong>
                      ) : (
                        <span className={styles.naText}>-</span>
                      )}
                    </td>
                    <td className={styles.dateCell}>{date}</td>
                    <td className={styles.eventIdCell}>
                      {(event.type === 'investment' || event.type === 'distribution' || event.type === 'contribution' || event.type === 'monthly_distribution' || event.type === 'monthly_compounded') && event.id && !event.id.startsWith('inv-created') ? (
                        <code>{event.id}</code>
                      ) : (
                        <span>{event.id.startsWith('inv-created') || event.id.startsWith('user-created') ? '-' : event.id}</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={styles.viewButton}
                        onClick={() => router.push(`/admin/users/${event.userId}`)}
                      >
                        View User
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

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
              (Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredActivity.length)} of {filteredActivity.length})
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
    </div>
  )
}
