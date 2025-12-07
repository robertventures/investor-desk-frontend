import { useState, useEffect } from 'react'
import { apiClient } from '../../../lib/apiClient'
import { formatCurrency } from '../../../lib/formatters.js'
import { TIME_MACHINE_ENABLED } from '../../../lib/featureFlags'
import SectionCard from './SectionCard'
import TimeMachineTab from './TimeMachineTab'
import DocumentManagerSection from './DocumentManagerSection'
import styles from './OperationsTab.module.css'

// Feature flag: Enable when backend endpoint is ready
const MASTER_PASSWORD_ENABLED = false

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
  const [masterPassword, setMasterPassword] = useState(null)
  const [masterPasswordInfo, setMasterPasswordInfo] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Fetch current master password info (only if feature is enabled)
  useEffect(() => {
    if (MASTER_PASSWORD_ENABLED) {
      fetchMasterPasswordInfo()
    }
  }, [])

  const fetchMasterPasswordInfo = async () => {
    if (!MASTER_PASSWORD_ENABLED) return
    
    try {
      const data = await apiClient.request('/api/admin/generate-master-password')
      if (data && data.success && data.hasPassword) {
        setMasterPasswordInfo(data)
      }
    } catch (error) {
      console.error('Error fetching master password info:', error)
    }
  }

  const handleGenerateMasterPassword = async () => {
    if (!MASTER_PASSWORD_ENABLED) {
      alert('Master password generation is not yet available. This feature is coming soon.')
      return
    }
    
    setIsGenerating(true)
    setCopied(false)
    try {
      const data = await apiClient.request('/api/admin/generate-master-password', {
        method: 'POST'
      })
      
      if (data && data.success) {
        setMasterPassword(data.password)
        setMasterPasswordInfo({
          hasPassword: true,
          expiresAt: data.expiresAt,
          isExpired: false
        })
        
        // Auto-copy to clipboard
        try {
          await navigator.clipboard.writeText(data.password)
          setCopied(true)
        } catch (err) {
          console.error('Failed to copy to clipboard:', err)
        }
      } else {
        alert('Failed to generate master password: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error generating master password:', error)
      alert('Failed to generate master password')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = async () => {
    if (masterPassword) {
      try {
        await navigator.clipboard.writeText(masterPassword)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

  const formatTimeRemaining = (ms) => {
    if (!ms || ms <= 0) return 'Expired'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  return (
    <div className={styles.operationsTab}>
      {/* Master Password Section */}
      <SectionCard title="Master Password Generator">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionDescription}>
            Generate a temporary master password to access any investor account for testing. Password expires in 30 minutes.
          </p>
        </div>
        <div className={styles.masterPasswordSection}>
          <button
            onClick={handleGenerateMasterPassword}
            disabled={isGenerating}
            className={styles.generateButton}
          >
            {isGenerating ? 'Generating...' : 'Generate Master Password'}
          </button>
          
          {masterPassword && (
            <div className={styles.masterPasswordDisplay}>
              <div className={styles.passwordBox}>
                <code className={styles.passwordText}>{masterPassword}</code>
                <button 
                  onClick={copyToClipboard}
                  className={styles.copyButton}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className={styles.passwordNote}>
                ⚠️ This password can be used to login to ANY investor account. Save it securely and use within 30 minutes.
              </p>
            </div>
          )}
          
          {masterPasswordInfo && masterPasswordInfo.hasPassword && !masterPasswordInfo.isExpired && (
            <div className={styles.masterPasswordStatus}>
              <p className={styles.statusText}>
                ✓ Active master password expires in {formatTimeRemaining(masterPasswordInfo.timeRemainingMs)}
              </p>
            </div>
          )}
        </div>
      </SectionCard>
      {/* Document Manager Section */}
      <SectionCard title="Document Manager">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionDescription}>
            Send documents to users via bulk upload (ZIP) or individual upload. Manage and delete documents as needed.
          </p>
        </div>
        <DocumentManagerSection 
          currentUser={currentUser}
          onUploadComplete={onImportComplete}
        />
      </SectionCard>

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
                          onClick={() => onWithdrawalAction('reject', w.userId, w.id)} 
                          disabled={w.status === 'rejected'}
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
    </div>
  )
}

