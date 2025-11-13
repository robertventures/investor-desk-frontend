/**
 * Input Validation Library
 *
 * Provides comprehensive validation schemas and utilities for all API endpoints.
 * Prevents injection attacks, data corruption, and business logic bypasses.
 */

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

/**
 * Email validation
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email is required', 'email')
  }

  // Trim and lowercase first
  const normalized = email.toLowerCase().trim()

  if (!normalized) {
    throw new ValidationError('Email is required', 'email')
  }

  // Check for common malicious patterns
  if (normalized.includes('<') || normalized.includes('>') || normalized.includes('script')) {
    throw new ValidationError('Invalid email format', 'email')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(normalized)) {
    throw new ValidationError('Invalid email format', 'email')
  }

  return normalized
}

/**
 * Password validation
 */
export function validatePassword(password, isNew = true) {
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required', 'password')
  }

  // For new passwords, enforce strength requirements
  if (isNew) {
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters', 'password')
    }

    const hasUppercase = /[A-Z]/.test(password)
    const hasLowercase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      throw new ValidationError(
        'Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character',
        'password'
      )
    }
  }

  return password
}

/**
 * User ID validation
 */
export function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new ValidationError('User ID is required', 'userId')
  }

  // Format: USR-{number}
  if (!/^USR-\d+$/.test(userId)) {
    throw new ValidationError('Invalid user ID format', 'userId')
  }

  return userId
}

/**
 * Investment ID validation
 */
export function validateInvestmentId(investmentId) {
  if (!investmentId || typeof investmentId !== 'string') {
    throw new ValidationError('Investment ID is required', 'investmentId')
  }

  // Format: INV-{number}
  if (!/^INV-\d+$/.test(investmentId)) {
    throw new ValidationError('Invalid investment ID format', 'investmentId')
  }

  return investmentId
}

/**
 * Amount validation
 */
export function validateAmount(amount, min = 0, max = Infinity) {
  if (amount === null || amount === undefined) {
    throw new ValidationError('Amount is required', 'amount')
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount

  if (isNaN(numAmount)) {
    throw new ValidationError('Amount must be a valid number', 'amount')
  }

  if (numAmount < min) {
    throw new ValidationError(`Amount must be at least $${min}`, 'amount')
  }

  if (numAmount > max) {
    throw new ValidationError(`Amount cannot exceed $${max}`, 'amount')
  }

  // Round to 2 decimal places
  return Math.round(numAmount * 100) / 100
}

/**
 * Investment amount validation (business rules)
 */
export function validateInvestmentAmount(amount) {
  const MIN_INVESTMENT = 1000
  const INVESTMENT_INCREMENT = 10

  const validAmount = validateAmount(amount, MIN_INVESTMENT, 10000000)

  if (validAmount % INVESTMENT_INCREMENT !== 0) {
    throw new ValidationError(
      `Investment amount must be in $${INVESTMENT_INCREMENT} increments`,
      'amount'
    )
  }

  return validAmount
}

/**
 * Name validation
 */
export function validateName(name, fieldName = 'name') {
  if (!name || typeof name !== 'string') {
    throw new ValidationError(`${fieldName} is required`, fieldName)
  }

  const trimmed = name.trim()

  if (trimmed.length < 1) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName)
  }

  if (trimmed.length > 100) {
    throw new ValidationError(`${fieldName} cannot exceed 100 characters`, fieldName)
  }

  // Check for malicious patterns
  if (/<script|javascript:|onerror=/i.test(trimmed)) {
    throw new ValidationError(`Invalid ${fieldName}`, fieldName)
  }

  return trimmed
}

/**
 * Phone number validation
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    throw new ValidationError('Phone number is required', 'phone')
  }

  const trimmed = phone.trim()

  // Allow various formats: +1-555-0100, (555) 555-0100, 555-555-0100, etc.
  const phoneRegex = /^[\d\s\-\+\(\)]+$/
  if (!phoneRegex.test(trimmed)) {
    throw new ValidationError('Invalid phone number format', 'phone')
  }

  // Extract digits only
  const digits = trimmed.replace(/\D/g, '')

  if (digits.length < 10 || digits.length > 15) {
    throw new ValidationError('Phone number must be 10-15 digits', 'phone')
  }

  return trimmed
}

/**
 * Date validation
 */
