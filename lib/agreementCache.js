'use client'

/**
 * Agreement cache helper
 *
 * Persists normalized agreement payloads (as returned by apiClient._normalizeAgreementResponse)
 * so that other screens can reuse them without re-fetching immediately after generation.
 *
 * Storage strategy:
 * - Uses localStorage when available (browser environment) with a simple TTL.
 * - Falls back to an in-memory cache when localStorage cannot be accessed (SSR / private mode).
 *
 * Cached shape:
 * {
 *   [investmentId]: {
 *     agreement: { signed_url?, pdf_base64?, ... },
 *     meta: { fileName?, source? ... },
 *     storedAt: number (ms since epoch),
 *     expiresAt: number (ms since epoch)
 *   }
 * }
 */

const STORAGE_KEY = 'investmentAgreementCache'
const DEFAULT_TTL_MS = 1000 * 60 * 30 // 30 minutes

const memoryCache = {
  data: {},
  lastCleanup: 0
}

const isBrowser = () => typeof window !== 'undefined'

const now = () => Date.now()

const safeParse = (value) => {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const readStore = () => {
  if (isBrowser()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      return safeParse(raw)
    } catch {
      // Fall through to memory cache
    }
  }
  return memoryCache.data
}

const writeStore = (store) => {
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
      return
    } catch {
      // Fall back to memory cache
    }
  }
  memoryCache.data = store
}

const cleanupStore = (store) => {
  const cutOff = now()
  let dirty = false

  Object.keys(store).forEach((key) => {
    const record = store[key]
    if (!record || typeof record !== 'object') {
      delete store[key]
      dirty = true
      return
    }

    if (record.expiresAt && record.expiresAt <= cutOff) {
      delete store[key]
      dirty = true
    }
  })

  if (dirty) {
    writeStore(store)
  }

  return store
}

const normalizeInvestmentId = (investmentId) => {
  if (investmentId === null || investmentId === undefined) return null
  return investmentId.toString()
}

export const agreementCache = {
  /**
   * Persist an agreement payload for an investment.
   *
   * @param {string|number} investmentId
   * @param {object} agreementData - normalized agreement payload
   * @param {object} options
   * @param {number} options.ttlMs - override TTL in milliseconds
   * @param {object} options.meta - additional metadata to store alongside the payload
   */
  set(investmentId, agreementData, { ttlMs = DEFAULT_TTL_MS, meta = {} } = {}) {
    const key = normalizeInvestmentId(investmentId)
    if (!key || !agreementData || typeof agreementData !== 'object') return

    const store = cleanupStore(readStore())
    const storedAt = now()
    const expiresAt = ttlMs > 0 ? storedAt + ttlMs : null

    store[key] = {
      agreement: agreementData,
      meta,
      storedAt,
      expiresAt
    }

    writeStore(store)
  },

  /**
   * Retrieve a cached agreement if it exists and is still valid.
   *
   * @param {string|number} investmentId
   * @returns {{agreement: object, meta: object, storedAt: number, expiresAt: number}|null}
   */
  get(investmentId) {
    const key = normalizeInvestmentId(investmentId)
    if (!key) return null

    const store = cleanupStore(readStore())
    const record = store[key]
    return record || null
  },

  /**
   * Retrieve all cached agreements (filtered for validity).
   *
   * @returns {Record<string, {agreement: object, meta: object, storedAt: number, expiresAt: number}>}
   */
  getAll() {
    return cleanupStore(readStore())
  },

  /**
   * Remove a cached agreement for the specified investment.
   *
   * @param {string|number} investmentId
   */
  remove(investmentId) {
    const key = normalizeInvestmentId(investmentId)
    if (!key) return

    const store = readStore()
    if (store[key]) {
      delete store[key]
      writeStore(store)
    }
  },

  /**
   * Clear every cached agreement.
   */
  clear() {
    if (isBrowser()) {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    }
    memoryCache.data = {}
    memoryCache.lastCleanup = now()
  }
}

// Periodic cleanup for long-lived sessions (memory fallback)
export const agreementCacheCleanup = () => {
  const timestamp = now()
  if (timestamp - memoryCache.lastCleanup < DEFAULT_TTL_MS) return
  memoryCache.lastCleanup = timestamp
  cleanupStore(readStore())
}

