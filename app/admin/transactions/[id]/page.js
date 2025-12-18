'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import AdminHeader from '../../../components/layout/AdminHeader'
import styles from './page.module.css'
import { formatCurrency } from '../../../../lib/formatters.js'
import { formatDateTime } from '../../../../lib/dateUtils.js'

export default function AdminTransactionDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const transactionId = params?.id
  const [currentUser, setCurrentUser] = useState(null)
  const [transaction, setTransaction] = useState(null)
  const [investment, setInvestment] = useState(null)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const init = async () => {
      try {
        const meId = localStorage.getItem('currentUserId')
        if (!meId) {
          router.push('/')
          return
        }
        const meRes = await fetch(`/api/users/${meId}`)
        const meData = await meRes.json()
        if (!meData.success || !meData.user || !meData.user.isAdmin) {
          router.push('/dashboard')
          return
        }
        setCurrentUser(meData.user)

        // Load all users to find the transaction
        const usersData = await apiClient.getAllUsers()
        if (!usersData || !usersData.success) {
          alert('Failed to load transaction data')
          return
        }

        // Find the transaction and its owner
        let foundTransaction = null
        let foundUser = null
        let foundInvestment = null

        for (const u of usersData.users) {
          if (u.investments && u.investments.length > 0) {
            for (const inv of u.investments) {
              // Check if transaction ID matches an investment
              const invTxId = `inv-${inv.id}`
              if (invTxId === transactionId) {
                foundTransaction = {
                  id: invTxId,
                  type: 'investment',
                  amount: inv.amount,
                  date: inv.createdAt || inv.approvedAt,
                  status: inv.status,
                  lockupPeriod: inv.lockupPeriod,
                  paymentFrequency: inv.paymentFrequency,
                  bonds: inv.bonds,
                  investmentDate: inv.investmentDate,
                  submittedAt: inv.submittedAt,
                  confirmedAt: inv.confirmedAt,
                  lockupEndDate: inv.lockupEndDate,
                  earningsMethod: inv.earningsMethod,
                  createdAt: inv.createdAt,
                  updatedAt: inv.updatedAt
                }
                foundUser = u
                foundInvestment = inv
                break
              }

              // Check transactions within investment
              if (inv.transactions && inv.transactions.length > 0) {
                const tx = inv.transactions.find(t => t.id === transactionId)
                if (tx) {
                  foundTransaction = tx
                  foundUser = u
                  foundInvestment = inv
                  break
                }
              }
            }
            if (foundTransaction) break
          }
        }

        if (foundTransaction) {
          setTransaction(foundTransaction)
          setUser(foundUser)
          setInvestment(foundInvestment)
        } else {
          alert('Transaction not found')
        }
      } catch (error) {
        console.error('Failed to load transaction:', error)
        alert('An error occurred while loading the transaction')
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [router, transactionId])

  // Transaction status configuration - using CSS variables for consistency
  // API TransactionStatus: pending, submitted, approved, rejected, received
  const STATUS_CONFIG = {
    // Transaction states from API - using CSS variable values
    pending: { label: 'Pending', bg: 'var(--status-warning-bg)', color: 'var(--status-warning-color)', icon: '⏳' },
    submitted: { label: 'Submitted', bg: 'var(--status-info-bg)', color: 'var(--status-info-color)', icon: '📤' },
    approved: { label: 'Approved', bg: 'var(--status-success-bg)', color: 'var(--status-success-color)', icon: '✓' },
    rejected: { label: 'Rejected', bg: 'var(--status-error-bg)', color: 'var(--status-error-color)', icon: '✕' },
    received: { label: 'Received', bg: 'var(--status-success-bg)', color: 'var(--status-success-color)', icon: '✅' },
    // Legacy/alias states for backwards compatibility
    completed: { label: 'Completed', bg: 'var(--status-success-bg)', color: 'var(--status-success-color)', icon: '✅' },
    failed: { label: 'Failed', bg: 'var(--status-error-bg)', color: 'var(--status-error-color)', icon: '❌' },
    active: { label: 'Active', bg: 'var(--status-success-bg)', color: 'var(--status-success-color)', icon: '✓' },
    draft: { label: 'Draft', bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-color)', icon: '📝' }
  }

  const getStatusConfig = (status) => {
    if (!status) return null
    const normalizedStatus = status.toString().toLowerCase()
    return STATUS_CONFIG[normalizedStatus] || { 
      label: status, 
      bg: '#f3f4f6', 
      color: '#374151', 
      icon: '•' 
    }
  }

  const getStatusBadge = (status) => {
    const config = getStatusConfig(status)
    if (!config) return null
    return (
      <span className={styles.statusBadge} style={{ backgroundColor: config.bg, color: config.color }}>
        {config.icon} {config.label}
      </span>
    )
  }

  const getTypeIcon = (type) => {
    if (type === 'investment') return '💰'
    if (type === 'distribution' || type === 'monthly_distribution') return '💸'
    if (type === 'contribution' || type === 'monthly_compounded') return '📈'
    return '📊'
  }

  const getTypeLabel = (type) => {
    if (type === 'investment') return 'Investment'
    if (type === 'distribution' || type === 'monthly_distribution') return 'Distribution'
    if (type === 'contribution' || type === 'monthly_compounded') return 'Contribution'
    return type
  }

  // Handle approve and process transaction
  const handleApproveTransaction = async () => {
    if (!confirm(`Approve and process this ${getTypeLabel(transaction.type).toLowerCase()} payout?`)) {
      return
    }

    setIsProcessing(true)

    try {
      const result = await apiClient.admin.processAchqPayment(transaction.id)
      
      if (result.success) {
        alert('Transaction approved and processed successfully!')
        // Reload the page to show updated status
        window.location.reload()
      } else {
        alert(result.error || 'Failed to process transaction')
      }
    } catch (error) {
      console.error('Error processing transaction:', error)
      alert('An error occurred while processing the transaction')
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className={styles.main}>
        <AdminHeader activeTab="distributions" />
        <div className={styles.container}>
          <div className={styles.loading}>Loading transaction details...</div>
        </div>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className={styles.main}>
        <AdminHeader activeTab="distributions" />
        <div className={styles.container}>
          <div className={styles.error}>Transaction not found</div>
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
          <div className={styles.header}>
            <button className={styles.backButton} onClick={() => router.push('/admin?tab=distributions')}>
              ← Back to Transactions
            </button>
          </div>

          {/* Summary Card - Main Info */}
          <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <div className={styles.summaryIcon}>
                {getTypeIcon(transaction.type)}
              </div>
              <div className={styles.summaryInfo}>
                <h1 className={styles.summaryTitle}>{getTypeLabel(transaction.type)}</h1>
                <div className={styles.summaryMeta}>
                  <code className={styles.transactionId}>{transaction.id}</code>
                  {getStatusBadge(transaction.status)}
                </div>
              </div>
              <div className={styles.summaryAmount}>
                {formatCurrency(transaction.amount)}
              </div>
            </div>
            
            <div className={styles.summaryDetails}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Date</span>
                <span className={styles.detailValue}>{formatDateTime(transaction.displayDate || transaction.date)}</span>
              </div>
              {transaction.monthIndex != null && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Month</span>
                  <span className={styles.detailValue}>Month {transaction.monthIndex}</span>
                </div>
              )}
              {transaction.lockupPeriod && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Lockup Period</span>
                  <span className={styles.detailValue}>{transaction.lockupPeriod}</span>
                </div>
              )}
              {transaction.paymentFrequency && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Payment Frequency</span>
                  <span className={styles.detailValue}>
                    {transaction.paymentFrequency === 'monthly' ? 'Interest Paid Monthly' : 'Compounded Monthly'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Section - Approve Button for Pending Transactions */}
          {transaction.status === 'pending' && (
            <div className={styles.actionSection}>
              <div className={styles.actionContent}>
                <div className={styles.actionInfo}>
                  <div className={styles.actionTitle}>⏳ Pending Approval</div>
                  <div className={styles.actionDescription}>
                    This transaction is pending admin approval. Approve to process the payout.
                  </div>
                </div>
                <button
                  className={styles.approveButton}
                  onClick={handleApproveTransaction}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Processing...' : '✓ Approve & Process'}
                </button>
              </div>
            </div>
          )}

          {/* Transaction Status Section - Show for payment-related transactions */}
          {(transaction.type === 'distribution' || transaction.type === 'contribution' || 
            transaction.type === 'monthly_distribution' || transaction.type === 'monthly_compounded') && (
            <div className={styles.paymentStatusSection}>
              <h2 className={styles.sectionTitle}>Transaction Status</h2>
              <div className={styles.paymentStatusGrid}>
                <div className={styles.paymentStatusCard}>
                  <div className={styles.paymentStatusLabel}>Current Status</div>
                  <div className={styles.paymentStatusValue}>
                    {getStatusBadge(transaction.status)}
                  </div>
                </div>
                {transaction.humanId && (
                  <div className={styles.paymentStatusCard}>
                    <div className={styles.paymentStatusLabel}>Transaction ID</div>
                    <div className={styles.paymentStatusValue}>
                      <code>{transaction.humanId}</code>
                    </div>
                  </div>
                )}
                {transaction.description && (
                  <div className={styles.paymentStatusCard}>
                    <div className={styles.paymentStatusLabel}>Description</div>
                    <div className={styles.paymentStatusValue}>
                      {transaction.description}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Transaction Lifecycle Timeline */}
              <div className={styles.paymentTimeline}>
                <div className={styles.timelineTitle}>Transaction Lifecycle</div>
                <div className={styles.timelineSteps}>
                  <div className={`${styles.timelineStep} ${transaction.status ? styles.completed : ''}`}>
                    <div className={styles.timelineStepIcon}>1</div>
                    <div className={styles.timelineStepLabel}>Pending</div>
                  </div>
                  <div className={styles.timelineConnector} />
                  <div className={`${styles.timelineStep} ${['submitted', 'approved', 'received', 'completed'].includes(transaction.status) ? styles.completed : ''}`}>
                    <div className={styles.timelineStepIcon}>2</div>
                    <div className={styles.timelineStepLabel}>Submitted</div>
                  </div>
                  <div className={styles.timelineConnector} />
                  <div className={`${styles.timelineStep} ${['approved', 'received', 'completed'].includes(transaction.status) ? styles.completed : ''} ${transaction.status === 'rejected' || transaction.status === 'failed' ? styles.failed : ''}`}>
                    <div className={styles.timelineStepIcon}>3</div>
                    <div className={styles.timelineStepLabel}>
                      {transaction.status === 'rejected' ? 'Rejected' : 
                       transaction.status === 'failed' ? 'Failed' : 'Received'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Additional Details */}
          <div className={styles.infoGrid}>
            {/* Investment-specific details */}
            {transaction.type === 'investment' && (
              <>
                {transaction.bonds && (
                  <div className={styles.infoCard}>
                    <div className={styles.infoLabel}>Bonds</div>
                    <div className={styles.infoValue}>{transaction.bonds}</div>
                  </div>
                )}
                {transaction.lockupEndDate && (
                  <div className={styles.infoCard}>
                    <div className={styles.infoLabel}>Lockup Ends</div>
                    <div className={styles.infoValue}>{formatDateTime(transaction.lockupEndDate)}</div>
                  </div>
                )}
              </>
            )}

            {/* Distribution/Contribution details */}
            {(transaction.type === 'distribution' || transaction.type === 'contribution' || 
              transaction.type === 'monthly_distribution' || transaction.type === 'monthly_compounded') && (
              <>
                {transaction.principal && (
                  <div className={styles.infoCard}>
                    <div className={styles.infoLabel}>Principal</div>
                    <div className={styles.infoValue}>{formatCurrency(transaction.principal)}</div>
                  </div>
                )}
                {transaction.payoutBankNickname && (
                  <div className={styles.infoCard}>
                    <div className={styles.infoLabel}>Payout Bank</div>
                    <div className={styles.infoValue}>{transaction.payoutBankNickname}</div>
                  </div>
                )}
                {transaction.distributionTxId && (
                  <div className={styles.infoCard}>
                    <div className={styles.infoLabel}>Related Distribution</div>
                    <button
                      className={styles.linkButton}
                      onClick={() => router.push(`/admin/transactions/${transaction.distributionTxId}`)}
                    >
                      View Transaction
                    </button>
                  </div>
                )}
                {transaction.failureReason && (
                  <div className={styles.infoCard}>
                    <div className={styles.infoLabel}>Failure Reason</div>
                    <div className={styles.infoValueError}>{transaction.failureReason}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Related Links */}
          <div className={styles.linksSection}>
            {user && (
              <button
                className={styles.linkCard}
                onClick={() => router.push(`/admin/users/${user.id}`)}
              >
                <div className={styles.linkIcon}>👤</div>
                <div className={styles.linkContent}>
                  <div className={styles.linkTitle}>Account Holder</div>
                  <div className={styles.linkSubtitle}>{user.firstName} {user.lastName}</div>
                  <div className={styles.linkMeta}>{user.email} · {user.accountType}</div>
                </div>
                <div className={styles.linkArrow}>→</div>
              </button>
            )}
            {investment && transaction.type !== 'investment' && (
              <button
                className={styles.linkCard}
                onClick={() => router.push(`/admin/investments/${investment.id}`)}
              >
                <div className={styles.linkIcon}>💼</div>
                <div className={styles.linkContent}>
                  <div className={styles.linkTitle}>Related Investment</div>
                  <div className={styles.linkSubtitle}>Investment #{investment.id}</div>
                  <div className={styles.linkMeta}>{formatCurrency(investment.amount)} · {getStatusBadge(investment.status)}</div>
                </div>
                <div className={styles.linkArrow}>→</div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

