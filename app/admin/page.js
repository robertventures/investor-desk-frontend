'use client'
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithCsrf } from '../../lib/csrfClient'
import { apiClient } from '../../lib/apiClient'
import AdminHeader from '../components/AdminHeader'
import { useAdminData } from './hooks/useAdminData'
import { useAdminMetrics } from './hooks/useAdminMetrics'
import DashboardTab from './components/DashboardTab'
import OperationsTab from './components/OperationsTab'
import ActivityTab from './components/ActivityTab'
import DistributionsTab from './components/DistributionsTab'
import { calculateInvestmentValue } from '../../lib/investmentCalculations.js'
import { formatDateForDisplay } from '../../lib/dateUtils.js'
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

  // Data management with custom hook
  const {
    currentUser,
    users,
    isLoading,
    withdrawals,
    isLoadingWithdrawals,
    pendingPayouts,
    isLoadingPayouts,
    timeMachineData,
    setTimeMachineData,
    refreshUsers,
    refreshWithdrawals,
    refreshPayouts
  } = useAdminData()

  // Metrics calculation with custom hook
  const metrics = useAdminMetrics(users, withdrawals, pendingPayouts, timeMachineData?.appTime)

  // State for specific tab operations
  const [savingId, setSavingId] = useState(null)
  const [accountsSearch, setAccountsSearch] = useState('')
  const [isDeletingAccounts, setIsDeletingAccounts] = useState(false)
  const [isSeedingAccounts, setIsSeedingAccounts] = useState(false)
  
  // State for account filters
  const [showFilters, setShowFilters] = useState(false)
  const [accountFilters, setAccountFilters] = useState({
    hasInvestments: 'all', // 'all', 'with', 'without'
    investmentAmountMin: '',
    investmentAmountMax: '',
    investmentValueMin: '',
    investmentValueMax: '',
    createdDateStart: '',
    createdDateEnd: '',
    numInvestmentsMin: '',
    numInvestmentsMax: ''
  })
  
  // PERFORMANCE: Pagination for accounts view
  const [accountsPage, setAccountsPage] = useState(1)
  const accountsPerPage = 20

  // Keep tab in sync with URL
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

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
      const dateA = a.displayCreatedAt ? new Date(a.displayCreatedAt).getTime() : 0
      const dateB = b.displayCreatedAt ? new Date(b.displayCreatedAt).getTime() : 0
      return dateB - dateA
    })
  }, [nonAdminUsers])

  const filteredAccountUsers = useMemo(() => {
    // Reset to page 1 when filters change
    setAccountsPage(1)
    
    let filtered = sortedAccountUsers
    
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
      
      // Filter by created date (use displayCreatedAt for imported accounts)
      if (accountFilters.createdDateStart && user.displayCreatedAt) {
        const userDate = new Date(user.displayCreatedAt).setHours(0,0,0,0)
        const filterDate = new Date(accountFilters.createdDateStart).setHours(0,0,0,0)
        if (userDate < filterDate) return false
      }
      if (accountFilters.createdDateEnd && user.displayCreatedAt) {
        const userDate = new Date(user.displayCreatedAt).setHours(0,0,0,0)
        const filterDate = new Date(accountFilters.createdDateEnd).setHours(0,0,0,0)
        if (userDate > filterDate) return false
      }
      
      return true
    })
    
    return filtered
  }, [sortedAccountUsers, accountsSearch, accountFilters, timeMachineData.appTime])

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

  // Investment operations
  const approveInvestment = async (userId, investmentId) => {
    try {
      setSavingId(investmentId)
      const data = await apiClient.updateUser(userId, {
        _action: 'updateInvestment',
        investmentId,
        adminUserId: currentUser?.id,
        fields: { status: 'active' }
      })
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
      const data = await apiClient.updateUser(userId, {
        _action: 'updateInvestment',
        investmentId,
        adminUserId: currentUser?.id,
        fields: { status: 'rejected' }
      })
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
  const actOnWithdrawal = async (action, userId, withdrawalId) => {
    try {
      const res = await fetchWithCsrf('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId, withdrawalId })
      })
      const data = await res.json()
      if (!data.success) {
        alert(data.error || 'Failed to update withdrawal')
        return
      }
      await refreshWithdrawals(true)  // Force refresh to bypass cache
      await refreshUsers(true)  // Force refresh to bypass cache
      alert('Withdrawal updated successfully')
    } catch (e) {
      console.error('Failed to update withdrawal', e)
      alert('An error occurred')
    }
  }

  // Payout operations
  const handlePayoutAction = async (action, userId, transactionId, failureReason = null) => {
    try {
      const res = await fetchWithCsrf('/api/admin/pending-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId, transactionId, failureReason })
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
      const res = await fetchWithCsrf('/api/admin/time-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appTime: new Date(newAppTime).toISOString(),
          adminUserId: currentUser.id
        })
      })
      
      if (!res.ok) {
        console.error('Response not OK:', res.status, res.statusText)
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
      
      if (data.success) {
        setTimeMachineData({
          appTime: data.appTime,
          isActive: true,
          realTime: new Date().toISOString()
        })
        
        alert('Time machine updated successfully!')
      } else {
        alert(data.error || 'Failed to update app time')
      }
    } catch (e) {
      console.error('Failed to update app time', e)
      alert('An error occurred while updating app time: ' + e.message)
    }
  }

  const resetAppTime = async () => {
    try {
      const res = await fetchWithCsrf(`/api/admin/time-machine?adminUserId=${currentUser.id}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
      if (data.success) {
        const realTime = new Date().toISOString()
        setTimeMachineData({
          appTime: realTime,
          isActive: false,
          realTime,
          autoApproveDistributions: false
        })
        
        alert('Time machine reset to real time!')
        return { appTime: realTime }
      } else {
        alert(data.error || 'Failed to reset app time')
      }
    } catch (e) {
      console.error('Failed to reset app time', e)
      alert('An error occurred while resetting app time')
    }
    return null
  }

  const toggleAutoApproveDistributions = async (newValue) => {
    if (!currentUser || !currentUser.id) {
      alert('Current user not loaded. Please refresh the page.')
      return
    }
    
    try {
      const res = await fetchWithCsrf('/api/admin/time-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoApproveDistributions: newValue
        })
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
      const res = await fetchWithCsrf('/api/admin/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: currentUser.id })
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
          errorMessage += '\n⚠️ Users removed from database but still exist in Supabase Auth. You may need to delete them manually from the Supabase Auth dashboard.'
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
      const res = await fetchWithCsrf('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: currentUser.id })
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
                {activeTab === 'accounts' && 'View and manage user accounts'}
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
              onApprove={approveInvestment}
              onReject={rejectInvestment}
              savingId={savingId}
              onPayoutAction={handlePayoutAction}
              onRefreshPayouts={refreshPayouts}
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
            <ActivityTab users={users || []} />
          )}

          {/* Transactions Tab */}
          {activeTab === 'distributions' && (
            <DistributionsTab users={users || []} timeMachineData={timeMachineData} />
          )}

          {/* Accounts Tab */}
          {activeTab === 'accounts' && (
            <div>
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
                      accountFilters.numInvestmentsMax) && 
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
                                numInvestmentsMax: ''
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
                    .reduce((sum, inv) => sum + (inv.amount || 0), 0)
                  
                  // Calculate total account value (including compounding interest)
                  // Use app time from time machine if available
                  const accountValue = activeInvestments
                    .reduce((sum, inv) => {
                      const calculation = calculateInvestmentValue(inv, timeMachineData.appTime)
                      return sum + calculation.currentValue
                    }, 0)
                  
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
                          {user.accountType === 'ira' && <span className={styles.iraBadge}>IRA</span>}
                        </div>
                      </div>
                      <div className={styles.accountCardBody}>
                        <div className={styles.accountEmail}>{user.email || '-'}</div>
                        <div className={styles.accountName}>{user.firstName || '-'} {user.lastName || ''}</div>
                        {user.accountType === 'joint' && user.jointHolder?.email && (
                          <div className={styles.accountJointEmail}>Joint: {user.jointHolder.email}</div>
                        )}
                        <div className={styles.accountPhone}>{user.phone || user.phoneNumber || '-'}</div>
                      </div>
                      <div className={styles.accountCardFooter}>
                        <div className={styles.accountStat}>
                          <div className={styles.statLabel}>Investments</div>
                          <div className={styles.statValue}>{(user.investments || []).length}</div>
                        </div>
                        <div className={styles.accountStat}>
                          <div className={styles.statLabel}>Invested</div>
                          <div className={styles.statValue}>${investedAmount.toLocaleString()}</div>
                        </div>
                        <div className={styles.accountStat}>
                          <div className={styles.statLabel}>Account Value</div>
                          <div className={styles.statValue}>${accountValue.toLocaleString()}</div>
                        </div>
                        <div className={styles.accountStat}>
                          <div className={styles.statLabel}>Created</div>
                          <div className={styles.statValue}>{user.displayCreatedAt ? formatDateForDisplay(user.displayCreatedAt) : '-'}</div>
                        </div>
                      </div>
                      <div className={styles.accountCardActions} onClick={(e) => e.stopPropagation()}>
                        <button
                          className={styles.dangerButton}
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Are you sure you want to delete ${user.firstName} ${user.lastName} (${user.email})?\n\nThis will permanently delete:\n• Account and profile\n• All investments and transactions\n• All activity and withdrawals\n• Authentication access\n\nThis action cannot be undone.`)) return
                            
                            console.log(`[Frontend] Deleting user ${user.id} (${user.email})...`)
                            
                            try {
                              const data = await apiClient.deleteUser(user.id)
                              console.log('[Frontend] Response data:', data)
                              
                              // Handle partial success (database deleted but auth failed)
                              if (data.partialSuccess) {
                                alert(`⚠️ Partial Success:\n\n${data.error}\n\n✅ User removed from database\n❌ Failed to remove from Supabase Auth\n\nYou may need to manually delete this user from the Supabase Auth dashboard.`)
                                await refreshUsers(true)
                                return
                              }
                              
                              // Handle complete failure
                              if (!data.success) {
                                alert(`❌ Failed to delete user:\n\n${data.error}`)
                                return
                              }
                              
                              // Success
                              console.log('[Frontend] ✅ User deleted successfully')
                              alert(`✅ User ${user.email} deleted successfully!`)
                              await refreshUsers(true)  // Force refresh to bypass cache
                            } catch (e) {
                              console.error('[Frontend] Delete failed:', e)
                              alert(`An error occurred: ${e.message}`)
                            }
                          }}
                        >
                          Delete
                        </button>
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

