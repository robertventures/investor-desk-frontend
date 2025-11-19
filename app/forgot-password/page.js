'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import Header from '../components/Header'
import styles from './page.module.css'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email.trim()) {
      setError('Email is required')
      return
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const data = await apiClient.requestPasswordReset(email)

      if (data && data.success) {
        setEmailSent(true)
      } else {
        // For security, we show success even if email doesn't exist
        // This prevents email enumeration attacks
        setEmailSent(true)
      }
    } catch (err) {
      console.error('Password reset request error:', err)
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (emailSent) {
    return (
      <main className={styles.main}>
        <Header />
        
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.title}>Check Your Email</h1>
            <p className={styles.description}>
              If an account exists with <strong>{email}</strong>, you will receive a password reset link shortly.
            </p>
            <p className={styles.hint}>
              Please check your inbox and spam folder.
            </p>
            <button
              onClick={() => router.push('/sign-in')}
              className={styles.backButton}
            >
              Back to Sign In
            </button>
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
          <h1 className={styles.title}>Reset Your Password</h1>
          <p className={styles.description}>
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                className={`${styles.input} ${error ? styles.inputError : ''}`}
                placeholder="Enter your email address"
                disabled={isLoading}
                maxLength={255}
              />
              {error && <span className={styles.errorText}>{error}</span>}
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
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

