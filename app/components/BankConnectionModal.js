"use client"
import { useEffect, useMemo, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { apiClient } from '../../lib/apiClient'
import styles from './BankConnectionModal.module.css'

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
      const res = await apiClient.request('/api/plaid/link-token', {
        method: 'POST',
        body: JSON.stringify({ use_case: 'processor', client_app: 'web' })
      })
      setLinkToken(res.link_token)
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to initialize Plaid')
    } finally {
      setIsFetchingToken(false)
    }
  }

  useEffect(() => {
    if (isOpen && !showManualEntry && !linkToken && !isFetchingToken) {
      fetchLinkToken()
    }
  }, [isOpen, showManualEntry, linkToken, isFetchingToken])

  const onPlaidSuccess = async (public_token, metadata) => {
    try {
      setStep(2)
      setErrorMessage('')
      const accountId = metadata?.account?.id
      const institution = metadata?.institution || {}
      const accountMask = metadata?.account?.mask
      const accountName = metadata?.account?.name
      const payload = {
        public_token,
        account_id: accountId,
        institution: { id: institution?.institution_id || institution?.id, name: institution?.name },
        account_mask: accountMask,
        account_name: accountName,
        save_for_reuse: true,
        idempotency_key: generateIdempotencyKey()
      }
      const res = await apiClient.request('/api/plaid/link-success', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      const method = res?.payment_method
      if (method && typeof onAccountSelected === 'function') {
        onAccountSelected(method)
      }
      onClose()
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to link bank account')
      setStep(1)
    }
  }

  const plaidConfig = useMemo(() => ({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  }), [linkToken])

  const { open, ready } = usePlaidLink(plaidConfig)

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
      const method = res?.payment_method
      if (method && typeof onAccountSelected === 'function') {
        onAccountSelected(method)
      }
      onClose()
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to add bank account')
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
            {showManualEntry ? 'Enter bank details' : 'Connect your bank'}
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
                  if (!linkToken) fetchLinkToken()
                  if (ready) open()
                }}
                disabled={!linkToken || isFetchingToken || !ready}
              >
                {(!linkToken || isFetchingToken || !ready) ? (
                  <>
                    <span className={styles.spinner}></span>
                    Initializing Plaid...
                  </>
                ) : (
                  'Continue with Plaid'
                )}
              </button>
              <div style={{ textAlign: 'center', color: '#6b7280' }}>or</div>
              <button
                className={styles.submitButton}
                onClick={() => setShowManualEntry(true)}
              >
                Enter bank details manually
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
                <label className={styles.label}>Account holder name</label>
                <input
                  className={styles.input}
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Routing number</label>
                <input
                  className={styles.input}
                  value={manualRouting}
                  onChange={(e) => setManualRouting(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
                  placeholder="9 digits"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Account number</label>
                <input
                  className={styles.input}
                  value={manualAccount}
                  onChange={(e) => setManualAccount(e.target.value.replace(/[^0-9]/g, '').slice(0, 17))}
                  placeholder="Account number"
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

