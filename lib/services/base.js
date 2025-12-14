/**
 * Base API Service
 * 
 * Provides core functionality for API communication:
 * - Token management (access/refresh)
 * - Request handling with automatic token injection
 * - Error handling and response parsing
 * - Request coalescing
 */

import logger from '../logger'

// Get API base URL from environment variable
const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || ''

class ApiService {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl
    this.accessToken = null
    this.refreshToken = null
    this._inflight = new Map()
    this._tokensChecked = false
    
    // Load refresh token from localStorage on initialization (client-side only)
    if (typeof window !== 'undefined') {
      this.refreshToken = localStorage.getItem('refresh_token')
      this._tokensChecked = true
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
   * Store tokens - access token in memory only, refresh token in localStorage
   */
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this._tokensChecked = true
    
    if (typeof window !== 'undefined') {
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken)
      }
      localStorage.removeItem('access_token')
    }
  }

  /**
   * Clear tokens from memory and localStorage
   */
  clearTokens() {
    this.accessToken = null
    this.refreshToken = null
    this._tokensChecked = false
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('currentUserId')
      localStorage.removeItem('signupEmail')
    }
  }

  /**
   * Ensure tokens are loaded from localStorage
   */
  ensureTokensLoaded() {
    if (typeof window !== 'undefined') {
      // Always check for refresh token updates in localStorage
      // This handles cases where one service updates the token but others (initialized earlier) missed it
      const storedRefreshToken = localStorage.getItem('refresh_token')
      
      if (storedRefreshToken && storedRefreshToken !== this.refreshToken) {
        this.refreshToken = storedRefreshToken
        if (!this._tokensChecked) {
          logger.debug('[ApiService] Loaded refresh token from localStorage')
        }
      }
      // IMPORTANT: Handle token removal too.
      // If localStorage no longer has a refresh token (e.g. logout), clear any stale in-memory copy
      // so services can't silently refresh and re-authenticate until a hard reload.
      if (!storedRefreshToken && this.refreshToken) {
        this.refreshToken = null
      }
      
      this._tokensChecked = true
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.accessToken
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken() {
    // Ensure refresh token is loaded from localStorage if not in memory
    if (!this.refreshToken && typeof window !== 'undefined') {
      this.refreshToken = localStorage.getItem('refresh_token')
    }
    
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

    this.ensureTokensLoaded()
    
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
          config.headers['Authorization'] = `Bearer ${this.accessToken}`
          response = await fetch(url, config)
        } catch (refreshError) {
          this.clearTokens()
          throw new Error('Session expired. Please log in again.')
        }
      }
      
      if (response.status === 204) {
        return { success: true }
      }
      
      let data
      try {
        data = await response.json()
      } catch (e) {
        data = { error: 'Invalid response format' }
      }
      
      if (!response.ok) {
        const errorMessage = data.detail || data.error || data.message || `API error: ${response.status}`
        
        // Special handling for known expected errors to reduce noise
        const lowerMsg = String(errorMessage || '').toLowerCase()
        const isProfileLocked = response.status === 403 && (
          lowerMsg.includes('profile is complete') ||
          lowerMsg.includes('cannot be modified')
        )
        const isExpectedConflict = response.status === 409 && endpoint.includes('/api/plaid/link-success')

        if (!isProfileLocked && !isExpectedConflict) {
          logger.error(`[ApiService] Request failed [${response.status}] ${endpoint}:`, data)
        }

        const error = new Error(errorMessage)
        error.responseData = data
        error.statusCode = response.status
        error.isProfileLocked = isProfileLocked
        throw error
      }
      
      return data
    } catch (error) {
      // Allow specific error types to bubble up without logging if they were already handled/logged
      if (!error.isProfileLocked && !error.responseData) {
        logger.error(`API request failed: ${endpoint}`, error)
      }
      throw error
    }
  }
}

// Export singleton for backward compatibility if needed, but prefer instantiating specific services
export const apiService = new ApiService()
export default ApiService

