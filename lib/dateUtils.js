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

/**
 * Normalize a date to UTC start of day (midnight) for date-based comparisons
 * This ensures that date comparisons are based on calendar days, not time of day
 * 
 * @param {string|Date} value - Date string or Date object
 * @returns {Date} - Date normalized to UTC midnight
 */
export function toUtcStartOfDay(value) {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Get the Eastern Time offset for a given date (handles EST/EDT automatically)
 * EST = UTC-5, EDT = UTC-4
 * 
 * @param {number} year - Year
 * @param {number} month - Month (0-indexed)
 * @param {number} day - Day of month
 * @returns {number} - Offset in hours (5 for EST, 4 for EDT)
 */
function getEasternOffset(year, month, day) {
  // Create a date at noon UTC on this day to safely check DST status
  const testDate = new Date(Date.UTC(year, month, day, 12))
  
  // Get the hour in Eastern Time - this tells us the offset
  const estHour = parseInt(testDate.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false
  }))
  
  // Noon UTC = 7am EST (offset 5) or 8am EDT (offset 4)
  return 12 - estHour
}

/**
 * Normalize a date to Eastern Time start of day (midnight EST/EDT) for date-based comparisons
 * This ensures that date comparisons are based on Eastern Time calendar days
 * 
 * @param {string|Date} value - Date string or Date object
 * @returns {Date} - Date normalized to Eastern Time midnight (returned as UTC timestamp)
 */
export function toEstStartOfDay(value) {
  const date = new Date(value)
  
  // Get the date string in Eastern Time (YYYY-MM-DD format)
  const estDateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [year, month, day] = estDateStr.split('-').map(Number)
  
  // Get the correct offset for this date (handles DST)
  const offsetHours = getEasternOffset(year, month - 1, day)
  
  // Midnight Eastern = offsetHours:00 UTC
  return new Date(Date.UTC(year, month - 1, day, offsetHours))
}

/**
 * Add years to a date while preserving the Eastern Time calendar date
 * This avoids timezone issues with setFullYear() which operates in local time
 * 
 * @param {string|Date} dateValue - Date string or Date object
 * @param {number} years - Number of years to add
 * @returns {Date} - New date with years added, normalized to Eastern Time midnight
 */
export function addYearsEst(dateValue, years) {
  const date = new Date(dateValue)
  
  // Get the date components in Eastern Time
  const estDateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const [year, month, day] = estDateStr.split('-').map(Number)
  
  // Add years to the Eastern Time date
  const newYear = year + years
  
  // Get the correct offset for the new date (handles DST)
  const offsetHours = getEasternOffset(newYear, month - 1, day)
  
  // Return midnight Eastern on the new date
  return new Date(Date.UTC(newYear, month - 1, day, offsetHours))
}

