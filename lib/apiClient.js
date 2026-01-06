import { authService } from './services/auth'
import { userService } from './services/user'
import { investmentService } from './services/investment'
import { adminService } from './services/admin'

/**
 * API Client - Centralized API Communication Layer
 * 
 * @deprecated This class is maintained for backward compatibility.
 * Please use the modular services in lib/services/ instead:
 * - authService (Authentication)
 * - userService (User Profile & Settings)
 * - investmentService (Investments & Documents)
 * - adminService (Admin Operations)
 */

class ApiClient {
  constructor() {
    this.auth = authService
    this.user = userService
    this.investment = investmentService
    this.admin = adminService
  }

  // Proxy properties to auth service
  get baseUrl() { return this.auth.baseUrl }
  get accessToken() { return this.auth.accessToken }
  get refreshToken() { return this.auth.refreshToken }

  // =====================================================================
  // PROXY METHODS
  // =====================================================================

  buildUrl(endpoint) {
    return this.auth.buildUrl(endpoint)
  }

  setTokens(accessToken, refreshToken) {
    this.auth.setTokens(accessToken, refreshToken)
    this.user.setTokens(accessToken, refreshToken)
    this.investment.setTokens(accessToken, refreshToken)
    this.admin.setTokens(accessToken, refreshToken)
  }

  clearTokens() {
    this.auth.clearTokens()
    this.user.clearTokens()
    this.investment.clearTokens()
    this.admin.clearTokens()
  }

  ensureTokensLoaded() {
    this.auth.ensureTokensLoaded()
    this.user.ensureTokensLoaded()
    this.investment.ensureTokensLoaded()
    this.admin.ensureTokensLoaded()
  }

  isAuthenticated() {
    return this.auth.isAuthenticated()
  }

  async refreshAccessToken() {
    const newAccessToken = await this.auth.refreshAccessToken()
    // Sync the refreshed tokens to all services to prevent race conditions
    this.setTokens(this.auth.accessToken, this.auth.refreshToken)
    return newAccessToken
  }

  /**
   * Generic request method for backward compatibility
   * Components can use this for custom API calls
   */
  async request(endpoint, options = {}) {
    return this.auth.request(endpoint, options)
  }

  // =====================================================================
  // AUTH METHODS
  // =====================================================================

  async login(email, password) {
    const result = await this.auth.login(email, password)
    
    // Sync tokens to all services after successful login to ensure consistency
    if (result && result.success && result.access_token) {
      this.setTokens(result.access_token, result.refresh_token)
    }
    
    return result
  }

  async logout() {
    // Ensure logout clears tokens across ALL services (auth/user/investment/admin).
    // This prevents stale in-memory refresh tokens from re-authenticating the user
    // after logout until a hard refresh.
    try {
      // auth.logout() clears only the auth service tokens; keep for compatibility/future server-side logout.
      return await this.auth.logout()
    } finally {
      // Clear tokens everywhere regardless of logout call outcome
      this.clearTokens()
    }
  }

  async register(email, password, full_name, phone) {
    return this.auth.register(email, password, full_name, phone)
  }

  async registerPending(email, password, phone) {
    return this.auth.registerPending(email, password, phone)
  }

  async requestPasswordReset(email) {
    return this.auth.requestPasswordReset(email)
  }

  async resetPassword(token, newPassword) {
    return this.auth.resetPassword(token, newPassword)
  }

  // =====================================================================
  // USER METHODS
  // =====================================================================

  async getCurrentUser() {
    return this.user.getCurrentUser()
  }

  async getUserProfile() {
    return this.user.getUserProfile()
  }

  async updateUserProfile(data) {
    return this.user.updateUserProfile(data)
  }

  async patchUserProfile(data) {
    return this.user.patchUserProfile(data)
  }

  async confirmAccount(userId, verificationCode) {
    return this.user.confirmAccount(userId, verificationCode)
  }

  async changePassword(currentPassword, newPassword) {
    return this.user.changePassword(currentPassword, newPassword)
  }

  async updateTrustedContact(data) {
    return this.user.updateTrustedContact(data)
  }

  async getTrustedContact() {
    return this.user.getTrustedContact()
  }

  async createTrustedContact(data) {
    return this.user.createTrustedContact(data)
  }

  async updateUser(userId, data) {
    return this.user.updateUser(userId, data)
  }


  // =====================================================================
  // PAYMENT METHODS
  // =====================================================================

  async createPlaidLinkToken() {
    return this.user.createPlaidLinkToken()
  }

  async postPlaidLinkSuccess(data) {
    return this.user.postPlaidLinkSuccess(data)
  }

  async createManualPaymentMethod(data, idempotencyKey) {
    return this.user.createManualPaymentMethod(data, idempotencyKey)
  }

