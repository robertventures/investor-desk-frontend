"use client"
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { apiClient } from '../../lib/apiClient'
import styles from './BankConnectionModal.module.css'

/**
 * BankConnectionModal - Plaid Integration for Bank Account Connection
 * 
 * SANDBOX TESTING:
 * - Environment: NEXT_PUBLIC_PLAID_ENV should be set to 'sandbox'
 * - Test Credentials: username: 'user_good', password: 'pass_good'
 * - Test Institutions: Chase (ins_109508), Bank of America (ins_109509), Wells Fargo (ins_109510)
 * - For testing failures: username: 'user_bad', password: 'pass_good'
 */
export default function BankConnectionModal({ isOpen, onClose, onAccountSelected }) {
  const [step, setStep] = useState(1) // 1: choose method, 2: connecting, 3: done
  const [linkToken, setLinkToken] = useState(null)
  const [isFetchingToken, setIsFetchingToken] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualRouting, setManualRouting] = useState('')
  const [manualAccount, setManualAccount] = useState('')
  const [manualType, setManualType] = useState('checking')
  const [isSubmittingManual, setIsSubmittingManual] = useState(false)

  const resetState = () => {
    setStep(1)
    setLinkToken(null)
    setIsFetchingToken(false)
    setErrorMessage('')
    setShowManualEntry(false)
    setManualName('')
    setManualRouting('')
    setManualAccount('')
    setManualType('checking')
    setIsSubmittingManual(false)
    setHasOpenedPlaid(false)
  }

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => resetState(), 300)
    }
  }, [isOpen])

  const generateIdempotencyKey = () => {
    // Lightweight UUID v4-ish
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  const fetchLinkToken = async () => {
    try {
      setIsFetchingToken(true)
      setErrorMessage('')
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Fetching Plaid Link token...')
      }
      const res = await apiClient.request('/api/plaid/link-token', {
        method: 'POST',
        body: JSON.stringify({ use_case: 'processor', client_app: 'web' })
      })
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Full link token response:', res)
        console.log('[BankConnectionModal] Link token received:', { 
          hasToken: !!res.link_token,
          expiration: res.expiration,
          tokenLength: res.link_token?.length 
        })
      }
      setLinkToken(res.link_token)
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[BankConnectionModal] Failed to fetch link token:', e)
      }
      setErrorMessage(e?.message || 'Failed to initialize Plaid. Please check backend connection.')
    } finally {
      setIsFetchingToken(false)
    }
  }

  useEffect(() => {
    if (isOpen && !showManualEntry && !linkToken && !isFetchingToken) {
      fetchLinkToken()
    }
  }, [isOpen, showManualEntry, linkToken, isFetchingToken])

  const onPlaidSuccess = useCallback(async (public_token, metadata) => {
    try {
      setStep(2)
      setErrorMessage('')
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Plaid Link success! Processing...', {
          institution: metadata?.institution?.name,
          account: metadata?.account?.name,
          mask: metadata?.account?.mask,
          type: metadata?.account?.type,
          subtype: metadata?.account?.subtype
        })
      }
      
      const accountId = metadata?.account?.id
      const institution = metadata?.institution || {}
      const accountMask = metadata?.account?.mask
      const accountDisplayName = metadata?.account?.name
      
      // Map Plaid account subtype to backend expected values ("Checking" or "Savings")
      // Plaid uses lowercase subtypes like "checking", "savings", etc.
      const accountSubtype = metadata?.account?.subtype || 'checking'
      const accountType = accountSubtype.toLowerCase()
      
      // Backend expects capitalized "Checking" or "Savings"
      let accountName = 'Checking' // default
      if (accountType === 'savings') {
        accountName = 'Savings'
      } else if (accountType === 'checking') {
        accountName = 'Checking'
      }
      
      const payload = {
        public_token,
        account_id: accountId,
        institution: { id: institution?.institution_id || institution?.id, name: institution?.name },
        account_mask: accountMask,
        account_name: accountName, // Send "Checking" or "Savings" as backend expects
        save_for_reuse: true,
        idempotency_key: generateIdempotencyKey()
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Sending to /api/plaid/link-success:', payload)
      }
      const res = await apiClient.request('/api/plaid/link-success', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Link success response:', res)
      }
      
      const method = res?.payment_method
      if (method && typeof onAccountSelected === 'function') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BankConnectionModal] Payment method created successfully:', method)
        }
        onAccountSelected(method)
      }
      onClose()
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[BankConnectionModal] Link success failed:', e)
      }
      const errorMsg = e?.message || 'Failed to link bank account'
      setErrorMessage(`${errorMsg}. Please try again or contact support if the issue persists.`)
      setStep(1)
    }
  }, [onAccountSelected, onClose])

  const [hasOpenedPlaid, setHasOpenedPlaid] = useState(false)
  const [plaidVisible, setPlaidVisible] = useState(true) // Track if we should hide our modal content

  // Auto-launch timer
  useEffect(() => {
    if (isOpen && !showManualEntry && !hasOpenedPlaid) {
      const timer = setTimeout(() => {
        if (!hasOpenedPlaid) {
          // setShowManualEntry(true)
          setPlaidVisible(false)
        }
      }, 15000) // 15 seconds fallback
      return () => clearTimeout(timer)
    }
  }, [isOpen, showManualEntry, hasOpenedPlaid])

  const onPlaidExit = useCallback((error, metadata) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[BankConnectionModal] Plaid Link exit:', { error, metadata })
    }
    // User exited Plaid, show our modal again
    setPlaidVisible(false)
  }, [])

  const plaidConfig = useMemo(() => {
    const config = {
      token: linkToken,
      onSuccess: onPlaidSuccess,
      onExit: onPlaidExit,
      env: process.env.NEXT_PUBLIC_PLAID_ENV || 'sandbox',
    }
    if (linkToken && process.env.NODE_ENV === 'development') {
      console.log('[BankConnectionModal] Creating Plaid config with token:', linkToken.substring(0, 20) + '...', 'env:', config.env)
    }
    return config
  }, [linkToken, onPlaidSuccess, onPlaidExit])

  const { open, ready } = usePlaidLink(plaidConfig)

  // Auto-launch Plaid when ready
  useEffect(() => {
    // Reset hasOpenedPlaid when modal is closed so it can open again next time
    if (!isOpen) {
      setHasOpenedPlaid(false)
      setPlaidVisible(true)
    } else if (ready && !hasOpenedPlaid && !showManualEntry) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Auto-launching Plaid Link...')
      }
      open()
      setHasOpenedPlaid(true)
      // Keep plaidVisible=true while it's launching/open so we don't show the background
      // We rely on CSS to hide the content while Plaid is open
    }
  }, [ready, hasOpenedPlaid, showManualEntry, isOpen, open])

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    if (!manualName || !manualRouting || !manualAccount) return
    if (!/^[0-9]{9}$/.test(manualRouting)) {
      setErrorMessage('Routing number must be 9 digits')
      return
    }
    try {
      setIsSubmittingManual(true)
      setErrorMessage('')
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Submitting manual bank account...')
      }
      const res = await apiClient.request('/api/payment-methods/manual', {
        method: 'POST',
        body: JSON.stringify({
          account_holder_name: manualName,
          routing_number: manualRouting,
          account_number: manualAccount,
          account_type: manualType,
          save_for_reuse: true,
          idempotency_key: generateIdempotencyKey()
        })
      })
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Manual bank account response:', res)
      }
      const method = res?.payment_method
      if (method && typeof onAccountSelected === 'function') {
        onAccountSelected(method)
      }
      onClose()
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[BankConnectionModal] Manual submission failed:', e)
      }
      setErrorMessage(e?.message || 'Failed to add bank account. Please verify your information.')
    } finally {
      setIsSubmittingManual(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* If Plaid is launching/open, show a cover over our modal content to reduce visual noise, 
            but keep the modal mounted so Plaid stays active. */}
        {hasOpenedPlaid && plaidVisible && (
          <div className={styles.plaidCover}>
            <div className={styles.spinner}></div>
            <p style={{ marginTop: '16px', color: '#6b7280' }}>Secure connection active...</p>
            <button 
              onClick={() => open()}
              style={{
                marginTop: '12px',
                background: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              Re-open Plaid
            </button>
          </div>
        )}

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {step > 1 && (
              <button className={styles.backButton} onClick={() => setStep(1)}>
                ← Back
              </button>
            )}
          </div>
          <div className={styles.headerCenter}>
            {/* {showManualEntry ? 'Enter bank details' : 'Connect your bank'} */}
          </div>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <div className={styles.progress}>
          <div className={`${styles.progressStep} ${step >= 1 ? styles.active : ''}`} />
          <div className={`${styles.progressStep} ${step >= 2 ? styles.active : ''}`} />
          <div className={`${styles.progressStep} ${step >= 3 ? styles.active : ''}`} />
        </div>

        <div className={styles.content}>
          {!showManualEntry ? (
            <div className={styles.bankSelection}>
              {errorMessage && (
                <div className={styles.securityNote}>
                  <span className={styles.lockIcon}>⚠️</span>
                  <span className={styles.securityText}>{errorMessage}</span>
                </div>
              )}
              
              <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Connecting to secure banking system...</p>
                <p className={styles.subtext}>Plaid Link should open automatically.</p>
                
                {/* Fallback launch button if auto-open is blocked or fails */}
                {ready && (
                  <button
                    className={styles.submitButton}
                    onClick={() => {
                      open()
                      setHasOpenedPlaid(true)
                    }}
                    style={{ marginTop: '16px' }}
                  >
                    Connect Bank Account
                  </button>
                )}
              </div>

              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setShowManualEntry(true)}
                >
                  Enter Bank Details Manually
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className={styles.form}>
              {errorMessage && (
                <div className={styles.securityNote}>
                  <span className={styles.lockIcon}>⚠️</span>
                  <span className={styles.securityText}>{errorMessage}</span>
                </div>
              )}
              <div className={styles.formGroup}>
                <label className={styles.label}>Account holder name</label>
                <input
                  className={styles.input}
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="John Doe"
                  maxLength={100}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Routing number</label>
                <input
                  className={styles.input}
                  value={manualRouting}
                  onChange={(e) => setManualRouting(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
                  placeholder="9 digits"
                  maxLength={9}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Account number</label>
                <input
                  className={styles.input}
                  value={manualAccount}
                  onChange={(e) => setManualAccount(e.target.value.replace(/[^0-9]/g, '').slice(0, 17))}
                  placeholder="Account number"
                  maxLength={50}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Account type</label>
                <select
                  className={styles.input}
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value)}
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </select>
              </div>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmittingManual || !manualName || !manualRouting || !manualAccount}
              >
                {isSubmittingManual ? (
                  <>
                    <span className={styles.spinner}></span>
                    Adding account...
                  </>
                ) : (
                  'Add bank account'
                )}
              </button>
              <button
                type="button"
                className={styles.submitButton}
                onClick={() => {
                  setShowManualEntry(false)
                  setHasOpenedPlaid(false) // Reset so Plaid tries to open again
                }}
                disabled={isSubmittingManual}
              >
                Back
              </button>
            </form>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.poweredBy}>🔒 Secured by Plaid</span>
        </div>
      </div>
    </div>
  )
}

