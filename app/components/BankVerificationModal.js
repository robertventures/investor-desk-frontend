"use client"
import { useState } from 'react'
import { apiClient } from '../../lib/apiClient'
import styles from './BankVerificationModal.module.css'

export default function BankVerificationModal({ isOpen, onClose, paymentMethodId, onVerificationSuccess }) {
  const [amount1, setAmount1] = useState('')
  const [amount2, setAmount2] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount1 || !amount2) {
      setError('Please enter both amounts')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')
      
      // Convert to cents (e.g. "0.32" -> 32)
      const cents1 = Math.round(parseFloat(amount1) * 100)
      const cents2 = Math.round(parseFloat(amount2) * 100)
      
      if (isNaN(cents1) || isNaN(cents2)) {
        throw new Error('Invalid amounts entered')
      }

      await apiClient.verifyPaymentMethod(paymentMethodId, [cents1, cents2])
      
      setSuccess(true)
      setTimeout(() => {
        if (onVerificationSuccess) onVerificationSuccess()
        onClose()
      }, 2000)
    } catch (err) {
      console.error('Verification failed:', err)
      setError(err.message || 'Verification failed. Please check the amounts and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Verify Bank Account</h3>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          {success ? (
            <div className={styles.successMessage}>
              <div className={styles.checkIcon}>✓</div>
              <h4 className={styles.successTitle}>Verification Successful</h4>
              <p className={styles.successText}>Your bank account is now ready to use.</p>
            </div>
          ) : (
            <>
              <p className={styles.description}>
                Please enter the two micro-deposit amounts that appeared on your bank statement (e.g., $0.32 and $0.45).
              </p>

              {error && <div className={styles.errorMessage}>{error}</div>}

              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.inputGroup}>
                  <div className={styles.inputWrapper}>
                    <span className={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1.00"
                      className={styles.input}
                      placeholder="0.00"
                      value={amount1}
                      onChange={e => setAmount1(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className={styles.inputWrapper}>
                    <span className={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1.00"
                      className={styles.input}
                      placeholder="0.00"
                      value={amount2}
                      onChange={e => setAmount2(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className={styles.submitButton}
                  disabled={isSubmitting || !amount1 || !amount2}
                >
                  {isSubmitting ? (
                    <>
                      <span className={styles.spinner}></span>
                      Verifying...
                    </>
                  ) : (
                    'Verify Amounts'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}


