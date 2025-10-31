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
  if (amount === null || amount === undefined) return '$0.00'
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hideCents ? 0 : 2,
    maximumFractionDigits: hideCents ? 0 : 2
  })
  
  return formatter.format(amount)
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

