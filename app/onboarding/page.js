'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithCsrf } from '../../lib/csrfClient'
import { apiClient } from '../../lib/apiClient'
import Header from '../components/Header'
import BankConnectionModal from '../components/BankConnectionModal'
import styles from './page.module.css'

const ONBOARDING_STEPS = {
  PASSWORD: 'password',
  BANK: 'bank',
  COMPLETE: 'complete'
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')
  
  const [currentStep, setCurrentStep] = useState(ONBOARDING_STEPS.PASSWORD)
  const [userData, setUserData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(true)
  const [bankAccountRequired, setBankAccountRequired] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [currentInvestmentForBank, setCurrentInvestmentForBank] = useState(null)
  const [currentBankType, setCurrentBankType] = useState(null) // 'funding' or 'payout'
  const [investmentBankAssignments, setInvestmentBankAssignments] = useState({})
  
  // Password step state
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)

  // Password validation
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)
  const hasMinLength = password.length >= 8
  const isPasswordValid = hasUppercase && hasNumber && hasSpecial && hasMinLength

  const passwordRequirements = [
    { label: '8 Characters', isMet: hasMinLength },
    { label: '1 Uppercase letter', isMet: hasUppercase },
    { label: '1 Number', isMet: hasNumber },
    { label: '1 Special character', isMet: hasSpecial }
  ]

  const shouldShowRequirements = isPasswordFocused

  // Load user data when testing (no token)
  const loadUserData = async (userId) => {
    try {
      const data = await apiClient.getUser(userId)
      
      if (data.success && data.user) {
        setUserData(data.user)
        
        // Fetch investments separately
        let investments = []
        try {
          const investmentsResponse = await apiClient.getInvestments()
          if (investmentsResponse && investmentsResponse.investments) {
            investments = investmentsResponse.investments
          }
        } catch (err) {
          console.warn('Failed to load investments:', err)
        }
        
        // Check if bank accounts are needed (only for monthly payment investments)
        const investmentsNeedingBanks = investments.filter(inv => 
          inv.status !== 'withdrawn' && 
          inv.paymentFrequency === 'monthly' && // Only monthly investments need banks
          inv.paymentMethod !== 'wire-transfer'
        )
        
        const needsBank = investmentsNeedingBanks.length > 0
        setBankAccountRequired(needsBank)
        
        // Initialize bank assignments for investments that already have banks
        const initialAssignments = {}
        investments.forEach(inv => {
          if (inv.bankAccountId) {
            // Mark as having a bank (we'll show it as connected)
            initialAssignments[inv.id] = { id: inv.bankAccountId }
          }
        })
        setInvestmentBankAssignments(initialAssignments)
        
        console.log('User data loaded for testing mode:', data.user)
        console.log('Investments needing banks:', investmentsNeedingBanks.length)
        console.log('Bank account required:', needsBank)
        
        // Determine initial step based on whether banks are needed
        if (needsBank) {
          setCurrentStep(ONBOARDING_STEPS.BANK)
        } else {
          // No banks needed, complete onboarding immediately
          await completeOnboarding()
        }
      } else {
        setError('Failed to load user data')
        setTimeout(() => router.push('/sign-in'), 2000)
      }
    } catch (err) {
      console.error('Error loading user data:', err)
      setError('Failed to load user data')
    }
  }

  // Verify token and auto-login
  const verifyToken = async (tokenValue) => {
    setIsLoading(true)
    setError(null)
    
    console.log('🔍 Starting token verification:', tokenValue)
    
    try {
      console.log('📡 Calling verify-onboarding-token API...')
      const response = await fetchWithCsrf('/api/auth/verify-onboarding-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: tokenValue })
      })
      
      console.log('📡 API response status:', response.status)
      
      if (!response.ok) {
        console.error('❌ API returned non-OK status:', response.status, response.statusText)
        setError(`Server error (${response.status}). Please contact support.`)
        return
      }
      
      const data = await response.json()
      console.log('📦 API response data:', { success: data.success, error: data.error })
      
      if (!data.success) {
        console.error('❌ Token verification failed:', data.error)
        setError(data.error || 'Invalid or expired setup link. Please contact your administrator for a new link.')
        return
      }
      
      console.log('✅ Token verified successfully')
      setUserData(data.user)
      localStorage.setItem('currentUserId', data.user.id)
      sessionStorage.setItem('onboarding_via_token', 'true')
      
      // Fetch investments separately
      let investments = []
      try {
        const investmentsResponse = await apiClient.getInvestments()
        if (investmentsResponse && investmentsResponse.investments) {
          investments = investmentsResponse.investments
        }
      } catch (err) {
        console.warn('Failed to load investments:', err)
      }
      
      // Check if bank account is needed (only for monthly payment investments)
      const needsBank = investments.some(inv => 
        inv.paymentFrequency === 'monthly' && 
        inv.status !== 'withdrawn' &&
        inv.paymentMethod !== 'wire-transfer'
      )
      setBankAccountRequired(needsBank)
      
      // Initialize bank assignments for investments that already have banks
      const initialAssignments = {}
      investments.forEach(inv => {
        if (inv.bankAccountId) {
          // Mark as having a bank (we'll show it as connected)
          initialAssignments[inv.id] = { id: inv.bankAccountId }
        }
      })
      setInvestmentBankAssignments(initialAssignments)
      
      console.log('✅ User auto-logged in:', data.user.email)
      console.log('Bank account required:', needsBank)
      
      setCurrentStep(ONBOARDING_STEPS.PASSWORD)
    } catch (err) {
      console.error('❌ Error verifying token:', err)
      console.error('Error details:', err.message, err.stack)
      setError(`Connection error: ${err.message}. Please try again or contact support.`)
    } finally {
      console.log('🏁 Token verification completed')
      setIsLoading(false)
    }
  }

  // Initialize on mount
  useEffect(() => {
    if (token) {
      // Via email link - full onboarding with password
      console.log('🔗 Onboarding via token link')
      verifyToken(token)
      setRequiresPasswordChange(true)
    } else {
      // Direct access (testing) - skip password, just SSN + Bank
      console.log('🧪 Onboarding via direct access (testing mode)')
      if (typeof window !== 'undefined') {
        const userId = localStorage.getItem('currentUserId')
        if (userId) {
          loadUserData(userId)
          setRequiresPasswordChange(false)
          // Don't set step here - let loadUserData determine if bank is needed
        } else {
          setError('Please sign in first')
          setTimeout(() => router.push('/sign-in'), 2000)
        }
      }
    }
  }, [token])

  // Handle password setup
  const handlePasswordSetup = async (e) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!isPasswordValid) {
      setError('Password does not meet requirements')
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      // For imported users setting password for first time, use direct auth update
      const response = await fetch(`/api/users/${userData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _action: 'setInitialPassword',
          password: password
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to set password')
      }
      
      console.log('✅ Password set successfully')
      
      // Check if bank needed
      if (bankAccountRequired) {
        setCurrentStep(ONBOARDING_STEPS.BANK)
      } else {
        await completeOnboarding()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }


  // Complete onboarding
  const completeOnboarding = async () => {
    try {
      await fetch(`/api/users/${userData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needsOnboarding: false,
          onboardingCompletedAt: new Date().toISOString(),
          onboardingToken: null,
          onboardingTokenExpires: null
        })
      })
      
      console.log('✅ Onboarding completed!')
      sessionStorage.removeItem('onboarding_via_token')
      setCurrentStep(ONBOARDING_STEPS.COMPLETE)
    } catch (err) {
      console.error('Error completing onboarding:', err)
      // Still proceed to complete step
      setCurrentStep(ONBOARDING_STEPS.COMPLETE)
    }
  }

  // Handle bank connection for specific investment
  const handleBankConnected = async (bankAccount) => {
    try {
      console.log('handleBankConnected called with:', bankAccount, 'for type:', currentBankType)
      
      // First, add bank account to user if not already added
      // Check if this exact bank account already exists (by bankId and last4)
      const existingBank = userData.bankAccounts?.find(b => 
        b.bankId === bankAccount.bankId && b.last4 === bankAccount.last4
      )
      
      let bankAccountId = existingBank?.id || bankAccount.id
      
      if (!existingBank) {
        console.log('Adding new bank account to user...')
        const addBankRes = await fetch(`/api/users/${userData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _action: 'addBankAccount',
            bankAccount
          })
        })
        
        const bankData = await addBankRes.json()
        console.log('Add bank response:', bankData)
        
        if (bankData.success && bankData.bankAccount) {
          bankAccountId = bankData.bankAccount.id
        } else {
          // If save failed, still use the temporary ID for this session
          console.warn('Bank account not saved to DB, using temporary ID')
        }
      } else {
        console.log('Bank account already exists, reusing:', existingBank.id)
      }
      
      // Assign bank to the specific investment
      if (currentInvestmentForBank && currentBankType) {
        console.log(`Assigning ${currentBankType} bank ${bankAccountId} to investment ${currentInvestmentForBank.id}`)
        
        // Update local state
        const updatedAssignments = {
          ...investmentBankAssignments,
          [currentInvestmentForBank.id]: {
            ...(investmentBankAssignments[currentInvestmentForBank.id] || {}),
            [currentBankType]: bankAccount
          }
        }
        setInvestmentBankAssignments(updatedAssignments)
        
        console.log(`✅ ${currentBankType} bank account assigned to investment ${currentInvestmentForBank.id}`)
        console.log('Updated assignments:', updatedAssignments)
        
        // Check if all investments have required banks assigned
        const investmentsNeedingBanks = getInvestmentsNeedingBanks()
        const allAssigned = investmentsNeedingBanks.every(inv => investmentHasAllRequiredBanks(inv, updatedAssignments))
        
        console.log('All investments have required banks?', allAssigned)
        
        if (allAssigned) {
          console.log('All banks assigned, completing onboarding...')
          setShowBankModal(false)
          setCurrentInvestmentForBank(null)
          setCurrentBankType(null)
          await completeOnboarding()
          return
        }
      }
      
      setShowBankModal(false)
      setCurrentInvestmentForBank(null)
      setCurrentBankType(null)
    } catch (err) {
      console.error('Error saving bank account:', err)
      setError(`Failed to save bank account: ${err.message}`)
      setShowBankModal(false)
      setCurrentInvestmentForBank(null)
      setCurrentBankType(null)
    }
  }
  
  // Get investments that need bank accounts (only monthly payment, exclude wire transfer)
  const getInvestmentsNeedingBanks = () => {
    return userData?.investments?.filter(inv => 
      inv.status !== 'withdrawn' && 
      inv.paymentFrequency === 'monthly' && // Only monthly payment investments
      inv.paymentMethod !== 'wire-transfer' // Exclude wire transfer investments
    ) || []
  }
  
  // Determine what banks an investment needs
  const getRequiredBanksForInvestment = (investment) => {
    // For imported investors (onboarding flow), only need payout account
    // The investment is already funded - they just need to receive distributions
    return ['payout']
  }
  
  // Check if investment has all required banks assigned
  const investmentHasAllRequiredBanks = (investment, assignments = investmentBankAssignments) => {
    const required = getRequiredBanksForInvestment(investment)
    const investmentBanks = assignments[investment.id] || {}
    return required.every(bankType => investmentBanks[bankType])
  }
  
  // Check if a specific bank type is assigned for an investment
  const investmentHasBank = (investment, bankType) => {
    const investmentBanks = investmentBankAssignments[investment.id] || {}
    return !!investmentBanks[bankType]
  }


  // Show loading state
  if (isLoading && !userData) {
    return (
      <div className={styles.main}>
        <Header />
        <div className={styles.container}>
          <div className={styles.onboardingBox}>
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Loading...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error && !userData) {
    return (
      <div className={styles.main}>
        <Header />
        <div className={styles.container}>
          <div className={styles.onboardingBox}>
            <div className={styles.errorState}>
              <h2>⚠️ Error</h2>
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.main}>
      <Header />
      
      <div className={styles.container}>
        <div className={styles.onboardingBox}>
          <h1 className={styles.title}>Welcome to Robert Ventures</h1>
          <p className={styles.subtitle}>
            {requiresPasswordChange ? 'Complete your account setup' : 'Complete your profile'}
          </p>

          {/* Progress Indicator */}
          <div className={styles.progressBar}>
            {requiresPasswordChange && (
              <div className={`${styles.step} ${currentStep === ONBOARDING_STEPS.PASSWORD ? styles.active : (currentStep === ONBOARDING_STEPS.BANK || currentStep === ONBOARDING_STEPS.COMPLETE) ? styles.completed : ''}`}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepLabel}>Password</div>
              </div>
            )}
            {bankAccountRequired && (
              <div className={`${styles.step} ${currentStep === ONBOARDING_STEPS.BANK ? styles.active : currentStep === ONBOARDING_STEPS.COMPLETE ? styles.completed : ''}`}>
                <div className={styles.stepNumber}>{requiresPasswordChange ? 2 : 1}</div>
                <div className={styles.stepLabel}>Payout Account</div>
              </div>
            )}
          </div>

          {error && userData && (
            <div className={styles.error}>
              ❌ {error}
            </div>
          )}

          {/* Step 1: Password Setup (only if via token) */}
          {requiresPasswordChange && currentStep === ONBOARDING_STEPS.PASSWORD && (
            <form onSubmit={handlePasswordSetup} className={styles.form}>
              <h2>Set Your Password</h2>
              <p>Create a secure password for your account</p>
              
              <div className={styles.formGroup}>
                <label>Password</label>
                <div className={styles.inputWrapper}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => setIsPasswordFocused(false)}
                    className={styles.passwordInput}
                    required
                    minLength={8}
                    placeholder="Create a secure password"
                    autoFocus
                  />
                  <button
                    type="button"
                    className={styles.togglePasswordButton}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(prev => !prev)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div
                  className={styles.requirements}
                  style={{
                    display: shouldShowRequirements ? 'block' : 'none',
                    marginTop: '8px'
                  }}
                  aria-live="polite"
                >
                  {passwordRequirements.map((requirement, index) => (
                    <span
                      key={requirement.label}
                      className={`${styles.requirementItem} ${requirement.isMet ? styles.valid : styles.invalid}`}
                    >
                      {requirement.label}
                      {index < passwordRequirements.length - 1 && (
                        <span aria-hidden="true" className={styles.requirementSeparator}>·</span>
                      )}
                    </span>
                  ))}
                </div>
                {error && <span className={styles.error}>{error}</span>}
              </div>

              <div className={styles.formGroup}>
                <label>Confirm Password</label>
                <div className={styles.inputWrapper}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={styles.passwordInput}
                    required
                    placeholder="Re-enter password"
                  />
                  <button
                    type="button"
                    className={styles.togglePasswordButton}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(prev => !prev)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              
              <button type="submit" disabled={isLoading} className={styles.submitButton}>
                {isLoading ? 'Setting Password...' : 'Continue'}
              </button>
            </form>
          )}

          {/* Step 2: Bank Account Setup - Per Investment */}
          {currentStep === ONBOARDING_STEPS.BANK && (
            <div className={styles.form}>
              <h2>Link Payout Accounts</h2>
              <p>Connect bank accounts to receive your monthly distributions</p>
              
              <div className={styles.investmentBankList}>
                {getInvestmentsNeedingBanks().map(investment => {
                  const requiredBanks = getRequiredBanksForInvestment(investment)
                  const paymentType = investment.paymentFrequency === 'monthly' ? 'Monthly Payments' : 'Compounding'
                  
                  return (
                    <div key={investment.id} className={styles.investmentBankItem}>
                      <div className={styles.investmentInfo}>
                        <h3 className={styles.investmentTitle}>
                          {investment.accountType === 'individual' ? 'Individual Account' :
                           investment.accountType === 'joint' ? 'Joint Account' :
                           investment.accountType === 'entity' ? 'Entity Account' : 'IRA Account'}
                        </h3>
                        <p className={styles.investmentDetails}>
                          ${investment.amount?.toLocaleString()} • {investment.lockupPeriod} • {paymentType}
                        </p>
                        
                        {/* Show payout account status */}
                        {investmentHasBank(investment, 'payout') ? (
                          <div className={styles.bankAssigned} style={{ marginTop: '8px' }}>
                            ✓ Payout account connected
                          </div>
                        ) : (
                          <div className={styles.bankPending} style={{ marginTop: '8px' }}>
                            ○ Payout account needed
                          </div>
                        )}
                      </div>
                      
                      {/* Connect payout button */}
                      <button
                        onClick={() => {
                          setCurrentInvestmentForBank(investment)
                          setCurrentBankType('payout')
                          setShowBankModal(true)
                        }}
                        className={investmentHasBank(investment, 'payout') ? styles.secondaryButton : styles.primaryButton}
                        disabled={isLoading}
                      >
                        {investmentHasBank(investment, 'payout') ? 'Change Payout Account' : 'Connect Payout Account'}
                      </button>
                    </div>
                  )
                })}
              </div>
              
              {showBankModal && currentInvestmentForBank && currentBankType && (
                <BankConnectionModal
                  isOpen={showBankModal}
                  onClose={() => {
                    setShowBankModal(false)
                    setCurrentInvestmentForBank(null)
                    setCurrentBankType(null)
                  }}
                  onAccountSelected={handleBankConnected}
                />
              )}
              
              {getInvestmentsNeedingBanks().every(inv => investmentHasAllRequiredBanks(inv)) && (
                <button 
                  onClick={completeOnboarding}
                  className={styles.submitButton}
                  disabled={isLoading}
                  style={{ marginTop: '20px' }}
                >
                  {isLoading ? 'Completing Setup...' : 'Complete Setup'}
                </button>
              )}
              
              <button
                onClick={() => {
                  if (window.confirm('Skip bank setup for now? You can add bank accounts later from your profile.')) {
                    completeOnboarding()
                  }
                }}
                className={styles.skipButton}
                disabled={isLoading}
              >
                Skip for Now
              </button>
            </div>
          )}

          {/* Step 3: Complete */}
          {currentStep === ONBOARDING_STEPS.COMPLETE && (
            <div className={styles.complete}>
              <div className={styles.successIcon}>✓</div>
              <h2>Setup Complete!</h2>
              <p>Your account is now fully set up. You can now access your investment dashboard.</p>
              
              <button
                onClick={() => router.push('/dashboard')}
                className={styles.submitButton}
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className={styles.main}>
        <Header />
        <div className={styles.container}>
          <div className={styles.onboardingBox}>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
