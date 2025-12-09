import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../../lib/apiClient'
import logger from '@/lib/logger'

// Cache configuration
const CACHE_DURATION = 30000 // 30 seconds
const CACHE_KEY_USERS = 'admin_users_cache'
const CACHE_KEY_WITHDRAWALS = 'admin_withdrawals_cache'
const CACHE_KEY_PAYOUTS = 'admin_payouts_cache'
const CACHE_KEY_ACTIVITY = 'admin_activity_cache'
const CACHE_KEY_TRANSACTIONS = 'admin_transactions_cache'

/**
 * Helper to determine if a user has a bank account connected
 * Checks multiple sources of truth since onboardingStatus.bankConnected
 * may not be updated for manual entry bank accounts
 */
const hasUserBankConnected = (user) => {
  // If no user provided, we can't determine bank connection status
  if (!user) return false
  
  // Check 1: Backend's onboardingStatus flag
  if (user.onboardingStatus?.bankConnected) return true
  
  // Check 2: User has bankAccounts array with items
  if (Array.isArray(user.bankAccounts) && user.bankAccounts.length > 0) return true
  
  return false
}

/**
 * Custom hook to manage all admin data fetching and state with intelligent caching
 */
export function useAdminData() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState(null)
  const [users, setUsers] = useState([])
  const [investments, setInvestments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [withdrawals, setWithdrawals] = useState([])
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(false)
  const [pendingPayouts, setPendingPayouts] = useState([])
  const [isLoadingPayouts, setIsLoadingPayouts] = useState(false)
  const [processingPayoutId, setProcessingPayoutId] = useState(null)
  const [activityEvents, setActivityEvents] = useState([])
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  const [allTransactions, setAllTransactions] = useState([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
  const [timeMachineData, setTimeMachineData] = useState({ 
    appTime: null, 
    isActive: false,
    autoApproveDistributions: false
  })
  
  // Helper to get cached data if still valid
  const getCachedData = (key) => {
    try {
      if (typeof window === 'undefined') return null
      
      const cached = localStorage.getItem(key)
      if (!cached) return null
      
      const { data, timestamp } = JSON.parse(cached)
      const age = Date.now() - timestamp
      
      if (age < CACHE_DURATION) {
        return data
      }
      
      // Cache expired, remove it
      localStorage.removeItem(key)
      return null
    } catch (e) {
      logger.error('Cache read error:', e)
      return null
    }
  }

  // Helper to set cached data
  const setCachedData = (key, data) => {
    try {
      if (typeof window === 'undefined') return
      
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch (e) {
      logger.error('Cache write error:', e)
    }
  }

  // Helper to clear specific cache
  const clearCache = (key) => {
    try {
      if (typeof window === 'undefined') return
      
      localStorage.removeItem(key)
    } catch (e) {
      logger.error('Cache clear error:', e)
    }
  }

  // Load initial data
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const init = async () => {
      try {
        // Check for force refresh query param
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('forceRefresh') === '1') {
          logger.log('🔄 Force refresh requested - clearing all caches')
          clearCache(CACHE_KEY_USERS)
          clearCache(CACHE_KEY_WITHDRAWALS)
          clearCache(CACHE_KEY_PAYOUTS)
          clearCache(CACHE_KEY_ACTIVITY)
          clearCache(CACHE_KEY_TRANSACTIONS)
        }
        // Ensure tokens are loaded before checking authentication
        apiClient.ensureTokensLoaded()
        
        // Check if we have authentication tokens
        if (!apiClient.isAuthenticated()) {
          // Try to refresh token if we have a refresh token
          if (apiClient.refreshToken) {
            try {
              await apiClient.refreshAccessToken()
            } catch (refreshError) {
              logger.error('Failed to refresh token:', refreshError)
              router.push('/login')
              return
            }
          } else {
            // No tokens available, redirect to login
            router.push('/login')
            return
          }
        }

        // Use getCurrentUser() instead of getUser(userId) - it properly handles token refresh
        const meData = await apiClient.getCurrentUser()
        if (!meData || !meData.success || !meData.user) {
          logger.error('Failed to get current user:', meData)
          router.push('/login')
          return
        }
        setCurrentUser(meData.user)
        
        if (!meData.user.isAdmin) {
          router.push('/dashboard')
          return
        }

        // Load all data in parallel
        await Promise.all([
          loadUsers(),
          loadWithdrawals(),
          loadPendingPayouts(),
          loadActivityEvents(),
          loadAllTransactions(),
          loadTimeMachine()
        ])
      } catch (e) {
        logger.error('Failed to load admin data', e)
        // If it's an authentication error, redirect to login
        if (e.message && (e.message.includes('401') || e.message.includes('Session expired') || e.message.includes('Unauthorized'))) {
          router.push('/login')
        }
      } finally {
        setIsLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const loadUsers = async (forceRefresh = false) => {
    try {
      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedData(CACHE_KEY_USERS)
        if (cached) {
          logger.log('📦 Using cached user data')
          setUsers(cached.users || [])
          setInvestments(cached.investments || [])
          return
        }
      }
      
      // Clear cache if forcing refresh
      if (forceRefresh) {
        clearCache(CACHE_KEY_USERS)
      }
      
      // Load users and investments in parallel
      const [usersData, investmentsData] = await Promise.all([
        apiClient.getAllUsers(),
        apiClient.getAdminInvestments()
      ])
      
      logger.log('[useAdminData] Users response:', usersData)
      logger.log('[useAdminData] Investments response:', investmentsData)
      
      if (usersData && usersData.success) {
        const usersList = usersData.users || []
        const investmentsList = investmentsData && investmentsData.success 
          ? (investmentsData.investments || []) 
          : []
        
        logger.log(`✓ Loaded ${usersList.length} users and ${investmentsList.length} investments`)
        logger.log('[useAdminData] Sample user:', usersList[0])
        logger.log('[useAdminData] Sample investment:', investmentsList[0])
        
        // Group investments by userId
        const investmentsByUser = {}
        investmentsList.forEach(inv => {
          const userId = inv.userId.toString()
          if (!investmentsByUser[userId]) {
            investmentsByUser[userId] = []
          }
          investmentsByUser[userId].push(inv)
        })
        
        // Attach investments to users
        // Handle both numeric IDs and string IDs with prefix (e.g., "USR-1025")
        const usersWithInvestments = usersList.map(user => {
          let userIdStr = user.id.toString()
          // Extract numeric part if user ID has a prefix (e.g., "USR-1025" -> "1025")
          const numericMatch = userIdStr.match(/\d+$/)
          const numericId = numericMatch ? numericMatch[0] : userIdStr
          
          const userInvestments = investmentsByUser[numericId] || investmentsByUser[userIdStr] || []
          
          return {
            ...user,
            investments: userInvestments
          }
        })
        
        // Log how many users have investments attached
        const usersWithInvCount = usersWithInvestments.filter(u => u.investments.length > 0).length
        logger.log(`✓ ${usersWithInvCount} users have investments attached`)
        
        setUsers(usersWithInvestments)
        setInvestments(investmentsList)
        
        // Cache combined data
        setCachedData(CACHE_KEY_USERS, {
          users: usersWithInvestments,
          investments: investmentsList
        })
        
        logger.log('✓ User and investment data loaded and cached')
      }
    } catch (e) {
      logger.error('Failed to load users and investments', e)
    }
  }

  const loadWithdrawals = async (forceRefresh = false) => {
    try {
      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedData(CACHE_KEY_WITHDRAWALS)
        if (cached) {
          logger.log('📦 Using cached withdrawals data')
          setWithdrawals(cached)
          return
        }
      }
      
      if (forceRefresh) {
        clearCache(CACHE_KEY_WITHDRAWALS)
      }
      
      setIsLoadingWithdrawals(true)
      const data = await apiClient.getAdminWithdrawals()
      if (data && data.success) {
        setWithdrawals(data.withdrawals || [])
        setCachedData(CACHE_KEY_WITHDRAWALS, data.withdrawals || [])
      }
    } catch (e) {
      logger.error('Failed to load withdrawals', e)
    } finally {
      setIsLoadingWithdrawals(false)
    }
  }

  const loadPendingPayouts = async (forceRefresh = false) => {
    try {
      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedData(CACHE_KEY_PAYOUTS)
        if (cached) {
          logger.log('📦 Using cached payouts data')
          setPendingPayouts(cached)
          return
        }
      }
      
      if (forceRefresh) {
        clearCache(CACHE_KEY_PAYOUTS)
      }
      
      setIsLoadingPayouts(true)
      const data = await apiClient.getPendingPayouts()
      if (data && data.success) {
        setPendingPayouts(data.pendingPayouts || [])
        setCachedData(CACHE_KEY_PAYOUTS, data.pendingPayouts || [])
      }
    } catch (e) {
      logger.error('Failed to load pending payouts', e)
    } finally {
      setIsLoadingPayouts(false)
    }
  }

  const loadActivityEvents = async (forceRefresh = false) => {
    try {
      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedData(CACHE_KEY_ACTIVITY)
        if (cached) {
          logger.log('📦 Using cached activity data')
          setActivityEvents(cached)
          return
        }
      }
      
      if (forceRefresh) {
        clearCache(CACHE_KEY_ACTIVITY)
      }
      
      setIsLoadingActivity(true)
      const data = await apiClient.getAdminActivityEvents({ size: 100 })
      if (data && data.success) {
        // Extract items from paginated response
        const events = data.items || data.events || []
        logger.log(`✓ Loaded ${events.length} activity events`)
        setActivityEvents(events)
        setCachedData(CACHE_KEY_ACTIVITY, events)
      }
    } catch (e) {
      logger.error('Failed to load activity events', e)
    } finally {
      setIsLoadingActivity(false)
    }
  }

  const loadAllTransactions = async (forceRefresh = false) => {
    try {
      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedData(CACHE_KEY_TRANSACTIONS)
        if (cached) {
          logger.log('📦 Using cached transactions data')
          setAllTransactions(cached)
          return
        }
      }
      
      if (forceRefresh) {
        clearCache(CACHE_KEY_TRANSACTIONS)
      }
      
      setIsLoadingTransactions(true)
      const data = await apiClient.getAllTransactions()
      if (data && data.success) {
        const transactions = data.transactions || []
        logger.log(`✓ Loaded ${transactions.length} transactions`)
        setAllTransactions(transactions)
        setCachedData(CACHE_KEY_TRANSACTIONS, transactions)
      }
    } catch (e) {
      logger.error('Failed to load transactions', e)
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  const loadTimeMachine = async () => {
    try {
      const timeData = await apiClient.getAppTime()
      if (timeData && (timeData.appTime || timeData.systemTime)) {
        setTimeMachineData({
          appTime: timeData.appTime,
          isActive: !!timeData.isOverridden,
          realTime: timeData.systemTime,
          autoApproveDistributions: timeMachineData.autoApproveDistributions || false
        })
      }
    } catch (e) {
      logger.error('Failed to load time machine data', e)
    }
  }

  // Clear all caches
  const clearAllCaches = () => {
    clearCache(CACHE_KEY_USERS)
    clearCache(CACHE_KEY_WITHDRAWALS)
    clearCache(CACHE_KEY_PAYOUTS)
    clearCache(CACHE_KEY_ACTIVITY)
    clearCache(CACHE_KEY_TRANSACTIONS)
  }

  /**
   * Pending payouts - distributions that need processing or reprocessing
   */
  const enrichedPendingPayouts = useMemo(() => {
    if (!allTransactions || allTransactions.length === 0) return []
    
    // Build lookup maps for faster matching
    const userMap = new Map()
    const investmentMap = new Map()
    users.forEach(user => {
      // Map by full ID and numeric part
      const id = user.id?.toString() || ''
      userMap.set(id, user)
      const numericId = id.match(/\d+$/)?.[0]
      if (numericId) userMap.set(numericId, user)
      
      // Build investment map
      ;(user.investments || []).forEach(inv => {
        const invId = inv.id?.toString() || ''
        investmentMap.set(invId, { ...inv, user })
        const numericInvId = invId.match(/\d+$/)?.[0]
        if (numericInvId) investmentMap.set(numericInvId, { ...inv, user })
      })
    })
    
    // Find which investments already have a submitted/completed payout (don't need action)
    const processedInvestments = new Set()
    allTransactions.forEach(tx => {
      const type = tx.type?.toLowerCase() || ''
      const status = tx.status?.toLowerCase() || ''
      if ((type === 'distribution' || type === 'monthly_distribution') &&
          (status === 'submitted' || status === 'completed' || status === 'cleared' || status === 'received')) {
        processedInvestments.add(tx.investmentId?.toString())
      }
    })
    
    // Filter for pending/failed/rejected distributions (skip if investment already processed)
    const actionablePayouts = allTransactions.filter(tx => {
      const type = tx.type?.toLowerCase() || ''
      const status = tx.status?.toLowerCase() || ''
      const isDistribution = type === 'distribution' || type === 'monthly_distribution'
      const needsAction = status === 'pending' || status === 'failed' || status === 'rejected'
      if (!isDistribution || !needsAction) return false
      
      // If this investment already has a submitted payout, don't show the old rejected one
      if (processedInvestments.has(tx.investmentId?.toString())) return false
      
      return true
    })
    
    // Enrich with user and investment data
    return actionablePayouts.map(tx => {
      const txUserId = tx.userId?.toString() || ''
      const txInvId = tx.investmentId?.toString() || ''
      
      // Find user (try full ID then numeric)
      let user = userMap.get(txUserId) || userMap.get(txUserId.match(/\d+$/)?.[0])
      
      // Find investment (try full ID then numeric)
      const investment = investmentMap.get(txInvId) || investmentMap.get(txInvId.match(/\d+$/)?.[0])
      
      // If no user found via userId, try via investment
      if (!user && investment?.user) user = investment.user
      
      return {
        ...tx,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : `User #${txUserId}`,
        userEmail: user?.email || null,
        bankConnected: hasUserBankConnected(user),
        investmentAmount: investment?.amount || null,
        investmentTerm: investment?.lockupPeriod || investment?.term || null,
        paymentFrequency: investment?.paymentFrequency || null
      }
    })
  }, [allTransactions, users])

  /**
   * Build a map of investmentId -> paymentFrequency for filtering
   * Only monthly investments have actual payouts to track
   */
  const investmentPaymentFrequencyMap = useMemo(() => {
    const map = new Map()
    users.forEach(user => {
      const investments = user.investments || []
      investments.forEach(inv => {
        if (inv.id && inv.paymentFrequency) {
          map.set(inv.id.toString(), inv.paymentFrequency)
        }
      })
    })
    return map
  }, [users])

  /**
   * Monitored payouts - distributions that have been processed (not pending)
   * Only tracks monthly payout investments (compounding investments don't have payouts)
   * Auto-hides after 3 days of being in completed/cleared/received status
   */
  const monitoredPayouts = useMemo(() => {
    if (!allTransactions || allTransactions.length === 0) return []
    
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
    const now = Date.now()
    
    // Filter for distribution transactions that are NOT pending
    // Only include monthly payout investments (not compounding)
    const nonPendingDistributions = allTransactions.filter(tx => {
      const type = tx.type?.toLowerCase() || ''
      const isDistribution = type === 'distribution' || type === 'monthly_distribution'
      const isPending = tx.status?.toLowerCase() === 'pending'
      const isFailed = tx.status?.toLowerCase() === 'failed' || tx.status?.toLowerCase() === 'rejected'
      
      if (!isDistribution || isPending || isFailed) return false
      
      // Only include payouts from monthly investments (not compounding)
      const investmentId = tx.investmentId?.toString()
      const paymentFrequency = investmentPaymentFrequencyMap.get(investmentId)
      if (paymentFrequency === 'compounding') {
        return false // Skip compounding investments - they don't have actual payouts
      }
      
      // Auto-hide cleared/completed payouts after 3 days
      const statusLower = tx.status?.toLowerCase() || ''
      const isCleared = statusLower === 'completed' || statusLower === 'cleared' || statusLower === 'received'
      if (isCleared) {
        const txDate = tx.date ? new Date(tx.date).getTime() : 0
        if (txDate && (now - txDate > THREE_DAYS_MS)) {
          return false // Auto-hide old cleared payouts
        }
      }
      
      return true
    })
    
    // Create a lookup map for users by both numeric and string IDs
    const userMap = new Map()
    users.forEach(user => {
      const userIdStr = user.id.toString()
      userMap.set(userIdStr, user)
      // Also map by numeric part (e.g., "USR-1025" -> "1025")
      const numericMatch = userIdStr.match(/\d+$/)
      if (numericMatch) {
        userMap.set(numericMatch[0], user)
      }
    })
    
    // Enrich with user data and sort by date (most recent first)
    return nonPendingDistributions
      .map(tx => {
        const txUserId = tx.userId?.toString() || ''
        let user = userMap.get(txUserId)
        if (!user) {
          const numericMatch = txUserId.match(/\d+$/)
          if (numericMatch) {
            user = userMap.get(numericMatch[0])
          }
        }
        
        return {
          ...tx,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User #${txUserId}` : `User #${txUserId}`,
          userEmail: user?.email || null
        }
      })
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA
      })
  }, [allTransactions, users, investmentPaymentFrequencyMap])

  /**
   * Process ACHQ payment for a pending payout transaction
   * @param {number} transactionId - The transaction ID to process
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  const processAchqPayment = async (transactionId) => {
    try {
      setProcessingPayoutId(transactionId)
      
      const result = await apiClient.processAchqPayment(transactionId)
      
      if (result.success) {
        logger.log(`✓ ACHQ payment processed for transaction ${transactionId}`)
        // Refresh transactions to update both pending payouts and payout status lists
        await loadAllTransactions(true)
        return { success: true, data: result }
      } else {
        logger.error(`ACHQ payment failed for transaction ${transactionId}:`, result.error)
        return { success: false, error: result.error }
      }
    } catch (e) {
      logger.error('Failed to process ACHQ payment', e)
      return { success: false, error: e.message || 'Failed to process payment' }
    } finally {
      setProcessingPayoutId(null)
    }
  }

  return {
    currentUser,
    users,
    isLoading,
    withdrawals,
    isLoadingWithdrawals,
    pendingPayouts: enrichedPendingPayouts,
    isLoadingPayouts,
    processingPayoutId,
    activityEvents,
    isLoadingActivity,
    allTransactions,
    isLoadingTransactions,
    monitoredPayouts,
    timeMachineData,
    setTimeMachineData,
    refreshUsers: loadUsers,
    refreshWithdrawals: loadWithdrawals,
    refreshPayouts: loadPendingPayouts,
    refreshActivity: loadActivityEvents,
    refreshTransactions: loadAllTransactions,
    refreshTimeMachine: loadTimeMachine,
    processAchqPayment
  }
}

