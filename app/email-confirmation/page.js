'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import logger from '@/lib/logger'
import { triggerAccountCreated } from '../../lib/webhooks'
import Header from '../components/layout/Header'
import styles from '../confirmation/page.module.css'

function EmailConfirmationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('verifying') // verifying, success, error
  const [message, setMessage] = useState('Verifying your email...')

  useEffect(() => {
    const verifyAccount = async () => {
      // Extract user_id and token from URL parameters
      const userId = searchParams.get('user_id')
      const token = searchParams.get('token')

      if (!userId || !token) {
        setStatus('error')
        setMessage('Invalid confirmation link. Missing required parameters.')
        return
      }

      try {
        // Call API to confirm account with verification code
        const data = await apiClient.confirmAccount(userId, token)

        if (!data.success) {
          // Log full error details for debugging
          console.error('Email verification failed:', data)
          
          let errorMessage = data.error || 'Verification failed. Please try again.'
          
          // If pending registration expired or not found
          if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
            errorMessage = 'Confirmation link has expired. Please sign up again.'
          }
          
          // If email already registered
          if (errorMessage.includes('already registered') || errorMessage.includes('already confirmed')) {
            errorMessage = 'This email is already verified. Redirecting to login...'
            setTimeout(() => router.push('/login'), 2000)
          }
          
          throw new Error(errorMessage)
        }

        // Verification successful
        setStatus('success')
        setMessage('Your email has been verified successfully!')

        // Store session data if returned
        if (typeof window !== 'undefined') {
          if (data.user?.id) {
            localStorage.setItem('currentUserId', data.user.id)
          }
          if (data.user?.email) {
            localStorage.setItem('signupEmail', data.user.email)
          }
          
          // Store tokens if provided (auto-login)
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
          
          // Clear pending registration data
          localStorage.removeItem('pendingRegistration')
          localStorage.removeItem('pendingUserId')
        }

        // Trigger account-created webhook (fire and forget - don't block redirect)
        if (data.user?.email) {
          triggerAccountCreated(data.user.email).catch((err) => {
            logger.warn('Account created webhook failed:', err)
          })
        }

        logger.log('Account confirmed via email link, redirecting to investment page')

        // Redirect to investment page after a short delay
        setTimeout(() => {
          router.push('/investment')
        }, 2000)

      } catch (err) {
        logger.error('Email verification error:', err)
        setStatus('error')
        setMessage(err.message || 'Verification failed. Please try again or contact support.')
      }
    }

    verifyAccount()
  }, [searchParams, router])

  return (
    <div className={styles.container}>
      <div className={styles.verificationCard}>
        <h1 className={styles.title}>Email Confirmation</h1>
        
        <div style={{ textAlign: 'center', margin: '2rem 0' }}>
          {status === 'verifying' && (
            <div>
              <p className={styles.description} style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</p>
              <p className={styles.description}>{message}</p>
            </div>
          )}
          
          {status === 'success' && (
            <div>
              <p style={{ fontSize: '48px', marginBottom: '16px' }}>✅</p>
              <p className={styles.description} style={{ color: '#059669', fontWeight: '600' }}>
                {message}
              </p>
              <p className={styles.description} style={{ marginTop: '12px' }}>
                Redirecting you to continue...
              </p>
            </div>
          )}
          
          {status === 'error' && (
            <div>
              <p style={{ fontSize: '48px', marginBottom: '16px' }}>❌</p>
              <p className={styles.error} style={{ marginBottom: '24px' }}>
                {message}
              </p>
              <button 
                onClick={() => router.push('/login')}
                className={styles.submitButton}
              >
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EmailConfirmationPage() {
  return (
    <main className={styles.main}>
      <Header />
      <Suspense fallback={
        <div className={styles.container}>
          <div className={styles.verificationCard}>
            <h1 className={styles.title}>Email Confirmation</h1>
            <div style={{ textAlign: 'center', margin: '2rem 0' }}>
              <p className={styles.description} style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</p>
              <p className={styles.description}>Loading...</p>
            </div>
          </div>
        </div>
      }>
        <EmailConfirmationContent />
      </Suspense>
    </main>
  )
}
