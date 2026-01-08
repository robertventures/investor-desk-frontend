import ApiService from './base'
import logger from '../logger'

class AdminService extends ApiService {
  /**
   * Get all users (admin only)
   */
  async getAllUsers(params = {}) {
    const queryParams = new URLSearchParams()
    
    // Add pagination params - backend max is 100
    queryParams.append('page', params.page || '1')
    queryParams.append('size', params.size || '100')
    
    // Add optional filters
    if (params.is_verified !== undefined) queryParams.append('is_verified', params.is_verified)
    if (params.account_type) queryParams.append('account_type', params.account_type)
    if (params.search) queryParams.append('search', params.search)
    
    const data = await this.request(`/api/admin/users?${queryParams.toString()}`, {
      method: 'GET',
    })
    
    const users = Array.isArray(data) ? data : (data.items || data.users || [])
    const total = data.total || 0
    const pages = data.pages || 1
    const currentPage = data.page || 1
    
    if (pages > 1 && currentPage === 1 && !params.page) {
      logger.info(`[AdminService] Fetching ${pages - 1} more pages of users...`)
      const remainingPages = []
      for (let page = 2; page <= pages; page++) {
        remainingPages.push(this.getAllUsers({ ...params, page: page.toString() }))
      }
      
      const remainingResults = await Promise.all(remainingPages)
      const allUsers = [
        ...users,
        ...remainingResults.flatMap(result => result.users || [])
      ]
      
      return {
        success: true,
        users: allUsers,
        total: total,
        page: 1,
        pages: pages
      }
    }
    
    return {
      success: true,
      users: users,
      total: total,
      page: currentPage,
      pages: pages
    }
  }

  /**
   * Get specific user by ID (admin only)
   * Uses getAllUsers with search filter since explicit GET by ID is not exposed
   */
  async getUser(userId) {
    // If we have a numeric ID, try searching by it
    const searchParams = { search: userId.toString() }
    
    const result = await this.getAllUsers(searchParams)
    
    if (result.success && result.users) {
      // Find exact match since search might be fuzzy
      const user = result.users.find(u => {
        // Exact string match
        if (u.id.toString() === userId.toString()) {
          return true
        }
        
        // Try matching trailing digits (e.g., "USR-123" matches "123")
        const userIdDigits = u.id.toString().match(/\d+$/)?.[0]
        const searchIdDigits = userId.toString().match(/\d+$/)?.[0]
        
        // Only compare if BOTH have trailing digits to avoid false matches
        // when match() returns null (undefined === undefined would be true)
        if (userIdDigits && searchIdDigits) {
          return userIdDigits === searchIdDigits
        }
        
        return false
      })
      
      if (user) {
        return { success: true, user }
      }
    }
    
    return { success: false, error: 'User not found' }
  }

  /**
   * Update user (admin only)
   * Updates user fields: firstName, lastName, email, ssn
   */
  async updateUser(userId, userData) {
    try {
      const numericId = userId.toString().replace(/\D/g, '')
      
      const data = await this.request(`/api/admin/users/${numericId}`, {
        method: 'PATCH',
        body: JSON.stringify(userData),
      })
      
      return {
        success: true,
        user: data,
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] Update user failed:', error)
      
      return {
        success: false,
        error: error.message || 'Failed to update user',
        ...error
      }
    }
  }

