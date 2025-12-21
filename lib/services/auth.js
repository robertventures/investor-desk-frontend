import ApiService from './base'
import logger from '../logger'

class AuthService extends ApiService {
  /**
   * Login with email and password
   * Backend expects: { email, password }
   * Returns: { access_token, refresh_token, token_type, user }
   */
  async login(email, password) {
    logger.debug('[AuthService] Login attempt for:', email)
    const data = await this.request('/api/auth/token', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    logger.debug('[AuthService] Login response received')

    if (data.access_token) {
      this.setTokens(data.access_token, data.refresh_token)
      
      // Fetch user profile to maintain compatibility
      // We'll need to handle the circular dependency or duplicate logic for getCurrentUser
      // For now, let's fetch the profile directly
      try {
        const profileResponse = await this.request('/api/profile', { method: 'GET' })
        const user = profileResponse.user || profileResponse
        
        return {
          success: true,
          user: user,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_type: data.token_type,
          expires_in: data.expires_in
        }
      } catch (e) {
        logger.warn('[AuthService] Failed to fetch user profile after login', e)
        // Return partial success if token is valid but profile fetch fails
        return {
          success: true,
          user: null,
          access_token: data.access_token
        }
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
   * Register new user
   * Backend endpoint: POST /api/profile
   */
  async register(email, password, full_name) {
    logger.debug('[AuthService] Registering user:', email)
    try {
      const result = await this.request('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name }),
      })
      return result
    } catch (error) {
      logger.error('[AuthService] Registration failed:', error)
      return {
        success: false,
        error: error.message || 'Registration failed'
      }
    }
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
    // Use console.log directly for production debugging
    console.log('[AuthService] Reset password request for token:', token)
    try {
      const result = await this.request('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: newPassword }),
      })
      console.log('[AuthService] Reset password response:', result)
      return result
    } catch (error) {
      console.error('[AuthService] Reset password failed:', error)
      throw error
    }
  }
  
  /**
   * Register pending (legacy wrapper)
   */
  async registerPending(email, password) {
    return this.register(email, password, null)
  }
}

export const authService = new AuthService()
export default AuthService

