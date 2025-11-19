'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import Header from '../components/Header'
import styles from './page.module.css'

function ResetPasswordContent() {
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
    if (!tokenParam) {
      router.push('/sign-in')
      return
    }
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
      const data = await apiClient.resetPassword(token, formData.password)

      if (data && data.success) {
        setResetSuccess(true)
        // Redirect to sign-in after 3 seconds
        setTimeout(() => {
          router.push('/sign-in')
        }, 3000)
      } else {
        setErrors({ general: data?.error || 'Failed to reset password' })
      }
    } catch (err) {
      console.error('Password reset error:', err)
      setErrors({ general: 'An error occurred. Please try again.' })
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
              Redirecting you to sign in...
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
                  maxLength={128}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={() => setShowPassword(prev => !prev)}
                  disabled={isLoading}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && <span className={styles.errorText}>{errors.password}</span>}
              
              {isPasswordFocused && (
                <div className={styles.requirements}>
                  <p className={styles.requirementsTitle}>Password must contain:</p>
                  <ul className={styles.requirementsList}>
                    {passwordRequirements.map((req, index) => (
                      <li
                        key={index}
                        className={req.isMet ? styles.requirementMet : styles.requirementUnmet}
                      >
                        <span className={styles.requirementIcon}>
                          {req.isMet ? '✓' : '○'}
                        </span>
                        {req.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword" className={styles.label}>
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`${styles.input} ${errors.confirmPassword ? styles.inputError : ''}`}
                placeholder="Confirm new password"
                disabled={isLoading}
                maxLength={128}
              />
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
              onClick={() => router.push('/sign-in')}
              className={styles.linkButton}
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
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
      <ResetPasswordContent />
    </Suspense>
  )
}

