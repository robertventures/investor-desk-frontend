/**
 * Webhook Helper Module
 * 
 * Client-side helper to trigger webhooks through internal API routes.
 * The actual webhook URLs are stored server-side and never exposed to the browser.
 */

const WEBHOOK_ENDPOINTS = {
  'account-created': '/api/webhooks/account-created',
  'investment-draft': '/api/webhooks/investment-draft',
  'investment-pending': '/api/webhooks/investment-pending',
  'investment-complete': '/api/webhooks/investment-complete',
}

/**
 * Trigger a webhook through the internal API route
 * 
 * @param {string} type - Webhook type: 'account-created' | 'investment-draft' | 'investment-pending' | 'investment-complete'
 * @param {Object} data - Data to send with the webhook
 * @param {string} data.email - User's email (required for all webhooks)
 * @param {string} [data.phone] - User's phone number
 * @param {string} [data.firstName] - User's first name
 * @param {string} [data.lastName] - User's last name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function triggerWebhook(type, data) {
  const endpoint = WEBHOOK_ENDPOINTS[type]
  
  if (!endpoint) {
    console.error(`[Webhook] Unknown webhook type: ${type}`)
    return { success: false, error: `Unknown webhook type: ${type}` }
  }

  if (!data?.email) {
    console.error(`[Webhook] Email is required for webhook: ${type}`)
    return { success: false, error: 'Email is required' }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      console.error(`[Webhook] ${type} failed:`, result.error || response.statusText)
      return { success: false, error: result.error || 'Webhook failed' }
    }

    console.log(`[Webhook] ${type} triggered successfully`)
    return { success: true }

  } catch (error) {
    // Don't let webhook failures break the main flow
    console.error(`[Webhook] ${type} error:`, error)
    return { success: false, error: error.message || 'Network error' }
  }
}

/**
 * Trigger account-created webhook
 * @param {string} email - User's email
 */
export async function triggerAccountCreated(email) {
  return triggerWebhook('account-created', { email })
}

/**
 * Trigger investment-draft webhook
 * @param {Object} userData - User data
 * @param {string} userData.email - User's email
 * @param {string} [userData.phone] - User's phone number
 * @param {string} [userData.firstName] - User's first name
 * @param {string} [userData.lastName] - User's last name
 */
export async function triggerInvestmentDraft(userData) {
  return triggerWebhook('investment-draft', userData)
}

/**
 * Trigger investment-pending webhook
 * @param {Object} userData - User data
 * @param {string} userData.email - User's email
 * @param {string} [userData.phone] - User's phone number
 * @param {string} [userData.firstName] - User's first name
 * @param {string} [userData.lastName] - User's last name
 */
export async function triggerInvestmentPending(userData) {
  return triggerWebhook('investment-pending', userData)
}

/**
 * Trigger investment-complete webhook
 * @param {Object} userData - User data
 * @param {string} userData.email - User's email
 * @param {string} [userData.phone] - User's phone number
 * @param {string} [userData.firstName] - User's first name
 * @param {string} [userData.lastName] - User's last name
 */
export async function triggerInvestmentComplete(userData) {
  return triggerWebhook('investment-complete', userData)
}

