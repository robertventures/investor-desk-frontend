import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../../lib/apiClient'
import { fetchWithCsrf } from '../../../lib/csrfClient'
import logger from '@/lib/logger'

// Cache configuration
const CACHE_DURATION = 30000 // 30 seconds
const CACHE_KEY_USERS = 'admin_users_cache'
const CACHE_KEY_WITHDRAWALS = 'admin_withdrawals_cache'
const CACHE_KEY_PAYOUTS = 'admin_payouts_cache'
const CACHE_KEY_ACTIVITY = 'admin_activity_cache'

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
              router.push('/sign-in')
              return
            }
          } else {
            // No tokens available, redirect to sign-in
            router.push('/sign-in')
            return
          }
        }

        // Use getCurrentUser() instead of getUser(userId) - it properly handles token refresh
        const meData = await apiClient.getCurrentUser()
        if (!meData || !meData.success || !meData.user) {
          logger.error('Failed to get current user:', meData)
          router.push('/sign-in')
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
          loadTimeMachine()
        ])
      } catch (e) {
        logger.error('Failed to load admin data', e)
        // If it's an authentication error, redirect to sign-in
        if (e.message && (e.message.includes('401') || e.message.includes('Session expired') || e.message.includes('Unauthorized'))) {
          router.push('/sign-in')
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
  }

  /**
   * Enrich pending payouts with user data (name, email)
   * Joins payouts with users based on userId
   */
  const enrichedPendingPayouts = useMemo(() => {
    if (!pendingPayouts || pendingPayouts.length === 0) return []
    if (!users || users.length === 0) return pendingPayouts
    
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
    
    return pendingPayouts.map(payout => {
      const payoutUserId = payout.userId?.toString() || ''
      // Try to find user by exact match or numeric part
      let user = userMap.get(payoutUserId)
      if (!user) {
        const numericMatch = payoutUserId.match(/\d+$/)
        if (numericMatch) {
          user = userMap.get(numericMatch[0])
        }
      }
      
      return {
        ...payout,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User #${payoutUserId}` : `User #${payoutUserId}`,
        userEmail: user?.email || null,
        bankConnected: user?.onboardingStatus?.bankConnected || false
      }
    })
  }, [pendingPayouts, users])

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
        // Refresh payouts list to get updated status
        await loadPendingPayouts(true)
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
    timeMachineData,
    setTimeMachineData,
    refreshUsers: loadUsers,
    refreshWithdrawals: loadWithdrawals,
    refreshPayouts: loadPendingPayouts,
    refreshActivity: loadActivityEvents,
    refreshTimeMachine: loadTimeMachine,
    processAchqPayment
  }
}

