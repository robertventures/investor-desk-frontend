'use client'
import { useEffect, useState, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../contexts/UserContext'
import { apiClient } from '../../lib/apiClient'
import styles from './TransactionsList.module.css'
import { formatCurrency } from '../../lib/formatters.js'
import { formatDateForDisplay } from '../../lib/dateUtils.js'

function eventMeta(ev, { isDraftInvestment = false } = {}) {
  const normalizedStatus = (ev.status || '').toString().toLowerCase()
  switch (ev.type) {
    case 'account_created':
      return { icon: '👤', iconClass: styles.created, title: 'Account Created' }
    case 'investment':
      return { icon: '🧾', iconClass: styles.created, title: 'Investment' }
    case 'investment_created':
      if (isDraftInvestment || normalizedStatus === 'draft') {
        return { icon: '📝', iconClass: styles.draft, title: 'Investment Draft' }
      }
      if (normalizedStatus === 'pending' || normalizedStatus === 'submitted') {
        return { icon: '⏳', iconClass: styles.pending, title: 'Investment Pending' }
      }
      return { icon: '🧾', iconClass: styles.created, title: 'Investment Created' }
    case 'investment_submitted':
      return { icon: '⏳', iconClass: styles.pending, title: 'Investment Submitted' }
    case 'investment_confirmed':
      return { icon: '✅', iconClass: styles.confirmed, title: 'Investment Confirmed' }
    case 'investment_rejected':
      return { icon: '❌', iconClass: styles.rejected, title: 'Investment Rejected' }
    case 'investment_updated':
      return { icon: '📝', iconClass: styles.created, title: 'Investment Updated' }
    case 'investment_info_confirmed':
      return { icon: '✅', iconClass: styles.confirmed, title: 'Investment Info Confirmed' }
    // Distributions - all types of payouts/interest calculations
    case 'distribution':
    case 'monthly_distribution':
      return { icon: '💸', iconClass: styles.distribution, title: 'Distribution' }
    // Contributions - all types of compounding/additions to principal
    case 'contribution':
    case 'monthly_contribution':
    case 'monthly_compounded':
      return { icon: '📈', iconClass: styles.distribution, title: 'Contribution' }
    case 'withdrawal_requested':
      return { icon: '🏦', iconClass: styles.withdrawal, title: 'Withdrawal Requested' }
    case 'withdrawal_notice_started':
      return { icon: '⏳', iconClass: styles.withdrawal, title: 'Withdrawal Notice Started' }
    case 'withdrawal_approved':
      return { icon: '✅', iconClass: styles.confirmed, title: 'Withdrawal Processed' }
    case 'withdrawal_rejected':
      return { icon: '❌', iconClass: styles.withdrawal, title: 'Withdrawal Rejected' }
    case 'redemption':
      return { icon: '🏦', iconClass: styles.withdrawal, title: 'Redemption' }
    case 'profile_updated':
      return { icon: '👤', iconClass: styles.created, title: 'Profile Updated' }
    case 'bank_account_added':
      return { icon: '🏦', iconClass: styles.created, title: 'Bank Account Added' }
    case 'bank_account_removed':
      return { icon: '🏦', iconClass: styles.withdrawal, title: 'Bank Account Removed' }
    default:
      return { icon: '•', iconClass: '', title: ev.type }
  }
}

const TransactionsList = memo(function TransactionsList({ limit = null, showViewAll = true, filterInvestmentId = null, expandable = false }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [events, setEvents] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5
  
  // PERFORMANCE FIX: Use UserContext instead of fetching user data again
  const { userData: user, loading, refreshUser, loadInvestments, loadActivity } = useUser()

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    
    const load = async () => {
      if (!user) return
      try {
        const baseEvents = Array.isArray(user.activity) ? user.activity : []
        const investmentEvents = (user.investments || []).flatMap(inv => {
          const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
          const txEvents = transactions.map(tx => ({
            ...tx,
            // Extract metadata fields if they exist in JSONB
            monthIndex: tx.monthIndex || tx.metadata?.monthIndex,
            lockupPeriod: tx.lockupPeriod || tx.metadata?.lockupPeriod || inv.lockupPeriod,
            paymentFrequency: tx.paymentFrequency || tx.metadata?.paymentFrequency || inv.paymentFrequency,
            payoutBankNickname: tx.payoutBankNickname || tx.metadata?.payoutBankNickname,
            payoutDueBy: tx.payoutDueBy || tx.metadata?.payoutDueBy,
            withdrawalId: tx.withdrawalId || tx.metadata?.withdrawalId,
            type: tx.type,
            date: tx.date || tx.createdAt,
            investmentId: inv.id,
            investmentAmount: inv.amount || 0
          }))

          // Create synthetic events for investment lifecycle if they don't exist in activity
          // This ensures we show something even if the activity log is empty
          const lifecycleEvents = []
          
          // Check if we already have a creation/submission event from the backend
          // We check both baseEvents (global activity) and txEvents (investment specific transactions)
          const hasBackendEvent = [...baseEvents, ...txEvents].some(ev => 
            String(ev.investmentId) === String(inv.id) && 
            ['investment_created', 'investment_submitted', 'investment'].includes(ev.type)
          )
          
          // 1. Creation event - only if no backend event exists
          if (inv.createdAt && !hasBackendEvent) {
            lifecycleEvents.push({
              id: `inv-create-${inv.id}`,
              type: 'investment_created',
              date: inv.createdAt,
              investmentId: inv.id,
              amount: inv.amount,
              status: inv.status,
              isSynthetic: true
            })
          }

          return [...txEvents, ...lifecycleEvents]
        })
        // No filtering needed - backend now only creates relevant activity events
        const combined = [...baseEvents, ...investmentEvents]
        // Sort descending (newest first) to show most recent activity at the top
        const sorted = combined.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
        setEvents(sorted)
      } catch (e) {
        console.error('Failed to load transactions:', e)
      }
    }
    load()
  }, [user])

  // PERFORMANCE: Memoize expensive filtering and pagination calculations
  // IMPORTANT: Hooks must be called unconditionally in the same order on every render.
  // Compute memoized values before any early returns to avoid React hook order errors.
  const { filtered, visibleEvents, totalPages } = useMemo(() => {
    // Use string comparison to handle both string and number IDs
    const filtered = filterInvestmentId 
      ? events.filter(ev => String(ev.investmentId) === String(filterInvestmentId)) 
      : events
    
    // Apply pagination if no limit is set (limit is used for "Recent Activity" widgets)
    // When limit is set, we're showing a preview; when not set, show full paginated list
    let visibleEvents
    let totalPages = 1
    if (limit) {
      visibleEvents = filtered.slice(0, limit)
    } else {
      totalPages = Math.ceil(filtered.length / itemsPerPage)
      const startIndex = (currentPage - 1) * itemsPerPage
      const endIndex = startIndex + itemsPerPage
      visibleEvents = filtered.slice(startIndex, endIndex)
    }
    
    return { filtered, visibleEvents, totalPages }
  }, [events, filterInvestmentId, limit, currentPage, itemsPerPage])

  // Prevent hydration mismatch
  if (!mounted || loading) return <div className={styles.empty}>Loading activity…</div>
  if (!user) return <div className={styles.empty}>No user found.</div>

  return (
    <div className={styles.listSection}>
      <div className={styles.feed}>
        {filtered.length === 0 && (
          <div className={styles.empty}>No activity yet</div>
        )}
        {visibleEvents.map(ev => {
          const date = ev.date ? formatDateForDisplay(ev.date) : '-'
          const isDistribution = ev.type === 'distribution' || ev.type === 'monthly_distribution'
          const isWithdrawal = ev.type === 'withdrawal_requested' || ev.type === 'redemption'
          const isInvestmentEvent = ev.type === 'investment_submitted' || ev.type === 'investment_confirmed' || ev.type === 'investment_rejected'
          const amountClass = isWithdrawal ? styles.negative : styles.positive
          const isExpanded = expandable && expandedId === ev.id
          // Only show amount for events that have a monetary value
          // Exclude only account_created as it doesn't represent a transaction
          // Investment created should show the amount since it represents a pending investment
          const shouldShowAmount = ev.type !== 'account_created'
          
          // Check if this event is for a draft investment
          const isDraftInvestment = ev.investmentId && user?.investments?.some(inv => 
            String(inv.id) === String(ev.investmentId) && inv.status === 'draft'
          )

          const meta = eventMeta(ev, { isDraftInvestment })
          
          const handleResumeDraft = (e) => {
            e.stopPropagation()
            if (ev.investmentId) {
              try {
                localStorage.setItem('currentInvestmentId', String(ev.investmentId))
              } catch {}
              router.push('/investment')
            }
          }
          
          const handleDeleteDraft = async (e) => {
            e.stopPropagation()
            if (!confirm('Delete this draft? This cannot be undone.')) return
            if (!ev.investmentId) return
            
            try {
              if (typeof window === 'undefined') return
              
              const userId = localStorage.getItem('currentUserId')
              if (!userId) {
                alert('User session not found')
                return
              }
              
              const data = await apiClient.deleteInvestment(userId, ev.investmentId)
              if (!data.success) {
                alert(data.error || 'Failed to delete draft')
                return
              }
              
              // Clear from localStorage if this was the current investment
              const currentInvestmentId = localStorage.getItem('currentInvestmentId')
              if (currentInvestmentId === String(ev.investmentId)) {
                localStorage.removeItem('currentInvestmentId')
              }
              
              // Reload only investments and activity data (not full user profile)
              // This prevents a full page rerender and is more efficient
              if (loadInvestments && loadActivity) {
                await Promise.all([loadInvestments(), loadActivity()])
              } else if (refreshUser) {
                // Fallback to full refresh if lazy loaders not available
                await refreshUser()
              }
            } catch (e) {
              console.error('Failed to delete draft', e)
              alert('Failed to delete draft')
            }
          }
          
          return (
            <div className={styles.event} key={ev.id} onClick={() => { if (expandable) setExpandedId(prev => prev === ev.id ? null : ev.id) }} style={{ cursor: expandable ? 'pointer' : 'default' }}>
              <div className={`${styles.icon} ${meta.iconClass}`}>{meta.icon}</div>
              <div className={styles.content}>
                <div className={styles.primary}>{meta.title}</div>
                <div className={styles.metaRow}>
                  <span>{date}</span>
                  {isDistribution && ev.monthIndex ? <span>• Month {ev.monthIndex}</span> : null}
                  {isDistribution && ev.status ? <span>• {ev.status.toUpperCase()}</span> : null}
                  {ev.status && !isDistribution ? <span>• {ev.status.toUpperCase()}</span> : null}
                  {isDistribution && ev.payoutBankNickname ? <span>• {ev.payoutBankNickname}</span> : null}
                  {ev.investmentId ? (
                    <span
                      className={`${styles.investmentBadge} ${styles.clickable}`}
                      onClick={(e) => { e.stopPropagation(); router.push(`/investment-details/${ev.investmentId}`) }}
                      title={ev.investmentId}
                    >
                      Investment {String(ev.investmentId).slice(-6)}
                    </span>
                  ) : null}
                </div>
                {isExpanded && (
                  <div className={styles.detailsBox}>
                    <div className={styles.detailRow}><span className={styles.detailKey}>Event ID</span><span className={styles.detailVal}>{ev.id}</span></div>
                    <div className={styles.detailRow}><span className={styles.detailKey}>Type</span><span className={styles.detailVal}>{ev.type}</span></div>
                    {ev.lockupPeriod ? <div className={styles.detailRow}><span className={styles.detailKey}>Lockup</span><span className={styles.detailVal}>{ev.lockupPeriod}</span></div> : null}
                    {ev.paymentFrequency ? <div className={styles.detailRow}><span className={styles.detailKey}>Payment</span><span className={styles.detailVal}>{ev.paymentFrequency}</span></div> : null}
                    {typeof ev.monthIndex !== 'undefined' ? <div className={styles.detailRow}><span className={styles.detailKey}>Month Index</span><span className={styles.detailVal}>{ev.monthIndex}</span></div> : null}
                    {ev.status ? <div className={styles.detailRow}><span className={styles.detailKey}>Status</span><span className={styles.detailVal}>{ev.status}</span></div> : null}
                    {ev.payoutBankNickname ? <div className={styles.detailRow}><span className={styles.detailKey}>Bank</span><span className={styles.detailVal}>{ev.payoutBankNickname}</span></div> : null}
                    {ev.noticeEndAt ? <div className={styles.detailRow}><span className={styles.detailKey}>Notice Ends</span><span className={styles.detailVal}>{formatDateForDisplay(ev.noticeEndAt)}</span></div> : null}
                    {ev.payoutDueBy ? <div className={styles.detailRow}><span className={styles.detailKey}>Payout Due By</span><span className={styles.detailVal}>{formatDateForDisplay(ev.payoutDueBy)}</span></div> : null}
                  </div>
                )}
              </div>
              <div className={styles.rightColumn}>
                {shouldShowAmount && (
                  <div className={`${styles.amount} ${amountClass}`}>
                    {formatCurrency(ev.amount || 0)}
                  </div>
                )}
                {isDraftInvestment && (
                  <>
                    <div className={styles.resumeDraft} onClick={handleResumeDraft}>
                      Resume Draft →
                    </div>
                    {isExpanded && (
                      <button
                        className={styles.deleteDraft}
                        onClick={handleDeleteDraft}
                      >
                        Delete Draft
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Show "View All" button when using limit */}
      {limit && events.length > limit && showViewAll && (
        <div className={styles.footer}>
          <button className={styles.viewAllButton} onClick={() => router.push('/dashboard')}>View all activity →</button>
        </div>
      )}
      
      {/* Show pagination when not using limit and there are multiple pages */}
      {!limit && totalPages > 1 && (
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
              (Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length})
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
})

export default TransactionsList

