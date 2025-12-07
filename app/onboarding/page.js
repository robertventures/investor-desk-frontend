'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithCsrf } from '../../lib/csrfClient'
import { apiClient } from '../../lib/apiClient'
import Header from '../components/Header'
import BankConnectionModal from '../components/BankConnectionModal'
import { formatCurrency } from '../../lib/formatters.js'
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
  // Read hint from URL (default to true if not present or 'true')
  const needsBankHint = searchParams?.get('needs_bank')
  const initialBankRequired = needsBankHint === 'false' ? false : true
  
  const [currentStep, setCurrentStep] = useState(ONBOARDING_STEPS.PASSWORD)
  const [userData, setUserData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(true)
  const [bankAccountRequired, setBankAccountRequired] = useState(initialBankRequired)
  const [showBankModal, setShowBankModal] = useState(false)
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

  // Helper to fetch investments and determine next step
  const fetchInvestmentsAndProceed = async (user) => {
    // Fetch investments separately
    let investments = []
    try {
      const investmentsResponse = await apiClient.getInvestments()
      if (investmentsResponse.success && investmentsResponse.investments) {
        // Deduplicate investments by ID to avoid display issues
        const uniqueMap = new Map()
        investmentsResponse.investments.forEach(inv => uniqueMap.set(inv.id, inv))
        investments = Array.from(uniqueMap.values())
      } else if (investmentsResponse.success === false) {
        console.error('Failed to fetch investments:', investmentsResponse.error)
        // If we're authenticated but failed to fetch investments, something is wrong.
        // But we'll proceed with empty investments which will effectively skip the bank step
        // unless we want to show an error.
      }
    } catch (err) {
      console.warn('Failed to load investments:', err)
    }
    
    // Merge investments into userData so getInvestmentsNeedingBanks() can access them
    setUserData({
      ...user,
      investments: investments
    })
    
    // Check if bank accounts are needed (only monthly payment investments need payout accounts)
    const investmentsNeedingBanks = investments.filter(inv => 
      inv.status !== 'withdrawn' && 
      inv.paymentFrequency === 'monthly'
    )
    
    const needsBank = investmentsNeedingBanks.length > 0
    setBankAccountRequired(needsBank) // Only require for monthly payment investments
    
    console.log('Investments needing banks:', investmentsNeedingBanks.length)
    
    // Go to bank step only if user has monthly investments, otherwise skip to complete
    setCurrentStep(needsBank ? ONBOARDING_STEPS.BANK : ONBOARDING_STEPS.COMPLETE)
  }

  // Initialize on mount
  useEffect(() => {
    // Onboarding requires a token from the admin-sent email link
    // If no token is present, redirect away - onboarding is only for imported users
    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ No onboarding token present, redirecting...')
      }
      if (typeof window !== 'undefined') {
        const userId = localStorage.getItem('currentUserId')
        if (userId) {
          // User is logged in - send to dashboard
          router.push('/dashboard')
        } else {
          // User is not logged in - send to login
          router.push('/login')
        }
      }
      return
    }

    // Clear any existing session if we have a token (prevents admin session mix-up)
    // Clear previous session to avoid "already authenticated" state as wrong user (e.g. admin)
    apiClient.clearTokens() 
    if (typeof window !== 'undefined') {
      localStorage.removeItem('currentUserId')
      sessionStorage.clear()
    }

    // Via email link - assume valid token and show password form
    if (process.env.NODE_ENV === 'development') {
      console.log('🔗 Onboarding via token link')
    }
    // We don't verify token upfront anymore as the endpoint doesn't exist
    // Validation happens when submitting the password
    setRequiresPasswordChange(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Use resetPassword with the token directly
      // This endpoint verifies the token and sets the password in one go
      const response = await apiClient.resetPassword(token, password)
      
      console.log('✅ Password set successfully', response)
      
      // Check if we received an authentication token (auto-login)
      if (response && response.access_token) {
        console.log('🔑 Received auth token, logging in automatically...')
        
        // Set the auth tokens to log the user in
        apiClient.setTokens(response.access_token, response.refresh_token)
        
        // Fetch user data and investments to determine next step
        try {
          const userData = await apiClient.getCurrentUser()
          
          if (userData.success && userData.user) {
            // Set currentUserId in localStorage for DashboardShell compatibility
            if (typeof window !== 'undefined') {
              localStorage.setItem('currentUserId', userData.user.id)
            }
            await fetchInvestmentsAndProceed(userData.user)
          } else {
            console.error('Failed to fetch user data after password setup')
            setError('Password set but failed to load user data. Please log in.')
            setCurrentStep(ONBOARDING_STEPS.COMPLETE)
          }
        } catch (err) {
          console.error('Error loading user data after password setup:', err)
          setError('Password set but failed to load user data. Please log in.')
          setCurrentStep(ONBOARDING_STEPS.COMPLETE)
        }
      } else {
        // No token in response, try to login manually using email from params
        console.log('⚠️ No auth token in response, attempting manual login')
        const email = searchParams?.get('email')
        
        if (email) {
          try {
            const loginResponse = await apiClient.login(email, password)
            if (loginResponse.success && loginResponse.user) {
              console.log('✅ Manual login successful')
              
              // Set currentUserId in localStorage for DashboardShell compatibility
              if (typeof window !== 'undefined' && loginResponse.user.id) {
                localStorage.setItem('currentUserId', loginResponse.user.id)
              }
              
              // CRITICAL: Explicitly set tokens on the global apiClient
              // apiClient.login only updates the authService instance, but we need
              // investmentService to also be authenticated for the next call.
              if (loginResponse.access_token) {
                apiClient.setTokens(loginResponse.access_token, loginResponse.refresh_token)
              }
              
              await fetchInvestmentsAndProceed(loginResponse.user)
              return
            }
          } catch (loginErr) {
            console.error('Manual login failed:', loginErr)
          }
        }
        
        // If manual login fails, show complete step
        setCurrentStep(ONBOARDING_STEPS.COMPLETE)
      }
    } catch (err) {
      console.error('Password setup failed:', err)
      setError(err.message || 'Failed to set password. The link may be invalid or expired.')
    } finally {
      setIsLoading(false)
    }
  }


  // Complete onboarding - just clear session and redirect to dashboard
  // No profile updates needed - the payment method is already associated with the user via Plaid
  const completeOnboarding = async () => {
    console.log('✅ Onboarding completed!')
    sessionStorage.removeItem('onboarding_via_token')
    
    // Redirect to dashboard if authenticated, otherwise show complete step
    if (apiClient.isAuthenticated()) {
      router.push('/dashboard')
    } else {
      setCurrentStep(ONBOARDING_STEPS.COMPLETE)
    }
  }

  // Handle bank connection - payment method is already created via Plaid link-success
  // We only need to update UI state here, no investment updates needed
  const handleBankConnected = async (bankAccount) => {
    console.log('handleBankConnected called with:', bankAccount)
    console.log('Payment method created via Plaid link-success, updating UI state...')
    
    // Update local state to show bank is connected for all applicable investments
    const investmentsNeeding = getInvestmentsNeedingBanks()
    let updatedAssignments = { ...investmentBankAssignments }
    
    for (const inv of investmentsNeeding) {
      updatedAssignments[inv.id] = {
        ...(updatedAssignments[inv.id] || {}),
        payout: bankAccount
      }
    }
    
    setInvestmentBankAssignments(updatedAssignments)
    console.log('✅ Bank account connected, UI state updated:', updatedAssignments)
    
    setShowBankModal(false)
  }
  
  // Get investments that need bank accounts (only monthly payment investments)
  const getInvestmentsNeedingBanks = () => {
    return userData?.investments?.filter(inv => 
      inv.status !== 'withdrawn' && 
      inv.paymentFrequency === 'monthly'
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

  const allBanksConnected = getInvestmentsNeedingBanks().every(inv => investmentHasAllRequiredBanks(inv))


  // Show loading state
  if (isLoading && !userData && !token) {
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
  if (error && !userData && !token) {
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
              <div className={`${styles.step} ${
                currentStep === ONBOARDING_STEPS.COMPLETE || (currentStep === ONBOARDING_STEPS.BANK && allBanksConnected)
                  ? styles.completed
                  : currentStep === ONBOARDING_STEPS.BANK
                  ? styles.active
                  : ''
              }`}>
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

          {/* Step 2: Bank Account Setup - Unified */}
          {currentStep === ONBOARDING_STEPS.BANK && (
            <div className={styles.form}>
              <h2>Link Payout Account</h2>
              <p>Connect a bank account to receive your monthly distributions. This account will be used for all your active investments.</p>
              
              {/* Summary of investments */}
              <div className={styles.investmentSummary} style={{ marginBottom: '24px', background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
                  Applicable Investments ({getInvestmentsNeedingBanks().length})
                </h3>
                {getInvestmentsNeedingBanks().map(investment => (
                  <div key={investment.id} style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                       {investment.accountType === 'individual' ? 'Individual' :
                        investment.accountType === 'joint' ? 'Joint' :
                        investment.accountType === 'entity' ? 'Entity' : 
                        (investment.accountType === 'sdira' ? 'SDIRA' : 'Investment')} Account
                    </span>
                    <span>{formatCurrency(investment.amount)}</span>
                  </div>
                ))}
              </div>
              
              {/* Bank Connection Status / Button */}
              {getInvestmentsNeedingBanks().every(inv => investmentHasAllRequiredBanks(inv)) ? (
                 // Connected State
                 <div className={styles.connectedState} style={{ marginBottom: '24px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', padding: '16px', border: '1px solid #10b981', borderRadius: '8px', background: '#ecfdf5' }}>
                     <div style={{ fontSize: '24px', marginRight: '12px' }}>✓</div>
                     <div>
                       <div style={{ fontWeight: '600', color: '#065f46' }}>Payout Account Connected</div>
                       <div style={{ fontSize: '13px', color: '#047857' }}>
                         {Object.values(investmentBankAssignments)[0]?.payout?.display_name || 'Bank Account'}
                       </div>
                     </div>
                     <button 
                       onClick={() => {
                         setShowBankModal(true)
                       }}
                       style={{ marginLeft: 'auto', fontSize: '13px', color: '#059669', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                     >
                       Change
                     </button>
                   </div>
                   
                   <button 
                    onClick={() => completeOnboarding()}
                    className={styles.submitButton}
                    disabled={isLoading}
                    style={{ marginTop: '24px' }}
                  >
                    {isLoading ? 'Completing Setup...' : 'Complete Setup'}
                  </button>
                 </div>
              ) : (
                // Not Connected State
                <button
                  onClick={() => {
                    setShowBankModal(true)
                  }}
                  className={styles.submitButton}
                  style={{ width: '100%', marginBottom: '16px' }}
                  disabled={isLoading}
                >
                  Connect Payout Account
                </button>
              )}
              
              {showBankModal && (
                <BankConnectionModal
                  isOpen={showBankModal}
                  onClose={() => {
                    setShowBankModal(false)
                  }}
                  onAccountSelected={handleBankConnected}
                />
              )}
              
            </div>
          )}

              {/* Step 3: Complete */}
          {currentStep === ONBOARDING_STEPS.COMPLETE && (
            <div className={styles.complete}>
              <div className={styles.successIcon}>✓</div>
              <h2>Setup Complete!</h2>
              {apiClient.isAuthenticated() ? (
                <>
                  <p>Your account setup is complete.</p>
                  <p style={{ marginTop: '8px', color: '#666' }}>You can now access your dashboard.</p>
                  
                  <button
                    onClick={() => router.push('/dashboard')}
                    className={styles.submitButton}
                    style={{ marginTop: '24px' }}
                  >
                    Go to Dashboard
                  </button>
                </>
              ) : (
                <>
                  <p>Your password has been set successfully.</p>
                  <p style={{ marginTop: '8px', color: '#666' }}>Please log in to access your dashboard.</p>
                  
                  <button
                    onClick={() => router.push('/login')}
                    className={styles.submitButton}
                    style={{ marginTop: '24px' }}
                  >
                    Log In
                  </button>
                </>
              )}
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
