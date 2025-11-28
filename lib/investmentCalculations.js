/**
 * Investment calculation utilities for compound interest and withdrawal eligibility
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

const toUtcStartOfDay = (value) => {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

const addDaysUtc = (date, days) => {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

const getDaysInMonthUtc = (date) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
}

const diffDaysInclusive = (startDate, endDate) => {
  return Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1
}

const buildAccrualSegments = (startDate, endDate) => {
  if (endDate < startDate) return []

  const segments = []
  let cursor = startDate

  const pushPartial = (segmentStart, segmentEnd, daysInMonth) => {
    const days = diffDaysInclusive(segmentStart, segmentEnd)
    segments.push({
      type: 'partial',
      start: segmentStart,
      end: segmentEnd,
      days,
      daysInMonth
    })
  }

  if (cursor.getUTCDate() !== 1) {
    const daysInMonth = getDaysInMonthUtc(cursor)
    const monthEnd = toUtcStartOfDay(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), daysInMonth)))
    const segmentEnd = monthEnd < endDate ? monthEnd : endDate
    pushPartial(cursor, segmentEnd, daysInMonth)
    cursor = addDaysUtc(segmentEnd, 1)
  }

  while (cursor <= endDate) {
    const daysInMonth = getDaysInMonthUtc(cursor)
    const monthEnd = toUtcStartOfDay(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), daysInMonth)))
    if (monthEnd <= endDate) {
      segments.push({
        type: 'full',
        start: cursor,
        end: monthEnd,
        days: daysInMonth,
        daysInMonth
      })
      cursor = addDaysUtc(monthEnd, 1)
    } else {
      pushPartial(cursor, endDate, daysInMonth)
      break
    }
  }

  return segments
}

/**
 * Calculate the current value of an investment with compounding
 * @param {Object} investment - Investment object
 * @param {number} investment.amount - Initial investment amount
 * @param {string} investment.paymentFrequency - 'monthly' or 'compounding'
 * @param {string} investment.lockupPeriod - '1-year' or '3-year'
 * @param {string} investment.confirmedAt - ISO date when investment was confirmed
 * @param {string} [asOfDate] - Calculate as of this date (defaults to current app time)
 * @param {boolean} [includePartialMonth] - If true, include partial current month in calculation (for withdrawals)
 * @returns {Object} Calculation results
 */