  async listPaymentMethods(type) {
    return this.user.listPaymentMethods(type)
  }

  async deletePaymentMethod(paymentMethodId) {
    return this.user.deletePaymentMethod(paymentMethodId)
  }

  // =====================================================================
  // INVESTMENT METHODS
  // =====================================================================

  async getInvestments(userId) {
    return this.investment.getInvestments(userId)
  }

  async getInvestment(investmentId) {
    return this.investment.getInvestment(investmentId)
  }

  async createInvestment(userId, investmentData) {
    return this.investment.createInvestment(userId, investmentData)
  }

  async updateInvestment(userId, investmentId, fields) {
    return this.investment.updateInvestment(userId, investmentId, fields)
  }

  async saveIdentityDraft(investmentId, draft) {
    return this.investment.saveIdentityDraft(investmentId, draft)
  }

  async deleteInvestment(userId, investmentId) {
    return this.investment.deleteInvestment(userId, investmentId)
  }

  async submitInvestment(investmentId, payload) {
    return this.investment.submitInvestment(investmentId, payload)
  }

  async getPayoutSummary(investmentId) {
    return this.investment.getPayoutSummary(investmentId)
  }

  async getCompoundingSummary(investmentId) {
    return this.investment.getCompoundingSummary(investmentId)
  }

  async createAttestation(investmentId, attestationData) {
    return this.investment.createAttestation(investmentId, attestationData)
  }

  async getActivityEvents() {
    return this.investment.getActivityEvents()
  }

  async fundInvestment(investmentId, paymentMethodId, amountCents, idempotencyKey, memo) {
    return this.investment.fundInvestment(investmentId, paymentMethodId, amountCents, idempotencyKey, memo)
  }

  async getFundingStatus(investmentId, fundingId) {
    return this.investment.getFundingStatus(investmentId, fundingId)
  }

  async requestWithdrawal(investmentId) {
    return this.investment.requestWithdrawal(investmentId)
  }

  async generateBondAgreement(investmentId, userId) {
    return this.investment.generateBondAgreement(investmentId, userId)
  }

  async getBondAgreement(investmentId, userId) {
    return this.investment.getBondAgreement(investmentId, userId)
  }

  async downloadBondAgreement(investmentId, userId) {
    return this.investment.downloadBondAgreement(investmentId, userId)
  }

  // =====================================================================
  // ADMIN METHODS
  // =====================================================================

  async getAllUsers(params) {
    return this.admin.getAllUsers(params)
  }

  async getAdminActivityEvents(params) {
    return this.admin.getAdminActivityEvents(params)
  }

  async getUserActivityEvents(userId) {
    return this.admin.getUserActivityEvents(userId)
  }

  async getAdminInvestments(params) {
    return this.admin.getAdminInvestments(params)
  }

  async approveInvestment(investmentId) {
    return this.admin.approveInvestment(investmentId)
  }

  async rejectInvestment(investmentId, reason) {
    return this.admin.rejectInvestment(investmentId, reason)
  }

  async getAppTime() {
    return this.admin.getAppTime()
  }

  async setAppTime(appTime) {
    return this.admin.setAppTime(appTime)
  }

  async resetAppTime() {
    return this.admin.resetAppTime()
  }

  async deleteUser(userId) {
    return this.admin.deleteUser(userId)
  }

  async getAdminWithdrawals(params) {
    return this.admin.getAdminWithdrawals(params)
  }

  async getWithdrawal(withdrawalId) {
    return this.admin.getWithdrawal(withdrawalId)
  }

  async approveWithdrawal(withdrawalId) {
    return this.admin.approveWithdrawal(withdrawalId)
  }

  async rejectWithdrawal(withdrawalId) {
    return this.admin.rejectWithdrawal(withdrawalId)
  }

  async getPendingPayouts() {
    return this.admin.getPendingPayouts()
  }

  async getAllTransactions(params) {
    return this.admin.getAllTransactions(params)
  }

  async processAchqPayment(transactionId) {
    return this.admin.processAchqPayment(transactionId)
  }

  async getInvestmentCalculation(userId, investmentId) {
    return this.admin.getInvestmentCalculation(userId, investmentId)
  }

  // =====================================================================
  // UTILITY METHODS
  // =====================================================================

  async submitContactForm(contactData) {
    // Contact form syncs to GoHighLevel and sends confirmation email
    try {
      const data = await this.auth.request('/api/support/contact', {
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

  getBackendUrl() {
    return this.auth.baseUrl || 'relative /api routes'
  }
}

// Export singleton instance for backward compatibility
export const apiClient = new ApiClient()

// Export class
export default ApiClient
