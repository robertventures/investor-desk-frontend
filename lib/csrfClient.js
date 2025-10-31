/**
 * CSRF Client Utility - DISABLED FOR NOW
 *
 * CSRF protection has been temporarily disabled to resolve build issues.
 * Re-enable when email service is configured and proper testing is done.
 *
 * Usage:
 * import { fetchWithCsrf } from '@/lib/csrfClient'
 *
 * // Use like normal fetch - CSRF protection is disabled
 * const response = await fetchWithCsrf('/api/users/profile', {
 *   method: 'PUT',
 *   body: JSON.stringify(data)
 * })
 */

/**
 * Fetch wrapper - CSRF protection disabled
 * @param {string} url - Request URL
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithCsrf(url, options = {}) {
  // Ensure credentials are included (for cookies)
  options.credentials = options.credentials || 'include'

  return fetch(url, options)
}

/**
 * Get CSRF token - disabled
 * @returns {Promise<string>} Always returns empty string
 */
export async function getCsrfToken() {
  return ''
}

/**
 * Clear cached CSRF token - disabled
 */
export function clearCsrfToken() {
  // No-op
}

/**
 * Refresh CSRF token - disabled
 * @returns {Promise<string>} Always returns empty string
 */
export async function refreshCsrfToken() {
  return ''
}

/**
 * Initialize CSRF token - disabled
 */
export function initCsrfToken() {
  // No-op
}

