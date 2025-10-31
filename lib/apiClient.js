/**
 * API Client - Centralized API Communication Layer
 * 
 * In browser context, always uses relative paths (/api/...) to avoid CORS/cookie issues.
 * Next.js rewrites in next.config.js proxy these requests to the Python backend.
 * 
 * In server-side context (SSR), can use NEXT_PUBLIC_API_URL for direct backend access.
 */

// Get API base URL from environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

class ApiClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * Build full URL for API endpoint
   * Always uses relative paths to leverage proxy (Next.js dev or Netlify production)
   */
  buildUrl(endpoint) {
    // Always use relative paths in client-side context to leverage proxy
    // This ensures cookies work properly (same-origin) and avoids CORS issues
    // - In development: Next.js rewrites proxy to localhost:8000
    // - In production: Netlify redirects proxy to Heroku backend
    if (typeof window !== 'undefined') {
      return endpoint
    }
    
    // Server-side context: use direct backend URL if provided
    if (!this.baseUrl) return endpoint
    
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    return `${base}${path}`
  }

  /**
   * Generic fetch wrapper with error handling
   */
  async request(endpoint, options = {}) {
    const url = this.buildUrl(endpoint)
    
    const config = {
      credentials: 'include', // Important for cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      // Try to parse JSON response
      let data
      try {
        data = await response.json()
      } catch (e) {
        // Response not JSON
        data = { success: false, error: 'Invalid response format' }
      }
      
      if (!response.ok) {
        // Use detail first, then error, then fallback
        const errorMessage = data.detail || data.error || `API error: ${response.status}`
        throw new Error(errorMessage)
      }
      
      return data
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error)
      throw error
    }
  }

  // =====================================================================
  // AUTHENTICATION ENDPOINTS
  // =====================================================================
  
  async login(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  async logout() {
    return this.request('/api/auth/logout', {
      method: 'POST',
    })
  }

  async registerPending(email, password) {
    return this.request('/api/auth/register-pending', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  async verifyAndCreate(email, code) {
    return this.request('/api/auth/verify-and-create', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    })
  }

  async requestPasswordReset(email) {
    return this.request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async resetPassword(token, newPassword) {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    })
  }

  async getCurrentUser() {
    try {
      const url = this.buildUrl('/api/auth/me')
      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })
      
      // If 401 (not authenticated), return null silently without logging error
      if (response.status === 401) {
        return null
      }
      
      const data = await response.json()
      
      if (!response.ok) {
        console.error(`getCurrentUser failed: ${response.status}`, data.error)
        return null
      }
      
      return data
    } catch (error) {
      // Network errors or other issues - don't log, just return null
      return null
    }
  }

  // =====================================================================
  // USER ENDPOINTS
  // =====================================================================
  
  async getUser(userId, fresh = false) {
    const query = fresh ? '?fresh=true' : ''
    return this.request(`/api/users/${userId}${query}`)
  }

  async updateUser(userId, data) {
    return this.request(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getUserProfile() {
    return this.request('/api/users/profile')
  }

  async updateUserProfile(data) {
    return this.request('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteUser(userId) {
    return this.request(`/api/users/${userId}`, {
      method: 'DELETE',
    })
  }

  // =====================================================================
  // INVESTMENT ENDPOINTS
  // =====================================================================
  
  async getInvestments(userId) {
    return this.request(`/api/users/${userId}/investments`)
  }

  async createInvestment(userId, investmentData) {
    return this.request(`/api/users/${userId}/investments`, {
      method: 'POST',
      body: JSON.stringify(investmentData),
    })
  }

  async updateInvestment(userId, investmentId, fields) {
    return this.request(`/api/users/${userId}/investments`, {
      method: 'PATCH',
      body: JSON.stringify({
        investmentId,
        ...fields,
      }),
    })
  }

  async deleteInvestment(userId, investmentId) {
    return this.request(`/api/users/${userId}/investments?investmentId=${investmentId}`, {
      method: 'DELETE',
    })
  }

  // =====================================================================
  // TRANSACTION ENDPOINTS
  // =====================================================================
  
  async getTransactions(userId, investmentId = null) {
    const query = investmentId ? `?investmentId=${investmentId}` : ''
    return this.request(`/api/users/${userId}/transactions${query}`)
  }

  // =====================================================================
  // WITHDRAWAL ENDPOINTS
  // =====================================================================
  
  async getWithdrawals(userId) {
    return this.request(`/api/users/${userId}/withdrawals`)
  }

  async createWithdrawal(userId, investmentId) {
    return this.request('/api/withdrawals', {
      method: 'POST',
      body: JSON.stringify({ userId, investmentId }),
    })
  }

  // =====================================================================
  // ADMIN ENDPOINTS
  // =====================================================================
  
  async getAppTime() {
    return this.request('/api/admin/time-machine')
  }

  async setAppTime(timestamp) {
    return this.request('/api/admin/time-machine', {
      method: 'POST',
      body: JSON.stringify({ timestamp }),
    })
  }

  async resetAppTime() {
    return this.request('/api/admin/time-machine', {
      method: 'DELETE',
    })
  }

  async getAllUsers() {
    return this.request('/api/users')
  }

  async getAdminWithdrawals() {
    return this.request('/api/admin/withdrawals')
  }

  async getPendingPayouts() {
    return this.request('/api/admin/pending-payouts')
  }

  // =====================================================================
  // DOCUMENT ENDPOINTS
  // =====================================================================
  
  async generateBondAgreement(investmentId, userId) {
    return this.request('/api/v1/documents/generate-bond-agreement', {
      method: 'POST',
      body: JSON.stringify({ investment_id: investmentId, user_id: userId }),
    })
  }

  async getBondAgreement(investmentId, userId = null) {
    const query = userId ? `?user_id=${userId}` : ''
    return this.request(`/api/v1/documents/bond-agreement/${investmentId}${query}`)
  }

  async downloadBondAgreement(investmentId, userId = null) {
    const query = userId ? `?user_id=${userId}` : ''
    const url = this.buildUrl(`/api/v1/documents/bond-agreement/${investmentId}/download${query}`)
    
    // Open in new tab for download
    if (typeof window !== 'undefined') {
      window.open(url, '_blank')
    }
    
    return { success: true }
  }

  // =====================================================================
  // UTILITY METHODS
  // =====================================================================
  
  /**
   * Check if using external backend
   */
  isUsingExternalBackend() {
    return !!this.baseUrl
  }

  /**
   * Get current backend URL
   */
  getBackendUrl() {
    return this.baseUrl || 'local Next.js routes'
  }
}

// Export singleton instance
export const apiClient = new ApiClient()

// Export class for custom instances if needed
export default ApiClient

// Log which backend is being used (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log(`🔌 API Client configured for: ${apiClient.getBackendUrl()}`)
}

