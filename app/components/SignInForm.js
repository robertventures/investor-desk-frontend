'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import styles from './SignInForm.module.css'

export default function SignInForm() {
  const router = useRouter()
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
    setFormData(prev => ({
      ...prev,
      [name]: value
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
      console.log('[SignInForm] User data:', JSON.stringify(user, null, 2))
      console.log('[SignInForm] isAdmin:', user.isAdmin, 'isVerified:', user.isVerified, 'needsOnboarding:', user.needsOnboarding)

      // Store minimal user info in localStorage for backward compatibility
      localStorage.setItem('currentUserId', user.id)
      localStorage.setItem('signupEmail', user.email)

      // Redirect based on user type
      // IMPORTANT: Admin users should ALWAYS go to admin dashboard, regardless of verification status
      if (user.isAdmin) {
        console.log('[SignInForm] Admin user detected, redirecting to /admin')
        router.push('/admin')
      } else if (!user.isVerified) {
        console.log('[SignInForm] Unverified user, redirecting to /confirmation')
        router.push('/confirmation')
      } else {
        console.log('[SignInForm] Verified user, redirecting to /dashboard')
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('Login error:', err)
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
    <div className={styles.signInForm}>
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
            className={styles.signInButton}
            disabled={isLoading}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
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
          Don't have an account?{' '}
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
