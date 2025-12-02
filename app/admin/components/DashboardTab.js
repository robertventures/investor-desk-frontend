import { useState, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import MetricCard from './MetricCard'
import SectionCard from './SectionCard'
import styles from './DashboardTab.module.css'
import { formatCurrency } from '../../../lib/formatters.js'

/**
 * Main dashboard tab showing overview metrics and recent activity
 * PERFORMANCE: Memoized to prevent unnecessary re-renders
 */
const DashboardTab = memo(function DashboardTab({ 
  metrics, 
  pendingInvestments, 
  pendingPayouts,
  isLoadingPayouts,
  processingPayoutId,
  onApprove, 
  onReject, 
  savingId,
  onProcessPayment,
  onRefreshPayouts
}) {
  const router = useRouter()

  // Selection state for bulk actions
  const [selectedPayouts, setSelectedPayouts] = useState(new Set())
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)

  // Toggle single payout selection
  const togglePayoutSelection = useCallback((payoutId) => {
    setSelectedPayouts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(payoutId)) {
        newSet.delete(payoutId)
      } else {
        newSet.add(payoutId)
      }
      return newSet
    })
  }, [])

  // Toggle all payouts selection
  const toggleSelectAll = useCallback(() => {
    if (selectedPayouts.size === pendingPayouts.length) {
      setSelectedPayouts(new Set())
    } else {
      setSelectedPayouts(new Set(pendingPayouts.map(p => p.id)))
    }
  }, [pendingPayouts, selectedPayouts.size])

  // Handle single payment processing
  const handleProcessPayment = useCallback(async (transactionId) => {
    const payout = pendingPayouts.find(p => p.id === transactionId)
    const userName = payout?.userName || `Transaction #${transactionId}`
    
    if (!confirm(`Process payment for ${userName}?\n\nAmount: ${formatCurrency(payout?.amount || 0)}\n\nThis will initiate the bank transfer via ACHQ.`)) {
      return
    }

    const result = await onProcessPayment(transactionId)
    
    if (result.success) {
      alert(`Payment processed successfully for ${userName}!`)
    } else {
      alert(`Failed to process payment: ${result.error}`)
    }
  }, [pendingPayouts, onProcessPayment])

  // Bulk process selected payouts
  const handleBulkProcess = useCallback(async () => {
    if (selectedPayouts.size === 0) return
    
    if (!confirm(`Process ${selectedPayouts.size} payment(s)? This will initiate bank transfers via ACHQ.`)) {
      return
    }

    setIsProcessingBulk(true)
    let successCount = 0
    let failCount = 0
    const errors = []
    
    try {
      for (const payoutId of selectedPayouts) {
        const payout = pendingPayouts.find(p => p.id === payoutId)
        if (payout) {
          const result = await onProcessPayment(payoutId)
          if (result.success) {
            successCount++
          } else {
            failCount++
            errors.push(`${payout.userName || payoutId}: ${result.error || 'Unknown error'}`)
          }
        }
      }
      
      // Show summary message
      if (failCount === 0) {
        alert(`Successfully processed ${successCount} payment(s)!`)
      } else {
        const errorMsg = errors.length > 0 ? `\n\nErrors:\n${errors.slice(0, 5).join('\n')}` : ''
        alert(`Processed ${successCount} payment(s). ${failCount} failed.${errorMsg}`)
      }
      
      setSelectedPayouts(new Set())
    } catch (error) {
      console.error('Bulk process error:', error)
      alert(`An error occurred during bulk processing: ${error.message}`)
    } finally {
      setIsProcessingBulk(false)
    }
  }, [selectedPayouts, pendingPayouts, onProcessPayment])

  const allSelected = pendingPayouts && pendingPayouts.length > 0 && selectedPayouts.size === pendingPayouts.length
  const someSelected = selectedPayouts.size > 0

  return (
    <div className={styles.dashboardTab}>
      {/* Primary Metrics */}
      <div className={styles.primaryMetricsGrid}>
        <MetricCard 
          label="Active Investors" 
          value={metrics.investorsCount} 
        />
        <MetricCard 
          label="Total Accounts" 
          value={metrics.totalAccounts} 
        />
        <MetricCard 
          label="Total AUM" 
          value={formatCurrency(Number(metrics.totalAUM) || 0)} 
        />
        <MetricCard 
          label="Total Amount Owed" 
          value={formatCurrency(Number(metrics.totalAmountOwed) || 0)} 
        />
        <MetricCard 
          label="Pending Investments" 
          value={formatCurrency(Number(metrics.pendingCapital) || 0)} 
        />
      </div>

      {/* Pending Approvals List */}
      <SectionCard title="Pending Approvals">
        {pendingInvestments && pendingInvestments.length > 0 ? (
          <div className={styles.pendingList}>
            {pendingInvestments.map(inv => (
              <div key={`${inv.user.id}-${inv.id}`} className={styles.pendingItem}>
                <div className={styles.pendingItemMain}>
                  <div className={styles.pendingItemInfo}>
                    <div className={styles.pendingItemHeader}>
                      <span className={styles.pendingItemId}>#{inv.id}</span>
                      <span 
                        className={styles.pendingItemName}
                        onClick={() => router.push(`/admin/users/${inv.user.id}`)}
                      >
                        {inv.user.firstName} {inv.user.lastName}
                      </span>
                    </div>
                    <div className={styles.pendingItemDetails}>
                      <span className={styles.pendingItemEmail}>{inv.user.email}</span>
                      <span className={styles.pendingItemDivider}>•</span>
                      <span className={styles.pendingItemAccountType}>
                        {inv.accountType === 'individual' && 'Individual'}
                        {inv.accountType === 'joint' && 'Joint'}
                        {inv.accountType === 'entity' && 'Entity'}
                        {inv.accountType === 'ira' && 'SDIRA'}
                      </span>
                      <span className={styles.pendingItemDivider}>•</span>
                      <span className={styles.pendingItemLockup}>
                        {inv.lockupPeriod === '1-year' ? '1-Year' : '3-Year'} Lockup
                      </span>
                      <span className={styles.pendingItemDivider}>•</span>
                      <span className={`${styles.pendingItemPaymentMethod} ${inv.paymentMethod === 'wire' ? styles.wirePayment : styles.achPayment}`}>
                        {inv.paymentMethod === 'wire' ? '🏦 Wire Transfer' : '🔄 ACH Transfer'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.pendingItemAmount}>
                    {formatCurrency(inv.amount)}
                  </div>
                </div>
                <div className={styles.pendingItemActions}>
                  {inv.paymentMethod === 'wire' ? (
                    <>
                      <button
                        onClick={() => {
                          if (confirm(`Approve investment ${inv.id} for ${inv.user.firstName} ${inv.user.lastName}?\n\nAmount: ${formatCurrency(inv.amount)}\nAccount Type: ${inv.accountType}\nLockup: ${inv.lockupPeriod === '1-year' ? '1-Year' : '3-Year'}\nPayment Method: ${inv.paymentMethod === 'wire' ? 'Wire Transfer' : 'ACH Transfer'}\n\nThis will activate the investment and lock the user's account type.`)) {
                            onApprove(inv.user.id, inv.id)
                          }
                        }}
                        disabled={savingId === inv.id}
                        className={styles.approveButton}
                      >
                        {savingId === inv.id ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Reject investment ${inv.id} for ${inv.user.firstName} ${inv.user.lastName}?\n\nThis action cannot be undone.`)) {
                            onReject(inv.user.id, inv.id)
                          }
                        }}
                        disabled={savingId === inv.id}
                        className={styles.rejectButton}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className={styles.autoApproveText}>
                      Auto-approves on settlement
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            ✅ No pending investment approvals
          </div>
        )}
      </SectionCard>

      {/* Pending Payouts Section */}
      <SectionCard title="Pending Payouts">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionDescription}>
            Monthly interest payments ready to be processed
          </p>
          <button 
            className={styles.refreshButton} 
            onClick={() => onRefreshPayouts(true)} 
            disabled={isLoadingPayouts}
          >
            {isLoadingPayouts ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {pendingPayouts && pendingPayouts.length > 0 && (
          <div className={styles.alertBox}>
            <strong>💰 {pendingPayouts.length} Payout{pendingPayouts.length !== 1 ? 's' : ''} Ready</strong>
            <p>
              These monthly interest payments are ready to be processed.
              Click &quot;Process Payment&quot; to initiate the bank transfer via ACHQ.
            </p>
          </div>
        )}

        {/* Bulk Actions Bar */}
        {someSelected && (
          <div className={styles.bulkActionsBar}>
            <div className={styles.bulkActionsLeft}>
              <span className={styles.selectionCount}>
                {selectedPayouts.size} selected
              </span>
              <button
                className={styles.clearSelectionButton}
                onClick={() => setSelectedPayouts(new Set())}
              >
                Clear
              </button>
            </div>
            <div className={styles.bulkActionsRight}>
              <button
                className={styles.bulkProcessButton}
                onClick={handleBulkProcess}
                disabled={isProcessingBulk}
              >
                {isProcessingBulk ? 'Processing...' : `💳 Process ${selectedPayouts.size} Payment${selectedPayouts.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={!pendingPayouts || pendingPayouts.length === 0}
                    className={styles.checkbox}
                  />
                </th>
                <th>User</th>
                <th>Investment ID</th>
                <th>Amount</th>
                <th>Scheduled Date</th>
                <th>Bank Account</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!pendingPayouts || pendingPayouts.length === 0 ? (
                <tr>
                  <td colSpan="8" className={styles.emptyState}>
                    ✅ No pending payouts - all monthly payments have been processed!
                  </td>
                </tr>
              ) : (
                pendingPayouts.map(payout => {
                  const isProcessing = processingPayoutId === payout.id
                  const isFailed = payout.status === 'rejected' || payout.status === 'failed'
                  
                  return (
                    <tr 
                      key={payout.id} 
                      className={`${isFailed ? styles.failedRow : styles.pendingRow} ${selectedPayouts.has(payout.id) ? styles.selectedRow : ''}`}
                    >
                      <td className={styles.checkboxCell}>
                        <input
                          type="checkbox"
                          checked={selectedPayouts.has(payout.id)}
                          onChange={() => togglePayoutSelection(payout.id)}
                          className={styles.checkbox}
                          disabled={isProcessing}
                        />
                      </td>
                      <td>
                        <div className={styles.userCell}>
                          <div className={styles.userName}>{payout.userName || `User #${payout.userId}`}</div>
                          <div className={styles.userEmail}>{payout.userEmail || '-'}</div>
                        </div>
                      </td>
                      <td className={styles.monospaceCell}>{payout.investmentId || '-'}</td>
                      <td><strong>{formatCurrency(payout.amount || 0)}</strong></td>
                      <td className={styles.dateCell}>
                        {payout.date ? new Date(payout.date).toLocaleDateString() : '-'}
                      </td>
                      <td className={styles.bankCell}>{payout.payoutBankNickname || 'Default'}</td>
                      <td>
                        <span className={`${styles.badge} ${styles[payout.status] || styles.pending}`}>
                          {(payout.status || 'pending').toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <button
                          className={isFailed ? styles.retryButton : styles.processButton}
                          onClick={() => handleProcessPayment(payout.id)}
                          disabled={isProcessing || isProcessingBulk}
                          title={isFailed ? 'Retry payment' : 'Process payment via ACHQ'}
                        >
                          {isProcessing 
                            ? '⏳ Processing...' 
                            : isFailed 
                              ? '🔄 Retry Payment' 
                              : '💳 Process Payment'
                          }
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Recent Activity */}
      <SectionCard title="Recent Activity">
        <div className={styles.activityCard}>
          <h3 className={styles.activityCardTitle}>Latest Investments</h3>
          <div className={styles.activityList}>
            {metrics.recentInvestments.length > 0 ? (
              metrics.recentInvestments.slice(0, 5).map(inv => (
                <div
                  key={`${inv.userId}-${inv.id}`}
                  className={styles.activityItem}
                  onClick={() => router.push(`/admin/users/${inv.userId}`)}
                >
                  <div className={styles.activityItemHeader}>
                    <span className={styles.activityItemTitle}>
                      Investment #{inv.id}
                    </span>
                    <span className={`${styles.activityStatus} ${styles[`status-${inv.status}`]}`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className={styles.activityItemDetails}>
                    <span>{inv.userName}</span>
                    <span className={styles.activityItemAmount}>
                      {formatCurrency(inv.amount)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.emptyState}>No recent investments</p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
})

export default DashboardTab