  /**
   * Get all activity events (admin only)
   */
  async getAdminActivityEvents(params = {}) {
    const queryParams = new URLSearchParams()
    
    queryParams.append('page', params.page || '1')
    queryParams.append('size', params.size || '100')
    
    if (params.user_id !== undefined && params.user_id !== null) {
      queryParams.append('user_id', params.user_id.toString())
    }
    if (params.investment_id !== undefined && params.investment_id !== null) {
      queryParams.append('investment_id', params.investment_id.toString())
    }
    if (params.activity_type) queryParams.append('activity_type', params.activity_type)
    if (params.status) queryParams.append('status', params.status)
    if (params.search) queryParams.append('search', params.search)
    if (params.order_by) queryParams.append('order_by', params.order_by)
    
    const data = await this.request(`/api/admin/activity/events?${queryParams.toString()}`, {
      method: 'GET',
    })
    
    const events = Array.isArray(data) ? data : (data.items || data.events || [])
    const total = data.total || 0
    const pages = data.pages || 1
    const currentPage = data.page || 1
    
    if (pages > 1 && currentPage === 1 && !params.page) {
      logger.info(`[AdminService] Fetching ${pages - 1} more pages of activity events...`)
      const remainingPages = []
      for (let page = 2; page <= pages; page++) {
        remainingPages.push(this.getAdminActivityEvents({ ...params, page: page.toString() }))
      }
      
      const remainingResults = await Promise.all(remainingPages)
      const allEvents = [
        ...events,
        ...remainingResults.flatMap(result => result.events || [])
      ]
      
      return {
        success: true,
        items: allEvents,
        events: allEvents,
        total: total,
        page: 1,
        pages: pages
      }
    }
    
    return {
      success: true,
      items: events,
      events: events,
      total: total,
      page: currentPage,
      pages: pages
    }
  }

  /**
   * Get activity events for a specific user (admin only)
   */
  async getUserActivityEvents(userId) {
    const numericId = userId.toString().replace(/\D/g, '')
    
    return this.getAdminActivityEvents({ 
      user_id: parseInt(numericId, 10),
      size: 100
    })
  }

  /**
   * Get all investments (admin only)
   */
  async getAdminInvestments(params = {}) {
    const queryParams = new URLSearchParams()
    
    queryParams.append('page', params.page || '1')
    queryParams.append('size', params.size || '100')
    
    if (params.status) queryParams.append('status', params.status)
    if (params.user_id) {
      // Convert to numeric ID (strip non-numeric characters like "USR-")
      const numericId = params.user_id.toString().replace(/\D/g, '')
      queryParams.append('user_id', numericId)
    }
    if (params.search) queryParams.append('search', params.search)
    
    logger.debug(`[AdminService] Fetching investments from: /api/admin/investments?${queryParams.toString()}`)
    
    const data = await this.request(`/api/admin/investments?${queryParams.toString()}`, {
      method: 'GET',
    })
    
    const investments = Array.isArray(data) ? data : (data.items || data.investments || [])
    const total = data.total || 0
    const pages = data.pages || 1
    const currentPage = data.page || 1
    
    if (pages > 1 && currentPage === 1 && !params.page) {
      logger.info(`[AdminService] Fetching ${pages - 1} more pages of investments...`)
      const remainingPages = []
      for (let page = 2; page <= pages; page++) {
        remainingPages.push(this.getAdminInvestments({ ...params, page: page.toString() }))
      }
      
      const remainingResults = await Promise.all(remainingPages)
      const allInvestments = [
        ...investments,
        ...remainingResults.flatMap(result => result.investments || [])
      ]
      
      return {
        success: true,
        investments: allInvestments,
        total: total,
        page: 1,
        pages: pages
      }
    }
    
    return {
      success: true,
      investments: investments,
      total: total,
      page: currentPage,
      pages: pages
    }
  }

  /**
   * Approve investment (admin only)
   */
  async approveInvestment(investmentId) {
    const data = await this.request(`/api/admin/investments/${investmentId}/approve`, {
      method: 'POST',
    })
    
    return {
      success: true,
      investment: data,
      ...data
    }
  }

  /**
   * Reject investment (admin only)
   */
  async rejectInvestment(investmentId, reason = null) {
    const data = await this.request(`/api/admin/investments/${investmentId}/reject`, {
      method: 'POST',
      ...(reason && { body: JSON.stringify({ reason }) })
    })
    
    return {
      success: true,
      investment: data,
      ...data
    }
  }

  /**
   * Get time machine status
   */
  async getAppTime() {
    return this.request('/api/admin/time-machine/status', {
      method: 'GET',
    })
  }

