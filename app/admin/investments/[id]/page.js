'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import { fetchWithCsrf } from '../../../../lib/csrfClient'
import logger from '../../../../lib/logger'
import AdminHeader from '../../../components/AdminHeader'
import InvestmentAdminHeader from '../../components/InvestmentAdminHeader'
import { calculateInvestmentValue, formatCurrency, formatDate } from '../../../../lib/investmentCalculations.js'
import { formatDateForDisplay, formatDateTime } from '../../../../lib/dateUtils.js'
import { useUser } from '@/app/contexts/UserContext'
import styles from './page.module.css'

function AdminInvestmentDetailsContent() {
  const router = useRouter()
  const params = useParams()
  const investmentId = params?.id
  const { userData, loading: userLoading } = useUser()
  const initializedRef = useRef(false)
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
  const [isDownloadingAgreement, setIsDownloadingAgreement] = useState(false)
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
    if (userLoading) return
    if (!userData || !userData.isAdmin) {
      logger.warn('[AdminInvestmentDetails] Not an admin, redirecting to dashboard', { userData, userLoading })
      router.push('/dashboard')
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true
    
    const init = async () => {
      try {
        logger.info('[AdminInvestmentDetails] Starting initialization, investmentId:', investmentId)
        
        setCurrentUser(userData)

        // Load users and investments separately (they come from different endpoints)
        const [usersData, investmentsData] = await Promise.all([
          apiClient.getAllUsers(),
          apiClient.getAdminInvestments()
        ])
        
        if (!usersData || !usersData.success) {
          logger.error('[AdminInvestmentDetails] Failed to load users data')
          alert('Failed to load users data')
          return
        }

        if (!investmentsData || !investmentsData.success) {
          logger.error('[AdminInvestmentDetails] Failed to load investments data')
          alert('Failed to load investments data')
          return
        }

        logger.debug('[AdminInvestmentDetails] Loaded data:', { usersCount: usersData.users?.length, investmentsCount: investmentsData.investments?.length })


        // Build investments by user map
        const investmentsByUser = {}
        const investmentsList = investmentsData.investments || []
        investmentsList.forEach(inv => {
          const userId = inv.userId.toString()
          if (!investmentsByUser[userId]) {
            investmentsByUser[userId] = []
          }
          investmentsByUser[userId].push(inv)
        })

        // Debug: Log all investment IDs
        const allInvestmentIds = investmentsList.map(inv => ({
          invId: inv.id,
          userId: inv.userId,
          invIdType: typeof inv.id
        }))
        logger.debug('[AdminInvestmentDetails] All investment IDs in system:', allInvestmentIds)

        // Find the investment directly from the investments list
        let foundInvestment = investmentsList.find(inv => {
          // Handle both string and number comparisons, and different ID formats
          const invId = String(inv.id)
          const searchId = String(investmentId)
          
          // Try exact match
          if (invId === searchId) return true
          
          // Try with INV- prefix
          if (invId === `INV-${searchId}`) return true
          if (`INV-${invId}` === searchId) return true
          
          // Try removing INV- prefix
          if (invId.replace('INV-', '') === searchId) return true
          if (searchId.replace('INV-', '') === invId) return true
          
          return false
        })

        if (!foundInvestment) {
          logger.error('[AdminInvestmentDetails] Investment not found!', { investmentId, available: allInvestmentIds })
          alert(`Investment not found. Looking for ID: ${investmentId}`)
          router.push('/admin?tab=transactions')
          return
        }

        logger.info('[AdminInvestmentDetails] ✓ Found investment:', foundInvestment.id)


        // Find the user who owns this investment
        // The investment might have userId as a string or number, or might not have it at all
        let foundUser = null
        
        if (foundInvestment.userId) {
          // Handle ID format differences (e.g., "1002" vs "USR-1002")
          foundUser = usersData.users.find(u => {
            const userId = u.id.toString()
            const investmentUserId = foundInvestment.userId.toString()
            
            // Try exact match
            if (userId === investmentUserId) return true
            
            // Try with USR- prefix
            if (userId === `USR-${investmentUserId}`) return true
            if (`USR-${userId}` === investmentUserId) return true
            
            // Try removing USR- prefix
            if (userId.replace('USR-', '') === investmentUserId) return true
            if (investmentUserId.replace('USR-', '') === userId) return true
            
            // Try numeric comparison (extract just the numbers)
            const userIdNum = userId.replace(/\D/g, '')
            const invUserIdNum = investmentUserId.replace(/\D/g, '')
            if (userIdNum === invUserIdNum) return true
            
            return false
          })
          
          if (foundUser) {
            logger.debug('[AdminInvestmentDetails] Found user via direct userId match')
          }
        }
        
        // If userId doesn't work, try to find by looking through investments attached to users
        if (!foundUser && investmentsByUser) {
          for (const [userId, investments] of Object.entries(investmentsByUser)) {
            if (investments.some(inv => inv.id.toString() === foundInvestment.id.toString())) {
              foundUser = usersData.users.find(u => {
                const uId = u.id.toString()
                const searchId = userId.toString()
                return uId === searchId || 
                       uId.replace(/\D/g, '') === searchId.replace(/\D/g, '')
              })
              if (foundUser) {
                logger.debug('[AdminInvestmentDetails] Found user via investmentsByUser mapping')
                break
              }
            }
          }
        }
        
        if (!foundUser) {
          logger.error('[AdminInvestmentDetails] User not found for investment!', { investmentUserId: foundInvestment.userId })
          alert('User not found for this investment')
          router.push('/admin?tab=transactions')
          return
        }

        logger.info('[AdminInvestmentDetails] ✓ Found user:', { id: foundUser.id, email: foundUser.email })

        // Fetch activity events for this investment
        try {
          const numericInvestmentId = foundInvestment.id.toString().replace(/\D/g, '')
          const activityData = await apiClient.getAdminActivityEvents({ 
            investment_id: parseInt(numericInvestmentId, 10),
            size: 100 
          })
          
          if (activityData && activityData.success) {
            const events = activityData.items || activityData.events || []
            logger.debug('[AdminInvestmentDetails] Fetched activity events:', events.length)
            
            // Map activity events to transactions format expected by UI
            // Available fields from API: id, transaction_type, amount, transaction_date, 
            // status (pending/submitted/approved/rejected/received), description, human_id, created_at
            foundInvestment.transactions = events.map(event => {
              // Extract amount from nested structures (transaction or eventMetadata)
              let amount = event.amount
              if (amount === undefined || amount === null) {
                amount = event.transaction?.amount ?? event.eventMetadata?.amount ?? null
              }
              // Convert string amounts to numbers for proper formatting
              if (typeof amount === 'string') {
                amount = parseFloat(amount)
              }
              
              // Extract status (check event level and nested transaction)
              // TransactionStatus: pending, submitted, approved, rejected, received
              const status = event.status || event.transaction?.status || null
              
              // Extract human-readable transaction ID (available in API)
              const humanId = event.transaction?.human_id 
                || event.transaction?.humanId 
                || event.eventMetadata?.human_id 
                || event.eventMetadata?.humanId 
                || null
              
              // Extract description (available in API)
              const description = event.transaction?.description 
                || event.description 
                || event.eventMetadata?.description 
                || null
              
              return {
                id: event.id,
                type: event.activity_type || event.type || event.activityType,
                amount: amount,
                date: event.created_at || event.createdAt || event.date,
                displayDate: event.display_date || event.displayDate || event.transaction?.transaction_date,
                status: status,
                humanId: humanId,
                description: description
              }
            })
          } else {
            logger.warn('[AdminInvestmentDetails] Failed to fetch activity events')
            foundInvestment.transactions = []
          }
        } catch (activityError) {
          logger.error('[AdminInvestmentDetails] Error fetching activity events:', activityError)
          foundInvestment.transactions = []
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

        if (usersData.timeOffset !== undefined && usersData.timeOffset !== null) {
          const realTime = new Date()
          const currentAppTime = new Date(realTime.getTime() + usersData.timeOffset).toISOString()
          setAppTime(currentAppTime)
        }
      } catch (e) {
        logger.error('Failed to load investment', e)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [router, investmentId, userData, userLoading])

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

    // SDIRA accounts cannot use monthly payment frequency
    if (form.accountType === 'ira' && form.paymentFrequency === 'monthly') {
      return 'SDIRA accounts can only use compounding payment frequency'
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
      logger.error('Failed to save', e)
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
      logger.error('Failed to terminate investment', e)
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

  const handleViewAgreement = async () => {
    setIsDownloadingAgreement(true)
    try {
      // Use admin endpoint to fetch agreement for any investment
      // Ensure tokens are loaded for authentication
      apiClient.ensureTokensLoaded()
      const headers = {
        'Accept': 'application/json, application/pdf;q=0.9,*/*;q=0.8'
      }
      if (apiClient.accessToken) {
        headers['Authorization'] = `Bearer ${apiClient.accessToken}`
      }
      
      // Extract numeric IDs (strip prefixes like "USR-" or "INV-")
      const numericUserId = user.id.toString().replace(/\D/g, '')
      const numericInvestmentId = investment.id.toString().replace(/\D/g, '')
      
      const response = await fetch(`/api/admin/users/${numericUserId}/view/investments/${numericInvestmentId}/agreement`, {
        method: 'GET',
        headers,
        credentials: 'include'
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || errorData.detail || errorData.message
        if (response.status === 404) {
          throw new Error('Agreement endpoint not available. The backend may need to implement /api/admin/investments/{id}/agreement')
        }
        throw new Error(errorMessage || `Failed to load agreement (${response.status})`)
      }
      
      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        // JSON response with signed_url or pdf_base64
        const data = await response.json()
        const signed_url = data.signed_url || data.signedUrl || data.url
        const pdf_base64 = data.pdf_base64 || data.pdfBase64 || data.pdf
        
        if (signed_url) {
          window.open(signed_url, '_blank')
        } else if (pdf_base64) {
          const byteCharacters = atob(pdf_base64)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const byteArray = new Uint8Array(byteNumbers)
          const blob = new Blob([byteArray], { type: 'application/pdf' })
          const url = window.URL.createObjectURL(blob)
          window.open(url, '_blank')
        } else {
          throw new Error('No document available')
        }
      } else {
        // Direct PDF binary response
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        window.open(url, '_blank')
      }
    } catch (error) {
      logger.error('Failed to load agreement', error)
      alert(error.message || 'Failed to load agreement')
    } finally {
      setIsDownloadingAgreement(false)
    }
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className={styles.viewAgreementButton} 
                    onClick={handleViewAgreement}
                    disabled={isDownloadingAgreement || investment.status === 'draft'}
                  >
                    {isDownloadingAgreement ? 'Loading...' : 'View Agreement'}
                  </button>
                  {!isEditing && (
                    <button className={styles.editButton} onClick={handleEdit}>
                      Edit Investment
                    </button>
                  )}
                </div>
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
                    ⚠️ SDIRA accounts can only use compounding
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
                  <option value="ira">SDIRA</option>
                </select>
                {isEditing && user?.accountType && form.accountType !== user.accountType && (
                  <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                    ⚠️ User&apos;s account type is {user.accountType}
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
                      <th>Status</th>
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
                        
                        // Get status configuration
                        // TransactionStatus: pending, submitted, approved, rejected, received
                        const statusConfig = getStatusConfig(event.status)
                        
                        return (
                          <tr key={event.id} className={styles.activityRow}>
                            <td>
                              <div className={styles.eventCell}>
                                <span className={styles.eventIcon} style={{ color: meta.color }}>
                                  {meta.icon}
                                </span>
                                <div className={styles.eventDetails}>
                                  <span className={styles.eventTitle}>{meta.title}</span>
                                  {event.humanId && (
                                    <span className={styles.eventHumanId}>#{event.humanId}</span>
                                  )}
                                </div>
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
                            <td>
                              {statusConfig ? (
                                <span className={styles.statusBadge} style={{
                                  backgroundColor: statusConfig.bg,
                                  color: statusConfig.color,
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: '500'
                                }}>
                                  {statusConfig.icon} {statusConfig.label}
                                </span>
                              ) : (
                                <span className={styles.naText}>-</span>
                              )}
                            </td>
                            <td className={styles.dateCell}>{date}</td>
                            <td className={styles.eventIdCell}>
                              <code>{event.id}</code>
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
    case 'investment_created':
      return { icon: '📝', title: 'Investment Created', color: '#6b7280' }
    case 'investment_confirmed':
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

// Transaction status configuration
// API TransactionStatus: pending, submitted, approved, rejected, received
const STATUS_CONFIG = {
  // Transaction states from API
  pending: { label: 'Pending', bg: '#fef3c7', color: '#92400e', icon: '⏳' },
  submitted: { label: 'Submitted', bg: '#dbeafe', color: '#1e40af', icon: '📤' },
  approved: { label: 'Approved', bg: '#dcfce7', color: '#166534', icon: '✓' },
  rejected: { label: 'Rejected', bg: '#fee2e2', color: '#991b1b', icon: '✕' },
  received: { label: 'Received', bg: '#dcfce7', color: '#166534', icon: '✅' },
  // Legacy/alias states for backwards compatibility
  completed: { label: 'Completed', bg: '#dcfce7', color: '#166534', icon: '✅' },
  failed: { label: 'Failed', bg: '#fee2e2', color: '#991b1b', icon: '❌' },
  active: { label: 'Active', bg: '#dcfce7', color: '#166534', icon: '✓' },
  draft: { label: 'Draft', bg: '#f3f4f6', color: '#374151', icon: '📝' }
}

// Get status configuration with fallback
function getStatusConfig(status) {
  if (!status) return null
  const normalizedStatus = status.toString().toLowerCase()
  return STATUS_CONFIG[normalizedStatus] || { 
    label: status, 
    bg: '#f3f4f6', 
    color: '#374151', 
    icon: '•' 
  }
}

export default function AdminInvestmentDetailsPage() {
  return (
    <Suspense fallback={
      <div className={styles.main}>
        <AdminHeader activeTab="transactions" />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.loadingState}>Loading investment details...</div>
          </div>
        </div>
      </div>
    }>
      <AdminInvestmentDetailsContent />
    </Suspense>
  )
}

