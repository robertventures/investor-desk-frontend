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
  const [activityTypeFilter, setActivityTypeFilter] = useState('all')
  const itemsPerPage = 20

  // Activity tab intentionally excludes distributions & contributions since those
  // are covered in the Transactions tab.
  const isExcludedFromActivity = (type) => {
    const t = (type || '').toString().toLowerCase()
    return (
      t === 'distribution' ||
      t === 'monthly_distribution' ||
      t === 'contribution' ||
      t === 'monthly_contribution' ||
      t === 'monthly_compounded'
    )
  }

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
            status: investment.status === 'pending' ? 'pending' : (investment.status === 'draft' ? 'draft' : 'completed'),
            investmentStatus: investment.status,
            userId: user.id,
            userEmail: user.email,
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            investmentId: investment.id,
            amount: safeAmount(investment.amount),
            date: investment.createdAt,
            displayDate: investment.createdAt,
            title: investment.status === 'draft' ? 'Draft Investment' : 'Investment Created',
            description: investment.status === 'draft' 
              ? `Draft investment for ${formatCurrency(safeAmount(investment.amount))}` 
              : `Investment created for ${formatCurrency(safeAmount(investment.amount))}`
          })
        }
        
        // 2. Add transaction events (distributions, contributions, etc)
        const transactions = Array.isArray(investment.transactions) ? investment.transactions : []
        transactions.forEach(tx => {
          if (isExcludedFromActivity(tx?.type)) return

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

  // Compute event counts by category for filter buttons
  const eventCounts = useMemo(() => {
    const counts = {
      all: allActivity.length,
      accounts: 0,
      investments: 0,
      drafts: 0,
      pending: 0,
      withdrawals: 0
    }

    allActivity.forEach(event => {
      const type = event.type?.toLowerCase() || ''
      
      // Account created
      if (type === 'account_created') {
        counts.accounts++
      }
      // Investment events (exclude drafts and pending - they have their own categories)
      else if ((type === 'investment_created' || type === 'investment_submitted' || type === 'investment' || type === 'investment_confirmed' || type === 'investment_rejected') && event.investmentStatus !== 'draft' && event.investmentStatus !== 'pending') {
        counts.investments++
      }
      // Withdrawal events
      else if (type === 'withdrawal_requested' || type === 'withdrawal_notice_started' || type === 'withdrawal_approved' || type === 'withdrawal_rejected' || type === 'redemption') {
        counts.withdrawals++
      }

      // Draft investments (investments with draft status)
      if (event.investmentStatus === 'draft') {
        counts.drafts++
      }

      // Pending status (cross-category)
      if (event.status?.toLowerCase() === 'pending') {
        counts.pending++
      }
    })

    return counts
  }, [allActivity])

  // Filter activity by type
  const filteredByType = useMemo(() => {
    if (activityTypeFilter === 'all') return allActivity

    return allActivity.filter(event => {
      const type = event.type?.toLowerCase() || ''
      
      switch (activityTypeFilter) {
        case 'accounts':
          return type === 'account_created'
        case 'investments':
          return (type === 'investment_created' || type === 'investment_submitted' || type === 'investment' || type === 'investment_confirmed' || type === 'investment_rejected') && event.investmentStatus !== 'draft' && event.investmentStatus !== 'pending'
        case 'drafts':
          return event.investmentStatus === 'draft'
        case 'pending':
          return event.status?.toLowerCase() === 'pending'
        case 'withdrawals':
          return type === 'withdrawal_requested' || type === 'withdrawal_notice_started' || type === 'withdrawal_approved' || type === 'withdrawal_rejected' || type === 'redemption'
        default:
          return true
      }
    })
  }, [allActivity, activityTypeFilter])

  // Filter activity based on search term
  const filteredActivity = useMemo(() => {
    if (!searchTerm.trim()) return filteredByType

    const term = searchTerm.toLowerCase()
    return filteredByType.filter(event => {
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
  }, [filteredByType, searchTerm])

  // Paginate filtered activity
  const paginatedActivity = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredActivity.slice(startIndex, endIndex)
  }, [filteredActivity, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredActivity.length / itemsPerPage)

  // Reset to page 1 when search term or filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, activityTypeFilter])

  // Helper functions for display
  const getEventTitle = (eventType) => {
    switch (eventType) {
      case 'account_created': return 'Account Created'
      case 'investment_created': return 'Investment Created'
      case 'investment_submitted': return 'Investment Submitted'
      case 'investment_confirmed': return 'Investment Confirmed'
      case 'investment_rejected': return 'Investment Rejected'
      case 'investment': return 'Investment Transaction'
      case 'withdrawal_requested': return 'Withdrawal Requested'
      case 'withdrawal_notice_started': return 'Withdrawal Notice Started'
      case 'withdrawal_approved': return 'Withdrawal Processed'
      case 'withdrawal_rejected': return 'Withdrawal Rejected'
      case 'redemption': return 'Redemption'
      default: return eventType || 'Unknown Event'
    }
  }

  // Get event metadata (icon, color) - takes event object to check investmentStatus
  const getEventMeta = (event) => {
    const eventType = typeof event === 'string' ? event : event?.type
    
    // Check for draft investments specifically
    if (event?.investmentStatus === 'draft') {
      return { icon: '📝', color: '#92400e' }
    }
    
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
            Platform events (excluding distributions and contributions) ({filteredActivity.length} total)
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

      {/* Activity Type Filter Cards */}
      <div className={styles.filterGrid}>
        <button
          className={`${styles.filterCard} ${activityTypeFilter === 'all' ? styles.filterCardActive : ''}`}
          onClick={() => setActivityTypeFilter('all')}
        >
          <div className={styles.filterCardLabel}>All Activity</div>
          <div className={styles.filterCardCount}>{eventCounts.all}</div>
          <div className={styles.filterCardSubtext}>events</div>
        </button>
        
        <button
          className={`${styles.filterCard} ${activityTypeFilter === 'accounts' ? styles.filterCardActive : ''}`}
          onClick={() => setActivityTypeFilter('accounts')}
        >
          <div className={styles.filterCardIcon}>👤</div>
          <div className={styles.filterCardLabel}>Accounts</div>
          <div className={styles.filterCardCount}>{eventCounts.accounts}</div>
        </button>
        
        <button
          className={`${styles.filterCard} ${activityTypeFilter === 'investments' ? styles.filterCardActive : ''}`}
          onClick={() => setActivityTypeFilter('investments')}
        >
          <div className={styles.filterCardIcon}>🧾</div>
          <div className={styles.filterCardLabel}>Investments</div>
          <div className={styles.filterCardCount}>{eventCounts.investments}</div>
        </button>
        
        <button
          className={`${styles.filterCard} ${activityTypeFilter === 'drafts' ? styles.filterCardActive : ''} ${eventCounts.drafts > 0 ? styles.filterCardWarning : ''}`}
          onClick={() => setActivityTypeFilter('drafts')}
        >
          <div className={styles.filterCardIcon}>📝</div>
          <div className={styles.filterCardLabel}>Drafts</div>
          <div className={styles.filterCardCount}>{eventCounts.drafts}</div>
        </button>
        
        <button
          className={`${styles.filterCard} ${activityTypeFilter === 'pending' ? styles.filterCardActive : ''} ${eventCounts.pending > 0 ? styles.filterCardWarning : ''}`}
          onClick={() => setActivityTypeFilter('pending')}
        >
          <div className={styles.filterCardIcon}>⏳</div>
          <div className={styles.filterCardLabel}>Pending</div>
          <div className={styles.filterCardCount}>{eventCounts.pending}</div>
        </button>
        
        <button
          className={`${styles.filterCard} ${activityTypeFilter === 'withdrawals' ? styles.filterCardActive : ''}`}
          onClick={() => setActivityTypeFilter('withdrawals')}
        >
          <div className={styles.filterCardIcon}>🏦</div>
          <div className={styles.filterCardLabel}>Withdrawals</div>
          <div className={styles.filterCardCount}>{eventCounts.withdrawals}</div>
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
                const meta = getEventMeta(event)
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
                      {event?.id && !event.id.startsWith('inv-created') && !event.id.startsWith('user-created')
                        ? <code>{event.id}</code>
                        : <span>-</span>
                      }
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
