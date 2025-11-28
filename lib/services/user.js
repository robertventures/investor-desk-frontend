import ApiService from './base'

class UserService extends ApiService {
  /**
   * Get raw profile response with in-flight coalescing
   */
  async _getProfileRawCoalesced() {
    return this._coalesce('profile', async () => {
      return await this.request('/api/profile', { method: 'GET' })
    })
  }

  /**
   * Get current authenticated user
   * Backend endpoint: GET /api/profile
   */
  async getCurrentUser() {
    try {
      this.ensureTokensLoaded()
      
      if (!this.accessToken && this.refreshToken) {
        try {
          await this.refreshAccessToken()
        } catch (e) {
          return { success: false, user: null }
        }
      }
      
      if (!this.accessToken) {
        return { success: false, user: null }
      }
      const data = await this._getProfileRawCoalesced()
      
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
        const digits = user.phone.replace(/\D/g, '')
        if (digits.length === 10) {
          user.phoneNumber = `+1${digits}`
          user.phone = `+1${digits}`
        } else {
          user.phoneNumber = user.phone
        }
      }
      
      return { success: true, user }
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('Session expired')) {
        return { success: false, user: null }
      }
      return { success: false, user: null, error: error.message }
    }
  }

  /**
   * Get user profile (current user)
   * Backend endpoint: GET /api/profile
   */
  async getUserProfile() {
    this.ensureTokensLoaded()
    
    const data = await this._getProfileRawCoalesced()
    const user = data.user || data
    
    if (user && 'phone' in user && user.phone) {
      const digits = user.phone.replace(/\D/g, '')
      if (digits.length === 10) {
        user.phoneNumber = `+1${digits}`
        user.phone = `+1${digits}`
      } else {
        user.phoneNumber = user.phone
      }
    }
    
    return user
  }

  /**
   * Update user profile (current user)
   * Backend endpoint: PUT /api/profile
   */
  async updateUserProfile(data) {
    const backendData = { ...data }
    
    if ('phoneNumber' in backendData) {
      backendData.phone = backendData.phoneNumber
      delete backendData.phoneNumber
    }
    
    if ('needsOnboarding' in backendData) {
      backendData.onboarding_completed = !backendData.needsOnboarding
      delete backendData.needsOnboarding
    }
    
    if ('onboardingCompletedAt' in backendData) {
      backendData.onboarding_completed_at = backendData.onboardingCompletedAt
      delete backendData.onboardingCompletedAt
    }
    
    if ('onboardingToken' in backendData) {
      backendData.onboarding_token = backendData.onboardingToken
      delete backendData.onboardingToken
    }
    
    if ('onboardingTokenExpires' in backendData) {
      backendData.onboarding_token_expires = backendData.onboardingTokenExpires
      delete backendData.onboardingTokenExpires
    }
    
    if (backendData.phone && typeof backendData.phone === 'string') {
      const digits = backendData.phone.replace(/\D/g, '')
      if (digits.length === 11 && digits.startsWith('1')) {
        backendData.phone = digits.slice(1)
      } else if (digits.length === 10) {
        backendData.phone = digits
      }
    }
    
    const response = await this.request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(backendData),
    })
    
    if (response.user && 'phone' in response.user && response.user.phone) {
      const digits = response.user.phone.replace(/\D/g, '')
      if (digits.length === 10) {
        response.user.phoneNumber = `+1${digits}`
        response.user.phone = `+1${digits}`
      } else {
        response.user.phoneNumber = response.user.phone
      }
    }
    
    return response
  }

  /**
   * Patch user profile (current user) - for partial updates
   */
  async patchUserProfile(data) {
    const backendData = { ...data }
    
    if ('phoneNumber' in backendData) {
      backendData.phone = backendData.phoneNumber
      delete backendData.phoneNumber
    }
    
    if (backendData.phone && typeof backendData.phone === 'string') {
      const digits = backendData.phone.replace(/\D/g, '')
      if (digits.length === 11 && digits.startsWith('1')) {
        backendData.phone = digits.slice(1)
      } else if (digits.length === 10) {
        backendData.phone = digits
      }
    }
    
    const response = await this.request('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(backendData),
    })
    
    if (response.user && 'phone' in response.user && response.user.phone) {
      const digits = response.user.phone.replace(/\D/g, '')
      if (digits.length === 10) {
        response.user.phoneNumber = `+1${digits}`
        response.user.phone = `+1${digits}`
      } else {
        response.user.phoneNumber = response.user.phone
      }
    }
    
    return response
  }

  /**
   * Confirm user account with verification code
   */
  async confirmAccount(userId, verificationCode) {
    const numericId = userId.toString().replace(/\D/g, '')
    
    try {
      const result = await this.request(`/api/profile/confirm/${numericId}`, {
        method: 'PUT',
        body: JSON.stringify({ verificationCode: verificationCode }),
      })
      return result
    } catch (error) {
      console.error('[UserService] Confirmation failed:', error)
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
   */
  async changePassword(currentPassword, newPassword) {
    return this.request('/api/profile/change_password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: currentPassword,
        newPassword: newPassword,
      }),
    })
  }

  /**
   * Update trusted contact for current user
   */
  async updateTrustedContact(data) {
    const backendData = {
      firstName: (data.firstName && data.firstName.trim()) || null,
      lastName: (data.lastName && data.lastName.trim()) || null,
      email: (data.email && data.email.trim()) || null,
      relationshipType: (data.relationship || data.relationshipType || '').trim() || null,
      phone: null
    }
    
    if (data.phone && typeof data.phone === 'string') {
      const digits = data.phone.replace(/\D/g, '')
      if (digits.length >= 10) {
        backendData.phone = digits.slice(-10)
      }
    }
    
    return this.request('/api/profile/trusted_contact', {
      method: 'PUT',
      body: JSON.stringify(backendData),
    })
  }

  /**
   * Get trusted contact for current user
   */
  async getTrustedContact() {
    return this.request('/api/profile/trusted_contact', {
      method: 'GET',
    })
  }

  /**
   * Create trusted contact for current user
   */
  async createTrustedContact(data) {
    const backendData = {
      firstName: (data.firstName && data.firstName.trim()) || null,
      lastName: (data.lastName && data.lastName.trim()) || null,
      email: (data.email && data.email.trim()) || null,
      relationshipType: (data.relationship || data.relationshipType || '').trim() || null,
      phone: null
    }
    
    if (data.phone && typeof data.phone === 'string') {
      const digits = data.phone.replace(/\D/g, '')
      if (digits.length >= 10) {
        backendData.phone = digits.slice(-10)
      }
    }
    
    return this.request('/api/profile/trusted_contact', {
      method: 'POST',
      body: JSON.stringify(backendData),
    })
  }

  /**
   * Legacy compatibility methods
   */
  async updateUser(userId, data) {
    return this.updateUserProfile(data)
  }
  
  // =====================================================================
  // PAYMENT METHODS (USER BANK ACCOUNTS)
  // =====================================================================

  /**
   * Create Plaid Link token (processor use case)
   */
  async createPlaidLinkToken() {
    return this.request('/api/plaid/link-token', {
      method: 'POST',
      body: JSON.stringify({ use_case: 'processor', client_app: 'web' }),
    })
  }

  /**
   * Handle Plaid Link success -> create ACHQ payment method
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
   */
  async verifyPaymentMethod(paymentMethodId, amounts) {
    return this.request(`/api/payment-methods/${paymentMethodId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ amounts }),
    })
  }

  /**
   * List saved payment methods (bank_ach)
   */
  async listPaymentMethods(type = 'bank_ach') {
    const qp = new URLSearchParams({ type })
    return this.request(`/api/payment-methods?${qp.toString()}`, {
      method: 'GET',
    })
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(paymentMethodId) {
    return this.request(`/api/payment-methods/${paymentMethodId}`, {
      method: 'DELETE',
    })
  }
}

export const userService = new UserService()
export default UserService

