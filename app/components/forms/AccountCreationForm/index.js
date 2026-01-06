'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import styles from './AccountCreationForm.module.css'

// Format phone number as (XXX) XXX-XXXX for display
const formatPhone = (value = '') => {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// Normalize phone number to E.164 format for database storage (+1XXXXXXXXXX)
const normalizePhoneForDB = (value = '') => {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+1${digits}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  return value
}

// Validate US phone number (10 digits, area code starts with 2-9)
const isValidUSPhone = (value = '') => {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 10) return false
  return /^[2-9][0-9]{9}$/.test(digits)
}

export default function AccountCreationForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [accountExistsError, setAccountExistsError] = useState('')
  const [generalError, setGeneralError] = useState('')
  
  // Clear any stale registration data when component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pendingRegistration')
      // Don't clear signupEmail here - it might be legitimate if user is coming back
    }
  }, [])
  
  const hasUppercase = /[A-Z]/.test(form.password)
  const hasNumber = /[0-9]/.test(form.password)
  const hasSpecial = /[^A-Za-z0-9]/.test(form.password)
  const hasMinLength = form.password.length >= 8
  const isPasswordValid = hasUppercase && hasNumber && hasSpecial && hasMinLength

  const passwordRequirements = [
    { label: '8 Characters', isMet: hasMinLength },
    { label: '1 Uppercase letter', isMet: hasUppercase },
    { label: '1 Number', isMet: hasNumber },
    { label: '1 Special character', isMet: hasSpecial }
  ]

  const shouldShowRequirements = isPasswordFocused

  const handleChange = (e) => {
    const { name, value } = e.target
    let normalizedValue = value
    
    // Normalize email to lowercase to prevent case-sensitivity issues
    if (name === 'email') {
      normalizedValue = value.toLowerCase()
    } else if (name === 'phoneNumber') {
      normalizedValue = formatPhone(value)
    }
    
    setForm(prev => ({ ...prev, [name]: normalizedValue }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    if (accountExistsError) setAccountExistsError('')
    if (generalError) setGeneralError('')
  }

  const validate = () => {
    const newErrors = {}
    if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = 'Invalid email'
    if (!form.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!isValidUSPhone(form.phoneNumber)) {
      newErrors.phoneNumber = 'Please enter a valid 10-digit US phone number'
    }
    if (!isPasswordValid) newErrors.password = 'Password does not meet requirements'
    if (form.confirmPassword !== form.password) newErrors.confirmPassword = 'Passwords do not match'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLoginRedirect = () => {
    router.push('/login')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setAccountExistsError('')
    
    try {
      // Register as pending user (not added to database yet)
      const phoneForDB = normalizePhoneForDB(form.phoneNumber)
      const data = await apiClient.registerPending(form.email, form.password, phoneForDB)

      if (data && data.success) {
        // Store email and user ID for confirmation page
        localStorage.setItem('signupEmail', form.email)
        localStorage.setItem('pendingRegistration', 'true')
        if (data.user && data.user.id) {
          localStorage.setItem('pendingUserId', data.user.id)
        }
        // Redirect to confirmation page
        router.push(`/confirmation?email=${encodeURIComponent(form.email)}`)
        return
      }

      if (data && (data.error === 'User with this email already exists' || data.error?.includes('already exists'))) {
        setAccountExistsError('An account with this email already exists. Please log in instead.')
        return
      }

      setGeneralError(data.error || 'Failed to create account. Please try again.')
    } catch (err) {
      console.error('Signup error', err)
      setGeneralError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {accountExistsError && (
        <div className={styles.accountExistsError}>
          <p className={styles.accountExistsText}>{accountExistsError}</p>
          <button 
            type="button"
            className={styles.loginRedirectButton}
            onClick={handleLoginRedirect}
          >
            Log In Instead
          </button>
        </div>
      )}
      
      {generalError && (
        <div className={styles.generalError}>
          <p className={styles.errorText}>{generalError}</p>
        </div>
      )}
      
      <div className={styles.grid}>
        <div className={styles.field}> 
          <label className={styles.label}>Email Address</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
            placeholder="Enter your email"
            autoComplete="email"
            maxLength={255}
          />
          {errors.email && <span className={styles.error}>{errors.email}</span>}
        </div>

        <div className={styles.field}> 
          <label className={styles.label}>Phone Number</label>
          <input
            type="tel"
            name="phoneNumber"
            value={form.phoneNumber}
            onChange={handleChange}
            className={`${styles.input} ${errors.phoneNumber ? styles.inputError : ''}`}
            placeholder="(555) 555-5555"
            autoComplete="tel"
            maxLength={14}
          />
          {errors.phoneNumber && <span className={styles.error}>{errors.phoneNumber}</span>}
        </div>

        <div className={styles.field}> 
          <label className={styles.label}>Password</label>
          <div className={styles.inputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={handleChange}
              className={`${styles.input} ${styles.inputWithToggle} ${errors.password ? styles.inputError : ''}`}
              placeholder="Create a password"
              autoComplete="new-password"
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={() => setIsPasswordFocused(false)}
              maxLength={128}
            />
            <button
              type="button"
              className={styles.toggleButton}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPassword(prev => !prev)}
              tabIndex={-1}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <div
            className={`${styles.requirements} ${shouldShowRequirements ? styles.requirementsVisible : ''}`}
            aria-live="polite"
          >
            {passwordRequirements.map((requirement, index) => (
              <span
                key={requirement.label}
                className={`${styles.requirementItem} ${requirement.isMet ? styles.valid : styles.invalid}`}
              >
                {requirement.label}
                {index < passwordRequirements.length - 1 && (
                  <span aria-hidden="true" className={styles.requirementSeparator}>·</span>
                )}
              </span>
            ))}
          </div>
          {errors.password && <span className={styles.error}>{errors.password}</span>}
        </div>

        <div className={styles.field}> 
          <label className={styles.label}>Confirm Password</label>
          <div className={styles.inputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              className={`${styles.input} ${styles.inputWithToggle} ${errors.confirmPassword ? styles.inputError : ''}`}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              maxLength={128}
            />
            <button
              type="button"
              className={styles.toggleButton}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(prev => !prev)}
              tabIndex={-1}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.confirmPassword && <span className={styles.error}>{errors.confirmPassword}</span>}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={submitting}
          onMouseDown={(e) => e.preventDefault()}
        >
          {submitting ? 'Creating account...' : 'Create Account'}
        </button>

        <p className={styles.termsText}>
          By submitting &apos;Create Account&apos;, I have read and agree to the{' '}
          <a
            href="https://robertventures.com/terms-of-use"
            className={styles.linkButton}
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Use
          </a>{' '}
          and acknowledge the{' '}
          <a
            href="https://robertventures.com/privacy-policy"
            className={styles.linkButton}
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>.
        </p>
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Already have an account?{' '}
          <button 
            type="button"
            onClick={handleLoginRedirect}
            className={styles.linkButton}
          >
            Log In
          </button>
        </p>
      </div>
    </form>
  )
}


