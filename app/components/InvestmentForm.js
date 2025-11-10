'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import styles from './InvestmentForm.module.css'

export default function InvestmentForm({ onCompleted, onReviewSummary, disableAuthGuard = false, accountType, initialAmount, initialPaymentFrequency, initialLockup, onValuesChange }) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    investmentAmount: typeof initialAmount === 'number' ? initialAmount : 0,
    paymentFrequency: initialPaymentFrequency === 'monthly' || initialPaymentFrequency === 'compounding' ? initialPaymentFrequency : 'compounding'
  })
  const [errors, setErrors] = useState({})
  const [selectedLockup, setSelectedLockup] = useState(initialLockup === '1-year' || initialLockup === '3-year' ? initialLockup : '3-year')
  const [isAmountFocused, setIsAmountFocused] = useState(false)
  const [displayAmount, setDisplayAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calculate bonds based on $10 per bond
  const bonds = Math.floor(formData.investmentAmount / 10)
  const formattedBonds = bonds.toLocaleString()

  const getAmountError = (amount) => {
    if (!amount) return ''
    if (amount < 1000) return 'Minimum investment is $1,000'
    if (amount % 10 !== 0) return 'Investment amount must be in $10 increments'
    return ''
  }

  // Calculate anticipated earnings based on payment frequency
  const calculateEarnings1Year = () => {
    const amount = formData.investmentAmount
    const apy = 0.08
    const years = 1
    
    if (formData.paymentFrequency === 'monthly') {
      // Interest paid monthly
      return (amount * apy * years).toFixed(2)
    } else {
      // Compounded monthly
      const monthlyRate = apy / 12
      const totalMonths = years * 12
      const compoundAmount = amount * Math.pow(1 + monthlyRate, totalMonths)
      return (compoundAmount - amount).toFixed(2)
    }
  }

  const calculateEarnings3Year = () => {
    const amount = formData.investmentAmount
    const apy = 0.10
    const years = 3
    
    if (formData.paymentFrequency === 'monthly') {
      // Interest paid monthly
      return (amount * apy * years).toFixed(2)
    } else {
      // Compounded monthly
      const monthlyRate = apy / 12
      const totalMonths = years * 12
      const compoundAmount = amount * Math.pow(1 + monthlyRate, totalMonths)
      return (compoundAmount - amount).toFixed(2)
    }
  }

  const earnings1Year = calculateEarnings1Year()
  const earnings3Year = calculateEarnings3Year()
  // Annualized earnings for display (APY * amount)
  const annualEarnings1Year = (formData.investmentAmount * 0.08).toFixed(2)
  const annualEarnings3Year = (formData.investmentAmount * 0.10).toFixed(2)

  // Upsell: how much more with compounding for selected lockup
  const compoundingVsMonthlyDelta = (() => {
    const amount = formData.investmentAmount || 0
    if (amount <= 0) return 0
    const isThreeYear = selectedLockup === '3-year'
    const apy = isThreeYear ? 0.10 : 0.08
    const years = isThreeYear ? 3 : 1
    const monthlyRate = apy / 12
    const totalMonths = years * 12
    const compoundedEarnings = amount * Math.pow(1 + monthlyRate, totalMonths) - amount
    const monthlyPaidEarnings = amount * apy * years
    const delta = compoundedEarnings - monthlyPaidEarnings
    return Math.max(0, Number(delta.toFixed(2)))
  })()

  const buildSummary = (lockupPeriodSelection) => {
    const effectiveLockup = lockupPeriodSelection || selectedLockup
    return {
      amount: formData.investmentAmount,
      paymentFrequency: formData.paymentFrequency,
      lockupPeriod: effectiveLockup,
      bonds,
      accountType
    }
  }

  const notifyCompletion = (investmentId, lockupPeriodSelection) => {
    const summary = buildSummary(lockupPeriodSelection)
    if (typeof onReviewSummary === 'function') {
      onReviewSummary(summary)
    }
    if (typeof onCompleted === 'function') {
      onCompleted({ investmentId, ...summary })
    } else {
      router.push('/investment')
    }
  }

  useEffect(() => {
    // Check if user is logged in (has session data)
    if (!disableAuthGuard) {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('currentUserId') : null
      if (!userId) {
        alert('Please complete the signup process first.')
        router.push('/')
        return
      }
    }
  }, [router, disableAuthGuard])

  // Keep in sync if parent updates values
  useEffect(() => {
    if (typeof initialAmount === 'number') {
      setFormData(prev => ({ ...prev, investmentAmount: initialAmount }))
      setDisplayAmount(initialAmount > 0 ? initialAmount.toLocaleString() : '')
    }
  }, [initialAmount])

  // Update display amount when formData changes
  useEffect(() => {
    if (!isAmountFocused) {
      setDisplayAmount(formData.investmentAmount > 0 ? formData.investmentAmount.toLocaleString() : '')
    }
  }, [formData.investmentAmount, isAmountFocused])
  useEffect(() => {
    if (initialPaymentFrequency === 'monthly' || initialPaymentFrequency === 'compounding') {
      setFormData(prev => ({ ...prev, paymentFrequency: initialPaymentFrequency }))
    }
  }, [initialPaymentFrequency])
  useEffect(() => {
    if (initialLockup === '1-year' || initialLockup === '3-year') {
      setSelectedLockup(initialLockup)
    }
  }, [initialLockup])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    let nextValue = value
    if (name === 'investmentAmount') {
      // Remove commas and strip leading zeros so typing doesn't result in values like 01000
      const cleanValue = value.replace(/,/g, '').replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
      nextValue = cleanValue
      setDisplayAmount(cleanValue) // Show raw input while typing
    }
    const numericValue = name === 'investmentAmount' ? (nextValue === '' ? 0 : parseInt(nextValue, 10) || 0) : nextValue
    
    setFormData(prev => ({ ...prev, [name]: numericValue }))
    if (typeof onValuesChange === 'function') onValuesChange({ amount: name === 'investmentAmount' ? numericValue : formData.investmentAmount, paymentFrequency: formData.paymentFrequency, lockupPeriod: selectedLockup })
    
    if (name === 'investmentAmount') {
      const amountError = getAmountError(numericValue)
      setErrors(prev => ({ ...prev, investmentAmount: amountError }))
    } else if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleRadioChange = (e) => {
    const { name, value } = e.target
    if (accountType === 'ira' && value === 'monthly') return
    setFormData(prev => ({ ...prev, [name]: value }))
    if (typeof onValuesChange === 'function') onValuesChange({ amount: formData.investmentAmount, paymentFrequency: value, lockupPeriod: selectedLockup })
  }


  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.investmentAmount) {
      newErrors.investmentAmount = 'Minimum investment is $1,000'
    } else {
      const amountError = getAmountError(formData.investmentAmount)
      if (amountError) newErrors.investmentAmount = amountError
    }
    
    if (!formData.paymentFrequency) {
      newErrors.paymentFrequency = 'Please select a payment frequency'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleInvest = async (lockupPeriod) => {
    if (!validateForm()) return
    setIsSubmitting(true)
    try {
      if (typeof window === 'undefined') return
      
      const userId = localStorage.getItem('currentUserId')
      if (!userId) {
        alert('Please sign in to continue')
        router.push('/')
        return
      }

      const investmentPayload = {
        amount: formData.investmentAmount,
        paymentFrequency: formData.paymentFrequency,
        lockupPeriod,
        accountType
      }

      console.log('Creating investment with payload:', investmentPayload)

      // Check if resuming an existing draft investment
      const existingInvestmentId = localStorage.getItem('currentInvestmentId')
      
      if (existingInvestmentId) {
        // Update existing draft investment (paymentMethod not required for updates)
        let data = await apiClient.updateInvestment(userId, existingInvestmentId, investmentPayload)
        if (!data.success) {
          // If investment not found, clear stale ID and create new one
          if (data.error && data.error.includes('not found')) {
            console.log('Investment not found, clearing stale ID and creating new investment')
            localStorage.removeItem('currentInvestmentId')
            // Create new investment with payment method
            const createPayload = { ...investmentPayload, paymentMethod: 'ach' }
            data = await apiClient.createInvestment(userId, createPayload)
            if (!data.success) {
              alert(data.error || 'Failed to start investment')
              return
            }
            // Save new investment id
            if (data.investment?.id) {
              localStorage.setItem('currentInvestmentId', data.investment.id)
              if (accountType) {
                apiClient.updateInvestment(userId, data.investment.id, { accountType })
                  .catch(err => console.error('Account type update failed:', err))
              }
            }
            notifyCompletion(data.investment?.id, lockupPeriod)
            return
          }
          alert(data.error || 'Failed to update investment')
          return
        }
        
        // If account type was already chosen, update it (wait for completion)
        if (accountType) {
          try {
            const resp = await apiClient.updateInvestment(userId, existingInvestmentId, { accountType })
            console.log('✅ Account type update attempt (investment):', {
              requestedAccountType: accountType,
              success: resp?.success,
              returnedAccountType: resp?.investment?.accountType
            })
            // Fallback: if backend didn't echo accountType on investment, persist on user profile
            if (!resp?.success || !resp?.investment || !resp.investment.accountType) {
              // Only fallback to user profile for 'individual' where no extra fields are required
              if (accountType === 'individual') {
                console.log('⚠️ Investment update missing accountType, falling back to user profile for individual')
                try {
                  const userResp = await apiClient.updateUser(userId, { accountType })
                  console.log('✅ Fallback: User profile accountType updated:', {
                    success: userResp?.success,
                    accountType
                  })
                } catch (e) {
                  console.error('❌ Fallback user accountType update failed:', e)
                }
              } else {
                console.log('ℹ️ Skipping profile fallback for non-individual accountType until identity step provides required fields')
              }
            }
          } catch (err) {
            console.error('❌ Investment accountType update failed (likely 401):', err)
            // Fallback: Save accountType to user profile instead
            if (accountType === 'individual') {
              console.log('⚠️ Attempting fallback: saving accountType to user profile (individual)')
              try {
                const userResp = await apiClient.updateUser(userId, { accountType })
                console.log('✅ Fallback: User profile accountType updated:', {
                  success: userResp?.success,
                  accountType
                })
              } catch (e) {
                console.error('❌ Fallback user accountType update also failed:', e)
              }
            } else {
              console.log('ℹ️ Skipping profile fallback for non-individual accountType after failure')
            }
          }
        }
        
        notifyCompletion(existingInvestmentId, lockupPeriod)
      } else {
        // Create new draft investment (API requires paymentMethod, use 'ach' as default)
        const createPayload = { ...investmentPayload, paymentMethod: 'ach' }
        const data = await apiClient.createInvestment(userId, createPayload)
        if (!data.success) {
          alert(data.error || 'Failed to start investment')
          return
        }
        
        // Save current investment id for next steps
        if (data.investment?.id) {
          localStorage.setItem('currentInvestmentId', data.investment.id)
          // If account type was already chosen earlier in the step, persist it now (wait for completion)
          if (accountType) {
            try {
              const resp = await apiClient.updateInvestment(userId, data.investment.id, { accountType })
              console.log('✅ Account type save attempt (investment):', {
                requestedAccountType: accountType,
                success: resp?.success,
                returnedAccountType: resp?.investment?.accountType
              })
              // Fallback: if backend didn't echo accountType on investment, persist on user profile
              if (!resp?.success || !resp?.investment || !resp.investment.accountType) {
                if (accountType === 'individual') {
                  console.log('⚠️ Investment creation missing accountType, falling back to user profile for individual')
                  try {
                    const userResp = await apiClient.updateUser(userId, { accountType })
                    console.log('✅ Fallback: User profile accountType updated:', {
                      success: userResp?.success,
                      accountType
                    })
                  } catch (e) {
                    console.error('❌ Fallback user accountType update failed:', e)
                  }
                } else {
                  console.log('ℹ️ Skipping profile fallback for non-individual accountType until identity step provides required fields')
                }
              }
            } catch (err) {
              console.error('❌ Investment accountType save failed (likely 401):', err)
              // Fallback: Save accountType to user profile instead
              if (accountType === 'individual') {
                console.log('⚠️ Attempting fallback: saving accountType to user profile (individual)')
                try {
                  const userResp = await apiClient.updateUser(userId, { accountType })
                  console.log('✅ Fallback: User profile accountType updated:', {
                    success: userResp?.success,
                    accountType
                  })
                } catch (e) {
                  console.error('❌ Fallback user accountType update also failed:', e)
                }
              } else {
                console.log('ℹ️ Skipping profile fallback for non-individual accountType after failure')
              }
            }
          }
        }
        notifyCompletion(data.investment?.id, lockupPeriod)
      }
    } catch (err) {
      console.error('Error starting investment', err)
      alert('An error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.investmentForm}>
      <div className={styles.formContainer}>
        {/* Step 1: Enter Investment Amount */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Enter Investment Amount</h2>
          <div className={styles.amountSection}>
            <div className={styles.inputGroup}>
              <div className={styles.currencyInputWrapper}>
                <div className={styles.currencyInput}>
                  <span className={styles.currencyPrefix}>$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="investmentAmount"
                    value={isAmountFocused ? displayAmount : (formData.investmentAmount > 0 ? formData.investmentAmount.toLocaleString() : '')}
                    onChange={handleInputChange}
                    className={styles.amountInput}
                    onFocus={() => setIsAmountFocused(true)}
                    onBlur={() => setIsAmountFocused(false)}
                    placeholder="0"
                  />
                  <span className={styles.bondsSuffix}>= {formattedBonds} Bond{bonds !== 1 ? 's' : ''}</span>
                </div>
                {errors.investmentAmount && (
                  <div className={`${styles.errorMessage} ${styles.amountError}`}>{errors.investmentAmount}</div>
                )}
                {formData.investmentAmount > 100000 && (
                  <div className={styles.wireTransferNotice}>
                    For investments above $100,000, payment must be made through wire transfer.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Select Payment Frequency */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>2. Select Payment Frequency</h2>
          <div className={styles.radioGroup}>
            <label className={`${styles.radioOption} ${formData.paymentFrequency === 'compounding' ? styles.radioOptionSelected : ''}`}>
              <input
                type="radio"
                name="paymentFrequency"
                value="compounding"
                checked={formData.paymentFrequency === 'compounding'}
                onChange={handleRadioChange}
                className={styles.radioInput}
              />
              <div className={styles.radioContent}>
                <span className={styles.radioLabel}>Compounded Monthly</span>
              </div>
            </label>
            
            <label className={`${styles.radioOption} ${accountType === 'ira' ? styles.disabled : ''} ${formData.paymentFrequency === 'monthly' ? styles.radioOptionSelected : ''}`}>
              <input
                type="radio"
                name="paymentFrequency"
                value="monthly"
                checked={formData.paymentFrequency === 'monthly'}
                onChange={handleRadioChange}
                className={styles.radioInput}
                disabled={accountType === 'ira'}
              />
              <div className={styles.radioContent}>
                <span className={styles.radioLabel}>Interest Paid Monthly</span>
              </div>
            </label>
          </div>
          {formData.paymentFrequency === 'monthly' && compoundingVsMonthlyDelta > 0 && (
            <div className={styles.radioDescription}>
              You could earn <strong>${compoundingVsMonthlyDelta.toLocaleString()}</strong> more by choosing compounding for the {selectedLockup === '3-year' ? '3-year' : '1-year'} option.
            </div>
          )}
          {errors.paymentFrequency && (
            <div className={styles.errorMessage}>{errors.paymentFrequency}</div>
          )}
        </div>

        {/* Step 3: Select Investment Option */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>3. Select Investment Option</h2>
          
          <div className={styles.investmentCards}>
            <div 
              className={`${styles.investmentCard} ${selectedLockup === '3-year' ? styles.selected : ''}`}
              onClick={() => { setSelectedLockup('3-year'); if (typeof onValuesChange === 'function') onValuesChange({ amount: formData.investmentAmount, paymentFrequency: formData.paymentFrequency, lockupPeriod: '3-year' }) }}
              role="button"
            >
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>3-Year Lock-Up</h3>
                <div className={styles.cardYield}>10% APY</div>
              </div>
              <div className={styles.cardEarnings}>
                Estimated annual earnings: <span className={styles.earningsAmount}>${parseFloat(annualEarnings3Year).toLocaleString()}</span>
              </div>
            </div>

            <div 
              className={`${styles.investmentCard} ${selectedLockup === '1-year' ? styles.selected : ''}`}
              onClick={() => { setSelectedLockup('1-year'); if (typeof onValuesChange === 'function') onValuesChange({ amount: formData.investmentAmount, paymentFrequency: formData.paymentFrequency, lockupPeriod: '1-year' }) }}
              role="button"
            >
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>1-Year Lock-Up</h3>
                <div className={styles.cardYield}>8% APY</div>
              </div>
              <div className={styles.cardEarnings}>
                Estimated annual earnings: <span className={styles.earningsAmount}>${parseFloat(annualEarnings1Year).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className={styles.actionsRow}>
            <button 
              onClick={() => handleInvest(selectedLockup)}
              className={styles.investButton}
              disabled={isSubmitting}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
