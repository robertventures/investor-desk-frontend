"use client"
import { useCallback, useState } from 'react'
import { usePlaidBankConnection } from '../BankConnectionModal'
import styles from './BankReconnectOverlay.module.css'

/**
 * BankReconnectOverlay - Dismissible overlay for users with disconnected bank accounts
 * 
 * Prompts users to reconnect their bank account via Plaid. Users can dismiss
 * the overlay to continue using the dashboard, but will be prompted again on
 * their next session until they reconnect.
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the overlay is visible
 * @param {Function} props.onReconnected - Called when bank is successfully reconnected
 * @param {Function} props.onDismiss - Called when user dismisses the overlay
 * @param {string} props.bankName - Optional name of the disconnected bank
 */
export default function BankReconnectOverlay({ isOpen, onReconnected, onDismiss, bankName }) {
  const [error, setError] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)

  const handleAccountSelected = useCallback((method) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[BankReconnectOverlay] Bank reconnected successfully:', method)
    }
    setIsConnecting(false)
    setError('')
    if (onReconnected) {
      onReconnected(method)
    }
  }, [onReconnected])

  const handleError = useCallback((errorMsg) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[BankReconnectOverlay] Plaid error:', errorMsg)
    }
    setError(errorMsg)
    setIsConnecting(false)
  }, [])

  const handleClose = useCallback(() => {
    // Plaid was closed without completing - just reset connecting state
    setIsConnecting(false)
  }, [])

  const plaid = usePlaidBankConnection({
    onAccountSelected: handleAccountSelected,
    onError: handleError,
    onClose: handleClose
  })

  const handleReconnectClick = useCallback(async () => {
    setError('')
    setIsConnecting(true)
    
    if (plaid.ready) {
      plaid.open()
    } else {
      // Fetch token first, then open will be called after ready
      await plaid.fetchToken()
    }
  }, [plaid])

  // Auto-open Plaid when ready after fetching token
  const handleOpenWhenReady = useCallback(() => {
    if (isConnecting && plaid.ready) {
      plaid.open()
    }
  }, [isConnecting, plaid])

  // Effect to open Plaid when it becomes ready
  if (isConnecting && plaid.ready && !plaid.isLoading) {
    handleOpenWhenReady()
  }

  // Handle clicking outside the modal to dismiss
  const handleOverlayClick = useCallback((e) => {
    // Only dismiss if clicking the overlay background, not the modal itself
    if (e.target === e.currentTarget && onDismiss) {
      onDismiss()
    }
  }, [onDismiss])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.iconContainer}>
          <div className={styles.warningIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 9V13M12 17H12.01M5.07183 19H18.9282C20.4678 19 21.4301 17.3333 20.6603 16L13.7321 4C12.9623 2.66667 11.0377 2.66667 10.2679 4L3.33975 16C2.56998 17.3333 3.53223 19 5.07183 19Z" 
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <h2 className={styles.title}>Bank Connection Required</h2>
        
        <p className={styles.description}>
          {bankName 
            ? `Your connection to ${bankName} has expired.`
            : 'Your bank connection has expired.'
          }
          {' '}Please reconnect your bank account to continue receiving your monthly payments.
        </p>

        {error && (
          <div className={styles.errorMessage}>
            <span className={styles.errorIcon}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <button
          className={styles.reconnectButton}
          onClick={handleReconnectClick}
          disabled={isConnecting || plaid.isLoading}
        >
          {isConnecting || plaid.isLoading ? (
            <>
              <span className={styles.spinner}></span>
              {plaid.isLoading ? 'Initializing...' : 'Connecting...'}
            </>
          ) : (
            'Reconnect Bank Account'
          )}
        </button>

        {onDismiss && (
          <button
            className={styles.skipButton}
            onClick={onDismiss}
            disabled={isConnecting}
          >
            Skip for now
          </button>
        )}

        <p className={styles.securityNote}>
          <span className={styles.lockIcon}>🔒</span>
          Secured by Plaid - Your credentials are never stored by us
        </p>
      </div>
    </div>
  )
}

