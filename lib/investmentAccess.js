const LOCKING_STATUSES = ['pending', 'active']

const STATUS_LABELS = {
  draft: 'draft',
  pending: 'pending',
  active: 'active'
}

const timestampOrZero = (value) => {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : 0
}

const normalizeStatus = (status) => (typeof status === 'string' ? status.toLowerCase() : '')

/**
 * Determine if the user should be restricted to a single account type based on
 * existing investments (pending or active).
 *
 * @param {Object|Array} userOrInvestments - Either a user object that contains
 *   an `investments` array and optional `accountType`, or an investments array.
 * @param {string|null} explicitAccountType - Optional fallback account type.
 * @returns {{
 *   lockedAccountType: string|null,
 *   lockingStatus: string|null,
 *   investmentId: number|string|null,
 *   investment: Object|null
 * }}
 */
export function getInvestmentTypeLockInfo(userOrInvestments, explicitAccountType = null) {
  const investments = Array.isArray(userOrInvestments)
    ? userOrInvestments
    : Array.isArray(userOrInvestments?.investments)
      ? userOrInvestments.investments
      : []

  const fallbackAccountType = explicitAccountType || (!Array.isArray(userOrInvestments) ? userOrInvestments?.accountType : null) || null

  let lockingCandidate = null

  for (const status of LOCKING_STATUSES) {
    const matches = investments
      .filter((inv) => normalizeStatus(inv.status) === status)
      .sort((a, b) => timestampOrZero(b.updatedAt || b.createdAt) - timestampOrZero(a.updatedAt || a.createdAt))

    if (matches.length > 0) {
      lockingCandidate = { status, investment: matches[0] }
      break
    }
  }

  if (!lockingCandidate) {
    return {
      lockedAccountType: null,
      lockingStatus: null,
      investmentId: null,
      investment: null
    }
  }

  const lockedAccountType =
    lockingCandidate.investment?.accountType ||
    fallbackAccountType ||
    null

  if (!lockedAccountType) {
    return {
      lockedAccountType: null,
      lockingStatus: null,
      investmentId: null,
      investment: null
    }
  }

  return {
    lockedAccountType,
    lockingStatus: lockingCandidate.status,
    investmentId: lockingCandidate.investment?.id ?? null,
    investment: lockingCandidate.investment || null
  }
}

export const getLockingStatusLabel = (status) => STATUS_LABELS[status] || status || ''

export const hasInvestmentTypeLock = (userOrInvestments, explicitAccountType = null) => {
  const info = getInvestmentTypeLockInfo(userOrInvestments, explicitAccountType)
  return Boolean(info.lockedAccountType && info.lockingStatus)
}

export { LOCKING_STATUSES }