  /**
   * Set time machine override
   */
  async setAppTime(appTime) {
    return this.request('/api/admin/time-machine/set', {
      method: 'POST',
      body: JSON.stringify({ appTime }),
    })
  }

  /**
   * Reset time machine to current time
   */
  async resetAppTime() {
    return this.request('/api/admin/time-machine/reset', {
      method: 'POST',
    })
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId) {
    try {
      const numericId = userId.toString().replace(/\D/g, '')
      
      const data = await this.request(`/api/admin/users/${numericId}`, {
        method: 'DELETE',
      })
      
      return {
        success: true,
        message: data.message || 'User deleted successfully',
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] Delete user failed:', error)
      
      return {
        success: false,
        error: error.message || 'Failed to delete user',
        partialSuccess: false
      }
    }
  }

  /**
   * Get all admin withdrawals
   */
  async getAdminWithdrawals(params = {}) {
    try {
      const queryParams = new URLSearchParams()
      
      queryParams.append('page', params.page || '1')
      queryParams.append('size', params.size || '100')
      
      if (params.status) queryParams.append('status', params.status)
      if (params.user_id) queryParams.append('user_id', params.user_id)
      
      const data = await this.request(`/api/admin/withdrawals?${queryParams.toString()}`, {
        method: 'GET',
      })
      
      const withdrawals = Array.isArray(data) ? data : (data.items || data.withdrawals || [])
      const total = data.total || withdrawals.length
      const pages = data.pages || 1
      const currentPage = data.page || 1
      
      // Transform backend response to match UI expectations
      const transformedWithdrawals = withdrawals.map(w => ({
        id: w.id,
        userId: w.userId || w.user_id,
        userEmail: w.userEmail || w.user_email,
        investmentId: w.investmentId || w.investment_id,
        amount: w.amount,
        quotedAmount: w.quotedAmount || w.quoted_amount,
        quotedEarnings: w.quotedEarnings || w.quoted_earnings,
        finalAmount: w.finalAmount || w.final_amount,
        finalEarnings: w.finalEarnings || w.final_earnings,
        status: w.status,
        requestedAt: w.requestedAt || w.requested_at || w.createdAt || w.created_at,
        payoutDueBy: w.payoutDueBy || w.payout_due_by,
        approvedAt: w.approvedAt || w.approved_at,
        rejectedAt: w.rejectedAt || w.rejected_at,
      }))
      
      // Fetch remaining pages if needed
      if (pages > 1 && currentPage === 1 && !params.page) {
        logger.info(`[AdminService] Fetching ${pages - 1} more pages of withdrawals...`)
        const remainingPages = []
        for (let page = 2; page <= pages; page++) {
          remainingPages.push(this.getAdminWithdrawals({ ...params, page: page.toString() }))
        }
        
        const remainingResults = await Promise.all(remainingPages)
        const allWithdrawals = [
          ...transformedWithdrawals,
          ...remainingResults.flatMap(result => result.withdrawals || [])
        ]
        
        return {
          success: true,
          withdrawals: allWithdrawals,
          total: total,
          page: 1,
          pages: pages
        }
      }
      
      return {
        success: true,
        withdrawals: transformedWithdrawals,
        total: total,
        page: currentPage,
        pages: pages
      }
    } catch (error) {
      logger.error('[AdminService] Get withdrawals failed:', error)
      return {
        success: false,
        withdrawals: [],
        total: 0,
        page: 1,
        pages: 1,
        error: error.message
      }
    }
  }

  /**
   * Get a specific withdrawal by ID (admin only)
   */
  async getWithdrawal(withdrawalId) {
    try {
      const data = await this.request(`/api/admin/withdrawals/${withdrawalId}`, {
        method: 'GET',
      })
      
      return {
        success: true,
        withdrawal: data,
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] Get withdrawal failed:', error)
      return {
        success: false,
        error: error.message || 'Failed to get withdrawal'
      }
    }
  }