export function validateDate(dateStr, fieldName = 'date') {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new ValidationError(`${fieldName} is required`, fieldName)
  }

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${fieldName} format`, fieldName)
  }

  return dateStr
}

/**
 * SSN validation
 */
export function validateSSN(ssn) {
  if (!ssn || typeof ssn !== 'string') {
    throw new ValidationError('SSN is required', 'ssn')
  }

  const trimmed = ssn.trim()

  // Format: XXX-XX-XXXX or XXXXXXXXX
  const ssnRegex = /^\d{3}-?\d{2}-?\d{4}$/
  if (!ssnRegex.test(trimmed)) {
    throw new ValidationError('Invalid SSN format. Must be XXX-XX-XXXX', 'ssn')
  }

  // Check for invalid SSN patterns (e.g., 000-00-0000, 123-45-6789)
  const digits = trimmed.replace(/-/g, '')
  if (digits === '000000000' || digits === '123456789') {
    throw new ValidationError('Invalid SSN', 'ssn')
  }

  // Normalize format
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

/**
 * Address validation
 */
export function validateAddress(address) {
  if (!address || typeof address !== 'object') {
    throw new ValidationError('Address is required', 'address')
  }

  const validatedAddress = {}

  // Street 1 (required)
  validatedAddress.street1 = validateName(address.street1, 'street1')

  // Street 2 (optional)
  if (address.street2) {
    validatedAddress.street2 = validateName(address.street2, 'street2')
  } else {
    validatedAddress.street2 = null
  }

  // City (required)
  validatedAddress.city = validateName(address.city, 'city')

  // State (required, full name)
  const state = validateName(address.state, 'state')
  const validStates = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
    'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
    'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
    'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
    'Wisconsin', 'Wyoming'
  ]
  if (!validStates.includes(state)) {
    throw new ValidationError('Invalid state. Must be full state name', 'state')
  }
  validatedAddress.state = state

  // ZIP code (required)
  if (!address.zip || typeof address.zip !== 'string') {
    throw new ValidationError('ZIP code is required', 'zip')
  }
  const zipRegex = /^\d{5}(-\d{4})?$/
  if (!zipRegex.test(address.zip.trim())) {
    throw new ValidationError('Invalid ZIP code format. Must be XXXXX or XXXXX-XXXX', 'zip')
  }
  validatedAddress.zip = address.zip.trim()

  return validatedAddress
}

/**
 * Lockup period validation
 */
export function validateLockupPeriod(period) {
  const validPeriods = ['1-year', '3-year']
  if (!validPeriods.includes(period)) {
    throw new ValidationError('Lockup period must be "1-year" or "3-year"', 'lockupPeriod')
  }
  return period
}

/**
 * Payment frequency validation
 */
export function validatePaymentFrequency(frequency) {
  const validFrequencies = ['monthly', 'compounding']
  if (!validFrequencies.includes(frequency)) {
    throw new ValidationError('Payment frequency must be "monthly" or "compounding"', 'paymentFrequency')
  }
  return frequency
}

/**
 * Account type validation
 */
export function validateAccountType(type) {
  const validTypes = ['individual', 'joint', 'entity', 'ira']
  if (!validTypes.includes(type)) {
    throw new ValidationError('Invalid account type', 'accountType')
  }
  return type
}

/**
 * Payment method validation
 */
export function validatePaymentMethod(method, amount, accountType, options = {}) {
  const { required = true } = options
  const normalizedMethod = typeof method === 'string' ? method.toLowerCase().trim() : method
  const isMissing = normalizedMethod === undefined || normalizedMethod === null || normalizedMethod === ''
  const validMethods = ['ach', 'wire']

  if (isMissing) {
    if (required) {
      throw new ValidationError('Payment method must be "ach" or "wire"', 'paymentMethod')
    }
    return undefined
  }

  if (!validMethods.includes(normalizedMethod)) {
    throw new ValidationError('Payment method must be "ach" or "wire"', 'paymentMethod')
  }

  // Business rule: ACH limited to $100,000
  if (normalizedMethod === 'ach' && amount > 100000) {
    throw new ValidationError(
      'Investments over $100,000 must use wire transfer',
      'paymentMethod'
    )
  }

  // Business rule: IRA must use wire
  if (accountType === 'ira' && normalizedMethod !== 'wire') {
    throw new ValidationError('IRA accounts must use wire transfer', 'paymentMethod')
  }

  return normalizedMethod
}

/**
 * Investment status validation
 */
export function validateInvestmentStatus(status) {
  const validStatuses = ['draft', 'pending', 'active', 'withdrawal_notice', 'withdrawn', 'rejected']
  if (!validStatuses.includes(status)) {
    throw new ValidationError('Invalid investment status', 'status')
  }
  return status
}

/**
 * Validate investment creation data
 */
export function validateInvestmentData(data) {
  const validated = {}

  validated.amount = validateInvestmentAmount(data.amount)
  validated.lockupPeriod = validateLockupPeriod(data.lockupPeriod)
  validated.paymentFrequency = validatePaymentFrequency(data.paymentFrequency)
  validated.accountType = validateAccountType(data.accountType)
  if (data.paymentMethod !== undefined && data.paymentMethod !== null) {
    validated.paymentMethod = validatePaymentMethod(
      data.paymentMethod,
      validated.amount,
      validated.accountType
    )
  } else {
    validated.paymentMethod = null
  }

  // Business rule: IRA cannot have monthly payouts
  if (validated.accountType === 'ira' && validated.paymentFrequency === 'monthly') {
    throw new ValidationError(
      'IRA accounts can only use compounding payment frequency',
      'paymentFrequency'
    )
  }

  return validated
}

/**
 * Validate user update data
 */
export function validateUserUpdateData(data) {
  const validated = {}

  if (data.firstName !== undefined) {
    validated.firstName = validateName(data.firstName, 'firstName')
  }

  if (data.lastName !== undefined) {
    validated.lastName = validateName(data.lastName, 'lastName')
  }

  if (data.phone !== undefined) {
    validated.phone = validatePhone(data.phone)
  }

  if (data.dob !== undefined) {
    validated.dob = validateDate(data.dob, 'date of birth')
  }

  if (data.ssn !== undefined) {
    validated.ssn = validateSSN(data.ssn)
  }

  if (data.address !== undefined) {
    validated.address = validateAddress(data.address)
  }

  if (data.accountType !== undefined) {
    validated.accountType = validateAccountType(data.accountType)
  }

  return validated
}

/**
 * Sanitize string for XSS prevention
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str

  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(params) {
  const validated = {}

  if (params.page !== undefined) {
    const page = parseInt(params.page)
    if (isNaN(page) || page < 1) {
      throw new ValidationError('Page must be a positive integer', 'page')
    }
    validated.page = page
  } else {
    validated.page = 1
  }

  if (params.limit !== undefined) {
    const limit = parseInt(params.limit)
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new ValidationError('Limit must be between 1 and 1000', 'limit')
    }
    validated.limit = limit
  } else {
    validated.limit = 100
  }

  return validated
}

/**
 * Validate sort parameters
 */
export function validateSortParams(params, allowedFields = []) {
  const validated = {}

  if (params.sortBy !== undefined) {
    if (!allowedFields.includes(params.sortBy)) {
      throw new ValidationError(
        `Sort field must be one of: ${allowedFields.join(', ')}`,
        'sortBy'
      )
    }
    validated.sortBy = params.sortBy
  }

  if (params.sortOrder !== undefined) {
    if (!['asc', 'desc'].includes(params.sortOrder)) {
      throw new ValidationError('Sort order must be "asc" or "desc"', 'sortOrder')
    }
    validated.sortOrder = params.sortOrder
  }

  return validated
}

/**
 * Validate object against schema
 */
export function validateSchema(data, schema) {
  const validated = {}

  for (const [field, validator] of Object.entries(schema)) {
    const value = data[field]

    // Check required fields
    if (validator.required && (value === undefined || value === null || value === '')) {
      throw new ValidationError(`${field} is required`, field)
    }

    // Skip optional fields if not provided
    if (!validator.required && (value === undefined || value === null)) {
      continue
    }

    // Apply validator function
    try {
      validated[field] = validator.validate(value)
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }
      throw new ValidationError(`Invalid ${field}: ${error.message}`, field)
    }
  }

  return validated
}
