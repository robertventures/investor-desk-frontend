/**
 * Environment-aware logger utility
 * Logs in development, silent in production, sanitizes sensitive data
 */

const isDevelopment = process.env.NODE_ENV !== 'production'

// Sensitive fields that should never be logged
const SENSITIVE_FIELDS = [
  'password',
  'ssn',
  'social_security',
  'creditCard',
  'cvv',
  'pin',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
  'sessionId'
]

/**
 * Sanitize object by redacting sensitive fields
 */
function sanitize(data) {
  if (!data || typeof data !== 'object') {
    return data
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitize(item))
  }

  const sanitized = { ...data }
  
  for (const key in sanitized) {
    const lowerKey = key.toLowerCase()
    
    // Redact sensitive fields
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitize(sanitized[key])
    }
  }
  
  return sanitized
}

/**
 * Logger that only logs in development and sanitizes sensitive data
 */
const logger = {
  log: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      )
      console.log(...sanitizedArgs)
    }
  },

  error: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      )
      console.error(...sanitizedArgs)
    } else {
      // In production, still log errors but sanitized
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      )
      console.error('[ERROR]', ...sanitizedArgs)
    }
  },

  warn: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      )
      console.warn(...sanitizedArgs)
    }
  },

  info: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      )
      console.info(...sanitizedArgs)
    }
  },

  debug: (...args) => {
    if (isDevelopment) {
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      )
      console.debug('[DEBUG]', ...sanitizedArgs)
    }
  }
}

export default logger

