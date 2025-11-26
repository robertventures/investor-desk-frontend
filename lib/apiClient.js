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
    return this.auth.refreshAccessToken()
  }

  // =====================================================================
  // AUTH METHODS
  // =====================================================================

  async login(email, password) {
    return this.auth.login(email, password)
  }

  async logout() {
    return this.auth.logout()
  }

  async register(email, password, full_name) {
    return this.auth.register(email, password, full_name)
  }

  async registerPending(email, password) {
    return this.auth.registerPending(email, password)
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

  async getUser(userId) {
    return this.user.getUser(userId)
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

  async verifyPaymentMethod(paymentMethodId, amounts) {
    return this.user.verifyPaymentMethod(paymentMethodId, amounts)
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

  async getAdminWithdrawals() {
    return this.admin.getAdminWithdrawals()
  }

  async getPendingPayouts() {
    return this.admin.getPendingPayouts()
  }

  // =====================================================================
  // UTILITY METHODS
  // =====================================================================

  async submitContactForm(contactData) {
    // Contact form is a bit of an outlier, handled via generic request
    // Could be moved to User or a Support service
    try {
      const data = await this.auth.request('/api/contact', {
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
