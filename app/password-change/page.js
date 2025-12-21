'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import Header from '../components/layout/Header'
import styles from './page.module.css'

function PasswordChangeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [token, setToken] = useState('')
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  useEffect(() => {
    const tokenParam = searchParams.get('token')
    
    // DEBUG LOGS
    console.log('[PasswordChange] Page mounted')
    console.log('[PasswordChange] Full URL:', typeof window !== 'undefined' ? window.location.href : 'SSR')
    console.log('[PasswordChange] Search params:', searchParams.toString())
    console.log('[PasswordChange] Token found:', tokenParam)
    
    if (!tokenParam) {
      console.log('[PasswordChange] ❌ No token found, redirecting to /login')
      router.push('/login')
      return
    }
    
    console.log('[PasswordChange] ✅ Token valid, setting token:', tokenParam)
    setToken(tokenParam)
  }, [searchParams, router])

  // Password validation
  const hasUppercase = /[A-Z]/.test(formData.password)
  const hasNumber = /[0-9]/.test(formData.password)
  const hasSpecial = /[^A-Za-z0-9]/.test(formData.password)
  const hasMinLength = formData.password.length >= 8
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
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!isPasswordValid) {
      newErrors.password = 'Password does not meet requirements'
    }
    if (formData.confirmPassword !== formData.password) {
      newErrors.confirmPassword = 'Passwords do not match'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validate()) {
      return
    }

    setIsLoading(true)

    try {
      console.log('[PasswordChange] Submitting password reset with token:', token)
      const data = await apiClient.resetPassword(token, formData.password)
      console.log('[PasswordChange] Reset password response:', data)

      if (data && data.success) {
        console.log('[PasswordChange] ✅ Password reset successful')
        setResetSuccess(true)
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      } else {
        console.log('[PasswordChange] ❌ Password reset failed:', data?.error)
        setErrors({ general: data?.error || 'Failed to reset password' })
      }
    } catch (err) {
      console.error('[PasswordChange] ❌ Password reset error:', err)
      setErrors({ general: err.message || 'An error occurred. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  if (resetSuccess) {
    return (
      <main className={styles.main}>
        <Header />
        
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.title}>Password Reset Successful!</h1>
            <p className={styles.description}>
              Your password has been updated and your account has been verified.
            </p>
            <p className={styles.hint}>
              Redirecting you to log in...
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <Header />
      
      <div className={styles.container}>
        {/* Debug Panel - visible in production for testing */}
        <div style={{
          background: '#f0f0f0',
          border: '2px solid #333',
          padding: '12px',
          marginBottom: '20px',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🔧 Debug Info:</div>
          <div>Token received: <strong>{token || 'NULL/EMPTY'}</strong></div>
          <div>Token length: <strong>{token?.length || 0}</strong> characters</div>
          <div>Page loaded: <strong>✅ YES</strong></div>
          <div>Full URL: <strong>{typeof window !== 'undefined' ? window.location.href : 'Loading...'}</strong></div>
        </div>
        
        <div className={styles.card}>
          <h1 className={styles.title}>Create New Password</h1>
          <p className={styles.description}>
            Enter a strong password for your account.
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {errors.general && (
              <div className={styles.generalError}>
                {errors.general}
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>
                New Password
              </label>
              <div className={styles.inputWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.password ? styles.inputError : ''}`}
                  placeholder="Enter new password"
                  disabled={isLoading}
                  autoComplete="new-password"
                  maxLength={128}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowPassword(prev => !prev)}
                  disabled={isLoading}
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
              {errors.password && <span className={styles.errorText}>{errors.password}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword" className={styles.label}>
                Confirm Password
              </label>
              <div className={styles.inputWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.confirmPassword ? styles.inputError : ''}`}
                  placeholder="Re-enter your password"
                  disabled={isLoading}
                  autoComplete="new-password"
                  maxLength={128}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(prev => !prev)}
                  disabled={isLoading}
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.confirmPassword && <span className={styles.errorText}>{errors.confirmPassword}</span>}
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading || !isPasswordValid || !formData.confirmPassword}
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>

          <div className={styles.footer}>
            <button
              onClick={() => router.push('/login')}
              className={styles.linkButton}
            >
              Back to Log In
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function PasswordChangePage() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <Header />
        <div className={styles.container}>
          <div className={styles.card}>
            <p>Loading...</p>
          </div>
        </div>
      </main>
    }>
      <PasswordChangeContent />
    </Suspense>
  )
}
