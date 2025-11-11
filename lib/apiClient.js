/**
 * API Client - Centralized API Communication Layer
 * 
 * Communicates with the Robert Ventures backend API using JWT token authentication.
 * Automatically handles token refresh and Authorization headers.
 */

// Get API base URL from environment variable
const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || ''

class ApiClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl
    this.accessToken = null
    this.refreshToken = null
    this._inflight = new Map()
    
    // Load tokens from localStorage on initialization (client-side only)
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('access_token')
      this.refreshToken = localStorage.getItem('refresh_token')
    }
  }

  /**
   * Coalesce concurrent async operations by key and return the same promise
   */
  _coalesce(key, fn) {
    if (this._inflight.has(key)) return this._inflight.get(key)
    const promise = (async () => {
      try {
        return await fn()
      } finally {
        this._inflight.delete(key)
      }
    })()
    this._inflight.set(key, promise)
    return promise
  }

  /**
   * Get raw profile response with in-flight coalescing
   */
  async _getProfileRawCoalesced() {
    return this._coalesce('profile', async () => {
      return await this.request('/api/profile', { method: 'GET' })
    })
  }

  /**
   * Build full URL for API endpoint
   */
  buildUrl(endpoint) {
    // Use relative paths in client-side context for Next.js proxy
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
   * Store tokens in memory and localStorage
   */
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', accessToken)
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken)
      }
    }
  }

  /**
   * Clear tokens from memory and localStorage
   */
  clearTokens() {
    this.accessToken = null
    this.refreshToken = null
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('currentUserId')
      localStorage.removeItem('signupEmail')
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const url = this.buildUrl('/api/auth/refresh')
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      })

      const data = await response.json()

      if (!response.ok || !data.access_token) {
        this.clearTokens()
        throw new Error('Failed to refresh token')
      }

      this.setTokens(data.access_token, data.refresh_token || this.refreshToken)
      return data.access_token
    } catch (error) {
      this.clearTokens()
      throw error
    }
  }

  /**
   * Generic fetch wrapper with error handling and auto token refresh
   */
  async request(endpoint, options = {}) {
    const url = this.buildUrl(endpoint)
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    // Add Authorization header if we have an access token (skip for public endpoints)
    if (this.accessToken && !endpoint.includes('/api/auth/token') && !endpoint.includes('/api/auth/refresh')) {
      config.headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    try {
      let response = await fetch(url, config)
      
      // If 401 and we have a refresh token, try to refresh
      if (response.status === 401 && this.refreshToken && !endpoint.includes('/api/auth/refresh')) {
        try {
          await this.refreshAccessToken()
          // Retry the original request with new token
          config.headers['Authorization'] = `Bearer ${this.accessToken}`
          response = await fetch(url, config)
        } catch (refreshError) {
          // Refresh failed, clear tokens and throw
          this.clearTokens()
          throw new Error('Session expired. Please log in again.')
        }
      }
      
      // Handle 204 No Content responses (successful DELETE operations)
      if (response.status === 204) {
        return { success: true }
      }
      
      // Try to parse JSON response
      let data
      try {
        data = await response.json()
      } catch (e) {
        // Response not JSON
        data = { error: 'Invalid response format' }
      }
      
      if (!response.ok) {
        const errorMessage = data.detail || data.error || data.message || `API error: ${response.status}`
        const lowerMsg = String(errorMessage || '').toLowerCase()
        const isProfileLocked = response.status === 403 && (
          lowerMsg.includes('profile is complete') ||
          lowerMsg.includes('cannot be modified')
        )
        if (isProfileLocked) {
          // Reduce console noise for expected "profile locked" state
          console.log(`[ApiClient] Profile locked on ${endpoint} - suppressing error log`, data)
        } else {
          console.error(`[ApiClient] Request failed [${response.status}] ${endpoint}:`, data)
        }
        const error = new Error(errorMessage)
        // Preserve original response data for debugging
        error.responseData = data
        error.statusCode = response.status
        throw error
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
  
  /**
   * Login with email and password
   * Backend expects: { email, password }
   * Returns: { access_token, refresh_token, token_type }
   */
  async login(email, password) {
    console.log('[ApiClient] Login attempt for:', email)
    const data = await this.request('/api/auth/token', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    console.log('[ApiClient] Login response:', data)

    // Store tokens
    if (data.access_token) {
      this.setTokens(data.access_token, data.refresh_token)
      
      // Fetch user profile to maintain compatibility with existing code
      const profileResponse = await this.getCurrentUser()
      
      // Extract the actual user object from the response
      const user = profileResponse.success ? profileResponse.user : null
      
      return {
        success: true,
        user: user,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
        expires_in: data.expires_in
      }
    }

    return data
  }

  /**
   * Logout - clear tokens
   */
  async logout() {
    this.clearTokens()
    return { success: true, message: 'Logged out successfully' }
  }

  /**
   * Get current authenticated user
   * Backend endpoint: GET /api/profile
   */
  async getCurrentUser() {
    try {
      // Ensure tokens are loaded from localStorage first
      this.ensureTokensLoaded()
      
      if (!this.accessToken) {
        console.log('[ApiClient] getCurrentUser: No access token available')
        return { success: false, user: null }
      }
      const data = await this._getProfileRawCoalesced()
      
      console.log('[ApiClient] getCurrentUser response:', data)
      
      // Handle response that may be wrapped in { success: true, user: {...} }
      const userData = data.user || data
      
      // Transform to match frontend expectations
      const user = {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        isAdmin: userData.isAdmin || userData.is_superuser || false,
        isVerified: userData.isVerified !== undefined ? userData.isVerified : (userData.is_verified !== undefined ? userData.is_verified : false),
        needsOnboarding: !userData.onboarding_completed,
        ...userData
      }
      
      // Map backend field names to frontend field names for consistency
      if (user && 'phone' in user && user.phone) {
        // Backend stores 10-digit phone number, convert to E.164 format for frontend
        const digits = user.phone.replace(/\D/g, '')
        if (digits.length === 10) {
          user.phoneNumber = `+1${digits}`
          user.phone = `+1${digits}` // Update phone field too for consistency
        } else {
          user.phoneNumber = user.phone
        }
      }
      
      return { success: true, user }
    } catch (error) {
      // If 401 or token invalid, return proper error structure
      if (error.message.includes('401') || error.message.includes('Session expired')) {
        console.log('[ApiClient] getCurrentUser: Session expired or invalid token')
        return { success: false, user: null }
      }
      console.error('[ApiClient] getCurrentUser error:', error)
      return { success: false, user: null, error: error.message }
    }
  }

  /**
   * Register new user
   * Backend endpoint: POST /api/profile
   */
  async register(email, password, full_name) {
    console.log('[ApiClient] Registering user:', email)
    try {
      const result = await this.request('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name }),
      })
      console.log('[ApiClient] Registration successful:', result)
      return result
    } catch (error) {
      console.error('[ApiClient] Registration failed:', error)
      // Return error in expected format
      return {
        success: false,
        error: error.message || 'Registration failed'
      }
    }
  }

  /**
   * Confirm user account with verification code
   * Backend endpoint: PUT /api/profile/confirm/{user_id}
   */
  async confirmAccount(userId, verificationCode) {
    // Extract numeric ID if userId is in format "USR-1004"
    const numericId = userId.toString().replace(/\D/g, '')
    
    console.log('[ApiClient] Confirming account - userId:', userId, 'numericId:', numericId, 'code:', verificationCode)
    
    try {
      const result = await this.request(`/api/profile/confirm/${numericId}`, {
        method: 'PUT',
        body: JSON.stringify({ verificationCode: verificationCode }),
      })
      console.log('[ApiClient] Confirmation successful:', result)
      return result
    } catch (error) {
      console.error('[ApiClient] Confirmation failed:', error)
      console.error('[ApiClient] Error details:', {
        message: error.message,
        statusCode: error.statusCode,
        responseData: error.responseData
      })
      // Return error in expected format
      return {
        success: false,
        error: error.message || 'Verification failed',
        details: error.responseData ? JSON.stringify(error.responseData) : error.toString(),
        statusCode: error.statusCode
      }
    }
  }

  /**
   * Change password
   * Backend endpoint: PUT /api/profile/change_password
   */
  async changePassword(currentPassword, newPassword) {
    return this.request('/api/profile/change_password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    })
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email) {
    return this.request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword) {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    })
  }

  // =====================================================================
  // PROFILE ENDPOINTS
  // =====================================================================
  
  /**
   * Get user profile (current user)
   * Backend endpoint: GET /api/profile
   */
  async getUserProfile() {
    // Ensure tokens are loaded from localStorage before making the request
    this.ensureTokensLoaded()
    
    const data = await this._getProfileRawCoalesced()
    
    console.log('[ApiClient] getUserProfile raw response:', data)
    
    // Handle response that may be wrapped in { success: true, user: {...} }
    const user = data.user || data
    
    console.log('[ApiClient] getUserProfile extracted user:', user)
    
    // Map backend field names to frontend field names for consistency
    if (user && 'phone' in user && user.phone) {
      // Backend stores 10-digit phone number, convert to E.164 format for frontend
      const digits = user.phone.replace(/\D/g, '')
      if (digits.length === 10) {
        user.phoneNumber = `+1${digits}`
        user.phone = `+1${digits}` // Update phone field too for consistency
      } else {
        user.phoneNumber = user.phone
      }
      console.log('[ApiClient] getUserProfile mapped phone to phoneNumber:', user.phoneNumber)
    }
    
    return user
  }
  
  /**
   * Ensure tokens are loaded from localStorage
   * Call this before making authenticated requests
   */
  ensureTokensLoaded() {
    if (typeof window !== 'undefined' && !this.accessToken) {
      this.accessToken = localStorage.getItem('access_token')
      this.refreshToken = localStorage.getItem('refresh_token')
      console.log('[ApiClient] Reloaded tokens from localStorage:', {
        hasAccess: !!this.accessToken,
        hasRefresh: !!this.refreshToken
      })
    }
  }

  /**
   * Update user profile (current user)
   * Backend endpoint: PUT /api/profile
   */
  async updateUserProfile(data) {
    // Map frontend field names to backend field names
    const backendData = { ...data }
    
    // Backend expects 'phone' but frontend uses 'phoneNumber'
    if ('phoneNumber' in backendData) {
      backendData.phone = backendData.phoneNumber
      delete backendData.phoneNumber
    }
    
    // Backend expects 10-digit phone number (no +1 prefix)
    // Convert from E.164 format (+15555555555) to 10 digits (5555555555)
    if (backendData.phone && typeof backendData.phone === 'string') {
      const digits = backendData.phone.replace(/\D/g, '')
      if (digits.length === 11 && digits.startsWith('1')) {
        // Strip leading 1 from +1XXXXXXXXXX format
        backendData.phone = digits.slice(1)
      } else if (digits.length === 10) {
        // Already 10 digits, use as is
        backendData.phone = digits
      }
      // Otherwise leave as is and let backend validation handle it
    }
    
    console.log('[ApiClient] updateUserProfile - sending to backend:', backendData)
    
    const response = await this.request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(backendData),
    })
    
    console.log('[ApiClient] updateUserProfile - received from backend:', response)
    
    // Map backend response fields back to frontend field names
    if (response.user && 'phone' in response.user && response.user.phone) {
      // Backend returns 10-digit phone number, convert to E.164 format for frontend
      const digits = response.user.phone.replace(/\D/g, '')
      if (digits.length === 10) {
        response.user.phoneNumber = `+1${digits}`
        response.user.phone = `+1${digits}` // Update phone field too for consistency
      } else {
        response.user.phoneNumber = response.user.phone
      }
    }
    
    return response
  }

  // =====================================================================
  // INVESTMENT ENDPOINTS
  // =====================================================================
  
  /**
   * Get all investments for current user
   * Backend endpoint: GET /api/investments
   */
  async getInvestments(userId = null) {
    // API returns InvestmentListResponse: { success: true, investments: [...] }
    const data = await this.request('/api/investments', {
      method: 'GET',
    })
    
    // Return the API response directly (it's already in the correct format)
    return data
  }

  /**
   * Get specific investment by ID
   * Backend endpoint: GET /api/investments/{investment_id}
   */
  async getInvestment(investmentId) {
    return this.request(`/api/investments/${investmentId}`, {
      method: 'GET',
    })
  }

  /**
   * Create new investment
   * Backend endpoint: POST /api/investments
   */
  async createInvestment(userId, investmentData) {
    console.log('[ApiClient] Creating investment:', investmentData)
    // API returns InvestmentDetailResponse: { success: true, investment: {...} }
    const data = await this.request('/api/investments', {
      method: 'POST',
      body: JSON.stringify(investmentData),
    })
    
    console.log('[ApiClient] Investment created:', data)
    // Return the API response directly (it's already in the correct format)
    return data
  }

  /**
   * Update investment
   * Backend endpoint: PATCH /api/investments/{investment_id}
   */
  async updateInvestment(userId, investmentId, fields) {
    // API returns InvestmentDetailResponse: { success: true, investment: {...} }
    const data = await this.request(`/api/investments/${investmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    })
    
    // Return the API response directly (it's already in the correct format)
    return data
  }

  /**
   * Delete investment
   * Backend endpoint: DELETE /api/investments/{investment_id}
   */
  async deleteInvestment(userId, investmentId) {
    await this.request(`/api/investments/${investmentId}`, {
      method: 'DELETE',
    })
    
    return {
      success: true,
      message: 'Investment deleted successfully'
    }
  }

  /**
   * Submit investment for approval
   * Backend endpoint: POST /api/investments/{investment_id}/submit
   */
  async submitInvestment(investmentId) {
    return this.request(`/api/investments/${investmentId}/submit`, {
      method: 'POST',
    })
  }

  /**
   * Get payout summary for investment
   * Backend endpoint: GET /api/investments/{investment_id}/payout-summary
   */
  async getPayoutSummary(investmentId) {
    return this.request(`/api/investments/${investmentId}/payout-summary`, {
      method: 'GET',
    })
  }

  /**
   * Get compounding summary for investment
   * Backend endpoint: GET /api/investments/{investment_id}/compounding-summary
   */
  async getCompoundingSummary(investmentId) {
    return this.request(`/api/investments/${investmentId}/compounding-summary`, {
      method: 'GET',
    })
  }

  // =====================================================================
  // ACTIVITY ENDPOINTS
  // =====================================================================
  
  /**
   * Get activity events for current user
   * Backend endpoint: GET /api/activity/events
   */
  async getActivityEvents() {
    return this.request('/api/activity/events', {
      method: 'GET',
    })
  }

  // =====================================================================
  // CONTACT ENDPOINTS
  // =====================================================================
  
  /**
   * Submit contact form
   * Backend endpoint: POST /api/contact
   * Payload: { subject, message, priority, category, contactMethod, phoneNumber? }
   * Backend will auto-add user name and email from authenticated session
   */
  async submitContactForm(contactData) {
    try {
      const data = await this.request('/api/contact', {
        method: 'POST',
        body: JSON.stringify(contactData),
      })
      
      return {
        success: true,
        ...data
      }
    } catch (error) {
      console.error('[ApiClient] Contact form submission failed:', error)
      return {
        success: false,
        error: error.message || 'Failed to submit contact form'
      }
    }
  }

  // =====================================================================
  // ADMIN ENDPOINTS
  // =====================================================================
  // 
  // Admin endpoints documented in OpenAPI spec:
  // - GET /api/admin/users - List all users (getAllUsers)
  // - GET /api/admin/activity/events - List activity events (getAdminActivityEvents)
  // - GET /api/admin/investments - List all investments (getAdminInvestments)
  // - POST /api/admin/investments/{id}/approve - Approve investment (approveInvestment)
  // - POST /api/admin/investments/{id}/reject - Reject investment (rejectInvestment)
  // - GET /api/admin/time-machine/status - Get time machine status (getAppTime)
  // - POST /api/admin/time-machine/set - Set time machine override (setAppTime)
  // - POST /api/admin/time-machine/reset - Reset time machine (resetAppTime)
  // 
  // Additional admin endpoints (not yet in OpenAPI spec):
  // - DELETE /api/admin/users/{user_id} - Delete user (deleteUser)
  
  /**
   * Get all users (admin only)
   * Backend endpoint: GET /api/admin/users
   * Returns paginated response: { items: [...], total, page, size, pages }
   * Note: Backend limits page size to 100, so we fetch all pages if needed
   */
  async getAllUsers(params = {}) {
    const queryParams = new URLSearchParams()
    
    // Add pagination params - backend max is 100
    queryParams.append('page', params.page || '1')
    queryParams.append('size', params.size || '100') // Backend max is 100
    
    // Add optional filters
    if (params.is_verified !== undefined) queryParams.append('is_verified', params.is_verified)
    if (params.account_type) queryParams.append('account_type', params.account_type)
    if (params.search) queryParams.append('search', params.search)
    
    const data = await this.request(`/api/admin/users?${queryParams.toString()}`, {
      method: 'GET',
    })
    
    // Handle paginated response from backend
    const users = Array.isArray(data) ? data : (data.items || data.users || [])
    const total = data.total || 0
    const pages = data.pages || 1
    const currentPage = data.page || 1
    
    // If there are more pages, fetch them all
    if (pages > 1 && currentPage === 1 && !params.page) {
      console.log(`[ApiClient] Fetching ${pages - 1} more pages of users...`)
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
   * Backend endpoint: GET /api/admin/activity/events
   * @param {Object} params - Optional filter parameters
   * @param {number} params.user_id - Filter by user ID
   * @param {number} params.investment_id - Filter by investment ID
   * @param {string} params.activity_type - Filter by activity type
   * @param {string} params.status - Filter by status
   * @param {string} params.search - Search query string
   * @param {string} params.order_by - Order by field
   * @param {number} params.page - Page number (default 1)
   * @param {number} params.size - Page size (default 100, max 100)
   */
  async getAdminActivityEvents(params = {}) {
    const queryParams = new URLSearchParams()
    
    // Add pagination params
    queryParams.append('page', params.page || '1')
    queryParams.append('size', params.size || '100') // Backend max is 100
    
    // Add optional filters
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
    
    // Handle paginated response
    const events = Array.isArray(data) ? data : (data.items || data.events || [])
    const total = data.total || 0
    const pages = data.pages || 1
    const currentPage = data.page || 1
    
    // If there are more pages and we're fetching all data, fetch remaining pages
    if (pages > 1 && currentPage === 1 && !params.page) {
      console.log(`[ApiClient] Fetching ${pages - 1} more pages of activity events...`)
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
   * Backend endpoint: GET /api/admin/activity/events?user_id={userId}
   * @param {number|string} userId - User ID to get activity for
   */
  async getUserActivityEvents(userId) {
    // Extract numeric ID if userId is in format "USR-1004"
    const numericId = userId.toString().replace(/\D/g, '')
    
    return this.getAdminActivityEvents({ 
      user_id: parseInt(numericId, 10),
      size: 100 // Get all events for the user
    })
  }

  /**
   * Get all investments (admin only)
   * Backend endpoint: GET /api/admin/investments
   * Returns paginated response: { items: [...], total, page, size, pages }
   * Note: Backend limits page size to 100, so we fetch all pages if needed
   */
  async getAdminInvestments(params = {}) {
    const queryParams = new URLSearchParams()
    
    // Add pagination params - backend max is 100
    queryParams.append('page', params.page || '1')
    queryParams.append('size', params.size || '100') // Backend max is 100
    
    // Add optional filters
    if (params.status) queryParams.append('status', params.status)
    if (params.user_id) queryParams.append('user_id', params.user_id)
    if (params.search) queryParams.append('search', params.search)
    
    console.log(`[ApiClient] Fetching investments from: /api/admin/investments?${queryParams.toString()}`)
    
    const data = await this.request(`/api/admin/investments?${queryParams.toString()}`, {
      method: 'GET',
    })
    
    console.log('[ApiClient] Raw investments API response:', {
      hasItems: !!data.items,
      hasInvestments: !!data.investments,
      isArray: Array.isArray(data),
      total: data.total,
      page: data.page,
      pages: data.pages,
      size: data.size,
      itemsLength: data.items?.length,
      investmentsLength: data.investments?.length
    })
    
    // Handle paginated response from backend
    const investments = Array.isArray(data) ? data : (data.items || data.investments || [])
    const total = data.total || 0
    const pages = data.pages || 1
    const currentPage = data.page || 1
    
    console.log(`[ApiClient] Parsed: ${investments.length} investments, total: ${total}, pages: ${pages}, currentPage: ${currentPage}`)
    
    // If there are more pages, fetch them all
    if (pages > 1 && currentPage === 1 && !params.page) {
      console.log(`[ApiClient] Fetching ${pages - 1} more pages of investments...`)
      const remainingPages = []
      for (let page = 2; page <= pages; page++) {
        remainingPages.push(this.getAdminInvestments({ ...params, page: page.toString() }))
      }
      
      const remainingResults = await Promise.all(remainingPages)
      const allInvestments = [
        ...investments,
        ...remainingResults.flatMap(result => result.investments || [])
      ]
      
      // Log status breakdown
      const statusCounts = allInvestments.reduce((acc, inv) => {
        acc[inv.status] = (acc[inv.status] || 0) + 1
        return acc
      }, {})
      console.log('[ApiClient] Investment status breakdown:', statusCounts)
      
      return {
        success: true,
        investments: allInvestments,
        total: total,
        page: 1,
        pages: pages
      }
    }
    
    // Log status breakdown for single page response
    if (!params.page) {
      const statusCounts = investments.reduce((acc, inv) => {
        acc[inv.status] = (acc[inv.status] || 0) + 1
        return acc
      }, {})
      console.log('[ApiClient] Investment status breakdown:', statusCounts)
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
   * Backend endpoint: POST /api/admin/investments/{investment_id}/approve
   * Returns InvestmentResponse with updated status
   */
  async approveInvestment(investmentId) {
    const data = await this.request(`/api/admin/investments/${investmentId}/approve`, {
      method: 'POST',
    })
    
    // Backend returns InvestmentResponse object
    return {
      success: true,
      investment: data,
      ...data
    }
  }

  /**
   * Reject investment (admin only)
   * Backend endpoint: POST /api/admin/investments/{investment_id}/reject
   * Returns InvestmentResponse with updated status
   */
  async rejectInvestment(investmentId, reason = null) {
    const data = await this.request(`/api/admin/investments/${investmentId}/reject`, {
      method: 'POST',
      // Note: Backend may not support reason parameter yet
      ...(reason && { body: JSON.stringify({ reason }) })
    })
    
    // Backend returns InvestmentResponse object
    return {
      success: true,
      investment: data,
      ...data
    }
  }

  /**
   * Get time machine status
   * Backend endpoint: GET /api/admin/time-machine/status
   */
  async getAppTime() {
    return this.request('/api/admin/time-machine/status', {
      method: 'GET',
    })
  }

  /**
   * Set time machine override
   * Backend endpoint: POST /api/admin/time-machine/set
   * @param {string} appTime - ISO 8601 timestamp to set as the application time
   */
  async setAppTime(appTime) {
    return this.request('/api/admin/time-machine/set', {
      method: 'POST',
      body: JSON.stringify({ appTime }),
    })
  }

  /**
   * Reset time machine to current time
   * Backend endpoint: POST /api/admin/time-machine/reset
   */
  async resetAppTime() {
    return this.request('/api/admin/time-machine/reset', {
      method: 'POST',
    })
  }

  // =====================================================================
  // LEGACY COMPATIBILITY METHODS
  // =====================================================================
  
  /**
   * Get user by ID (for backward compatibility)
   * Maps to profile endpoint
   */
  async getUser(userId, fresh = false) {
    const user = await this.getUserProfile()
    // Wrap in success format for backward compatibility
    return {
      success: true,
      user: user
    }
  }

  /**
   * Update user by ID (for backward compatibility)
   * Maps to profile endpoint
   */
  async updateUser(userId, data) {
    return this.updateUserProfile(data)
  }

  /**
   * Get transactions (for backward compatibility)
   * Note: Backend may not have this endpoint yet
   */
  async getTransactions(userId, investmentId = null) {
    // TODO: Update when backend implements transactions endpoint
    console.warn('getTransactions: Endpoint not yet implemented in backend')
    return {
      success: true,
      transactions: []
    }
  }

  /**
   * Get withdrawals (for backward compatibility)
   * Note: Backend may not have this endpoint yet
   */
  async getWithdrawals(userId) {
    // TODO: Update when backend implements withdrawals endpoint
    console.warn('getWithdrawals: Endpoint not yet implemented in backend')
    return {
      success: true,
      withdrawals: []
    }
  }

  /**
   * Create withdrawal (for backward compatibility)
   * Note: Backend may not have this endpoint yet
   */
  async createWithdrawal(userId, investmentId) {
    // TODO: Update when backend implements withdrawals endpoint
    console.warn('createWithdrawal: Endpoint not yet implemented in backend')
    return {
      success: true,
      message: 'Withdrawals not yet implemented'
    }
  }

  /**
   * Get admin withdrawals (for backward compatibility)
   * Note: Backend may not have this endpoint yet
   */
  async getAdminWithdrawals() {
    // TODO: Update when backend implements admin withdrawals endpoint
    console.warn('getAdminWithdrawals: Endpoint not yet implemented in backend')
    return {
      success: true,
      withdrawals: []
    }
  }

  /**
   * Get pending payouts (for backward compatibility)
   * Note: Backend may not have this endpoint yet
   */
  async getPendingPayouts() {
    // TODO: Update when backend implements pending payouts endpoint
    console.warn('getPendingPayouts: Endpoint not yet implemented in backend')
    return {
      success: true,
      payouts: []
    }
  }

  /**
   * Document generation methods (for backward compatibility)
   * Note: Backend may not have these endpoints yet
   */
  async generateBondAgreement(investmentId, userId) {
    console.warn('generateBondAgreement: Endpoint not yet implemented in backend')
    return { success: true, message: 'Document generation not yet implemented' }
  }

  async getBondAgreement(investmentId, userId = null) {
    console.warn('getBondAgreement: Endpoint not yet implemented in backend')
    return { success: true, document: null }
  }

  async downloadBondAgreement(investmentId, userId = null) {
    console.warn('downloadBondAgreement: Endpoint not yet implemented in backend')
    return { success: true }
  }

  // Legacy methods for old auth endpoints
  async registerPending(email, password) {
    return this.register(email, password, null)
  }

  async verifyAndCreate(email, code) {
    // This needs user_id which we don't have here
    console.warn('verifyAndCreate: Use confirmAccount with user_id instead')
    return { success: false, error: 'Use confirmAccount method instead' }
  }

  /**
   * Delete user (admin only)
   * Backend endpoint: DELETE /api/admin/users/{user_id}
   * This will delete the user and all associated data (investments, transactions, etc.)
   */
  async deleteUser(userId) {
    try {
      // Extract numeric ID if userId is in format "USR-1004"
      const numericId = userId.toString().replace(/\D/g, '')
      
      const data = await this.request(`/api/admin/users/${numericId}`, {
        method: 'DELETE',
      })
      
      // Backend should return success response or error details
      return {
        success: true,
        message: data.message || 'User deleted successfully',
        ...data
      }
    } catch (error) {
      console.error('[ApiClient] Delete user failed:', error)
      
      // Return error in expected format
      return {
        success: false,
        error: error.message || 'Failed to delete user',
        partialSuccess: false
      }
    }
  }

  // =====================================================================
  // UTILITY METHODS
  // =====================================================================
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.accessToken
  }

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
    return this.baseUrl || 'relative /api routes'
  }

  // =====================================================================
  // PAYMENTS / PLAID / ACHQ HELPERS
  // =====================================================================

  /**
   * Create Plaid Link token (processor use case)
   * Backend endpoint: POST /api/plaid/link-token
   */
  async createPlaidLinkToken() {
    return this.request('/api/plaid/link-token', {
      method: 'POST',
      body: JSON.stringify({ use_case: 'processor', client_app: 'web' }),
    })
  }

  /**
   * Handle Plaid Link success -> create ACHQ payment method
   * Backend endpoint: POST /api/plaid/link-success
   */
  async postPlaidLinkSuccess({ publicToken, accountId, institution, accountMask, accountName, saveForReuse = true, idempotencyKey }) {
    const payload = {
      public_token: publicToken,
      account_id: accountId,
      institution: institution || undefined,
      account_mask: accountMask || undefined,
      account_name: accountName || undefined,
      save_for_reuse: saveForReuse,
      idempotency_key: idempotencyKey,
    }
    return this.request('/api/plaid/link-success', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Manually add bank account (ACHQ tokenization + micro-deposits)
   * Backend endpoint: POST /api/payment-methods/manual
   */
  async createManualPaymentMethod({ accountHolderName, routingNumber, accountNumber, accountType = 'checking', saveForReuse = true }, idempotencyKey) {
    return this.request('/api/payment-methods/manual', {
      method: 'POST',
      body: JSON.stringify({
        account_holder_name: accountHolderName,
        routing_number: routingNumber,
        account_number: accountNumber,
        account_type: accountType,
        save_for_reuse: saveForReuse,
        idempotency_key: idempotencyKey,
      }),
    })
  }

  /**
   * Verify manual bank account via micro-deposits
   * Backend endpoint: POST /api/payment-methods/:id/verify
   */
  async verifyPaymentMethod(paymentMethodId, amounts) {
    return this.request(`/api/payment-methods/${paymentMethodId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ amounts }),
    })
  }

  /**
   * List saved payment methods (bank_ach)
   * Backend endpoint: GET /api/payment-methods?type=bank_ach
   */
  async listPaymentMethods(type = 'bank_ach') {
    const qp = new URLSearchParams({ type })
    return this.request(`/api/payment-methods?${qp.toString()}`, {
      method: 'GET',
    })
  }

  /**
   * Delete payment method
   * Backend endpoint: DELETE /api/payment-methods/:id
   */
  async deletePaymentMethod(paymentMethodId) {
    return this.request(`/api/payment-methods/${paymentMethodId}`, {
      method: 'DELETE',
    })
  }

  /**
   * Fund an investment using a saved payment method via ACH
   * Backend endpoint: POST /api/investments/:investmentId/fund
   */
  async fundInvestment(investmentId, paymentMethodId, amountCents, idempotencyKey, memo = null) {
    return this.request(`/api/investments/${investmentId}/fund`, {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id: paymentMethodId,
        amount_cents: amountCents,
        idempotency_key: idempotencyKey,
        ...(memo ? { memo } : {}),
      }),
    })
  }

  /**
   * Get funding status
   * Backend endpoint: GET /api/investments/:investmentId/funding/:fundingId
   */
  async getFundingStatus(investmentId, fundingId) {
    return this.request(`/api/investments/${investmentId}/funding/${fundingId}`, {
      method: 'GET',
    })
  }
}

// Export singleton instance
export const apiClient = new ApiClient()

// Export class for custom instances if needed
export default ApiClient

// Log which backend is being used (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log(`[API] Connected to: ${apiClient.getBackendUrl()}`)
  console.log(`[API] Auth: ${apiClient.isAuthenticated() ? 'Active' : 'Inactive'}`)
}
