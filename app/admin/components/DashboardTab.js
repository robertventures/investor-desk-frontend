import { useState, useCallback, memo, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MetricCard from './MetricCard'
import SectionCard from './SectionCard'
import styles from './DashboardTab.module.css'
import { formatCurrency } from '../../../lib/formatters.js'

/**
 * Main dashboard tab showing overview metrics and payout status
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
  onRefreshPayouts,
  monitoredPayouts,
  onRefreshTransactions,
  isLoadingTransactions
}) {
  const router = useRouter()

  // Selection state for bulk actions
  const [selectedPayouts, setSelectedPayouts] = useState(new Set())
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  // Accordion state - track which investors are expanded
  const [expandedInvestors, setExpandedInvestors] = useState(new Set())

  // Group payouts by investor
  const groupedPayouts = useMemo(() => {
    if (!pendingPayouts || pendingPayouts.length === 0) return []
    
    const groups = new Map()
    
    pendingPayouts.forEach(payout => {
      const key = payout.userId?.toString() || 'unknown'
      if (!groups.has(key)) {
        groups.set(key, {
          userId: payout.userId,
          userName: payout.userName || `User #${payout.userId}`,
          userEmail: payout.userEmail || null,
          bankConnected: payout.bankConnected || false,
          payouts: [],
          totalAmount: 0
        })
      }
      const group = groups.get(key)
      group.payouts.push(payout)
      group.totalAmount += Number(payout.amount) || 0
    })
    
    // Convert to array and sort by user name
    return Array.from(groups.values()).sort((a, b) => 
      a.userName.localeCompare(b.userName)
    )
  }, [pendingPayouts])

  // Toggle accordion expansion for an investor
  const toggleInvestorExpanded = useCallback((userId) => {
    setExpandedInvestors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }, [])

  // Expand/collapse all accordions
  const toggleExpandAll = useCallback(() => {
    if (expandedInvestors.size === groupedPayouts.length) {
      setExpandedInvestors(new Set())
    } else {
      setExpandedInvestors(new Set(groupedPayouts.map(g => g.userId)))
    }
  }, [groupedPayouts, expandedInvestors.size])

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

  // Toggle all payouts for an investor
  const toggleInvestorPayouts = useCallback((payoutIds) => {
    setSelectedPayouts(prev => {
      const newSet = new Set(prev)
      const allSelected = payoutIds.every(id => newSet.has(id))
      
      if (allSelected) {
        // Deselect all
        payoutIds.forEach(id => newSet.delete(id))
      } else {
        // Select all
        payoutIds.forEach(id => newSet.add(id))
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

  // Calculate total amount of selected payouts
  const selectedTotalAmount = useMemo(() => {
    if (!pendingPayouts || selectedPayouts.size === 0) return 0
    return pendingPayouts
      .filter(p => selectedPayouts.has(p.id))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  }, [pendingPayouts, selectedPayouts])

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
          <div className={styles.sectionActions}>
            {groupedPayouts.length > 0 && (
              <button 
                className={styles.expandAllButton}
                onClick={toggleExpandAll}
              >
                {expandedInvestors.size === groupedPayouts.length ? 'Collapse All' : 'Expand All'}
              </button>
            )}
            <button 
              className={styles.refreshButton} 
              onClick={() => onRefreshPayouts(true)} 
              disabled={isLoadingPayouts}
            >
              {isLoadingPayouts ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Selection & Summary Panel */}
        {pendingPayouts && pendingPayouts.length > 0 && (
          <div className={styles.selectionPanel}>
            <div className={styles.selectionControls}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className={styles.checkbox}
              />
              <label onClick={toggleSelectAll} className={styles.selectAllLabel}>
                Select All ({pendingPayouts.length})
              </label>
            </div>
            <div className={styles.selectionStats}>
              <span className={styles.totalAmount}>
                Total Amount: {formatCurrency(selectedTotalAmount)}
              </span>
              <button
                className={styles.processSelectedButton}
                onClick={handleBulkProcess}
                disabled={!someSelected || isProcessingBulk}
              >
                {isProcessingBulk ? 'Processing...' : 'Process Payments'}
              </button>
            </div>
          </div>
        )}

        {/* Accordion List */}
        <div className={styles.accordionContainer}>
          {groupedPayouts.length === 0 ? (
            <div className={styles.emptyState}>
              ✅ No pending payouts - all monthly payments have been processed!
            </div>
          ) : (
            groupedPayouts.map(group => {
              const isExpanded = expandedInvestors.has(group.userId)
              const groupPayoutIds = group.payouts.map(p => p.id)
              const allGroupSelected = groupPayoutIds.every(id => selectedPayouts.has(id))
              const someGroupSelected = groupPayoutIds.some(id => selectedPayouts.has(id))
              
              return (
                <div key={group.userId} className={styles.accordionItem}>
                  {/* Accordion Header */}
                  <div 
                    className={`${styles.accordionHeader} ${isExpanded ? styles.expanded : ''}`}
                  >
                    <div className={styles.accordionHeaderLeft}>
                      <input
                        type="checkbox"
                        checked={allGroupSelected}
                        ref={el => {
                          if (el) el.indeterminate = someGroupSelected && !allGroupSelected
                        }}
                        onChange={() => toggleInvestorPayouts(groupPayoutIds)}
                        className={styles.checkbox}
                        onClick={e => e.stopPropagation()}
                      />
                      <button 
                        className={styles.accordionToggle}
                        onClick={() => toggleInvestorExpanded(group.userId)}
                      >
                        <span className={styles.accordionArrow}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      </button>
                      <div 
                        className={styles.accordionUserInfo}
                        onClick={() => toggleInvestorExpanded(group.userId)}
                      >
                        <div className={styles.accordionUserNameRow}>
                          <span className={styles.accordionUserName}>{group.userName}</span>
                          {group.bankConnected ? (
                            <span className={styles.bankConnectedBadge} title="Bank account connected">
                              🏦 Bank Connected
                            </span>
                          ) : (
                            <span className={styles.bankNotConnectedBadge} title="No bank account connected - cannot process payment">
                              ⚠️ No Bank Account
                            </span>
                          )}
                        </div>
                        <span className={styles.accordionUserEmail}>{group.userEmail || '-'}</span>
                      </div>
                    </div>
                    <div 
                      className={styles.accordionHeaderRight}
                      onClick={() => toggleInvestorExpanded(group.userId)}
                    >
                      <span className={styles.accordionPayoutCount}>
                        {group.payouts.length} payout{group.payouts.length !== 1 ? 's' : ''}
                      </span>
                      <span className={styles.accordionTotalAmount}>
                        {formatCurrency(group.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div className={styles.accordionContent}>
                      <table className={styles.payoutTable}>
                        <thead>
                          <tr>
                            <th className={styles.checkboxCell}></th>
                            <th>Investment</th>
                            <th>Inv. Amount</th>
                            <th>Term</th>
                            <th>Payout</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.payouts.map(payout => {
                            const isProcessing = processingPayoutId === payout.id
                            const isFailed = payout.status?.toLowerCase() === 'rejected' || payout.status?.toLowerCase() === 'failed'
                            const termLabel = payout.investmentTerm === '1-year' ? '1 Year' : payout.investmentTerm === '3-year' ? '3 Years' : payout.investmentTerm || '-'
                            
                            return (
                              <tr 
                                key={payout.id}
                                className={`${isFailed ? styles.failedRow : ''} ${selectedPayouts.has(payout.id) ? styles.selectedRow : ''}`}
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
                                  <Link 
                                    href={`/admin/investments/${payout.investmentId}`}
                                    className={styles.investmentLink}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    #{payout.investmentId}
                                  </Link>
                                </td>
                                <td>{payout.investmentAmount ? formatCurrency(payout.investmentAmount) : '-'}</td>
                                <td>{termLabel}</td>
                                <td><strong>{formatCurrency(payout.amount || 0)}</strong></td>
                                <td className={styles.dateCell}>
                                  {payout.date ? new Date(payout.date).toLocaleDateString() : '-'}
                                </td>
                                <td>
                                  <span className={`${styles.badge} ${styles[payout.status?.toLowerCase()] || styles.pending}`}>
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
                                        ? '🔄 Retry' 
                                        : '💳 Process'
                                    }
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </SectionCard>

      {/* Payout Status - Track processed payouts */}
      <SectionCard title="Payout Status">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionDescription}>
            Track monthly payouts as they move through processing. Cleared payouts auto-hide after 3 days.
          </p>
          <div className={styles.sectionActions}>
            <button 
              className={styles.refreshButton} 
              onClick={() => onRefreshTransactions && onRefreshTransactions(true)} 
              disabled={isLoadingTransactions}
            >
              {isLoadingTransactions ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {monitoredPayouts && monitoredPayouts.length > 0 ? (
          <div className={styles.payoutStatusTableContainer}>
            <table className={styles.payoutTable}>
              <thead>
                <tr>
                  <th>Investment</th>
                  <th>Investor</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {monitoredPayouts.map(payout => {
                  const statusLower = (payout.status || '').toLowerCase()
                  const isCleared = statusLower === 'completed' || statusLower === 'cleared' || statusLower === 'received'
                  
                  return (
                    <tr key={payout.id} className={isCleared ? styles.clearedRow : ''}>
                      <td>
                        <Link 
                          href={`/admin/investments/${payout.investmentId}`}
                          className={styles.investmentLink}
                        >
                          #{payout.investmentId}
                        </Link>
                      </td>
                      <td>
                        <div className={styles.investorCell}>
                          <span 
                            className={styles.investorName}
                            onClick={() => router.push(`/admin/users/${payout.userId}`)}
                          >
                            {payout.userName}
                          </span>
                          {payout.userEmail && (
                            <span className={styles.investorEmail}>{payout.userEmail}</span>
                          )}
                        </div>
                      </td>
                      <td><strong>{formatCurrency(payout.amount || 0)}</strong></td>
                      <td className={styles.dateCell}>
                        {payout.date ? new Date(payout.date).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[statusLower] || styles.defaultBadge}`}>
                          {(payout.status || 'unknown').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            No payouts currently being processed. Payouts will appear here after they are submitted for payment.
          </div>
        )}
      </SectionCard>
    </div>
  )
})

export default DashboardTab