export function calculateInvestmentValue(investment, asOfDate = null, includePartialMonth = false) {
  if (!investment) {
    return {
      currentValue: 0,
      totalEarnings: 0,
      monthsElapsed: 0,
      isWithdrawable: false,
      lockupEndDate: null
    }
  }

  // Ensure amount is a number
  const principal = Number(investment.amount) || 0

  // Only calculate compounding for confirmed investments (active, in withdrawal, or withdrawn)
  // withdrawn investments should still show their final accumulated value
  if (investment.status !== 'active' && investment.status !== 'withdrawal_notice' && investment.status !== 'withdrawn') {
    return {
      currentValue: principal,
      totalEarnings: 0,
      monthsElapsed: 0,
      isWithdrawable: false,
      lockupEndDate: null
    }
  }

  // Use confirmedAt as the confirmation date
  // Fallback: If confirmedAt is not set but investment is active/withdrawn, try signedAt or createdAt
  // This handles imported investments that might be missing the specific confirmation timestamp
  let confirmationTimestamp = investment.confirmedAt
  if (!confirmationTimestamp && (investment.status === 'active' || investment.status === 'withdrawal_notice' || investment.status === 'withdrawn')) {
    confirmationTimestamp = investment.signedAt || investment.createdAt
  }
  
  if (!confirmationTimestamp) {
    return {
      currentValue: principal,
      totalEarnings: 0,
      monthsElapsed: 0,
      isWithdrawable: false,
      lockupEndDate: null
    }
  }

  const confirmedDate = new Date(confirmationTimestamp)
  // Interest starts accruing from the day AFTER confirmation
  const accrualStartDate = addDaysUtc(toUtcStartOfDay(confirmedDate), 1)
  const currentDate = toUtcStartOfDay(asOfDate || new Date().toISOString())

  // Calculate lock up end date
  let lockupEndDate
  if (investment.lockupEndDate) {
    lockupEndDate = new Date(investment.lockupEndDate)
  } else {
    const lockupYears = investment.lockupPeriod === '3-year' ? 3 : 1
    lockupEndDate = new Date(confirmedDate)
    lockupEndDate.setFullYear(lockupEndDate.getFullYear() + lockupYears)
  }

  // Normalize payment frequency (handle case sensitivity and aliases)
  // Explicitly check for known frequencies to avoid incorrect handling of future frequency types
  const frequency = (investment.paymentFrequency || '').toLowerCase()
  const isCompounding = frequency === 'compounding' || frequency === 'compound'
  const isMonthly = frequency === 'monthly'

  if (currentDate < accrualStartDate) {
    // Only calculate monthly interest for explicit 'monthly' frequency
    const monthlyInterestAmount = isMonthly
      ? Math.round(principal * ((investment.lockupPeriod === '3-year' ? 0.10 : 0.08) / 12) * 100) / 100
      : 0
    return {
      currentValue: principal,
      totalEarnings: 0,
      monthsElapsed: 0,
      isWithdrawable: false,
      lockupEndDate: lockupEndDate.toISOString(),
      monthlyInterestAmount
    }
  }
  
  // Calculate APY based on lockup period
  const apy = investment.lockupPeriod === '3-year' ? 0.10 : 0.08
  const monthlyRate = apy / 12

  // IMPORTANT: Calculate interest only up to the LAST COMPLETED MONTH END (by default)
  // Distributions are generated at month boundaries, so current value should only reflect completed months
  // This prevents daily value changes and ensures consistency with generated distributions
  // The dual strategy (proration) only applies at investment start/end, not during active months
  // EXCEPTION: For withdrawal payouts, includePartialMonth=true to ensure investors get paid for all accrued days
  
  let calculationEndDate = currentDate
  
  if (!includePartialMonth) {
    // Find the last completed month end before current date
    let cursor = new Date(accrualStartDate)
    let lastCompletedMonthEnd = null
    
    while (cursor <= currentDate) {
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
      if (monthEnd < currentDate) {
        lastCompletedMonthEnd = monthEnd
      } else {
        break
      }
      cursor = addDaysUtc(monthEnd, 1)
    }
    
    // Use last completed month end for calculation (not current date)
    // This ensures values only update at month boundaries
    if (lastCompletedMonthEnd) {
      calculationEndDate = toUtcStartOfDay(lastCompletedMonthEnd)
    } else {
      // No completed months yet - use accrual start date minus 1 day to show zero earnings
      calculationEndDate = addDaysUtc(accrualStartDate, -1)
    }
  }

  const segments = buildAccrualSegments(accrualStartDate, calculationEndDate)
  const monthsElapsed = segments.reduce((acc, segment) => {
    if (segment.type === 'full') return acc + 1
    return acc + (segment.days / segment.daysInMonth)
  }, 0)

  let currentValue = principal
  let totalEarnings = 0

  // Calculate interest for completed months only
  if (isCompounding) {
    // For compounding: interest is added to principal each period
    // IMPORTANT: Round after each period to avoid floating-point precision errors
    // Financial calculations must work with discrete cent values for accuracy and tax compliance
    let balance = principal
    segments.forEach(segment => {
      if (segment.type === 'full') {
        // Full month: simple monthly rate
        // Round interest to cents to prevent accumulation of floating-point errors
        const interest = Math.round(balance * monthlyRate * 100) / 100
        balance = Math.round((balance + interest) * 100) / 100
        totalEarnings = Math.round((totalEarnings + interest) * 100) / 100
      } else {
        // Partial month: daily prorated (only at start/end of investment)
        // Banking standard: divide annual interest by 365 days
        const dailyRate = apy / 365
        const interest = Math.round(balance * dailyRate * segment.days * 100) / 100
        balance = Math.round((balance + interest) * 100) / 100
        totalEarnings = Math.round((totalEarnings + interest) * 100) / 100
      }
    })
    currentValue = balance
  } else {
    // For monthly payout: principal stays the same, calculate total interest earned
    // Round each distribution to cents for consistency
    const monthlyInterest = Math.round(principal * monthlyRate * 100) / 100
    segments.forEach(segment => {
      if (segment.type === 'full') {
        // Full month: full monthly interest
        totalEarnings = Math.round((totalEarnings + monthlyInterest) * 100) / 100
      } else {
        // Partial month: prorated (only at start/end of investment)
        // Banking standard: divide annual interest by 365 days
        const annualInterest = principal * apy
        const dailyInterest = annualInterest / 365
        const prorated = Math.round(dailyInterest * segment.days * 100) / 100
        totalEarnings = Math.round((totalEarnings + prorated) * 100) / 100
      }
    })
    currentValue = principal
  }

  const lockupComparisonDate = new Date(asOfDate || new Date().toISOString())

  return {
    currentValue: Math.round(currentValue * 100) / 100,
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    monthsElapsed,
    isWithdrawable: lockupComparisonDate >= lockupEndDate,
    lockupEndDate: lockupEndDate.toISOString(),
    // Only calculate monthly interest for explicit 'monthly' frequency
    monthlyInterestAmount: isMonthly ? 
      Math.round((principal * monthlyRate) * 100) / 100 : 0
  }
}

