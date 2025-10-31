/**
 * Date utility functions for handling dates WITHOUT timezone conversion
 * Use these functions when you want to preserve the exact date entered by the user
 */

/**
 * Convert a date-only string (YYYY-MM-DD) to ISO string without timezone shift
 * This ensures that "2024-11-20" stays as "2024-11-20" regardless of timezone
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} - ISO string representing midnight UTC on that date
 */
export function dateOnlyToISO(dateString) {
  if (!dateString) return null
  
  // If it's already a full ISO string, extract just the date part
  if (dateString.includes('T')) {
    dateString = dateString.split('T')[0]
  }
  
  // Parse the date components
  const [year, month, day] = dateString.split('-').map(Number)
  
  // Create a UTC date at midnight (no timezone conversion)
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  
  return date.toISOString()
}

/**
 * Convert an ISO string back to a date-only string (YYYY-MM-DD)
 * 
 * @param {string} isoString - ISO string
 * @returns {string} - Date string in YYYY-MM-DD format
 */
export function isoToDateOnly(isoString) {
  if (!isoString) return null
  return isoString.split('T')[0]
}

/**
 * Add days to a date without timezone conversion
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD or ISO format
 * @param {number} days - Number of days to add
 * @returns {string} - ISO string
 */
export function addDays(dateString, days) {
  const iso = dateOnlyToISO(dateString)
  const date = new Date(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

/**
 * Add years to a date without timezone conversion
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD or ISO format  
 * @param {number} years - Number of years to add
 * @returns {string} - ISO string
 */
export function addYears(dateString, years) {
  const iso = dateOnlyToISO(dateString)
  const date = new Date(iso)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return date.toISOString()
}

/**
 * Get today's date as YYYY-MM-DD in UTC
 * 
 * @returns {string} - Date string in YYYY-MM-DD format
 */
export function getTodayDateOnly() {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

/**
 * Format a date for display as MM/DD/YYYY without timezone conversion
 * Input: "2024-11-20" or "2024-11-20T00:00:00.000Z"
 * Output: "11/20/2024"
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD or ISO format
 * @returns {string} - Formatted date string in MM/DD/YYYY format
 */
export function formatDateForDisplay(dateString) {
  if (!dateString) return ''
  
  // Extract just the date part (YYYY-MM-DD)
  const datePart = dateString.split('T')[0]
  const [year, month, day] = datePart.split('-')
  
  // Return in MM/DD/YYYY format
  return `${month}/${day}/${year}`
}

/**
 * Format a date for display using locale-aware formatting
 * Example: "November 20, 2024"
 * 
 * @param {string} dateString - Date string in any valid format
 * @param {object} options - Intl.DateTimeFormat options (defaults to long format)
 * @returns {string} - Formatted date string
 */
export function formatDateLocale(dateString, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', options)
}

/**
 * Format a date and time for display
 * Example: "11/20/2024, 3:45 PM"
 * 
 * @param {string} dateString - Date string in any valid format
 * @returns {string} - Formatted date and time string
 */
export function formatDateTime(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

