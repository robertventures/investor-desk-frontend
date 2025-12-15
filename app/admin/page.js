'use client'
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import AdminHeader from '../components/AdminHeader'
import { useAdminData } from './hooks/useAdminData'
import { useAdminMetrics } from './hooks/useAdminMetrics'
import { adminService } from '../../lib/services/admin'
import DashboardTab from './components/DashboardTab'
import OperationsTab from './components/OperationsTab'
import ActivityTab from './components/ActivityTab'
import DistributionsTab from './components/DistributionsTab'
import { calculateInvestmentValue } from '../../lib/investmentCalculations.js'
import { formatDateForDisplay } from '../../lib/dateUtils.js'
import { formatCurrency } from '../../lib/formatters.js'
import styles from './page.module.css'

/**
 * Main Admin Dashboard - Refactored for better organization
 */
function AdminPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Tab management
  const initialTab = useMemo(() => {
    const t = searchParams?.get('tab') || 'dashboard'
    const allowed = ['dashboard', 'accounts', 'distributions', 'activity', 'operations']
    return allowed.includes(t) ? t : 'dashboard'
  }, [searchParams])
  const [activeTab, setActiveTab] = useState(initialTab)
  
  // Sub-tab management for Accounts panel
  const initialAccountsSubTab = useMemo(() => {
    const subTab = searchParams?.get('accountsView') || 'all'
    return subTab === 'incomplete' ? 'incomplete' : 'all'
  }, [searchParams])
  const [accountsSubTab, setAccountsSubTab] = useState(initialAccountsSubTab)

  // Data management with custom hook
  const {
    currentUser,
    users,
    isLoading,
    withdrawals,
    isLoadingWithdrawals,
    pendingPayouts,
    isLoadingPayouts,
    processingPayoutId,
    activityEvents,
    isLoadingActivity,
    allTransactions,
    isLoadingTransactions,
    monitoredPayouts,
    timeMachineData,
    setTimeMachineData,
    // Payment methods / ACH status
    paymentMethodsByUser,
    isLoadingPaymentMethods,
    disconnectedBankUsers,
    loadPaymentMethods,
    // Refresh functions
    refreshUsers,
    refreshWithdrawals,
    refreshPayouts,
    refreshActivity,
    refreshTransactions,
    processAchqPayment
  } = useAdminData()

  // Metrics calculation with custom hook
  const metrics = useAdminMetrics(users, withdrawals, pendingPayouts, timeMachineData?.appTime)

  // State for specific tab operations
  const [savingId, setSavingId] = useState(null)
  const [isDeletingAccounts, setIsDeletingAccounts] = useState(false)
  const [isSeedingAccounts, setIsSeedingAccounts] = useState(false)
  
  // Initialize account filters from URL search params for persistence across navigation
  const initialAccountsSearch = useMemo(() => searchParams?.get('search') || '', [searchParams])
  const initialAccountFilters = useMemo(() => ({
    hasInvestments: searchParams?.get('hasInvestments') || 'all',
    investmentAmountMin: searchParams?.get('investmentAmountMin') || '',
    investmentAmountMax: searchParams?.get('investmentAmountMax') || '',
    investmentValueMin: searchParams?.get('investmentValueMin') || '',
    investmentValueMax: searchParams?.get('investmentValueMax') || '',
    createdDateStart: searchParams?.get('createdDateStart') || '',
    createdDateEnd: searchParams?.get('createdDateEnd') || '',
    numInvestmentsMin: searchParams?.get('numInvestmentsMin') || '',
    numInvestmentsMax: searchParams?.get('numInvestmentsMax') || '',
    isVerified: searchParams?.get('isVerified') || 'all',
    bankConnected: searchParams?.get('bankConnected') || 'all',
    investmentType: searchParams?.get('investmentType') || 'all'
  }), [searchParams])
  const initialAccountsPage = useMemo(() => Number(searchParams?.get('page')) || 1, [searchParams])
  
  // State for account filters
  const [showFilters, setShowFilters] = useState(false)
  const [accountsSearch, setAccountsSearch] = useState(initialAccountsSearch)
  const [accountFilters, setAccountFilters] = useState(initialAccountFilters)
  
  // Onboarding link generation state
  const [generatingLinkUserId, setGeneratingLinkUserId] = useState(null)
  const [generatedLinks, setGeneratedLinks] = useState({})
  const [copiedLinkId, setCopiedLinkId] = useState(null)
  
  // PERFORMANCE: Pagination for accounts view
  const [accountsPage, setAccountsPage] = useState(initialAccountsPage)
  const accountsPerPage = 20

  // Keep tab in sync with URL
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  // Sync account filters to URL when they change (for persistence across navigation)
  useEffect(() => {
    if (activeTab !== 'accounts') return
    
    const params = new URLSearchParams()
    params.set('tab', 'accounts')
    if (accountsSubTab === 'incomplete') {
      params.set('accountsView', 'incomplete')
    }
    
    // Only include non-default values to keep URL clean
    if (accountsSearch) params.set('search', accountsSearch)
    if (accountFilters.hasInvestments !== 'all') params.set('hasInvestments', accountFilters.hasInvestments)
    if (accountFilters.investmentAmountMin) params.set('investmentAmountMin', accountFilters.investmentAmountMin)
    if (accountFilters.investmentAmountMax) params.set('investmentAmountMax', accountFilters.investmentAmountMax)
    if (accountFilters.investmentValueMin) params.set('investmentValueMin', accountFilters.investmentValueMin)
    if (accountFilters.investmentValueMax) params.set('investmentValueMax', accountFilters.investmentValueMax)
    if (accountFilters.createdDateStart) params.set('createdDateStart', accountFilters.createdDateStart)
    if (accountFilters.createdDateEnd) params.set('createdDateEnd', accountFilters.createdDateEnd)
    if (accountFilters.numInvestmentsMin) params.set('numInvestmentsMin', accountFilters.numInvestmentsMin)
    if (accountFilters.numInvestmentsMax) params.set('numInvestmentsMax', accountFilters.numInvestmentsMax)
    if (accountFilters.isVerified !== 'all') params.set('isVerified', accountFilters.isVerified)
    if (accountFilters.bankConnected !== 'all') params.set('bankConnected', accountFilters.bankConnected)
    if (accountFilters.investmentType !== 'all') params.set('investmentType', accountFilters.investmentType)
    if (accountsPage > 1) params.set('page', String(accountsPage))
    
    // Use replace to avoid polluting browser history with every filter change
    router.replace(`/admin?${params.toString()}`, { scroll: false })
  }, [activeTab, accountsSearch, accountFilters, accountsPage, router])

  // Restore account filters from URL when searchParams change (handles browser back/forward)
  useEffect(() => {
    if (activeTab !== 'accounts') return
    
    // Get values from URL
    const urlSearch = searchParams?.get('search') || ''
    const urlPage = Number(searchParams?.get('page')) || 1
    const urlAccountsView = searchParams?.get('accountsView') || 'all'
    if (urlAccountsView === 'incomplete' && accountsSubTab !== 'incomplete') {
      setAccountsSubTab('incomplete')
    } else if (urlAccountsView !== 'incomplete' && accountsSubTab === 'incomplete') {
      setAccountsSubTab('all')
    }
    const urlFilters = {
      hasInvestments: searchParams?.get('hasInvestments') || 'all',
      investmentAmountMin: searchParams?.get('investmentAmountMin') || '',
      investmentAmountMax: searchParams?.get('investmentAmountMax') || '',
      investmentValueMin: searchParams?.get('investmentValueMin') || '',
      investmentValueMax: searchParams?.get('investmentValueMax') || '',
      createdDateStart: searchParams?.get('createdDateStart') || '',
      createdDateEnd: searchParams?.get('createdDateEnd') || '',
      numInvestmentsMin: searchParams?.get('numInvestmentsMin') || '',
      numInvestmentsMax: searchParams?.get('numInvestmentsMax') || '',
      isVerified: searchParams?.get('isVerified') || 'all',
      bankConnected: searchParams?.get('bankConnected') || 'all',
      investmentType: searchParams?.get('investmentType') || 'all'
    }
    
    // Only update state if URL values differ from current state (avoid infinite loops)
    if (urlSearch !== accountsSearch) {
      setAccountsSearch(urlSearch)
    }
    if (urlPage !== accountsPage) {
      setAccountsPage(urlPage)
    }
    // Compare filters object
    const filtersChanged = Object.keys(urlFilters).some(
      key => urlFilters[key] !== accountFilters[key]
    )
    if (filtersChanged) {
      setAccountFilters(urlFilters)
    }
  }, [searchParams, activeTab]) // Note: intentionally not including state in deps to avoid loops

  // Load payment methods when users are loaded (for ACH status tracking)
  useEffect(() => {
    if (users && users.length > 0 && !isLoading) {
      loadPaymentMethods(users)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, isLoading])

  // Filter functions
  const nonAdminUsers = useMemo(() => 
    (users || []).filter(u => !u.isAdmin), 
    [users]
  )

  // Get all investments with user info
  const allInvestments = useMemo(() => {
    const investments = []
    nonAdminUsers.forEach(user => {
      if (user.investments && user.investments.length > 0) {
        user.investments.forEach(inv => {
          investments.push({
            ...inv,
            user: {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone || user.phoneNumber,
              phoneNumber: user.phoneNumber,
              dob: user.dob,
              ssn: user.ssn,
              address: user.address,
              bankAccounts: user.bankAccounts,
              accountType: user.accountType,
              isVerified: user.isVerified,
              jointHolder: user.jointHolder
            }
          })
        })
      }
    })
    investments.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })
    return investments
  }, [nonAdminUsers])

  // Get pending investments for dashboard
  const pendingInvestments = useMemo(() => {
    return allInvestments.filter(inv => inv.status === 'pending')
  }, [allInvestments])

  const sortedAccountUsers = useMemo(() => {
    return [...nonAdminUsers].sort((a, b) => {
      const createdA = a.displayCreatedAt || a.createdAt || a.created_at
      const createdB = b.displayCreatedAt || b.createdAt || b.created_at
      const dateA = createdA ? new Date(createdA).getTime() : 0
      const dateB = createdB ? new Date(createdB).getTime() : 0
      return dateB - dateA
    })
  }, [nonAdminUsers])

  const filteredAccountUsers = useMemo(() => {
    // Reset to page 1 when filters change
    setAccountsPage(1)
    
    let filtered = sortedAccountUsers
    
    // Apply sub-tab-based filtering (verified vs incomplete accounts)
    if (activeTab === 'accounts') {
      if (accountsSubTab === 'incomplete') {
        // Show unverified users with NO investments
        filtered = filtered.filter(user => {
          const hasInvestments = user.investments && user.investments.length > 0
          return user.isVerified === false && !hasInvestments
        })
      } else {
        // Show verified users OR users with investments
        filtered = filtered.filter(user => {
          const hasInvestments = user.investments && user.investments.length > 0
          return user.isVerified === true || hasInvestments
        })
      }
    }
    
    // Apply search filter
    if (accountsSearch.trim()) {
      const term = accountsSearch.toLowerCase()
      filtered = filtered.filter(user => {
        const accountId = (user.id || '').toString().toLowerCase()
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase()
        const email = (user.email || '').toLowerCase()
        const jointEmail = (user.jointHolder?.email || '').toLowerCase()
        const jointName = `${user.jointHolder?.firstName || ''} ${user.jointHolder?.lastName || ''}`.toLowerCase()
        return accountId.includes(term) || fullName.includes(term) || 
               email.includes(term) || jointEmail.includes(term) || 
               jointName.includes(term)
      })
    }
    
    // Apply account filters
    filtered = filtered.filter(user => {
      const activeInvestments = (user.investments || []).filter(inv => 
        inv.status === 'active' || inv.status === 'withdrawal_notice'
      )
      const numInvestments = activeInvestments.length
      const investedAmount = activeInvestments.reduce((sum, inv) => sum + (inv.amount || 0), 0)
      const accountValue = activeInvestments.reduce((sum, inv) => {
        const calculation = calculateInvestmentValue(inv, timeMachineData.appTime)
        return sum + calculation.currentValue
      }, 0)
      
      // Filter by has investments
      if (accountFilters.hasInvestments === 'with' && numInvestments === 0) return false
      if (accountFilters.hasInvestments === 'without' && numInvestments > 0) return false
      
      // Filter by investment amount (original principal)
      if (accountFilters.investmentAmountMin && investedAmount < Number(accountFilters.investmentAmountMin)) return false
      if (accountFilters.investmentAmountMax && investedAmount > Number(accountFilters.investmentAmountMax)) return false
      
      // Filter by account value (current value with compound interest)
      if (accountFilters.investmentValueMin && accountValue < Number(accountFilters.investmentValueMin)) return false
      if (accountFilters.investmentValueMax && accountValue > Number(accountFilters.investmentValueMax)) return false
      
      // Filter by number of investments
      if (accountFilters.numInvestmentsMin && numInvestments < Number(accountFilters.numInvestmentsMin)) return false
      if (accountFilters.numInvestmentsMax && numInvestments > Number(accountFilters.numInvestmentsMax)) return false
      
      // Filter by verification status
      if (accountFilters.isVerified === 'yes' && !user.isVerified) return false
      if (accountFilters.isVerified === 'no' && user.isVerified) return false

      // Filter by bank connected status
      // Check both onboardingStatus flag and bankAccounts array since manual entry may not update the flag
      const isBankConnected = user.onboardingStatus?.bankConnected || 
        (Array.isArray(user.bankAccounts) && user.bankAccounts.length > 0)
      if (accountFilters.bankConnected === 'yes' && !isBankConnected) return false
      if (accountFilters.bankConnected === 'no' && isBankConnected) return false

      // Filter by investment type (paymentFrequency)
      if (accountFilters.investmentType !== 'all') {
        const hasCompounding = activeInvestments.some(inv => inv.paymentFrequency === 'compounding')
        const hasMonthly = activeInvestments.some(inv => inv.paymentFrequency === 'monthly')
        
        if (accountFilters.investmentType === 'compounding' && (!hasCompounding || hasMonthly)) return false
        if (accountFilters.investmentType === 'monthly' && (!hasMonthly || hasCompounding)) return false
        if (accountFilters.investmentType === 'both' && (!hasCompounding || !hasMonthly)) return false
      }
      
      // Filter by created date (prefer displayCreatedAt, fallback to createdAt)
      const createdRaw = user.displayCreatedAt || user.createdAt || user.created_at
      if (accountFilters.createdDateStart && createdRaw) {
        const userDate = new Date(createdRaw).setHours(0,0,0,0)
        const filterDate = new Date(accountFilters.createdDateStart).setHours(0,0,0,0)
        if (userDate < filterDate) return false
      }
      if (accountFilters.createdDateEnd && createdRaw) {
        const userDate = new Date(createdRaw).setHours(0,0,0,0)
        const filterDate = new Date(accountFilters.createdDateEnd).setHours(0,0,0,0)
        if (userDate > filterDate) return false
      }
      
      return true
    })
    
    return filtered
  }, [sortedAccountUsers, activeTab, accountsSubTab, accountsSearch, accountFilters, timeMachineData.appTime])

  // PERFORMANCE: Paginate accounts for better rendering performance
  const paginatedAccountUsers = useMemo(() => {
    const startIdx = (accountsPage - 1) * accountsPerPage
    const endIdx = startIdx + accountsPerPage
    return filteredAccountUsers.slice(startIdx, endIdx)
  }, [filteredAccountUsers, accountsPage, accountsPerPage])
  
  const totalAccountPages = Math.ceil(filteredAccountUsers.length / accountsPerPage)

  // Helper function to check if user profile is complete for investment approval
  const isProfileComplete = (user) => {
    if (!user) return false
    
    // Check personal details
    const hasPersonalDetails = user.firstName && 
                               user.lastName && 
                               (user.phone || user.phoneNumber) &&
                               user.dob &&
                               user.ssn
    
    // Check address
    const hasAddress = user.address && 
                      user.address.street1 && 
                      user.address.city && 
                      user.address.state && 
                      user.address.zip
    
    // Note: Bank connection check removed since users can't add bank accounts
    // through the regular signup flow - only needed during investment finalization
    
    return hasPersonalDetails && hasAddress
  }

  // Onboarding link handlers
  const handleGenerateLink = async (e, userId) => {
    e.stopPropagation()
    if (generatingLinkUserId) return
    
    setGeneratingLinkUserId(userId)
    try {
      const result = await adminService.resetUserOnboarding(userId)
      
      if (result.success && result.token) {
        const link = `${window.location.origin}/onboarding?token=${result.token}`
        // Automatically copy to clipboard
        navigator.clipboard.writeText(link).catch(err => console.error('Auto-copy failed:', err))
        
        setGeneratedLinks(prev => ({
          ...prev,
          [userId]: link
        }))
      } else {
        alert('Failed to generate link: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to generate link', error)
      alert('An error occurred while generating the link')
    } finally {
      setGeneratingLinkUserId(null)
    }
  }

  const copyLink = (e, link, userId) => {
    e.stopPropagation()
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLinkId(userId)
      setTimeout(() => setCopiedLinkId(null), 2000)
    }).catch(err => {
      console.error('Failed to copy link', err)
    })
  }

  // Investment operations
  const approveInvestment = async (userId, investmentId) => {
    try {
      setSavingId(investmentId)
      const data = await apiClient.approveInvestment(investmentId)
      if (!data.success) {
        alert(data.error || 'Failed to confirm investment')
        return
      }
      await refreshUsers(true)  // Force refresh to bypass cache
    } catch (e) {
      console.error('Confirm failed', e)
      alert('An error occurred. Please try again.')
    } finally {
      setSavingId(null)
    }
  }

  const rejectInvestment = async (userId, investmentId) => {
    try {
      setSavingId(investmentId)
      const data = await apiClient.rejectInvestment(investmentId)
      if (!data.success) {
        alert(data.error || 'Failed to reject investment')
        return
      }
      await refreshUsers(true)  // Force refresh to bypass cache
    } catch (e) {
      console.error('Reject failed', e)
      alert('An error occurred. Please try again.')
    } finally {
      setSavingId(null)
    }
  }

  // Withdrawal operations
  // Returns true on success, false on failure (for callers that need to know)
  const actOnWithdrawal = async (action, userId, withdrawalId) => {
    try {
      let result
      
      if (action === 'complete' || action === 'approve') {
        result = await apiClient.approveWithdrawal(withdrawalId)
      } else if (action === 'reject') {
        result = await apiClient.rejectWithdrawal(withdrawalId)
      } else {
        alert(`Unknown action: ${action}`)
        return false
      }
      
      if (!result.success) {
        alert(result.error || 'Failed to update withdrawal')
        return false
      }
      
      await refreshWithdrawals(true)  // Force refresh to bypass cache
      await refreshUsers(true)  // Force refresh to bypass cache
      
      const actionLabel = action === 'reject' ? 'rejected' : 'completed'
      alert(`Withdrawal ${actionLabel} successfully`)
      return true
    } catch (e) {
      console.error('Failed to update withdrawal', e)
      alert('An error occurred while updating the withdrawal')
      return false
    }
  }

  // Payout operations
  const handlePayoutAction = async (action, userId, transactionId, failureReason = null) => {
    try {
      const res = await fetch('/api/admin/pending-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId, transactionId, failureReason }),
        credentials: 'include'
      })
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
      if (!data.success) {
        alert(data.error || 'Failed to process payout action')
        return
      }
      
      // Show success message
      alert(data.message || 'Payout updated successfully')
      
      // CRITICAL FIX: Refresh both payouts and users data to ensure UI is in sync
      console.log('Refreshing data after payout action...')
      try {
        await Promise.all([
          refreshPayouts(true),  // Force refresh to bypass cache
          refreshUsers(true)     // Force refresh to bypass cache
        ])
        console.log('Data refresh completed successfully')
      } catch (refreshErr) {
        console.error('Failed to refresh data:', refreshErr)
        alert('Payout updated but failed to refresh data. Please reload the page manually.')
      }
    } catch (e) {
      console.error('Failed to process payout action:', e)
      alert(`An error occurred: ${e.message}`)
    }
  }

  // Time machine operations
  const updateAppTime = async (newAppTime) => {
    if (!currentUser || !currentUser.id) {
      alert('Current user not loaded. Please refresh the page.')
      return
    }
    
    try {
      const appTimeISO = new Date(newAppTime).toISOString()
      console.log('[Admin] Setting app time to:', appTimeISO)
      
      const data = await apiClient.setAppTime(appTimeISO)
      console.log('[Admin] Time machine set response:', data)
      
      if (data.appTime) {
        // Map backend response to frontend structure
        setTimeMachineData({
          appTime: data.appTime,
          isActive: true, // Any override means it's active
          realTime: new Date().toISOString()
        })
        
        alert('Time machine updated successfully!')
      } else {
        alert('Failed to update app time')
      }
    } catch (e) {
      console.error('Failed to update app time', e)
      alert('An error occurred while updating app time: ' + e.message)
    }
  }

  const resetAppTime = async () => {
    try {
      console.log('[Admin] Resetting app time to real time')
      
      const data = await apiClient.resetAppTime()
      console.log('[Admin] Time machine reset response:', data)
      
      if (data.appTime) {
        // Map backend response to frontend structure
        setTimeMachineData({
          appTime: data.appTime,
          isActive: false,
          realTime: data.appTime, // After reset, app time equals real time
          autoApproveDistributions: timeMachineData.autoApproveDistributions // Preserve this frontend-only setting
        })
        
        alert(data.message || 'Time machine reset to real time!')
        return { appTime: data.appTime }
      } else {
        alert('Failed to reset app time')
      }
    } catch (e) {
      console.error('Failed to reset app time', e)
      alert('An error occurred while resetting app time: ' + e.message)
    }
    return null
  }

  const toggleAutoApproveDistributions = async (newValue) => {
    if (!currentUser || !currentUser.id) {
      alert('Current user not loaded. Please refresh the page.')
      return
    }
    
    try {
      const res = await fetch('/api/admin/time-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoApproveDistributions: newValue
        }),
        credentials: 'include'
      })
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
      
      if (data.success) {
        setTimeMachineData({
          ...timeMachineData,
          autoApproveDistributions: data.autoApproveDistributions
        })
        
        alert(`Auto-approve distributions ${newValue ? 'enabled' : 'disabled'}!`)
      } else {
        alert(data.error || 'Failed to update auto-approve setting')
      }
    } catch (e) {
      console.error('Failed to toggle auto-approve', e)
      alert('An error occurred while updating auto-approve setting: ' + e.message)
    }
  }

  const deleteAllAccounts = async () => {
    if (!confirm('Delete ALL accounts? This will remove every non-admin user.')) return
    setIsDeletingAccounts(true)
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: currentUser.id }),
        credentials: 'include'
      })
      const data = await res.json()
      if (!data.success) {
        // Show detailed error including auth deletion failures
        let errorMessage = data.error || 'Failed to delete accounts'
        if (data.authDeletionFailures && data.authDeletionFailures.length > 0) {
          errorMessage += '\n\nAuth deletion failures:\n'
          data.authDeletionFailures.forEach(f => {
            errorMessage += `- User ${f.userId} (auth_id: ${f.authId}): ${f.error}\n`
          })
          errorMessage += '\n⚠️ Users were removed from the database but still exist in the authentication service. You may need to delete them manually in your auth provider dashboard.'
        }
        alert(errorMessage)
        await refreshUsers(true)  // Force refresh to see updated state
        return
      }
      alert('All non-admin accounts deleted successfully. Reloading users...')
      await refreshUsers(true)  // Force refresh to bypass cache
    } catch (error) {
      console.error('Failed to delete accounts', error)
      alert('An error occurred while deleting accounts')
    } finally {
      setIsDeletingAccounts(false)
    }
  }

  const seedTestAccounts = async () => {
    if (!confirm('Seed test accounts? This will create the full local dataset.')) return
    setIsSeedingAccounts(true)
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: currentUser.id }),
        credentials: 'include'
      })
      const data = await res.json()
      if (!data.success) {
        alert(data.error || 'Failed to seed accounts')
        return
      }
      alert('Test accounts seeded successfully! Reloading users...')
      await refreshUsers(true)  // Force refresh to bypass cache
    } catch (error) {
      console.error('Failed to seed accounts', error)
      alert('An error occurred while seeding accounts')
    } finally {
      setIsSeedingAccounts(false)
    }
  }


  const handleImportComplete = async (result) => {
    console.log('Import completed:', result)
    // Refresh users data to show newly imported investors
    await refreshUsers(true)  // Force refresh to bypass cache
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.main}>
        <AdminHeader onTabChange={setActiveTab} activeTab={activeTab} />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.loadingState}>Loading admin dashboard...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.main}>
      <AdminHeader onTabChange={setActiveTab} activeTab={activeTab} />
      <div className={styles.container}>
        <div className={styles.content}>
          {/* Header */}
          <div className={styles.headerRow}>
            <div>
              <h1 className={styles.title}>
                {activeTab === 'dashboard' && 'Admin Dashboard'}
                {activeTab === 'accounts' && 'Accounts'}
                {activeTab === 'activity' && 'Activity'}
                {activeTab === 'distributions' && 'Transactions'}
                {activeTab === 'operations' && 'Operations'}
              </h1>
              <p className={styles.subtitle}>
                {activeTab === 'dashboard' && 'Overview of platform metrics and recent activity'}
                {activeTab === 'accounts' && (accountsSubTab === 'incomplete' ? 'View accounts that are not verified and have no investments' : 'View and manage verified accounts and accounts with investments')}
                {activeTab === 'activity' && 'View all activity events across the platform'}
                {activeTab === 'distributions' && 'Track all transactions including investments, monthly payments and compounding interest calculations'}
                {activeTab === 'operations' && 'Manage withdrawals, tax reporting, and system operations'}
              </p>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'dashboard' && (
            <DashboardTab 
              metrics={metrics} 
              pendingInvestments={pendingInvestments}
              pendingPayouts={pendingPayouts}
              isLoadingPayouts={isLoadingPayouts}
              processingPayoutId={processingPayoutId}
              onApprove={approveInvestment}
              onReject={rejectInvestment}
              savingId={savingId}
              onProcessPayment={processAchqPayment}
              onRefreshPayouts={refreshPayouts}
              monitoredPayouts={monitoredPayouts}
              onRefreshTransactions={refreshTransactions}
              isLoadingTransactions={isLoadingTransactions}
              disconnectedBankUsers={disconnectedBankUsers}
              isLoadingPaymentMethods={isLoadingPaymentMethods}
            />
          )}

          {activeTab === 'operations' && (
            <OperationsTab
              withdrawals={withdrawals}
              isLoadingWithdrawals={isLoadingWithdrawals}
              timeMachineData={timeMachineData}
              currentUser={currentUser}
              onWithdrawalAction={actOnWithdrawal}
              onTimeMachineUpdate={updateAppTime}
              onTimeMachineReset={resetAppTime}
              onDeleteAccounts={deleteAllAccounts}
              onSeedTestAccounts={seedTestAccounts}
              isDeletingAccounts={isDeletingAccounts}
              isSeedingAccounts={isSeedingAccounts}
              onRefreshWithdrawals={refreshWithdrawals}
              onImportComplete={handleImportComplete}
              onToggleAutoApprove={toggleAutoApproveDistributions}
            />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <ActivityTab 
              users={users || []}
              isLoading={isLoading}
              onRefresh={() => refreshUsers(true)}
            />
          )}

          {/* Transactions Tab */}
          {activeTab === 'distributions' && (
            <DistributionsTab 
              users={users || []} 
              timeMachineData={timeMachineData} 
              allTransactions={allTransactions || []}
            />
          )}

          {/* Accounts Tab */}
          {activeTab === 'accounts' && (
            <div>
              {/* Sub-tab navigation for Accounts */}
              <div style={{ 
                display: 'flex', 
                gap: '4px', 
                marginBottom: '24px',
                background: '#f3f4f6',
                padding: '4px',
                borderRadius: '8px',
                width: 'fit-content'
              }}>
                <button
                  onClick={() => {
                    setAccountsSubTab('all')
                    const params = new URLSearchParams(searchParams.toString())
                    params.set('tab', 'accounts')
                    params.delete('accountsView')
                    router.replace(`/admin?${params.toString()}`, { scroll: false })
                  }}
                  style={{
                    padding: '8px 24px',
                    border: 'none',
                    borderRadius: '6px',
                    background: accountsSubTab === 'all' ? '#ffffff' : 'transparent',
                    color: accountsSubTab === 'all' ? '#1a1a1a' : '#6b7280',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: accountsSubTab === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Verified Accounts
                </button>
                <button
                  onClick={() => {
                    setAccountsSubTab('incomplete')
                    const params = new URLSearchParams(searchParams.toString())
                    params.set('tab', 'accounts')
                    params.set('accountsView', 'incomplete')
                    router.replace(`/admin?${params.toString()}`, { scroll: false })
                  }}
                  style={{
                    padding: '8px 24px',
                    border: 'none',
                    borderRadius: '6px',
                    background: accountsSubTab === 'incomplete' ? '#ffffff' : 'transparent',
                    color: accountsSubTab === 'incomplete' ? '#1a1a1a' : '#6b7280',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: accountsSubTab === 'incomplete' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Incomplete
                </button>
              </div>
              
              <div className={styles.searchContainer}>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={accountsSearch}
                  onChange={(e) => setAccountsSearch(e.target.value)}
                  className={styles.searchInput}
                />
                <div style={{ position: 'relative', display: 'inline-block', marginLeft: '12px' }}>
                  <button
                    className={styles.filterButton}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    🔍 Filters
                    {(accountFilters.hasInvestments !== 'all' || 
                      accountFilters.investmentAmountMin || 
                      accountFilters.investmentAmountMax || 
                      accountFilters.investmentValueMin || 
                      accountFilters.investmentValueMax || 
                      accountFilters.createdDateStart || 
                      accountFilters.createdDateEnd || 
                      accountFilters.numInvestmentsMin || 
                      accountFilters.numInvestmentsMax ||
                      accountFilters.investmentType !== 'all') && 
                      <span className={styles.activeFilterBadge}>●</span>
                    }
                  </button>
                  
                  {showFilters && (
                    <>
                      <div 
                        className={styles.filterOverlay}
                        onClick={() => setShowFilters(false)}
                      />
                      <div className={styles.filterDropdown}>
                        <div className={styles.filterHeader}>
                          <h3>Filter Accounts</h3>
                          <button
                            className={styles.clearFiltersButton}
                            onClick={() => {
                              setAccountFilters({
                                hasInvestments: 'all',
                                investmentAmountMin: '',
                                investmentAmountMax: '',
                                investmentValueMin: '',
                                investmentValueMax: '',
                                createdDateStart: '',
                                createdDateEnd: '',
                                numInvestmentsMin: '',
                                numInvestmentsMax: '',
                                isVerified: 'all',
                                bankConnected: 'all',
                                investmentType: 'all'
                              })
                            }}
                          >
                            Clear All
                          </button>
                        </div>
                        
                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Has Investments</label>
                          <select
                            className={styles.filterSelect}
                            value={accountFilters.hasInvestments}
                            onChange={(e) => setAccountFilters({...accountFilters, hasInvestments: e.target.value})}
                          >
                            <option value="all">All Accounts</option>
                            <option value="with">With Investments</option>
                            <option value="without">Without Investments</option>
                          </select>
                        </div>
                        
                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Verification Status</label>
                          <select
                            className={styles.filterSelect}
                            value={accountFilters.isVerified}
                            onChange={(e) => setAccountFilters({...accountFilters, isVerified: e.target.value})}
                          >
                            <option value="all">All Users</option>
                            <option value="yes">Verified</option>
                            <option value="no">Not Verified</option>
                          </select>
                        </div>

                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Bank Connection</label>
                          <select
                            className={styles.filterSelect}
                            value={accountFilters.bankConnected}
                            onChange={(e) => setAccountFilters({...accountFilters, bankConnected: e.target.value})}
                          >
                            <option value="all">All Users</option>
                            <option value="yes">Bank Connected</option>
                            <option value="no">No Bank Connected</option>
                          </select>
                        </div>

                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Investment Type</label>
                          <select
                            className={styles.filterSelect}
                            value={accountFilters.investmentType}
                            onChange={(e) => setAccountFilters({...accountFilters, investmentType: e.target.value})}
                          >
                            <option value="all">All Users</option>
                            <option value="compounding">Compounding Only</option>
                            <option value="monthly">Monthly Only</option>
                            <option value="both">Both Types</option>
                          </select>
                        </div>

                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Investment Amount (Principal)</label>
                          <div className={styles.filterRange}>
                            <input
                              type="number"
                              placeholder="Min"
                              className={styles.filterInput}
                              value={accountFilters.investmentAmountMin}
                              onChange={(e) => setAccountFilters({...accountFilters, investmentAmountMin: e.target.value})}
                            />
                            <span>to</span>
                            <input
                              type="number"
                              placeholder="Max"
                              className={styles.filterInput}
                              value={accountFilters.investmentAmountMax}
                              onChange={(e) => setAccountFilters({...accountFilters, investmentAmountMax: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Account Value (with Interest)</label>
                          <div className={styles.filterRange}>
                            <input
                              type="number"
                              placeholder="Min"
                              className={styles.filterInput}
                              value={accountFilters.investmentValueMin}
                              onChange={(e) => setAccountFilters({...accountFilters, investmentValueMin: e.target.value})}
                            />
                            <span>to</span>
                            <input
                              type="number"
                              placeholder="Max"
                              className={styles.filterInput}
                              value={accountFilters.investmentValueMax}
                              onChange={(e) => setAccountFilters({...accountFilters, investmentValueMax: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Number of Investments</label>
                          <div className={styles.filterRange}>
                            <input
                              type="number"
                              placeholder="Min"
                              className={styles.filterInput}
                              value={accountFilters.numInvestmentsMin}
                              onChange={(e) => setAccountFilters({...accountFilters, numInvestmentsMin: e.target.value})}
                            />
                            <span>to</span>
                            <input
                              type="number"
                              placeholder="Max"
                              className={styles.filterInput}
                              value={accountFilters.numInvestmentsMax}
                              onChange={(e) => setAccountFilters({...accountFilters, numInvestmentsMax: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        <div className={styles.filterSection}>
                          <label className={styles.filterLabel}>Created Date Range</label>
                          <div className={styles.filterRange}>
                            <input
                              type="date"
                              className={styles.filterInput}
                              value={accountFilters.createdDateStart}
                              onChange={(e) => setAccountFilters({...accountFilters, createdDateStart: e.target.value})}
                            />
                            <span>to</span>
                            <input
                              type="date"
                              className={styles.filterInput}
                              value={accountFilters.createdDateEnd}
                              onChange={(e) => setAccountFilters({...accountFilters, createdDateEnd: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        <div className={styles.filterFooter}>
                          <button
                            className={styles.applyFiltersButton}
                            onClick={() => setShowFilters(false)}
                          >
                            Apply Filters
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {/* PERFORMANCE: Show results count and pagination info */}
              <div style={{ padding: '12px 0', color: '#6b7280', fontSize: '14px' }}>
                Showing {paginatedAccountUsers.length} of {filteredAccountUsers.length} accounts
                {totalAccountPages > 1 && ` (Page ${accountsPage} of ${totalAccountPages})`}
              </div>
              
              <div className={styles.accountsGrid}>
                {paginatedAccountUsers.map(user => {
                  const activeInvestments = (user.investments || [])
                    .filter(inv => inv.status === 'active' || inv.status === 'withdrawal_notice')
                  
                  const investedAmount = activeInvestments
                    .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
                  
                  // Calculate total account value (including compounding interest)
                  // Use app time from time machine if available
                  const accountValue = activeInvestments
                    .reduce((sum, inv) => {
                      const calculation = calculateInvestmentValue(inv, timeMachineData.appTime)
                      return sum + (Number(calculation.currentValue) || 0)
                    }, 0)
                  
                  // Determine accreditation status from latest investment
                  const latestInvestment = (user.investments || [])
                    .sort((a, b) => {
                      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
                      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
                      return dateB - dateA
                    })[0]
                  const accreditationStatus = latestInvestment?.compliance?.status
                  
                  // Check both onboardingStatus flag and bankAccounts array since manual entry may not update the flag
                  const hasBankAccount = user.onboardingStatus?.bankConnected || 
                    (Array.isArray(user.bankAccounts) && user.bankAccounts.length > 0)
                  
                  // Compute ACH status from payment methods
                  // Handles known statuses and passes through unrecognized statuses as-is
                  const userPaymentData = paymentMethodsByUser[user.id.toString()]
                  const paymentMethods = userPaymentData?.paymentMethods || []
                  let achStatus = 'na' // Default: no bank account or no payment methods
                  
                  if (isLoadingPaymentMethods && hasBankAccount) {
                    achStatus = 'loading'
                  } else if (paymentMethods.length > 0) {
                    // User has payment methods - check their connection status
                    // Priority: disconnected > connected > any other status from response
                    const hasDisconnected = paymentMethods.some(pm => {
                      const connStatus = pm.connection_status || pm.connectionStatus
                      return connStatus === 'disconnected'
                    })
                    const hasConnected = paymentMethods.some(pm => {
                      const connStatus = pm.connection_status || pm.connectionStatus
                      return connStatus === 'connected'
                    })
                    
                    if (hasDisconnected) {
                      achStatus = 'disconnected'
                    } else if (hasConnected) {
                      achStatus = 'active'
                    } else {
                      // Use the first payment method's status as-is (unknown, pending, error, etc.)
                      const firstStatus = paymentMethods[0]?.connection_status || paymentMethods[0]?.connectionStatus
                      achStatus = firstStatus || 'na'
                    }
                  }
                  
                  // Determine bank connection type (Plaid/Manual/Not Connected)
                  let bankConnectionType = 'not_connected'
                  if (hasBankAccount && paymentMethods.length > 0) {
                    const hasManual = paymentMethods.some(pm => {
                      const creationSource = pm.creation_source || pm.creationSource
                      return creationSource === 'manual'
                    })
                    const hasPlaid = paymentMethods.some(pm => {
                      const creationSource = pm.creation_source || pm.creationSource
                      return creationSource === 'plaid' || (!creationSource && pm.type === 'bank_ach')
                    })
                    bankConnectionType = hasPlaid ? 'plaid' : hasManual ? 'manual' : 'connected'
                  } else if (hasBankAccount) {
                    bankConnectionType = 'connected' // Fallback when payment methods not loaded
                  }
                  
                  return (
                    <div
                      key={user.id}
                      className={styles.accountCard}
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                    >
                      <div className={styles.accountCardHeader}>
                        <div className={styles.accountId}>Account #{user.id}</div>
                        <div className={styles.accountBadges}>
                          {user.isVerified && <span className={styles.verifiedBadge}>✓ Verified</span>}
                          {!isProfileComplete(user) && (
                            <span className={styles.warningBadge} title="Profile incomplete: Missing personal details or address information">
                              ⚠ Profile Incomplete
                            </span>
                          )}
                          {user.accountType === 'joint' && <span className={styles.jointBadge}>Joint</span>}
                          {user.accountType === 'individual' && <span className={styles.individualBadge}>Individual</span>}
                          {user.accountType === 'entity' && <span className={styles.entityBadge}>Entity</span>}
                          {user.accountType === 'ira' && <span className={styles.sdiraBadge}>SDIRA</span>}
                        </div>
                      </div>
                      <div className={styles.accountCardBody}>
                        <div className={styles.accountEmail}>{user.email || '-'}</div>
                        <div className={styles.accountName}>{user.firstName || '-'} {user.lastName || ''}</div>
                        {user.accountType === 'joint' && user.jointHolder?.email && (
                          <div className={styles.accountJointEmail}>Joint: {user.jointHolder.email}</div>
                        )}
                        <div className={styles.accountPhone}>{user.phone || user.phoneNumber || '-'}</div>
                        
                        <div className={styles.onboardingStatusGrid}>
                          <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>Verified</span>
                            <span className={`${styles.statusValue} ${user.isVerified ? styles.statusSuccess : styles.statusPending}`}>
                              {user.isVerified ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>Bank</span>
                            <span className={`${styles.statusValue} ${
                              bankConnectionType === 'plaid' || bankConnectionType === 'manual' || bankConnectionType === 'connected' 
                                ? styles.statusSuccess 
                                : styles.statusPending
                            }`}>
                              {bankConnectionType === 'plaid' ? 'Plaid' :
                               bankConnectionType === 'manual' ? 'Manual' :
                               bankConnectionType === 'connected' ? 'Connected' :
                               'Not Connected'}
                            </span>
                          </div>
                          <div className={styles.statusItem}>
                            <span className={styles.statusLabel}>ACH Status</span>
                            <span className={`${styles.statusValue} ${
                              achStatus === 'active' ? styles.statusSuccess : 
                              achStatus === 'disconnected' ? styles.statusDisconnected : 
                              achStatus === 'loading' ? '' : 
                              achStatus === 'na' ? styles.statusPending :
                              styles.statusPending
                            }`}>
                              {achStatus === 'active' ? 'Active' : 
                               achStatus === 'disconnected' ? 'Disconnected' : 
                               achStatus === 'loading' ? '...' : 
                               achStatus === 'na' ? 'N/A' :
                               achStatus.charAt(0).toUpperCase() + achStatus.slice(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.accountCardFooter} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0' }}>
                        <div className={styles.statsContainer}>
                          <div className={styles.accountStat}>
                            <div className={styles.statLabel}>Investments</div>
                            <div className={styles.statValue}>{(user.investments || []).length}</div>
                          </div>
                          <div className={styles.accountStat}>
                            <div className={styles.statLabel}>Invested</div>
                            <div className={styles.statValue}>{formatCurrency(Number(investedAmount) || 0)}</div>
                          </div>
                          <div className={styles.accountStat}>
                            <div className={styles.statLabel}>Account Value</div>
                            <div className={styles.statValue}>{formatCurrency(Number(accountValue) || 0)}</div>
                          </div>
                          <div className={styles.accountStat}>
                            <div className={styles.statLabel}>Created</div>
                            <div className={styles.statValue}>{(user.displayCreatedAt || user.createdAt || user.created_at) ? formatDateForDisplay(user.displayCreatedAt || user.createdAt || user.created_at) : '-'}</div>
                          </div>
                          <div className={styles.accountStat}>
                            <div className={styles.statLabel}>Accredited</div>
                            <div className={styles.statValue}>
                              {accreditationStatus === 'accredited' ? (
                                <span style={{ color: '#166534' }}>Yes</span>
                              ) : accreditationStatus === 'not_accredited' ? (
                                <span style={{ color: '#6b7280' }}>No</span>
                              ) : (
                                <span style={{ color: '#9ca3af' }}>-</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* PERFORMANCE: Pagination controls */}
              {totalAccountPages > 1 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '24px 0',
                  marginTop: '24px'
                }}>
                  <button
                    onClick={() => setAccountsPage(prev => Math.max(1, prev - 1))}
                    disabled={accountsPage === 1}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: accountsPage === 1 ? '#f3f4f6' : '#3b82f6',
                      color: accountsPage === 1 ? '#9ca3af' : '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: accountsPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    ← Previous
                  </button>
                  
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>
                    Page {accountsPage} of {totalAccountPages}
                  </span>
                  
                  <button
                    onClick={() => setAccountsPage(prev => Math.min(totalAccountPages, prev + 1))}
                    disabled={accountsPage === totalAccountPages}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: accountsPage === totalAccountPages ? '#f3f4f6' : '#3b82f6',
                      color: accountsPage === totalAccountPages ? '#9ca3af' : '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: accountsPage === totalAccountPages ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className={styles.main}>
        <div className={styles.container}>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            Loading...
          </div>
        </div>
      </div>
    }>
      <AdminPageContent />
    </Suspense>
  )
}

