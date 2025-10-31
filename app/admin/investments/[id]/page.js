'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import { fetchWithCsrf } from '../../../../lib/csrfClient'
import AdminHeader from '../../../components/AdminHeader'
import InvestmentAdminHeader from '../../components/InvestmentAdminHeader'
import { calculateInvestmentValue, formatCurrency, formatDate } from '../../../../lib/investmentCalculations.js'
import { formatDateForDisplay, formatDateTime } from '../../../../lib/dateUtils.js'
import styles from './page.module.css'

export default function AdminInvestmentDetailsPage({ params }) {
  const router = useRouter()
  const { id: investmentId } = params
  const [currentUser, setCurrentUser] = useState(null)
  const [investment, setInvestment] = useState(null)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showTerminateModal, setShowTerminateModal] = useState(false)
  const [isTerminating, setIsTerminating] = useState(false)
  const [overrideLockupConfirmed, setOverrideLockupConfirmed] = useState(false)
  const [appTime, setAppTime] = useState(null)
  const [form, setForm] = useState({
    amount: '',
    status: '',
    paymentFrequency: '',
    lockupPeriod: '',
    accountType: '',
    paymentMethod: ''
  })

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

        // Load all users to find the investment
        const usersData = await apiClient.getAllUsers()
        if (!usersData || !usersData.success) {
          alert('Failed to load investment data')
          return
        }

        // Find the investment and its owner
        let foundInvestment = null
        let foundUser = null
        for (const u of usersData.users) {
          const inv = (u.investments || []).find(i => i.id === investmentId)
          if (inv) {
            foundInvestment = inv
            foundUser = u
            break
          }
        }

        if (!foundInvestment || !foundUser) {
          alert('Investment not found')
          router.push('/admin?tab=transactions')
          return
        }

        setInvestment(foundInvestment)
        setUser(foundUser)
        setForm({
          amount: foundInvestment.amount || '',
          status: foundInvestment.status || '',
          paymentFrequency: foundInvestment.paymentFrequency || '',
          lockupPeriod: foundInvestment.lockupPeriod || '',
          accountType: foundInvestment.accountType || '',
          paymentMethod: foundInvestment.paymentMethod || 'ach'
        })

        // Calculate current app time using offset for withdrawal calculations
        if (usersData.timeOffset !== undefined && usersData.timeOffset !== null) {
          const realTime = new Date()
          const currentAppTime = new Date(realTime.getTime() + usersData.timeOffset).toISOString()
          setAppTime(currentAppTime)
        }
      } catch (e) {
        console.error('Failed to load investment', e)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [router, investmentId])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    // Reset form to original investment data
    const inv = investment
    setForm({
      amount: inv.amount || '',
      status: inv.status || '',
      paymentFrequency: inv.paymentFrequency || '',
      lockupPeriod: inv.lockupPeriod || '',
      accountType: inv.accountType || ''
    })
    setIsEditing(false)
  }

  // Define valid status transitions (state machine)
  const validTransitions = {
    'draft': ['pending'],
    'pending': ['active', 'rejected'],
    'active': ['withdrawal_notice'],
    'withdrawal_notice': ['withdrawn'],
    'rejected': [],
    'withdrawn': []
  }

  // Get valid status options for dropdown
  const getValidStatusOptions = () => {
    const currentStatus = investment?.status
    if (!currentStatus) return ['draft', 'pending', 'active', 'rejected', 'withdrawal_notice', 'withdrawn']
    
    const allowed = validTransitions[currentStatus] || []
    // Always include the current status
    return [currentStatus, ...allowed]
  }

  const validateForm = () => {
    // Validate amount
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) {
      return 'Investment amount must be greater than zero'
    }
    if (amount < 1000) {
      return 'Minimum investment amount is $1,000'
    }
    if (amount % 10 !== 0) {
      return 'Investment amount must be in $10 increments'
    }

    // Validate status transitions
    const currentStatus = investment.status
    const requestedStatus = form.status
    
    if (currentStatus !== requestedStatus) {
      const allowedStatuses = validTransitions[currentStatus] || []
      if (!allowedStatuses.includes(requestedStatus)) {
        return `Invalid status transition from '${currentStatus}' to '${requestedStatus}'. Allowed: ${allowedStatuses.join(', ') || 'none'}`
      }
    }

    // Cannot change amount on active investments
    if (investment.status === 'active' && investment.amount !== amount) {
      return 'Cannot change investment amount on active investments. Amount is locked for tax reporting and audit compliance.'
    }

    // IRA accounts cannot use monthly payment frequency
    if (form.accountType === 'ira' && form.paymentFrequency === 'monthly') {
      return 'IRA accounts can only use compounding payment frequency'
    }

    // Account type must match user's account type
    if (user.accountType && form.accountType !== user.accountType) {
      return `Account type must be ${user.accountType} for this user`
    }

    return null // No errors
  }

  const handleSave = async () => {
    if (!user || !investment) return
    
    // Validate form before submission
    const validationError = validateForm()
    if (validationError) {
      alert(validationError)
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _action: 'updateInvestment',
          investmentId: investment.id,
          adminUserId: currentUser?.id,
          fields: {
            amount: parseFloat(form.amount),
            status: form.status,
            paymentFrequency: form.paymentFrequency,
            lockupPeriod: form.lockupPeriod,
            accountType: form.accountType,
            paymentMethod: form.paymentMethod
          }
        })
      })
      const data = await res.json()
      if (!data.success) {
        alert(data.error || 'Failed to update investment')
        return
      }
      alert('Investment updated successfully')
      // Reload the investment data
      const updatedInv = (data.user.investments || []).find(i => i.id === investmentId)
      if (updatedInv) {
        setInvestment(updatedInv)
        setUser(data.user)
      }
      setIsEditing(false)
    } catch (e) {
      console.error('Failed to save', e)
      alert('An error occurred. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTerminateClick = () => {
    setShowTerminateModal(true)
    setOverrideLockupConfirmed(false)
  }

  const handleTerminateConfirm = async () => {
    if (!user || !investment || !currentUser) return

    // Check if lockup override is needed
    const now = new Date(appTime || new Date().toISOString())
    const needsOverride = investment.lockupEndDate && now < new Date(investment.lockupEndDate)
    
    if (needsOverride && !overrideLockupConfirmed) {
      alert('Please confirm that you understand you are overriding the lockup period.')
      return
    }

    if (!confirm('Are you sure you want to terminate this investment? This action cannot be undone. The withdrawal will be processed immediately.')) {
      return
    }

    setIsTerminating(true)
    try {
      const res = await fetchWithCsrf('/api/admin/withdrawals/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          investmentId: investment.id,
          adminUserId: currentUser.id,
          overrideLockup: needsOverride && overrideLockupConfirmed
        })
      })

      const data = await res.json()
      
      if (!data.success) {
        alert(data.error || 'Failed to terminate investment')
        return
      }

      alert(`Investment terminated successfully!\n\nFinal Payout: $${data.finalPayout.finalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nPrincipal: $${data.finalPayout.principalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nEarnings: $${data.finalPayout.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      
      // Reload the page to show updated data
      window.location.reload()
    } catch (e) {
      console.error('Failed to terminate investment', e)
      alert('An error occurred. Please try again.')
    } finally {
      setIsTerminating(false)
      setShowTerminateModal(false)
    }
  }

  const handleTerminateCancel = () => {
    setShowTerminateModal(false)
    setOverrideLockupConfirmed(false)
  }

  if (isLoading) {
    return (
      <div className={styles.main}>
        <AdminHeader activeTab="transactions" />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.loadingState}>Loading investment details...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!investment || !user) {
    return (
      <div className={styles.main}>
        <AdminHeader activeTab="transactions" />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.errorState}>Investment not found</div>
          </div>
        </div>
      </div>
    )
  }

  const statusColor = {
    active: '#10b981',
    pending: '#f59e0b',
    rejected: '#ef4444',
    withdrawn: '#6b7280'
  }[investment.status] || '#6b7280'

  // Construct transactions link
  const transactionsHref = '/admin?tab=transactions';

  return (
    <div className={styles.main}>
      <AdminHeader activeTab="transactions" />
      <div className={styles.container}>
        <div className={styles.content}>
          {/* Investment Admin Header with breadcrumb, back, and actions */}
          <InvestmentAdminHeader
            investmentId={investment.id}
            accountId={user.id}
            accountName={`${user.firstName} ${user.lastName}`}
            transactionsHref={transactionsHref}
          />

          {/* Page Header */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.title}>Investment Details</h1>
              <p className={styles.subtitle}>
                Account: <button 
                  className={styles.accountLink} 
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                >
                  {user.firstName} {user.lastName} ({user.email})
                </button>
              </p>
            </div>
            <div className={styles.headerActions}>
              <span className={styles.statusBadge} style={{ 
                backgroundColor: `${statusColor}20`,
                color: statusColor 
              }}>
                {investment.status?.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Amount</div>
              <div className={styles.metricValue}>${(investment.amount || 0).toLocaleString()}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Created</div>
              <div className={styles.metricValue}>
                {formatDateForDisplay(investment.createdAt)}
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Submitted</div>
              <div className={styles.metricValue}>
                {formatDateForDisplay(investment.submittedAt)}
              </div>
            </div>
            {investment.confirmedAt && (
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Confirmed</div>
                <div className={styles.metricValue}>
                  {formatDateForDisplay(investment.confirmedAt)}
                </div>
              </div>
            )}
          </div>

          {/* Investment Details Section */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className={styles.sectionTitle}>Investment Details</h2>
                {!isEditing && (
                  <button className={styles.editButton} onClick={handleEdit}>
                    Edit Investment
                  </button>
                )}
              </div>
            </div>
            <div className={styles.grid}>
              <div>
                <label>Amount ($)</label>
                <input
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  className={styles.input}
                  min="1000"
                  step="10"
                  disabled={!isEditing || investment.status === 'active'}
                />
                {investment.status === 'active' && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    ⚠️ Amount is locked on active investments for tax compliance
                  </div>
                )}
              </div>
              <div>
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange} className={styles.input} disabled={!isEditing}>
                  {getValidStatusOptions().map(status => (
                    <option key={status} value={status}>
                      {status === 'draft' && 'Draft'}
                      {status === 'pending' && 'Pending'}
                      {status === 'active' && 'Active'}
                      {status === 'rejected' && 'Rejected'}
                      {status === 'withdrawal_notice' && 'Withdrawal Notice'}
                      {status === 'withdrawn' && 'Withdrawn'}
                    </option>
                  ))}
                </select>
                {isEditing && investment.status && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Valid transitions from {investment.status}: {(validTransitions[investment.status] || []).join(', ') || 'none'}
                  </div>
                )}
              </div>
              <div>
                <label>Payment Frequency</label>
                <select name="paymentFrequency" value={form.paymentFrequency} onChange={handleChange} className={styles.input} disabled={!isEditing}>
                  <option value="monthly">Monthly</option>
                  <option value="compounding">Compounding</option>
                </select>
                {isEditing && form.accountType === 'ira' && form.paymentFrequency === 'monthly' && (
                  <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                    ⚠️ IRA accounts can only use compounding
                  </div>
                )}
              </div>
              <div>
                <label>Lockup Period</label>
                <select name="lockupPeriod" value={form.lockupPeriod} onChange={handleChange} className={styles.input} disabled={!isEditing}>
                  <option value="1-year">1 Year</option>
                  <option value="3-year">3 Years</option>
                </select>
              </div>
              <div>
                <label>Account Type</label>
                <select name="accountType" value={form.accountType} onChange={handleChange} className={styles.input} disabled={!isEditing}>
                  <option value="individual">Individual</option>
                  <option value="joint">Joint</option>
                  <option value="entity">Entity</option>
                  <option value="ira">IRA</option>
                </select>
                {isEditing && user?.accountType && form.accountType !== user.accountType && (
                  <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                    ⚠️ User's account type is {user.accountType}
                  </div>
                )}
              </div>
              <div>
                <label>Payment Method</label>
                <select name="paymentMethod" value={form.paymentMethod} onChange={handleChange} className={styles.input} disabled={!isEditing}>
                  <option value="ach">ACH Transfer</option>
                  <option value="wire">Wire Transfer</option>
                </select>
                {form.paymentMethod === 'wire' && (
                  <div style={{ fontSize: '12px', color: '#92400e', marginTop: '4px' }}>
                    🏦 Wire transfers require manual approval
                  </div>
                )}
                {form.paymentMethod === 'ach' && investment.autoApproved && (
                  <div style={{ fontSize: '12px', color: '#1e40af', marginTop: '4px' }}>
                    ✓ Auto-approved (ACH)
                  </div>
                )}
              </div>
            </div>

            {isEditing && (
              <div className={styles.sectionActions}>
                <button
                  className={styles.saveButton}
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving Changes...' : 'Save Changes'}
                </button>
                <button
                  className={styles.cancelButton}
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Dates & Timeline Section */}
          {investment.lockupEndDate && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Dates & Timeline</h2>
              </div>
              <div className={styles.grid}>
                <div>
                  <label>Created At</label>
                  <div className={styles.readOnly}>
                    {formatDateTime(investment.createdAt)}
                  </div>
                </div>
                <div>
                  <label>Submitted At</label>
                  <div className={styles.readOnly}>
                    {formatDateTime(investment.submittedAt)}
                  </div>
                </div>
                <div>
                  <label>Confirmed At</label>
                  <div className={styles.readOnly}>
                    {formatDateTime(investment.confirmedAt)}
                  </div>
                </div>
                <div>
                  <label>Lockup End Date</label>
                  <div className={styles.readOnly}>
                    {formatDateForDisplay(investment.lockupEndDate)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Banking Information Section */}
          {investment.banking && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Banking Information</h2>
              </div>
              <div className={styles.grid}>
                <div>
                  <label>Funding Method</label>
                  <div className={styles.readOnly}>{investment.banking.fundingMethod || '-'}</div>
                </div>
                <div>
                  <label>Earnings Method</label>
                  <div className={styles.readOnly}>{investment.banking.earningsMethod || '-'}</div>
                </div>
                {investment.banking.bank && (
                  <>
                    <div>
                      <label>Bank Nickname</label>
                      <div className={styles.readOnly}>{investment.banking.bank.nickname || '-'}</div>
                    </div>
                    <div>
                      <label>Bank Type</label>
                      <div className={styles.readOnly}>{investment.banking.bank.type?.toUpperCase() || '-'}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Personal Information Section */}
          {investment.personalInfo && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Personal Information</h2>
              </div>
              <div className={styles.grid}>
                <div>
                  <label>First Name</label>
                  <div className={styles.readOnly}>{investment.personalInfo.firstName || '-'}</div>
                </div>
                <div>
                  <label>Last Name</label>
                  <div className={styles.readOnly}>{investment.personalInfo.lastName || '-'}</div>
                </div>
                <div>
                  <label>Date of Birth</label>
                  <div className={styles.readOnly}>{investment.personalInfo.dob || '-'}</div>
                </div>
                <div>
                  <label>SSN</label>
                  <div className={styles.readOnly}>{investment.personalInfo.ssn || '-'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Address Section */}
          {investment.address && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Address</h2>
              </div>
              <div className={styles.grid}>
                <div>
                  <label>Street 1</label>
                  <div className={styles.readOnly}>{investment.address.street1 || '-'}</div>
                </div>
                <div>
                  <label>Street 2</label>
                  <div className={styles.readOnly}>{investment.address.street2 || '-'}</div>
                </div>
                <div>
                  <label>City</label>
                  <div className={styles.readOnly}>{investment.address.city || '-'}</div>
                </div>
                <div>
                  <label>State</label>
                  <div className={styles.readOnly}>{investment.address.state || '-'}</div>
                </div>
                <div>
                  <label>ZIP Code</label>
                  <div className={styles.readOnly}>{investment.address.zip || '-'}</div>
                </div>
                <div>
                  <label>Country</label>
                  <div className={styles.readOnly}>{investment.address.country || '-'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Section */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Activity & Transactions</h2>
              <p className={styles.subtitle}>
                All events and transactions for this investment ({(investment.transactions || []).length} total)
              </p>
            </div>
            
            {(!investment.transactions || investment.transactions.length === 0) ? (
              <div className={styles.emptyActivity}>
                No activity events yet for this investment
              </div>
            ) : (
              <div className={styles.activityTable}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Event ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investment.transactions
                      .sort((a, b) => {
                        // Sort by actual date to maintain chronological order (distribution before contribution)
                        const dateA = a.date ? new Date(a.date).getTime() : 0
                        const dateB = b.date ? new Date(b.date).getTime() : 0
                        return dateB - dateA
                      })
                      .map(event => {
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
                          <tr key={event.id} className={styles.activityRow}>
                            <td>
                              <div className={styles.eventCell}>
                                <span className={styles.eventIcon} style={{ color: meta.color }}>
                                  {meta.icon}
                                </span>
                                <span className={styles.eventTitle}>{meta.title}</span>
                              </div>
                            </td>
                            <td>
                              {event.amount != null ? (
                                <strong className={styles.amount}>
                                  ${event.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </strong>
                              ) : (
                                <span className={styles.naText}>-</span>
                              )}
                            </td>
                            <td className={styles.dateCell}>{date}</td>
                            <td className={styles.eventIdCell}>
                              {(event.type === 'investment' || event.type === 'distribution' || event.type === 'contribution') && event.id ? (
                                <button
                                  className={styles.eventIdButton}
                                  onClick={() => router.push(`/admin/transactions/${event.id}`)}
                                  title="View transaction details"
                                >
                                  <code>{event.id}</code>
                                </button>
                              ) : (
                                <span>{event.id}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Admin Actions Section - Only show for active or withdrawal_notice investments */}
          {(investment.status === 'active' || investment.status === 'withdrawal_notice') && (
            <div className={styles.sectionCard} style={{ borderColor: '#dc2626', borderWidth: '2px' }}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} style={{ color: '#dc2626' }}>⚠️ Admin Actions</h2>
                <p className={styles.subtitle} style={{ color: '#991b1b' }}>
                  Danger Zone - Immediate investment termination
                </p>
              </div>
              
              <div style={{ padding: '20px' }}>
                {/* Current Investment Value */}
                <div style={{ 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px', 
                  padding: '16px',
                  marginBottom: '20px'
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>
                    Current Investment Value
                  </h3>
                  {(() => {
                    const currentValue = calculateInvestmentValue(investment, appTime)
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Principal</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                            ${(investment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Earnings</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#059669' }}>
                            ${currentValue.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Total Value</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#0369a1' }}>
                            ${currentValue.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Lockup Status */}
                <div style={{ marginBottom: '20px' }}>
                  {(() => {
                    const now = new Date(appTime || new Date().toISOString())
                    const lockupEnd = investment.lockupEndDate ? new Date(investment.lockupEndDate) : null
                    const isLockupExpired = !lockupEnd || now >= lockupEnd

                    return isLockupExpired ? (
                      <div style={{ 
                        padding: '12px', 
                        background: '#dcfce7', 
                        border: '1px solid #86efac',
                        borderRadius: '6px',
                        color: '#166534',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}>
                        ✓ Lockup period expired - Can terminate without override
                      </div>
                    ) : (
                      <div style={{ 
                        padding: '12px', 
                        background: '#fef3c7', 
                        border: '1px solid #fbbf24',
                        borderRadius: '6px',
                        color: '#92400e',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}>
                        ⏳ Lockup ends on {formatDateForDisplay(investment.lockupEndDate)} - Override confirmation required
                      </div>
                    )
                  })()}
                </div>

                {/* Terminate Button */}
                <button
                  className={styles.terminateButton}
                  onClick={handleTerminateClick}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#b91c1c'}
                  onMouseLeave={(e) => e.target.style.background = '#dc2626'}
                >
                  Terminate Investment Immediately
                </button>

                <div style={{ 
                  marginTop: '12px', 
                  fontSize: '12px', 
                  color: '#6b7280',
                  lineHeight: '1.5'
                }}>
                  This will immediately process the withdrawal and return all funds (principal + accrued earnings) to the investor. 
                  This action bypasses the standard 90-day notice period and cannot be undone.
                </div>
              </div>
            </div>
          )}

          {/* Termination Confirmation Modal */}
          {showTerminateModal && (
            <div className={styles.modalOverlay} onClick={handleTerminateCancel}>
              <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalContent}>
                  <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>
                    Confirm Investment Termination
                  </h2>

                  {/* Investment Summary */}
                  <div style={{ 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px', 
                    padding: '16px',
                    marginBottom: '20px'
                  }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>
                      Investment #{investment.id}
                    </h3>
                    {(() => {
                      const currentValue = calculateInvestmentValue(investment, appTime)
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Investor:</span>
                            <span style={{ fontWeight: '600' }}>{user.firstName} {user.lastName}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Principal:</span>
                            <span style={{ fontWeight: '600' }}>
                              ${(investment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Earnings:</span>
                            <span style={{ fontWeight: '600', color: '#059669' }}>
                              ${currentValue.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            paddingTop: '8px',
                            marginTop: '8px',
                            borderTop: '1px solid #e2e8f0'
                          }}>
                            <span style={{ fontWeight: '600', color: '#64748b' }}>Total Payout:</span>
                            <span style={{ fontSize: '18px', fontWeight: '700', color: '#0369a1' }}>
                              ${currentValue.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Lockup Override Warning */}
                  {(() => {
                    const now = new Date(appTime || new Date().toISOString())
                    const lockupEnd = investment.lockupEndDate ? new Date(investment.lockupEndDate) : null
                    const needsOverride = lockupEnd && now < lockupEnd

                    return needsOverride ? (
                      <div className={styles.warningBox} style={{
                        background: '#fef3c7',
                        border: '2px solid #f59e0b',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '20px'
                      }}>
                        <div style={{ 
                          fontSize: '16px', 
                          fontWeight: '700', 
                          color: '#92400e',
                          marginBottom: '12px'
                        }}>
                          ⚠️ Lockup Period Override Required
                        </div>
                        <p style={{ fontSize: '14px', color: '#92400e', marginBottom: '12px' }}>
                          This investment is still in its lockup period, which ends on{' '}
                          <strong>
                            {formatDateForDisplay(investment.lockupEndDate)}
                          </strong>
                          . Terminating now will override the lockup agreement.
                        </p>
                        <label style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#92400e'
                        }}>
                          <input
                            type="checkbox"
                            checked={overrideLockupConfirmed}
                            onChange={(e) => setOverrideLockupConfirmed(e.target.checked)}
                            className={styles.confirmCheckbox}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          I understand I am overriding the lockup period
                        </label>
                      </div>
                    ) : null
                  })()}

                  {/* Final Confirmation */}
                  <div style={{
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                    fontSize: '14px',
                    color: '#991b1b',
                    lineHeight: '1.6'
                  }}>
                    <strong>This action is immediate and cannot be undone.</strong> The investment will be terminated, 
                    all funds will be marked for payout, and the investor will receive their principal plus all accrued earnings.
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleTerminateCancel}
                      disabled={isTerminating}
                      style={{
                        padding: '10px 20px',
                        background: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: isTerminating ? 'not-allowed' : 'pointer',
                        opacity: isTerminating ? 0.5 : 1
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleTerminateConfirm}
                      disabled={isTerminating}
                      style={{
                        padding: '10px 20px',
                        background: isTerminating ? '#9ca3af' : '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: isTerminating ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isTerminating ? 'Processing...' : 'Confirm Termination'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Get event metadata (icon, title, color)
function getEventMeta(eventType) {
  switch (eventType) {
    case 'investment':
      return { icon: '✅', title: 'Investment Confirmed', color: '#16a34a' }
    case 'distribution':
      return { icon: '💸', title: 'Distribution', color: '#5b21b6' }
    case 'monthly_distribution':
      return { icon: '💸', title: 'Monthly Payout', color: '#5b21b6' }
    case 'contribution':
      return { icon: '📈', title: 'Contribution', color: '#5b21b6' }
    case 'monthly_compounded':
      return { icon: '📈', title: 'Monthly Compounded', color: '#5b21b6' }
    case 'redemption':
      return { icon: '🏦', title: 'Redemption', color: '#ca8a04' }
    default:
      return { icon: '•', title: eventType || 'Unknown Event', color: '#6b7280' }
  }
}