/**
 * Calculate months elapsed between two dates, handling mid-month calculations
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Months elapsed (with fractional months)
 */
export function calculateMonthsElapsed(startDate, endDate) {
  const startUtc = toUtcStartOfDay(startDate)
  const endUtc = toUtcStartOfDay(endDate)
  if (endUtc < startUtc) return 0
  const segments = buildAccrualSegments(startUtc, endUtc)
  return segments.reduce((acc, segment) => {
    if (segment.type === 'full') return acc + 1
    return acc + (segment.days / segment.daysInMonth)
  }, 0)
}

/**
 * Calculate withdrawal amounts for an investment
 * @param {Object} investment - Investment object
 * @param {Object} currentValue - Current value calculation from calculateInvestmentValue
 * @returns {Object} Withdrawal details
 */
export function calculateWithdrawalAmount(investment, currentValue) {
  if (!currentValue.isWithdrawable) {
    return {
      canWithdraw: false,
      withdrawableAmount: 0,
      principalAmount: investment.amount,
      earningsAmount: 0,
      lockupEndDate: currentValue.lockupEndDate
    }
  }

  return {
    canWithdraw: true,
    withdrawableAmount: currentValue.currentValue,
    principalAmount: investment.amount,
    earningsAmount: currentValue.totalEarnings,
    lockupEndDate: currentValue.lockupEndDate
  }
}

/**
 * Calculate final withdrawal payout including partial month interest
 * This is used when admin processes a withdrawal to determine the exact amount to pay
 * @param {Object} investment - Investment object
 * @param {string} withdrawalDate - ISO date when withdrawal is processed
 * @returns {Object} Final payout calculation
 */
export function calculateFinalWithdrawalPayout(investment, withdrawalDate) {
  // Use fallback logic for confirmedAt check
  let hasConfirmation = !!investment?.confirmedAt
  if (!hasConfirmation && investment && (investment.status === 'active' || investment.status === 'withdrawal_notice' || investment.status === 'withdrawn')) {
    hasConfirmation = !!(investment.signedAt || investment.createdAt)
  }

  if (!investment || !hasConfirmation) {
    return {
      finalValue: investment?.amount || 0,
      totalEarnings: 0,
      principalAmount: investment?.amount || 0,
      withdrawalDate: withdrawalDate || new Date().toISOString()
    }
  }

  // Calculate value up to withdrawal date (includes partial final month)
  // IMPORTANT: Pass includePartialMonth=true to ensure investors get paid for all accrued days
  const calculation = calculateInvestmentValue(investment, withdrawalDate, true)
  
  return {
    finalValue: calculation.currentValue,
    totalEarnings: calculation.totalEarnings,
    principalAmount: investment.amount,
    withdrawalDate: withdrawalDate || new Date().toISOString(),
    monthsElapsed: calculation.monthsElapsed
  }
}

/**
 * Format currency for display
 * @param {number} amount 
 * @returns {string}
 */
import { formatCurrency as baseFormatCurrency } from './formatters.js'

export function formatCurrency(amount) {
  return baseFormatCurrency(amount)
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string}
 */
export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Get investment status with lock up information
 * @param {Object} investment 
 * @returns {Object}
 */
export function getInvestmentStatus(investment, asOfDate = null) {
  if (investment.status === 'draft') {
    return {
      status: 'draft',
      statusLabel: 'Draft',
      isActive: false,
      isLocked: false
    }
  }
  
  if (investment.status === 'pending') {
    return {
      status: 'pending',
      statusLabel: 'Pending',
      isActive: false,
      isLocked: true
    }
  }
  
  if (investment.status === 'withdrawal_notice') {
    return {
      status: 'withdrawal_notice',
      statusLabel: 'Withdrawal Processing',
      isActive: false,
      isLocked: true
    }
  }
  
  if (investment.status === 'withdrawn') {
    return {
      status: 'withdrawn',
      statusLabel: 'Withdrawn',
      isActive: false,
      isLocked: false
    }
  }
  
  if (investment.status !== 'active') {
    return {
      status: investment.status,
      statusLabel: 'Processing',
      isActive: false,
      isLocked: false
    }
  }

  const currentValue = calculateInvestmentValue(investment, asOfDate)
  
  return {
    status: 'active',
    statusLabel: currentValue.isWithdrawable ? 'Available for Withdrawal' : 'Locked',
    isActive: true,
    isLocked: !currentValue.isWithdrawable,
    lockupEndDate: currentValue.lockupEndDate
  }
}
