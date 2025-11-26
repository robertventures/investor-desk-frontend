/**
 * Centralized formatting utilities for display purposes
 * Use these functions consistently across all components
 */

/**
 * Format a number as USD currency
 * Example: 50000 => "$50,000.00"
 * 
 * @param {number} amount - The amount to format
 * @param {boolean} hideCents - Whether to hide cents (defaults to false)
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(amount, hideCents = false) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0.00'
  
  // Convert to number if it's a string
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  
  // Check again after conversion
  if (isNaN(numAmount)) return '$0.00'
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hideCents ? 0 : 2,
    maximumFractionDigits: hideCents ? 0 : 2
  })
  
  return formatter.format(numAmount)
}

/**
 * Format a number as a percentage
 * Example: 0.12 => "12.00%"
 * 
 * @param {number} value - The decimal value (0.12 for 12%)
 * @param {number} decimals - Number of decimal places (defaults to 2)
 * @returns {string} - Formatted percentage string
 */
export function formatPercentage(value, decimals = 2) {
  if (value === null || value === undefined) return '0.00%'
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Format a number with thousands separators
 * Example: 1000000 => "1,000,000"
 * 
 * @param {number} value - The number to format
 * @returns {string} - Formatted number string
 */
export function formatNumber(value) {
  if (value === null || value === undefined) return '0'
  return new Intl.NumberFormat('en-US').format(value)
}

/**
 * Names: Allow only letters, spaces, hyphens, apostrophes, and periods
 */
export const formatName = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

/**
 * Entity Names: Allow letters, numbers, spaces, hyphens, periods, commas, and hash symbols
 */
export const formatEntityName = (value = '') => value.replace(/[^a-zA-Z0-9\s'\-\.&,]/g, '')

/**
 * City names: Allow only letters, spaces, hyphens, apostrophes, and periods
 */
export const formatCity = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

/**
 * Street addresses: Allow letters, numbers, spaces, hyphens, periods, commas, and hash symbols
 */
export const formatStreet = (value = '') => value.replace(/[^a-zA-Z0-9\s'\-\.,#]/g, '')

/**
 * Format US phone numbers as (XXX) XXX-XXXX while typing (ignore leading country code 1)
 */
export const formatPhone = (value = '') => {
  const digitsOnly = (value || '').replace(/\D/g, '')
  const withoutCountry = digitsOnly.startsWith('1') && digitsOnly.length === 11 ? digitsOnly.slice(1) : digitsOnly
  const len = withoutCountry.length
  if (len === 0) return ''
  if (len <= 3) return `(${withoutCountry}`
  if (len <= 6) return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3)}`
  return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3, 6)}-${withoutCountry.slice(6, 10)}`
}

/**
 * Mask SSN for display (show last 4 digits only)
 */
export const maskSSN = (ssn = '') => {
  if (!ssn) return ''
  const digits = ssn.replace(/\D/g, '')
  if (digits.length === 9) {
    return `***-**-${digits.slice(-4)}`
  }
  return '***-**-****'
}