  /**
   * Approve/complete a withdrawal (admin only)
   */
  async approveWithdrawal(withdrawalId) {
    try {
      const data = await this.request(`/api/admin/withdrawals/${withdrawalId}/approve`, {
        method: 'POST',
      })
      
      return {
        success: true,
        withdrawal: data,
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] Approve withdrawal failed:', error)
      return {
        success: false,
        error: error.message || 'Failed to approve withdrawal'
      }
    }
  }

  /**
   * Reject a withdrawal (admin only)
   * This restores the investment to its normal active state
   */
  async rejectWithdrawal(withdrawalId) {
    try {
      const data = await this.request(`/api/admin/withdrawals/${withdrawalId}/reject`, {
        method: 'POST',
      })
      
      return {
        success: true,
        withdrawal: data,
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] Reject withdrawal failed:', error)
      return {
        success: false,
        error: error.message || 'Failed to reject withdrawal'
      }
    }
  }

  /**
   * Get pending payouts (distribution transactions with pending/failed/rejected status)
   * Fetches multiple statuses in parallel and merges them since backend doesn't support multi-value query params
   */
  async getPendingPayouts(params = {}) {
    // We need to fetch these statuses separately because the backend doesn't support multiple status params
    const statuses = ['pending', 'failed', 'rejected']
    
    try {
      // Create a request for each status
      const requests = statuses.map(status => {
        const queryParams = new URLSearchParams()
        queryParams.append('status', status)
        queryParams.append('transaction_type', 'distribution')
        queryParams.append('page', params.page || '1')
        queryParams.append('size', params.size || '50')
        
        return this.request(`/api/admin/transactions?${queryParams.toString()}`, {
          method: 'GET',
        })
      })
      
      // Execute all requests in parallel
      const responses = await Promise.all(requests)
      
      // Merge results
      let allItems = []
      let totalCount = 0
      let maxPages = 1
      let currentPage = 1
      
      responses.forEach(data => {
        const items = data.items || []
        allItems = [...allItems, ...items]
        totalCount += (data.total || 0)
        maxPages = Math.max(maxPages, data.pages || 1)
        currentPage = data.page || 1 // Taking the last one, effectively 1
      })
      
      // Transform backend response to match UI expectations
      // Handle both snake_case and camelCase field names from backend
      const pendingPayouts = allItems.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        status: tx.status,
        date: tx.transaction_date || tx.transactionDate,
        userId: tx.userId || tx.user_id,
        userName: tx.userName || tx.user_name || null,
        userEmail: tx.userEmail || tx.user_email || null,
        investmentId: tx.investmentId || tx.investment_id,
        payoutBankNickname: tx.payoutBankNickname || tx.payout_bank_nickname || tx.bankNickname || null,
        failureReason: tx.failureReason || tx.failure_reason || null,
        description: tx.description,
        humanId: tx.human_id || tx.humanId,
        createdAt: tx.created_at || tx.createdAt,
        submittedAt: tx.submitted_at || tx.submittedAt,
        receivedAt: tx.received_at || tx.receivedAt,
      }))
      
      return {
        success: true,
        pendingPayouts,
        total: totalCount,
        page: currentPage,
        pages: maxPages
      }
    } catch (error) {
      logger.error('[AdminService] Get pending payouts failed:', error)
      return {
        success: false,
        pendingPayouts: [],
        total: 0,
        page: 1,
        pages: 1,
        error: error.message
      }
    }
  }

  /**
   * Get all transactions (distributions, contributions, etc.)
   */
  async getAllTransactions(params = {}) {
    const queryParams = new URLSearchParams()
    
    queryParams.append('page', params.page || '1')
    queryParams.append('size', params.size || '100')
    
    if (params.transaction_type) queryParams.append('transaction_type', params.transaction_type)
    if (params.status) queryParams.append('status', params.status)
    if (params.user_id) queryParams.append('user_id', params.user_id)
    if (params.investment_id) queryParams.append('investment_id', params.investment_id)
    
    logger.debug(`[AdminService] Fetching transactions from: /api/admin/transactions?${queryParams.toString()}`)
    
    const data = await this.request(`/api/admin/transactions?${queryParams.toString()}`, {
      method: 'GET',
    })
    
    const items = data.items || []
    const total = data.total || 0
    const pages = data.pages || 1
    const currentPage = data.page || 1
    
    // Transform backend response to match UI expectations
    // Note: API returns camelCase (transactionType) not snake_case (transaction_type)
    const transactions = items.map(tx => ({
      id: tx.id,
      type: tx.transactionType || tx.transaction_type || tx.type,
      amount: parseFloat(tx.amount) || 0,
      status: tx.status,
      date: tx.transactionDate || tx.transaction_date,
      userId: tx.userId || tx.user_id,
      userName: tx.userName || tx.user_name || null,
      userEmail: tx.userEmail || tx.user_email || null,
      investmentId: tx.investmentId || tx.investment_id,
      description: tx.description,
      humanId: tx.humanId || tx.human_id,
      createdAt: tx.createdAt || tx.created_at,
      submittedAt: tx.submittedAt || tx.submitted_at,
      receivedAt: tx.receivedAt || tx.received_at,
    }))
    
    // Fetch remaining pages if needed
    if (pages > 1 && currentPage === 1 && !params.page) {
      logger.info(`[AdminService] Fetching ${pages - 1} more pages of transactions...`)
      const remainingPages = []
      for (let page = 2; page <= pages; page++) {
        remainingPages.push(this.getAllTransactions({ ...params, page: page.toString() }))
      }
      
      const remainingResults = await Promise.all(remainingPages)
      
      // Filter out any duplicate transactions that might appear across pages due to new transactions being added during fetch
      const seenIds = new Set(transactions.map(t => t.id))
      
      remainingResults.flatMap(result => result.transactions || []).forEach(tx => {
        if (!seenIds.has(tx.id)) {
          transactions.push(tx)
          seenIds.add(tx.id)
        }
      })
      
      return {
        success: true,
        transactions: transactions,
        total: total,
        page: 1,
        pages: pages
      }
    }
    
    return {
      success: true,
      transactions: transactions,
      total: total,
      page: currentPage,
      pages: pages
    }
  }

  /**
   * Process ACHQ payment for a transaction (admin only)
   * Triggers the actual bank transfer for a pending payout
   */
  async processAchqPayment(transactionId) {
    try {
      const data = await this.request(`/api/admin/transactions/${transactionId}/achq-payment`, {
        method: 'POST',
      })
      
      return {
        success: true,
        transactionId: data.transactionId,
        transactionStatus: data.transactionStatus,
        fundingId: data.fundingId,
        fundingStatus: data.fundingStatus,
        achqTransactionId: data.achqTransactionId,
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] ACHQ payment failed:', error)
      return {
        success: false,
        error: error.message || 'Failed to process ACHQ payment'
      }
    }
  }

  /**
   * Get user payment methods (admin only)
   */
  async getUserPaymentMethods(userId) {
    const numericId = userId.toString().replace(/\D/g, '')
    try {
      const data = await this.request(`/api/admin/users/${numericId}/payment-methods`, {
        method: 'GET',
      })
      return {
        success: true,
        payment_methods: data.items || data.payment_methods || []
      }
    } catch (error) {
      logger.error('[AdminService] Get payment methods failed:', error)
      return { success: false, payment_methods: [], error: error.message }
    }
  }

  /**
   * Refresh user payment method balance (admin only)
   */
  async refreshUserPaymentMethodBalance(userId) {
    const numericId = userId.toString().replace(/\D/g, '')
    const data = await this.request(`/api/admin/users/${numericId}/balance-refresh`, {
      method: 'POST',
    })
    return {
      success: true,
      payment_method: data.payment_method || data,
      ...data
    }
  }

  /**
   * Reset user onboarding for testing (admin only)
   * Reinitializes onboarding, sends email, and returns token
   */
  async resetUserOnboarding(userId) {
    const numericId = userId.toString().replace(/\D/g, '')
    
    const data = await this.request(`/api/admin/users/${numericId}/onboarding/reset`, {
      method: 'POST',
    })
    
    return {
      success: true,
      user: data.user,
      token: data.passwordResetToken,
      ...data
    }
  }


  /**
   * Get disconnected payment methods (admin only)
   * Returns users whose bank connections are broken and cannot receive payments
   * This is the authoritative source for payment eligibility
   */
  async getDisconnectedPaymentMethods() {
    try {
      const data = await this.request('/api/admin/payment-methods/disconnected', {
        method: 'GET',
      })
      
      // Response is an array of DisconnectedPaymentMethodResponse
      const disconnected = Array.isArray(data) ? data : (data.items || [])
      
      return {
        success: true,
        disconnectedPaymentMethods: disconnected
      }
    } catch (error) {
      logger.error('[AdminService] Get disconnected payment methods failed:', error)
      return {
        success: false,
        disconnectedPaymentMethods: [],
        error: error.message
      }
    }
  }

  /**
   * Get investment calculation data (admin only)
   * Returns accrual information for an investment including partial month interest
   */
  async getInvestmentCalculation(userId, investmentId) {
    const numericUserId = userId.toString().replace(/\D/g, '')
    const numericInvestmentId = investmentId.toString().replace(/\D/g, '')
    
    try {
      const data = await this.request(`/api/admin/users/${numericUserId}/view/investments/${numericInvestmentId}/calculation`, {
        method: 'GET'
      })
      
      return {
        success: true,
        calculation: data,
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] Get investment calculation failed:', error)
      return {
        success: false,
        error: error.message || 'Failed to get investment calculation'
      }
    }
  }

  /**
   * Get TIN matching requests (admin only)
   * Lists TIN verification requests with optional filters
   * @param {Object} params - Filter parameters
   * @param {string} params.user_id - Filter by user ID
   * @param {string} params.status - Filter by status (pending, submitted, success, failed)
   */
  async getTinMatchingRequests(params = {}) {
    try {
      const queryParams = new URLSearchParams()
      
      if (params.user_id) {
        const numericId = params.user_id.toString().replace(/\D/g, '')
        queryParams.append('user_id', numericId)
      }
      if (params.status) queryParams.append('status', params.status)
      
      const queryString = queryParams.toString()
      const url = queryString 
        ? `/api/admin/tin-matching-requests?${queryString}`
        : '/api/admin/tin-matching-requests'
      
      const data = await this.request(url, {
        method: 'GET',
      })
      
      const requests = Array.isArray(data) ? data : (data.items || data.requests || [])
      
      return {
        success: true,
        requests: requests,
        total: data.total || requests.length
      }
    } catch (error) {
      logger.error('[AdminService] Get TIN matching requests failed:', error)
      return {
        success: false,
        requests: [],
        error: error.message || 'Failed to get TIN matching requests'
      }
    }
  }

  /**
   * Refresh TIN matching for a user (admin only)
   * Triggers submission or status refresh for the user's latest TIN matching request
   * @param {string} userId - User ID to refresh TIN matching for
   */
  async refreshTinMatching(userId) {
    const numericId = userId.toString().replace(/\D/g, '')
    
    try {
      logger.info(`[AdminService] Refreshing TIN matching for user ${numericId}`)
      const data = await this.request(`/api/admin/users/${numericId}/tin-matching/refresh`, {
        method: 'POST',
      })
      
      logger.info('[AdminService] TIN matching refresh response:', data)
      
      return {
        success: true,
        requestId: data.requestId || data.request_id,
        status: data.status,
        submissionId: data.submissionId || data.submission_id,
        ...data
      }
    } catch (error) {
      logger.error('[AdminService] Refresh TIN matching failed:', error)
      // Extract error message from various possible sources
      const errorMessage = error.responseData?.detail 
        || error.responseData?.error 
        || error.responseData?.message 
        || error.message 
        || 'Failed to refresh TIN matching'
      return {
        success: false,
        error: errorMessage,
        statusCode: error.statusCode
      }
    }
  }
}

export const adminService = new AdminService()
export default AdminService

