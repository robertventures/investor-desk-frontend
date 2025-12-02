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
  const [manualRouting, setManualRouting] = useState('')
  const [manualAccount, setManualAccount] = useState('')
  const [manualConfirmAccount, setManualConfirmAccount] = useState('')
  const [manualType, setManualType] = useState('checking')
  const [manualHolderType, setManualHolderType] = useState('Personal')
  const [isSubmittingManual, setIsSubmittingManual] = useState(false)
  const [fieldErrors, setFieldErrors] = useState([]) // Track which fields have errors

  const resetState = () => {
    setStep(1)
    setLinkToken(null)
    setIsFetchingToken(false)
    setErrorMessage('')
    setShowManualEntry(false)
    setManualRouting('')
    setManualAccount('')
    setManualConfirmAccount('')
    setManualType('checking')
    setManualHolderType('Personal')
    setIsSubmittingManual(false)
    setFieldErrors([])
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
      
      let res
      try {
        res = await apiClient.request('/api/plaid/link-success', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
      } catch (reqErr) {
        // Check for "existing payment method" error to implement auto-replace
        const responseData = reqErr?.responseData || {}
        let existingId = responseData.existing_payment_method_id
        
        // Fallback: Check if error message contains the ID if responseData parsing failed or structure is different
        // The log shows: Error: {'detail': '...', 'existing_payment_method_id': '...'}
        // This suggests the error.message might be the stringified JSON.
        if (!existingId && reqErr?.message && reqErr.message.includes('existing_payment_method_id')) {
          try {
            // Try to extract from message if it looks like a python dict/JSON
            const match = reqErr.message.match(/'existing_payment_method_id':\s*'([^']+)'/) || 
                          reqErr.message.match(/"existing_payment_method_id":\s*"([^"]+)"/)
            if (match) existingId = match[1]
          } catch (e) {
            // Ignore parsing errors
          }
        }
        
        // Fallback for string detail
        const errDetail = responseData.detail
        if (!existingId && typeof errDetail === 'string') {
           // Try to extract from string if needed
           const match = errDetail.match(/'existing_payment_method_id':\s*'([^']+)'/) ||
                         errDetail.match(/"existing_payment_method_id":\s*"([^"]+)"/)
           if (match) existingId = match[1]
        }

        if (existingId) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[BankConnectionModal] Found existing payment method to replace:', existingId)
          }
          
          // Auto-replace logic: Delete the old one, then retry
          try {
            await apiClient.deletePaymentMethod(existingId)
            if (process.env.NODE_ENV === 'development') {
              console.log('[BankConnectionModal] Deleted existing payment method. Retrying link...')
            }
            // Retry the original request
            res = await apiClient.request('/api/plaid/link-success', {
              method: 'POST',
              body: JSON.stringify(payload)
            })
          } catch (retryErr) {
            // If retry fails, throw the original or new error
            console.error('[BankConnectionModal] Retry failed:', retryErr)
            throw retryErr
          }
        } else {
          // If we have an error object but no existing ID to handle, we just rethrow to let the catch block below handle it.
          // However, to avoid double logging in the catch block below (which logs 'Link success failed'),
          // we can just let it bubble up.
          throw reqErr
        }
      }

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

  const plaidConfig = useMemo(() => {
    const config = {
      token: linkToken,
      onSuccess: onPlaidSuccess,
      env: process.env.NEXT_PUBLIC_PLAID_ENV || 'sandbox',
    }
    if (linkToken && process.env.NODE_ENV === 'development') {
      console.log('[BankConnectionModal] Creating Plaid config with token:', linkToken.substring(0, 20) + '...', 'env:', config.env)
    }
    return config
  }, [linkToken, onPlaidSuccess])

  const { open, ready } = usePlaidLink(plaidConfig)

  // Log when ready state changes
  useEffect(() => {
    if (linkToken && process.env.NODE_ENV === 'development') {
      console.log('[BankConnectionModal] Plaid Link ready state:', ready)
    }
  }, [ready, linkToken])

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    setFieldErrors([])
    setErrorMessage('')
    
    // Validate required fields
    if (!manualRouting || !manualAccount || !manualConfirmAccount) {
      setErrorMessage('Please fill in all required fields')
      return
    }
    
    // Validate routing number: exactly 9 digits
    if (!/^\d{9}$/.test(manualRouting)) {
      setErrorMessage('Routing number must be exactly 9 digits')
      setFieldErrors(['routingNumber'])
      return
    }
    
    // Validate account number: 4-17 digits
    if (!/^\d{4,17}$/.test(manualAccount)) {
      setErrorMessage('Account number must be 4-17 digits')
      setFieldErrors(['accountNumber'])
      return
    }
    
    // Validate account number confirmation
    if (manualAccount !== manualConfirmAccount) {
      setErrorMessage('Account numbers do not match')
      setFieldErrors(['accountNumber', 'confirmAccountNumber'])
      return
    }
    
    try {
      setIsSubmittingManual(true)
      if (process.env.NODE_ENV === 'development') {
        console.log('[BankConnectionModal] Submitting manual bank account with real-time verification...')
      }
      const res = await apiClient.request('/api/payment-methods/manual', {
        method: 'POST',
        body: JSON.stringify({
          routing_number: manualRouting,
          account_number: manualAccount,
          account_type: manualType,
          account_holder_type: manualHolderType,
          verification_method: 'real_time',
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
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[BankConnectionModal] Manual submission failed:', err)
      }
      
      // Handle verification error types from real-time ACHQ verification
      const errorData = err?.responseData || {}
      const errorType = errorData.error_type || ''
      
      switch (errorType) {
        case 'invalid_account':
          setErrorMessage('Please check your routing and account numbers')
          setFieldErrors(['routingNumber', 'accountNumber'])
          break
        case 'ownership_failed':
          setErrorMessage(
            'Your name must match exactly as it appears on your bank account. ' +
            'Please verify your profile information matches your bank records.'
          )
          break
        case 'account_flagged':
          setErrorMessage(
            'We couldn\'t verify this account. ' +
            'Please contact your bank or try a different account.'
          )
          break
        case 'unsupported_account':
          setErrorMessage(
            'This account type isn\'t supported. ' +
            'Please use a checking or savings account.'
          )
          break
        default:
          // Generic error fallback
          setErrorMessage(err?.message || 'Failed to add bank account. Please verify your information and try again.')
      }
    } finally {
      setIsSubmittingManual(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
              <button
                className={styles.submitButton}
                onClick={() => {
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[BankConnectionModal] Button clicked - linkToken:', !!linkToken, 'ready:', ready)
                  }
                  if (!linkToken) {
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[BankConnectionModal] No link token, fetching...')
                    }
                    fetchLinkToken()
                  } else if (ready) {
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[BankConnectionModal] Opening Plaid Link...')
                    }
                    open()
                  } else {
                    if (process.env.NODE_ENV === 'development') {
                      console.warn('[BankConnectionModal] Plaid Link not ready yet. Token:', !!linkToken, 'Ready:', ready)
                    }
                  }
                }}
                disabled={!linkToken || isFetchingToken || !ready}
              >
                {isFetchingToken ? (
                  <>
                    <span className={styles.spinner}></span>
                    Fetching token...
                  </>
                ) : !linkToken ? (
                  <>
                    <span className={styles.spinner}></span>
                    Initializing...
                  </>
                ) : !ready ? (
                  <>
                    <span className={styles.spinner}></span>
                    Loading Plaid...
                  </>
                ) : (
                  'Connect Bank Account'
                )}
              </button>
              <div style={{ textAlign: 'center', color: '#6b7280' }}>or</div>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowManualEntry(true)}
              >
                Enter Bank Details Manually
              </button>
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
                <label className={styles.label}>Account holder type</label>
                <select
                  className={styles.input}
                  value={manualHolderType}
                  onChange={(e) => setManualHolderType(e.target.value)}
                >
                  <option value="Personal">Personal</option>
                  <option value="Business">Business</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Routing number</label>
                <input
                  className={`${styles.input} ${fieldErrors.includes('routingNumber') ? styles.inputError : ''}`}
                  value={manualRouting}
                  onChange={(e) => {
                    setManualRouting(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))
                    setFieldErrors(prev => prev.filter(f => f !== 'routingNumber'))
                  }}
                  placeholder="9 digits"
                  maxLength={9}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Account number</label>
                <input
                  className={`${styles.input} ${fieldErrors.includes('accountNumber') ? styles.inputError : ''}`}
                  value={manualAccount}
                  onChange={(e) => {
                    setManualAccount(e.target.value.replace(/[^0-9]/g, '').slice(0, 17))
                    setFieldErrors(prev => prev.filter(f => f !== 'accountNumber'))
                  }}
                  placeholder="4-17 digits"
                  maxLength={17}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Confirm account number</label>
                <input
                  className={`${styles.input} ${fieldErrors.includes('confirmAccountNumber') ? styles.inputError : ''}`}
                  value={manualConfirmAccount}
                  onChange={(e) => {
                    setManualConfirmAccount(e.target.value.replace(/[^0-9]/g, '').slice(0, 17))
                    setFieldErrors(prev => prev.filter(f => f !== 'confirmAccountNumber'))
                  }}
                  placeholder="Re-enter account number"
                  maxLength={17}
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
                disabled={isSubmittingManual || !manualRouting || !manualAccount || !manualConfirmAccount}
              >
                {isSubmittingManual ? (
                  <>
                    <span className={styles.spinner}></span>
                    Verifying account...
                  </>
                ) : (
                  'Add bank account'
                )}
              </button>
              <button
                type="button"
                className={styles.submitButton}
                onClick={() => setShowManualEntry(false)}
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

