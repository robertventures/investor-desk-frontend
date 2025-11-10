'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import logger from '@/lib/logger'
import Header from '../components/Header'
import styles from './page.module.css'

export default function ConfirmationPage() {
  const router = useRouter()
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [countdown, setCountdown] = useState(26)
  const inputRefs = useRef([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Try to get from URL parameters first (more reliable in production)
    const params = new URLSearchParams(window.location.search)
    const urlEmail = params.get('email')
    
    // Fallback to localStorage
    const signupEmail = urlEmail || localStorage.getItem('signupEmail')
    const pendingUserId = localStorage.getItem('pendingUserId')
    
    if (!signupEmail || !pendingUserId) {
      // If no email or user ID found, redirect to sign-in
      router.push('/sign-in')
      return
    }
    
    // Store in localStorage if it came from URL
    if (urlEmail) localStorage.setItem('signupEmail', urlEmail)
    
    setEmail(signupEmail)
    setUserId(pendingUserId)

    // Start countdown timer
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Focus first input
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }

    return () => clearInterval(timer)
  }, [router])

  const handleInputChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)
    setError('')

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').trim()
    
    // Only process if it's 6 digits
    if (/^\d{6}$/.test(pastedData)) {
      const newCode = pastedData.split('')
      setCode(newCode)
      setError('')
      // Focus last input
      inputRefs.current[5]?.focus()
    }
  }

  const handleResendCode = () => {
    // Reset countdown
    setCountdown(26)
    setCode(['', '', '', '', '', ''])
    setError('')
    inputRefs.current[0]?.focus()
    
    // In a real implementation, this would trigger a new email
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const enteredCode = code.join('')
    
    if (enteredCode.length !== 6) {
      setError('Please enter all 6 digits')
      return
    }

    setIsLoading(true)
    
    try {
      if (!email || !userId) {
        setError('Session expired. Please sign up again.')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      // Call backend to confirm account with verification code
      const data = await apiClient.confirmAccount(userId, enteredCode)

      if (!data.success) {
        // Log full error details for debugging
        console.error('❌ Verification failed:', data)
        
        // Provide helpful error messages
        let errorMessage = data.error || 'Verification failed. Please try again.'
        
        // Show additional details if available (for debugging)
        if (data.details) {
          console.error('❌ Error details:', data.details)
          errorMessage = `${errorMessage} (${data.details})`
        }
        
        // If pending registration expired or not found
        if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
          errorMessage = 'Registration expired. Please sign up again.'
          // Clear localStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem('signupEmail')
            localStorage.removeItem('pendingRegistration')
            localStorage.removeItem('currentUserId')
          }
        }
        
        // If email already registered (this shouldn't happen, but handle it gracefully)
        if (errorMessage.includes('already registered')) {
          errorMessage = 'This email is already registered. Redirecting to sign in...'
          // Clear localStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem('signupEmail')
            localStorage.removeItem('pendingRegistration')
            localStorage.removeItem('currentUserId')
          }
          // Redirect to sign in after showing error
          setTimeout(() => router.push('/sign-in'), 2000)
        }
        
        setError(errorMessage)
        setCode(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
        return
      }

      // Verification successful! User account confirmed and automatically logged in
      // Update localStorage with user info and tokens
      if (typeof window !== 'undefined') {
        if (data.user && data.user.id) {
          localStorage.setItem('currentUserId', data.user.id)
        }
        if (data.user && data.user.email) {
          localStorage.setItem('signupEmail', data.user.email)
        }
        // Store tokens if provided
        if (data.access_token && data.refresh_token) {
          apiClient.setTokens(data.access_token, data.refresh_token)
        }
        // Seed UserContext immediately with the returned user
        try {
          if (data.user) {
            sessionStorage.setItem('preloadedUser', JSON.stringify(data.user))
          }
        } catch (e) {
          // ignore storage errors
        }
        // Clear any stale investment-local state from prior sessions
        try {
          localStorage.removeItem('currentInvestmentId')
          localStorage.removeItem('currentInvestmentAccountType')
          // Remove any per-investment identity snapshots
          const keysToRemove = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('investmentIdentityDraft:')) {
              keysToRemove.push(key)
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k))
        } catch {}
        // Clear pending registration data
        localStorage.removeItem('pendingRegistration')
        localStorage.removeItem('pendingUserId')
      }
      
      logger.log('✅ Account confirmed and verified successfully, user auto-logged in, redirecting to investment page')
      
      // Redirect to investment page to start making first investment
      router.push('/investment')
    } catch (err) {
      logger.error('Verification error:', err)
      setError('An error occurred. Please try again.')
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className={styles.main}>
      <Header />
      
      <div className={styles.container}>
        <div className={styles.verificationCard}>
          <h1 className={styles.title}>Let's Verify It's You</h1>
          
          <p className={styles.description}>
            Please enter the 6 digit verification code sent to
          </p>
          <p className={styles.email}>{email}</p>
          <p className={styles.hint}>
            Use <strong>000000</strong> for testing purposes
          </p>

          <form onSubmit={handleSubmit}>
            <div className={styles.codeInputContainer}>
              <label className={styles.label}>Verification Code</label>
              <div className={styles.codeInputs}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => inputRefs.current[index] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    className={`${styles.codeInput} ${error ? styles.inputError : ''}`}
                    disabled={isLoading}
                  />
                ))}
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>

            <div className={styles.resendContainer}>
              {countdown > 0 ? (
                <p className={styles.countdown}>
                  Request a new code in ({countdown}s)
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendCode}
                  className={styles.resendButton}
                >
                  Request a new code
                </button>
              )}
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading || code.join('').length !== 6}
            >
              {isLoading ? 'Verifying...' : 'Verify and Create Account'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}


