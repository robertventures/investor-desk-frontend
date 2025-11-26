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
    if (params.user_id) queryParams.append('user_id', params.user_id)
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
   * Get admin withdrawals
   */
  async getAdminWithdrawals() {
    logger.warn('getAdminWithdrawals: Endpoint not yet implemented in backend')
    return {
      success: true,
      withdrawals: []
    }
  }

  /**
   * Get pending payouts
   */
  async getPendingPayouts() {
    logger.warn('getPendingPayouts: Endpoint not yet implemented in backend')
    return {
      success: true,
      payouts: []
    }
  }

  /**
   * Get user payment methods (admin only)
   * MOCKED implementation until backend endpoint is ready
   */
  async getUserPaymentMethods(userId) {
    // TODO: Replace with actual API call when ready:
    // return this.request(`/api/admin/users/${userId}/payment-methods`)
    
    // Mock data
    return {
      success: true,
      payment_methods: [
        {
          id: "pm_mock_1",
          type: "plaid",
          display_name: "Chase Checking ••1234",
          bank_name: "Chase",
          account_type: "checking",
          last4: "1234",
          status: "verified",
          provider_transaction_id: "tx_123",
          current_balance: "1250.50",
          available_balance: "1250.50",
          balance_last_updated: new Date().toISOString(),
          created_at: "2024-01-15T10:30:00-05:00",
          verification_attempts_remaining: 3,
          verification_expires_at: "2024-01-22T10:30:00-05:00"
        },
        {
          id: "pm_mock_2",
          type: "manual",
          display_name: "Manual Wire ••5678",
          bank_name: "Wells Fargo",
          account_type: "savings",
          last4: "5678",
          status: "verified",
          provider_transaction_id: null,
          current_balance: null,
          available_balance: null,
          balance_last_updated: null,
          created_at: "2024-02-01T14:20:00-05:00",
          verification_attempts_remaining: null,
          verification_expires_at: null
        }
      ]
    }
  }

  /**
   * Refresh user payment method balance (admin only)
   * MOCKED implementation until backend endpoint is ready
   */
  async refreshUserPaymentMethodBalance(userId, paymentMethodId) {
    // TODO: Replace with actual API call when ready:
    // return this.request(`/api/admin/users/${userId}/payment-methods/${paymentMethodId}/balance/refresh`, { method: 'POST' })

    // Mock successful refresh
    return {
      success: true,
      payment_method: {
        id: paymentMethodId,
        type: "plaid",
        display_name: "Chase Checking ••1234",
        bank_name: "Chase",
        account_type: "checking",
        last4: "1234",
        status: "verified",
        provider_transaction_id: "tx_123",
        current_balance: (1250.50 + Math.random() * 100).toFixed(2),
        available_balance: (1250.50 + Math.random() * 100).toFixed(2),
        balance_last_updated: new Date().toISOString(),
        created_at: "2024-01-15T10:30:00-05:00",
        verification_attempts_remaining: 3,
        verification_expires_at: "2024-01-22T10:30:00-05:00"
      }
    }
  }
}

export const adminService = new AdminService()
export default AdminService

