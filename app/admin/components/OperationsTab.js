import { useState } from 'react'
import { formatCurrency } from '../../../lib/formatters.js'
import { TIME_MACHINE_ENABLED } from '../../../lib/featureFlags'
import SectionCard from './SectionCard'
import TimeMachineTab from './TimeMachineTab'
import styles from './OperationsTab.module.css'

/**
 * Operations tab containing investor import, time machine, and withdrawals
 */
export default function OperationsTab({
  withdrawals,
  isLoadingWithdrawals,
  timeMachineData,
  currentUser,
  onWithdrawalAction,
  onTimeMachineUpdate,
  onTimeMachineReset,
  onDeleteAccounts,
  onSeedTestAccounts,
  isDeletingAccounts,
  isSeedingAccounts,
  onRefreshWithdrawals,
  onImportComplete,
  onToggleAutoApprove
}) {
  // Withdrawal rejection confirmation modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [withdrawalToReject, setWithdrawalToReject] = useState(null)
  const [isRejecting, setIsRejecting] = useState(false)

  // Open reject confirmation modal
  const handleRejectClick = (withdrawal) => {
    setWithdrawalToReject(withdrawal)
    setRejectModalOpen(true)
  }

  // Close reject confirmation modal
  const handleRejectCancel = () => {
    setRejectModalOpen(false)
    setWithdrawalToReject(null)
  }

  // Confirm and execute rejection
  const handleRejectConfirm = async () => {
    if (!withdrawalToReject) return
    
    setIsRejecting(true)
    try {
      const success = await onWithdrawalAction('reject', withdrawalToReject.userId, withdrawalToReject.id)
      if (success) {
        // Only close modal on success - on failure, keep it open so user can retry or cancel
        setRejectModalOpen(false)
        setWithdrawalToReject(null)
      }
    } catch (error) {
      console.error('Failed to reject withdrawal:', error)
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <div className={styles.operationsTab}>
      {/* Time Machine Section */}
      {TIME_MACHINE_ENABLED && (
        <SectionCard title="Time Machine">
          <TimeMachineTab
            timeMachineData={timeMachineData}
            onUpdate={onTimeMachineUpdate}
            onReset={onTimeMachineReset}
            currentUser={currentUser}
            onDeleteAccounts={onDeleteAccounts}
            onSeedTestAccounts={onSeedTestAccounts}
            isDeletingAccounts={isDeletingAccounts}
            isSeedingAccounts={isSeedingAccounts}
            onToggleAutoApprove={onToggleAutoApprove}
          />
        </SectionCard>
      )}

      {/* Withdrawals Section */}
      <SectionCard title="Withdrawals">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionDescription}>
            Process withdrawal requests from investors
          </p>
          <button 
            className={styles.refreshButton} 
            onClick={onRefreshWithdrawals} 
            disabled={isLoadingWithdrawals}
          >
            {isLoadingWithdrawals ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Email</th>
                <th>Investment ID</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Eligible At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan="8" className={styles.emptyState}>
                    No withdrawals
                  </td>
                </tr>
              ) : (
                withdrawals.map(w => (
                  <tr key={w.id}>
                    <td>{w.userId}</td>
                    <td>{w.userEmail}</td>
                    <td>{w.investmentId}</td>
                    <td>{formatCurrency(w.amount || 0)}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[w.status]}`}>
                        {w.status === 'approved' ? 'Completed' : w.status}
                      </span>
                    </td>
                    <td>{w.requestedAt ? new Date(w.requestedAt).toLocaleString() : '-'}</td>
                    <td>{w.payoutDueBy ? new Date(w.payoutDueBy).toLocaleString() : '-'}</td>
                    <td>
                      <div className={styles.actionButtonGroup}>
                        <button 
                          className={styles.approveButton} 
                          onClick={() => onWithdrawalAction('complete', w.userId, w.id)} 
                          disabled={w.status === 'approved'}
                        >
                          Complete Payout
                        </button>
                        <button 
                          className={styles.rejectButton} 
                          onClick={() => handleRejectClick(w)} 
                          disabled={w.status === 'rejected' || w.status === 'approved'}
                        >
                          Reject
                        </button>
                      </div>
                      {w.quotedAmount != null && w.finalAmount != null && (
                        <div className={styles.withdrawalMeta}>
                          <div>
                            <strong>Quoted:</strong> {formatCurrency(w.quotedAmount || 0)} (earnings {formatCurrency(w.quotedEarnings || 0)})
                          </div>
                          <div>
                            <strong>Final:</strong> {formatCurrency(w.finalAmount || 0)} (earnings {formatCurrency(w.finalEarnings || 0)})
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Rejection Confirmation Modal */}
      {rejectModalOpen && withdrawalToReject && (
        <div className={styles.modalOverlay} onClick={handleRejectCancel}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Confirm Withdrawal Rejection</h3>
            <div className={styles.modalBody}>
              <p className={styles.modalWarning}>
                Are you sure you want to reject this withdrawal request?
              </p>
              <div className={styles.modalDetails}>
                <div className={styles.modalDetailRow}>
                  <span className={styles.modalDetailLabel}>User:</span>
                  <span className={styles.modalDetailValue}>{withdrawalToReject.userEmail}</span>
                </div>
                <div className={styles.modalDetailRow}>
                  <span className={styles.modalDetailLabel}>Investment ID:</span>
                  <span className={styles.modalDetailValue}>{withdrawalToReject.investmentId}</span>
                </div>
                <div className={styles.modalDetailRow}>
                  <span className={styles.modalDetailLabel}>Amount:</span>
                  <span className={styles.modalDetailValue}>{formatCurrency(withdrawalToReject.amount || 0)}</span>
                </div>
              </div>
              <p className={styles.modalNote}>
                Rejecting this withdrawal will restore the investment to its normal active state. 
                The investor will not see this as a rejection - their investment will simply continue as before.
              </p>
            </div>
            <div className={styles.modalActions}>
              <button 
                className={styles.modalCancelButton}
                onClick={handleRejectCancel}
                disabled={isRejecting}
              >
                Cancel
              </button>
              <button 
                className={styles.modalConfirmButton}
                onClick={handleRejectConfirm}
                disabled={isRejecting}
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

