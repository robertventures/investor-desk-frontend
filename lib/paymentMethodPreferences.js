export const DRAFT_PAYMENT_METHOD_KEY = 'investment_draft_paymentMethod'

export const investmentPaymentMethodKey = (investmentId) => {
  return `investment_${investmentId}_paymentMethodPreference`
}

export const determineDraftPaymentMethod = (accountType, amount) => {
  const normalizedAmount =
    typeof amount === 'number'
      ? amount
      : typeof amount === 'string'
        ? parseFloat(amount) || 0
        : 0

  if (accountType === 'ira') return 'wire'
  if (normalizedAmount > 100000) return 'wire'
  return 'ach'
}

export const persistDraftPaymentMethod = (key, method) => {
  if (typeof window === 'undefined') return
  if (!method) return

  try {
    localStorage.setItem(key, method)
  } catch {
    // noop
  }
}

export const readStoredPaymentMethod = (key) => {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const clearStoredPaymentMethod = (key) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    // noop
  }
}


