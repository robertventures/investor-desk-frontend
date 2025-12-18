'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import { useUser } from '@/app/contexts/UserContext'
import styles from './LoginForm.module.css'

export default function LoginForm() {
  const router = useRouter()
  const { refreshUser } = useUser()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [generalError, setGeneralError] = useState('')

  const handleInputChange = (e) => {
    const { name, value } = e.target
    // Normalize email to lowercase to prevent case-sensitivity issues
    const normalizedValue = name === 'email' ? value.toLowerCase() : value
    setFormData(prev => ({
      ...prev,
      [name]: normalizedValue
    }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
    if (generalError) {
      setGeneralError('')
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      // Call login API using apiClient
      const data = await apiClient.login(formData.email, formData.password)

      if (!data || !data.success) {
        // Handle specific error messages
        setErrors({ password: 'Invalid email or password' })
        setIsLoading(false)
        return
      }

      // Login successful - user data is in data.user
      const user = data.user
      if (process.env.NODE_ENV === 'development') {
        console.log('[LoginForm] User data:', JSON.stringify(user, null, 2))
        console.log('[LoginForm] isAdmin:', user.isAdmin, 'isVerified:', user.isVerified, 'needsOnboarding:', user.needsOnboarding)
      }

      // Store minimal user info in localStorage for backward compatibility
      localStorage.setItem('currentUserId', user.id)
      localStorage.setItem('signupEmail', user.email)

      // Refresh UserContext to ensure state is synced before navigation
      if (refreshUser) {
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log('[LoginForm] Refreshing user context...')
          }
          await refreshUser()
        } catch (refreshErr) {
          console.warn('[LoginForm] Failed to refresh user context', refreshErr)
        }
      }

      // Redirect based on user type
      // IMPORTANT: Admin users should ALWAYS go to admin dashboard, regardless of verification status
      if (user.isAdmin) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[LoginForm] Admin user detected, redirecting to /admin')
        }
        router.push('/admin')
      } else if (!user.isVerified) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[LoginForm] Unverified user, redirecting to /confirmation')
        }
        router.push('/confirmation')
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('[LoginForm] Verified user, redirecting to /dashboard')
        }
        router.push('/dashboard')
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Login error:', err)
      }
      // Show the actual error message from the backend
      const errorMessage = err.message || 'An unexpected error occurred. Please try again.'
      
      // If it's an auth error, show it in the password field
      if (errorMessage.toLowerCase().includes('password') || errorMessage.toLowerCase().includes('email') || errorMessage.toLowerCase().includes('invalid')) {
        setErrors({ password: errorMessage })
      } else {
        setGeneralError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.loginForm}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {generalError && (
          <div className={styles.generalError}>
            <p className={styles.errorText}>{generalError}</p>
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>
            Email Address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
            placeholder="Enter your email address"
            disabled={isLoading}
            maxLength={255}
          />
          {errors.email && <span className={styles.errorText}>{errors.email}</span>}
        </div>

        <div className={styles.field}>
          <label htmlFor="password" className={styles.label}>
            Password
          </label>
          <div className={styles.inputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className={`${styles.input} ${styles.inputWithToggle} ${errors.password ? styles.inputError : ''}`}
              placeholder="Enter your password"
              disabled={isLoading}
              maxLength={128}
            />
            <button
              type="button"
              className={styles.toggleButton}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(prev => !prev)}
              disabled={isLoading}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.password && <span className={styles.errorText}>{errors.password}</span>}
        </div>

        <div className={styles.actions}>
          <button 
            type="submit" 
            className={styles.loginButton}
            disabled={isLoading}
          >
            {isLoading ? 'Logging In...' : 'Log In'}
          </button>
        </div>
      </form>

      <div className={styles.footer}>
        <button 
          onClick={() => router.push('/forgot-password')} 
          className={styles.linkButton}
          style={{ marginBottom: '12px' }}
        >
          Forgot Password?
        </button>
        <p className={styles.footerText}>
          Don&apos;t have an account?{' '}
          <button 
            onClick={() => router.push('/')} 
            className={styles.linkButton}
          >
            Create Account
          </button>
        </p>
      </div>
    </div>
  )
}

