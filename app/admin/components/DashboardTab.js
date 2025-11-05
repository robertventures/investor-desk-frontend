import { useState, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import MetricCard from './MetricCard'
import ActionCard from './ActionCard'
import SectionCard from './SectionCard'
import { fetchWithCsrf } from '../../../lib/csrfClient'
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
  onApprove, 
  onReject, 
  savingId,
  onPayoutAction,
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

  // Bulk complete selected payouts
  const handleBulkComplete = useCallback(async () => {
    if (selectedPayouts.size === 0) return
    
    if (!confirm(`Mark ${selectedPayouts.size} payout(s) as completed? This will bypass bank transfers.`)) {
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
          try {
            const res = await fetchWithCsrf('/api/admin/pending-payouts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'complete', 
                userId: payout.userId, 
                transactionId: payout.id 
              })
            })
            
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`)
            }
            
            const data = await res.json()
            if (data.success) {
              successCount++
            } else {
              failCount++
              errors.push(`${payout.userName}: ${data.error || 'Unknown error'}`)
            }
          } catch (e) {
            failCount++
            errors.push(`${payout.userName}: ${e.message}`)
          }
        }
      }
      
      // Show summary message
      if (failCount === 0) {
        alert(`Successfully completed ${successCount} payout(s)!`)
      } else {
        const errorMsg = errors.length > 0 ? `\n\nErrors:\n${errors.slice(0, 5).join('\n')}` : ''
        alert(`Completed ${successCount} payout(s). ${failCount} failed.${errorMsg}`)
      }
      
      // Refresh data
      console.log('Refreshing data after bulk complete...')
      await onRefreshPayouts()
      setSelectedPayouts(new Set())
    } catch (error) {
      console.error('Bulk complete error:', error)
      alert(`An error occurred during bulk processing: ${error.message}`)
    } finally {
      setIsProcessingBulk(false)
    }
  }, [selectedPayouts, pendingPayouts, onRefreshPayouts])

  // Bulk fail selected payouts
  const handleBulkFail = useCallback(async () => {
    if (selectedPayouts.size === 0) return
    
    const reason = prompt(`Enter failure reason for ${selectedPayouts.size} payout(s):`)
    if (!reason) return

    setIsProcessingBulk(true)
    let successCount = 0
    let failCount = 0
    const errors = []
    
    try {
      for (const payoutId of selectedPayouts) {
        const payout = pendingPayouts.find(p => p.id === payoutId)
        if (payout) {
          try {
            const res = await fetchWithCsrf('/api/admin/pending-payouts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'fail', 
                userId: payout.userId, 
                transactionId: payout.id,
                failureReason: reason
              })
            })
            
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`)
            }
            
            const data = await res.json()
            if (data.success) {
              successCount++
            } else {
              failCount++
              errors.push(`${payout.userName}: ${data.error || 'Unknown error'}`)
            }
          } catch (e) {
            failCount++
            errors.push(`${payout.userName}: ${e.message}`)
          }
        }
      }
      
      // Show summary message
      if (failCount === 0) {
        alert(`Successfully marked ${successCount} payout(s) as failed.`)
      } else {
        const errorMsg = errors.length > 0 ? `\n\nErrors:\n${errors.slice(0, 5).join('\n')}` : ''
        alert(`Marked ${successCount} payout(s) as failed. ${failCount} operations failed.${errorMsg}`)
      }
      
      // Refresh data
      console.log('Refreshing data after bulk fail...')
      await onRefreshPayouts()
      setSelectedPayouts(new Set())
    } catch (error) {
      console.error('Bulk fail error:', error)
      alert(`An error occurred during bulk processing: ${error.message}`)
    } finally {
      setIsProcessingBulk(false)
    }
  }, [selectedPayouts, pendingPayouts, onRefreshPayouts])

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
                        {inv.accountType === 'ira' && 'IRA'}
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
                    ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className={styles.pendingItemActions}>
                  <button
                    onClick={() => {
                      if (confirm(`Approve investment ${inv.id} for ${inv.user.firstName} ${inv.user.lastName}?\n\nAmount: $${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nAccount Type: ${inv.accountType}\nLockup: ${inv.lockupPeriod === '1-year' ? '1-Year' : '3-Year'}\nPayment Method: ${inv.paymentMethod === 'wire' ? 'Wire Transfer' : 'ACH Transfer'}\n\nThis will activate the investment and lock the user's account type.`)) {
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
            Monthly interest payments requiring admin approval
          </p>
          <button 
            className={styles.refreshButton} 
            onClick={onRefreshPayouts} 
            disabled={isLoadingPayouts}
          >
            {isLoadingPayouts ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {pendingPayouts && pendingPayouts.length > 0 && (
          <div className={styles.alertBox}>
            <strong>⚠️ {pendingPayouts.length} Payout{pendingPayouts.length !== 1 ? 's' : ''} Pending</strong>
            <p>
              These monthly interest payments require manual approval from admin.
              You can retry the payouts or manually mark them as completed once approved.
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
                className={styles.bulkCompleteButton}
                onClick={handleBulkComplete}
                disabled={isProcessingBulk}
              >
                ✓ Complete Selected
              </button>
              <button
                className={styles.bulkFailButton}
                onClick={handleBulkFail}
                disabled={isProcessingBulk}
              >
                ✗ Fail Selected
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
                <th>Failure Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!pendingPayouts || pendingPayouts.length === 0 ? (
                <tr>
                  <td colSpan="9" className={styles.emptyState}>
                    ✅ No pending payouts - all monthly payments have been successfully processed!
                  </td>
                </tr>
              ) : (
                pendingPayouts.map(payout => (
                  <tr 
                    key={payout.id} 
                    className={`${payout.status === 'rejected' ? styles.failedRow : styles.pendingRow} ${selectedPayouts.has(payout.id) ? styles.selectedRow : ''}`}
                  >
                    <td className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={selectedPayouts.has(payout.id)}
                        onChange={() => togglePayoutSelection(payout.id)}
                        className={styles.checkbox}
                      />
                    </td>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.userName}>{payout.userName || payout.userId}</div>
                        <div className={styles.userEmail}>{payout.userEmail}</div>
                      </div>
                    </td>
                    <td className={styles.monospaceCell}>{payout.investmentId}</td>
                    <td><strong>${(payout.amount || 0).toFixed(2)}</strong></td>
                    <td className={styles.dateCell}>{new Date(payout.date).toLocaleDateString()}</td>
                    <td className={styles.bankCell}>{payout.payoutBankNickname || 'Not configured'}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[payout.status]}`}>
                        {payout.status.toUpperCase()}
                      </span>
                    </td>
                    <td className={styles.reasonCell}>
                      {payout.failureReason || (payout.status === 'pending' ? 'Awaiting admin approval' : '-')}
                    </td>
                    <td>
                      <div className={styles.actionButtonGroup}>
                        <button
                          className={styles.retryButton}
                          onClick={() => onPayoutAction('retry', payout.userId, payout.id)}
                          title="Retry payout"
                        >
                          🔄 Retry
                        </button>
                        <button
                          className={styles.completeButton}
                          onClick={() => {
                            if (confirm('Mark this payout as completed? This will bypass the bank transfer.')) {
                              onPayoutAction('complete', payout.userId, payout.id)
                            }
                          }}
                          title="Mark as completed"
                        >
                          ✓ Complete
                        </button>
                        <button
                          className={styles.failButton}
                          onClick={() => {
                            const reason = prompt('Enter failure reason:')
                            if (reason) {
                              onPayoutAction('fail', payout.userId, payout.id, reason)
                            }
                          }}
                          title="Mark as failed"
                        >
                          ✗ Fail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Two Column Layout */}
      <div className={styles.twoColumnLayout}>
        {/* Left Column - Distribution */}
        <div className={styles.column}>
          <SectionCard title="Distribution">
            <div className={styles.distributionGrid}>
              <div className={styles.distributionCard}>
                <div className={styles.distributionTitle}>Account Types</div>
                <div className={styles.distributionList}>
                  <div className={styles.distributionRow}>
                    <span>Individual</span>
                    <strong>{metrics.accountsByType.individual}</strong>
                  </div>
                  <div className={styles.distributionRow}>
                    <span>Joint</span>
                    <strong>{metrics.accountsByType.joint}</strong>
                  </div>
                  <div className={styles.distributionRow}>
                    <span>Entity</span>
                    <strong>{metrics.accountsByType.entity}</strong>
                  </div>
                  <div className={styles.distributionRow}>
                    <span>IRA</span>
                    <strong>{metrics.accountsByType.ira}</strong>
                  </div>
                </div>
              </div>

              <div className={styles.distributionCard}>
                <div className={styles.distributionTitle}>Lockup Periods</div>
                <div className={styles.distributionList}>
                  <div className={styles.distributionRow}>
                    <span>1 Year</span>
                    <strong>{metrics.investmentsByLockup['1-year']}</strong>
                  </div>
                  <div className={styles.distributionRow}>
                    <span>3 Years</span>
                    <strong>{metrics.investmentsByLockup['3-year']}</strong>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right Column - Recent Activity */}
        <div className={styles.column}>
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
                          ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      </div>
    </div>
  )
})

export default DashboardTab

