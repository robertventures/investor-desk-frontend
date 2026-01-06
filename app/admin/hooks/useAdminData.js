import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../../lib/apiClient'
import { adminService } from '../../../lib/services/admin'
import logger from '@/lib/logger'

// Cache configuration
const CACHE_DURATION = 30000 // 30 seconds
const CACHE_KEY_USERS = 'admin_users_cache'
const CACHE_KEY_WITHDRAWALS = 'admin_withdrawals_cache'
const CACHE_KEY_PAYOUTS = 'admin_payouts_cache'
const CACHE_KEY_ACTIVITY = 'admin_activity_cache'
const CACHE_KEY_TRANSACTIONS = 'admin_transactions_cache'
const CACHE_KEY_PAYMENT_METHODS = 'admin_payment_methods_cache'
const CACHE_KEY_DISCONNECTED_BANKS = 'admin_disconnected_banks_cache'

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
  
  // Payment methods state for ACH connection status tracking
  const [paymentMethodsByUser, setPaymentMethodsByUser] = useState({})
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false)
  
  // Disconnected bank users - users who cannot receive payments (from dedicated backend endpoint)
  const [disconnectedBankUsers, setDisconnectedBankUsers] = useState([])
  const [isLoadingDisconnectedBanks, setIsLoadingDisconnectedBanks] = useState(false)
  
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
        // Note: loadPendingPayouts removed - we now use loadActivityEvents for pending payouts
        await Promise.all([
          loadUsers(),
          loadWithdrawals(),
          loadActivityEvents(),
          loadAllTransactions(),
          loadTimeMachine(),
          loadDisconnectedBankUsers()
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
      // Fetch all activity events - this API correctly reflects real-time status updates
      // Note: API limit is 100 per page, but the service handles pagination automatically
      const data = await apiClient.getAdminActivityEvents({ size: 100 })
      if (data && data.success) {
        // Extract items from paginated response
        const rawEvents = data.items || data.events || []
        
        // Filter for distribution events and transform to flat format
        const events = rawEvents
          .filter(event => {
            const type = (event.activity_type || event.type || event.activityType || '').toLowerCase()
            return type === 'distribution' || type === 'monthly_distribution'
          })
          .map(event => {
            // Extract amount from nested structures
            let amount = event.amount
            if (amount === undefined || amount === null) {
              amount = event.transaction?.amount ?? event.eventMetadata?.amount ?? null
            }
            if (typeof amount === 'string') {
              amount = parseFloat(amount)
            }
            
            // Extract status (prefer transaction status over activity status)
            const status = event.transaction?.status || event.status || null
            
            // Extract date fields
            const transactionDate = event.transaction?.transaction_date || event.transaction_date || null
            const createdAt = event.transaction?.created_at || event.created_at || event.createdAt || null
            const submittedAt = event.transaction?.submitted_at || event.submitted_at || event.submittedAt || null
            const receivedAt = event.transaction?.received_at || event.received_at || event.receivedAt || null
            
            // Get the actual transaction ID (integer) for API calls
            // The event.id is a string humanId, but API endpoints need the numeric transaction.id
            const transactionId = event.transaction?.id || event.transaction_id || null
            
            return {
              id: transactionId,
              type: event.activity_type || event.type || event.activityType || 'distribution',
              amount: amount,
              status: status,
              date: transactionDate || createdAt || event.date,
              userId: event.user_id || event.userId,
              investmentId: event.investment_id || event.investmentId,
              description: event.transaction?.description || event.description || null,
              humanId: event.id,
              createdAt: createdAt,
              submittedAt: submittedAt,
              receivedAt: receivedAt,
              rawData: event
            }
          })
        
        logger.log(`✓ Loaded ${events.length} distribution activity events from ${rawEvents.length} total`)
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
      // Time machine is an optional feature - 404 means it's not available in this environment
      // Only log as info, not error, since this is expected in production
      if (e.statusCode === 404) {
        logger.info('[useAdminData] Time machine feature not available in this environment')
      } else {
        logger.error('Failed to load time machine data', e)
      }
    }
  }

  // Clear all caches
  const clearAllCaches = () => {
    clearCache(CACHE_KEY_USERS)
    clearCache(CACHE_KEY_WITHDRAWALS)
    clearCache(CACHE_KEY_PAYOUTS)
    clearCache(CACHE_KEY_ACTIVITY)
    clearCache(CACHE_KEY_TRANSACTIONS)
    clearCache(CACHE_KEY_PAYMENT_METHODS)
    clearCache(CACHE_KEY_DISCONNECTED_BANKS)
  }

  /**
   * Load payment methods for users who have bank accounts connected
   * This fetches the connection_status to determine ACH health
   */
  const loadPaymentMethods = async (usersList, forceRefresh = false) => {
    try {
      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedData(CACHE_KEY_PAYMENT_METHODS)
        if (cached) {
          logger.log('📦 Using cached payment methods data')
          setPaymentMethodsByUser(cached)
          return cached
        }
      }
      
      if (forceRefresh) {
        clearCache(CACHE_KEY_PAYMENT_METHODS)
      }
      
      // Filter for users who have bank accounts connected
      const usersWithBanks = usersList.filter(user => hasUserBankConnected(user))
      
      if (usersWithBanks.length === 0) {
        logger.log('No users with bank accounts to fetch payment methods for')
        return {}
      }
      
      logger.log(`Fetching payment methods for ${usersWithBanks.length} users with bank accounts...`)
      setIsLoadingPaymentMethods(true)
      
      // Batch fetch payment methods in parallel (limit concurrency to avoid overwhelming API)
      const BATCH_SIZE = 10
      const results = {}
      
      for (let i = 0; i < usersWithBanks.length; i += BATCH_SIZE) {
        const batch = usersWithBanks.slice(i, i + BATCH_SIZE)
        const batchPromises = batch.map(async (user) => {
          try {
            const numericId = user.id.toString().replace(/\D/g, '')
            const response = await adminService.getUserPaymentMethods(numericId)
            if (response && response.success) {
              return { userId: user.id.toString(), paymentMethods: response.payment_methods || [] }
            }
            return { userId: user.id.toString(), paymentMethods: [] }
          } catch (err) {
            logger.error(`Failed to fetch payment methods for user ${user.id}:`, err)
            return { userId: user.id.toString(), paymentMethods: [], error: err.message }
          }
        })
        
        const batchResults = await Promise.all(batchPromises)
        batchResults.forEach(result => {
          results[result.userId] = result
        })
      }
      
      logger.log(`✓ Loaded payment methods for ${Object.keys(results).length} users`)
      setPaymentMethodsByUser(results)
      setCachedData(CACHE_KEY_PAYMENT_METHODS, results)
      
      return results
    } catch (e) {
      logger.error('Failed to load payment methods', e)
      return {}
    } finally {
      setIsLoadingPaymentMethods(false)
    }
  }

  /**
   * Load disconnected bank users from the dedicated backend endpoint.
   * This is the authoritative source for users who cannot receive payments.
   * The backend determines which users have broken bank connections that prevent payments.
   */
  const loadDisconnectedBankUsers = async (forceRefresh = false) => {
    try {
      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedData(CACHE_KEY_DISCONNECTED_BANKS)
        if (cached) {
          logger.log('📦 Using cached disconnected banks data')
          setDisconnectedBankUsers(cached)
          return cached
        }
      }
      
      if (forceRefresh) {
        clearCache(CACHE_KEY_DISCONNECTED_BANKS)
      }
      
      setIsLoadingDisconnectedBanks(true)
      
      const response = await adminService.getDisconnectedPaymentMethods()
      
      if (response.success) {
        // Group by user_id since a user might have multiple disconnected payment methods
        const userMap = new Map()
        
        response.disconnectedPaymentMethods.forEach(pm => {
          const userId = pm.user_id?.toString()
          if (!userId) return
          
          if (!userMap.has(userId)) {
            userMap.set(userId, {
              id: userId,
              email: null, // Will be enriched if user data is available
              firstName: null,
              lastName: null,
              connectionStatus: pm.connection_status || 'disconnected',
              connectionErrorCode: pm.connection_error_code,
              connectionCheckedAt: pm.connection_checked_at,
              disconnectedMethods: []
            })
          }
          
          userMap.get(userId).disconnectedMethods.push({
            id: pm.id,
            displayName: pm.display_name,
            bankName: pm.bank_name,
            accountType: pm.account_type,
            last4: pm.last4,
            creationSource: pm.creation_source,
            connectionStatus: pm.connection_status,
            connectionErrorCode: pm.connection_error_code
          })
        })
        
        const disconnectedList = Array.from(userMap.values())
        logger.log(`✓ Loaded ${disconnectedList.length} users with disconnected banks`)
        
        setDisconnectedBankUsers(disconnectedList)
        setCachedData(CACHE_KEY_DISCONNECTED_BANKS, disconnectedList)
        
        return disconnectedList
      } else {
        logger.error('Failed to load disconnected banks:', response.error)
        return []
      }
    } catch (e) {
      logger.error('Failed to load disconnected bank users', e)
      return []
    } finally {
      setIsLoadingDisconnectedBanks(false)
    }
  }

  /**
   * Pending payouts - distributions that need processing or reprocessing
   * Uses Activity Events API which correctly reflects real-time status updates
   */
  const enrichedPendingPayouts = useMemo(() => {
    if (!activityEvents || activityEvents.length === 0) return []
    
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
    
    // Filter for pending or rejected distributions
    // Activity Events API correctly shows current status - no complex matching needed
    const actionablePayouts = activityEvents.filter(event => {
      const status = event.status?.toLowerCase() || ''
      return status === 'pending' || status === 'rejected'
    })
    
    // Enrich with user and investment data
    return actionablePayouts.map(event => {
      const eventUserId = event.userId?.toString() || ''
      const eventInvId = event.investmentId?.toString() || ''
      
      // Find user (try full ID then numeric)
      let user = userMap.get(eventUserId) || userMap.get(eventUserId.match(/\d+$/)?.[0])
      
      // Find investment (try full ID then numeric)
      const investment = investmentMap.get(eventInvId) || investmentMap.get(eventInvId.match(/\d+$/)?.[0])
      
      // If no user found via userId, try via investment
      if (!user && investment?.user) user = investment.user
      
      return {
        ...event,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : `User #${eventUserId}`,
        userEmail: user?.email || null,
        bankConnected: hasUserBankConnected(user),
        investmentAmount: investment?.amount || null,
        investmentTerm: investment?.lockupPeriod || investment?.term || null,
        paymentFrequency: investment?.paymentFrequency || null
      }
    })
  }, [activityEvents, users])

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
      
      // Auto-hide cleared/completed payouts after 3 days from when they were received
      const statusLower = tx.status?.toLowerCase() || ''
      const isCleared = statusLower === 'completed' || statusLower === 'cleared' || statusLower === 'received'
      if (isCleared) {
        const receivedDate = tx.receivedAt ? new Date(tx.receivedAt).getTime() : 0
        if (receivedDate && (now - receivedDate > THREE_DAYS_MS)) {
          return false // Auto-hide payouts 3 days after they were received
        }
      }
      
      return true
    })
    
    // Create lookup maps for users and investments by both numeric and string IDs
    const userMap = new Map()
    const investmentMap = new Map()
    users.forEach(user => {
      const userIdStr = user.id.toString()
      userMap.set(userIdStr, user)
      // Also map by numeric part (e.g., "USR-1025" -> "1025")
      const numericMatch = userIdStr.match(/\d+$/)
      if (numericMatch) {
        userMap.set(numericMatch[0], user)
      }
      
      // Build investment map for looking up investment amounts
      ;(user.investments || []).forEach(inv => {
        const invId = inv.id?.toString() || ''
        investmentMap.set(invId, inv)
        const numericInvId = invId.match(/\d+$/)?.[0]
        if (numericInvId) investmentMap.set(numericInvId, inv)
      })
    })
    
    // Enrich with user and investment data, sort by date (most recent first)
    return nonPendingDistributions
      .map(tx => {
        const txUserId = tx.userId?.toString() || ''
        const txInvId = tx.investmentId?.toString() || ''
        
        let user = userMap.get(txUserId)
        if (!user) {
          const numericMatch = txUserId.match(/\d+$/)
          if (numericMatch) {
            user = userMap.get(numericMatch[0])
          }
        }
        
        // Find investment (try full ID then numeric)
        const investment = investmentMap.get(txInvId) || investmentMap.get(txInvId.match(/\d+$/)?.[0])
        
        return {
          ...tx,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User #${txUserId}` : `User #${txUserId}`,
          userEmail: user?.email || null,
          investmentAmount: investment?.amount || null
        }
      })
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA
      })
  }, [allTransactions, users, investmentPaymentFrequencyMap])

  /**
   * Enrich disconnected bank users with user data (email, name) from the users list
   * The backend endpoint only returns payment method data, not full user details
   */
  const enrichedDisconnectedBankUsers = useMemo(() => {
    if (!disconnectedBankUsers || disconnectedBankUsers.length === 0) {
      return []
    }
    
    // Build user lookup map
    const userMap = new Map()
    users.forEach(user => {
      const id = user.id?.toString() || ''
      userMap.set(id, user)
      // Also map by numeric part (e.g., "USR-1025" -> "1025")
      const numericId = id.match(/\d+$/)?.[0]
      if (numericId) userMap.set(numericId, user)
    })
    
    return disconnectedBankUsers.map(disconnected => {
      const user = userMap.get(disconnected.id) || userMap.get(disconnected.id?.match(/\d+$/)?.[0])
      
      return {
        ...disconnected,
        email: user?.email || disconnected.email,
        firstName: user?.firstName || disconnected.firstName,
        lastName: user?.lastName || disconnected.lastName
      }
    })
  }, [disconnectedBankUsers, users])

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
        // Refresh activity events (for pending payouts) and transactions (for payout status)
        await Promise.all([
          loadActivityEvents(true),
          loadAllTransactions(true)
        ])
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
    // Payment methods / ACH status (for accounts list filtering)
    paymentMethodsByUser,
    isLoadingPaymentMethods,
    loadPaymentMethods,
    // Disconnected bank users (cannot receive payments)
    disconnectedBankUsers: enrichedDisconnectedBankUsers,
    isLoadingDisconnectedBanks,
    refreshDisconnectedBanks: loadDisconnectedBankUsers,
    // Refresh functions
    refreshUsers: loadUsers,
    refreshWithdrawals: loadWithdrawals,
    refreshPayouts: loadPendingPayouts,
    refreshActivity: loadActivityEvents,
    refreshTransactions: loadAllTransactions,
    refreshTimeMachine: loadTimeMachine,
    processAchqPayment
  }
}

