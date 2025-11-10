'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/apiClient'
import logger from '@/lib/logger'
import Header from '../components/Header'
import styles from './page.module.css'
import stepStyles from '../components/TabbedSignup.module.css'
import TabbedInvestmentType from '../components/TabbedInvestmentType'
import InvestmentForm from '../components/InvestmentForm'
import TabbedResidentialIdentity from '../components/TabbedResidentialIdentity'

function InvestmentPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const context = searchParams?.get('context') // 'onboarding' or 'new'
  const [activeStep, setActiveStep] = useState(1)
  const [isStep1Completed, setIsStep1Completed] = useState(false)
  const [isStep2Completed, setIsStep2Completed] = useState(false)
  const [reviewModeStep1, setReviewModeStep1] = useState(false)
  const [reviewModeStep2, setReviewModeStep2] = useState(false)
  const [step1Confirmed, setStep1Confirmed] = useState(false)
  const [step2Confirmed, setStep2Confirmed] = useState(false)
  const [step2Unlocked, setStep2Unlocked] = useState(false)

  const [selectedAccountType, setSelectedAccountType] = useState('individual')
  const [lockedAccountType, setLockedAccountType] = useState(null)
  const [userAccountType, setUserAccountType] = useState(null)
  const [investmentAmount, setInvestmentAmount] = useState(0)
  const [investmentPaymentFrequency, setInvestmentPaymentFrequency] = useState('compounding')
  const [investmentLockup, setInvestmentLockup] = useState('3-year')
  const [investmentSummary, setInvestmentSummary] = useState(null)
  const [identitySummary, setIdentitySummary] = useState(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const formattedInvestmentSummary = useMemo(() => {
    if (!investmentSummary) return []
    const accountTypeLabels = {
      individual: 'Individual',
      joint: 'Joint',
      entity: 'Entity',
      ira: 'IRA'
    }
    const lockupLabels = {
      '1-year': '1-Year Lock-Up',
      '3-year': '3-Year Lock-Up'
    }
    const lines = []
    lines.push({ label: 'Account Type', value: accountTypeLabels[investmentSummary.accountType] || '—' })
    lines.push({ label: 'Investment Amount', value: typeof investmentSummary.amount === 'number' ? `$${Number(investmentSummary.amount).toLocaleString()}` : '—' })
    lines.push({ label: 'Total Bonds', value: typeof investmentSummary.bonds === 'number' ? investmentSummary.bonds.toLocaleString() : '—' })
    lines.push({ label: 'Payment Frequency', value: investmentSummary.paymentFrequency === 'monthly' ? 'Interest Paid Monthly' : 'Compounded Monthly' })
    lines.push({ label: 'Lockup Period', value: lockupLabels[investmentSummary.lockupPeriod] || '—' })
    return lines
  }, [investmentSummary])

  const formattedIdentitySummary = useMemo(() => {
    if (!identitySummary) return []
    const lines = []
    if (identitySummary.accountType === 'entity' && identitySummary.entityName) {
      lines.push({ label: 'Entity Name', value: identitySummary.entityName })
    }
    if (identitySummary.accountType !== 'entity') {
      const primaryName = [identitySummary.firstName, identitySummary.lastName].filter(Boolean).join(' ')
      if (primaryName) {
        lines.push({ label: 'Holder Name', value: primaryName })
      }
    }
    if (identitySummary.phone) lines.push({ label: identitySummary.accountType === 'joint' ? 'Primary Phone' : 'Phone', value: identitySummary.phone })
    if (identitySummary.accountType === 'joint') {
      lines.push({ label: 'Joint Holding Type', value: identitySummary.jointHoldingType || '—' })
    }
    const addressParts = [identitySummary.street1, identitySummary.street2, identitySummary.city, identitySummary.state, identitySummary.zip]
      .filter(Boolean)
    if (addressParts.length) lines.push({ label: 'Address', value: addressParts.join(', ') })
    if (identitySummary.dob) lines.push({ label: identitySummary.accountType === 'entity' ? 'Registration Date' : 'Date of Birth', value: identitySummary.dob })
    if (identitySummary.ssn) lines.push({ label: identitySummary.accountType === 'entity' ? 'EIN/TIN' : 'SSN', value: identitySummary.ssn })
    if (identitySummary.accountType === 'entity' && identitySummary.entityName) {
      // already added above
    }
    if (identitySummary.accountType === 'entity' && identitySummary.authorizedRep) {
      const rep = identitySummary.authorizedRep
      const repName = [rep.firstName, rep.lastName].filter(Boolean).join(' ')
      if (repName) lines.push({ label: 'Authorized Rep Name', value: repName })
      if (rep.dob) lines.push({ label: 'Authorized Rep DOB', value: rep.dob })
      if (rep.ssn) lines.push({ label: 'Authorized Rep SSN', value: rep.ssn })
      const repAddress = [rep.address?.street1, rep.address?.street2, rep.address?.city, rep.address?.state, rep.address?.zip].filter(Boolean)
      if (repAddress.length) lines.push({ label: 'Authorized Rep Address', value: repAddress.join(', ') })
    }
    if (identitySummary.accountType === 'joint') {
      const joint = identitySummary.jointHolder
      if (joint) {
        const fullName = [joint.firstName, joint.lastName].filter(Boolean).join(' ')
        if (fullName) lines.push({ label: 'Joint Holder', value: fullName })
        if (joint.email) lines.push({ label: 'Joint Email', value: joint.email })
        if (joint.phone) lines.push({ label: 'Joint Phone', value: joint.phone })
        if (joint.dob) lines.push({ label: 'Joint DOB', value: joint.dob })
        if (joint.ssn) lines.push({ label: 'Joint SSN', value: joint.ssn })
        const jointAddress = [joint.address?.street1, joint.address?.street2, joint.address?.city, joint.address?.state, joint.address?.zip].filter(Boolean)
        if (jointAddress.length) lines.push({ label: 'Joint Address', value: jointAddress.join(', ') })
      }
    }
    return lines
  }, [identitySummary])

  const renderSummary = (items) => {
    if (!items.length) return null
    return (
      <div className={stepStyles.reviewSummary}>
        {items.map(({ label, value }) => (
          <div key={label} className={stepStyles.summaryRow}>
            <span className={stepStyles.summaryLabel}>{label}</span>
            <span className={stepStyles.summaryValue}>{value || '—'}</span>
          </div>
        ))}
      </div>
    )
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const userId = localStorage.getItem('currentUserId')
    if (!userId) {
      window.location.href = '/'
    }
    const checkAdmin = async () => {
      try {
        const data = await apiClient.getUser(userId)
        // If the account no longer exists, clear session and redirect
        if (!data.success || !data.user) {
          try {
            localStorage.removeItem('currentUserId')
            localStorage.removeItem('signupEmail')
            localStorage.removeItem('currentInvestmentId')
          } catch {}
          window.location.href = '/'
          return
        }
        if (data.success && data.user?.isAdmin) {
          window.location.href = '/dashboard'
          return
        }
        
        // Check if user is verified before allowing investment
        if (data.success && data.user && !data.user.isVerified) {
          window.location.href = '/confirmation'
          return
        }
        
        // Load existing draft investment data first if it exists, then set account type constraints
        const investmentId = typeof window !== 'undefined' ? localStorage.getItem('currentInvestmentId') : null
        let draftAccountType = null
        
        if (data.success && investmentId) {
          try {
            // Fetch the specific investment from the investments endpoint
            const investmentResponse = await apiClient.getInvestment(investmentId)
            if (investmentResponse.success && investmentResponse.investment) {
              const existingInvestment = investmentResponse.investment
              // Only load if it's a draft
              if (existingInvestment.status === 'draft') {
                logger.log('✅ Loading draft investment:', { id: existingInvestment.id, accountType: existingInvestment.accountType })
                // Log raw investment object shape for debugging fields available from backend
                try {
                  logger.log('ℹ️ Draft investment payload (debug):', {
                    keys: Object.keys(existingInvestment || {}),
                    sample: existingInvestment
                  })
                } catch {}
                // Store draft accountType to use after checking user constraints
                if (existingInvestment.accountType) draftAccountType = existingInvestment.accountType
                if (existingInvestment.amount !== undefined && existingInvestment.amount !== null) {
                  const amountNumber = typeof existingInvestment.amount === 'number' ? existingInvestment.amount : parseFloat(existingInvestment.amount) || 0
                  setInvestmentAmount(amountNumber)
                }
                if (existingInvestment.paymentFrequency) setInvestmentPaymentFrequency(existingInvestment.paymentFrequency)
                if (existingInvestment.lockupPeriod) setInvestmentLockup(existingInvestment.lockupPeriod)
              } else {
                // Investment is no longer a draft - clear it
                logger.log('⚠️ Investment is no longer a draft, clearing from localStorage')
                localStorage.removeItem('currentInvestmentId')
              }
            } else {
              // Investment not found - clear it from localStorage
              logger.log('⚠️ Investment not found, clearing from localStorage')
              localStorage.removeItem('currentInvestmentId')
            }
          } catch (err) {
            logger.warn('❌ Failed to load draft investment:', err)
            // Clear stale investment ID on error
            localStorage.removeItem('currentInvestmentId')
          }
        }
        
        // Load user's account type and set as locked ONLY if user has confirmed investments
        if (data.success && data.user) {
          const confirmedInvestments = (data.user.investments || []).filter(inv => inv.status === 'confirmed' || inv.status === 'pending')
          if (confirmedInvestments.length > 0 && data.user.accountType) {
            // User has at least one confirmed/pending investment, lock the account type
            setUserAccountType(data.user.accountType)
            setLockedAccountType(data.user.accountType)
            setSelectedAccountType(data.user.accountType)
          } else {
            // User has no confirmed investments yet - prioritize draft accountType if available
            if (data.user.accountType) {
              setUserAccountType(data.user.accountType)
            }
            if (draftAccountType && draftAccountType !== 'undefined') {
              setSelectedAccountType(draftAccountType)
              logger.log('✅ Restored draft accountType from investment:', draftAccountType)
            } else if (data.user.accountType) {
              setSelectedAccountType(data.user.accountType)
              logger.log('✅ Using user profile accountType (no draft):', data.user.accountType)
            } else {
              setSelectedAccountType('individual')
              logger.log('ℹ️ No accountType found, defaulting to individual')
            }
          }
        } else if (draftAccountType && draftAccountType !== 'undefined') {
          // No user data but have draft accountType
          setSelectedAccountType(draftAccountType)
          logger.log('✅ Restored draft accountType (no user data):', draftAccountType)
        }
        
        // Mark loading as complete
        setIsLoadingDraft(false)
      } catch {
        // Mark loading as complete even on error
        setIsLoadingDraft(false)
      }
    }
    if (userId) checkAdmin()
  }, [])

  // If user switches to IRA and payment frequency is monthly, force compounding
  useEffect(() => {
    if (selectedAccountType === 'ira' && investmentPaymentFrequency === 'monthly') {
      setInvestmentPaymentFrequency('compounding')
    }
  }, [selectedAccountType, investmentPaymentFrequency])

  const shouldShowSummaryStep1 = reviewModeStep1 && isStep1Completed && Boolean(investmentSummary)
  // Keep incomplete steps expanded regardless of active step
  const showStep1Edit = (!isStep1Completed) || (activeStep === 1 && !shouldShowSummaryStep1)
  const isStep1Collapsed = step1Confirmed && !showStep1Edit

  const shouldShowSummaryStep2 = reviewModeStep2 && isStep2Completed && Boolean(identitySummary)
  // Keep incomplete steps expanded regardless of active step
  const showStep2Edit = (!isStep2Completed) || (activeStep === 2 && !shouldShowSummaryStep2)
  const isStep2Collapsed = !step2Unlocked || (step2Confirmed && !showStep2Edit)
  const canFinalize = step1Confirmed && step2Confirmed

  return (
    <main className={styles.main}>
      <Header showBackButton={true} />
      <div className={styles.container}>
        {isLoadingDraft && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingContent}>
              <div className={styles.spinner}></div>
              <p className={styles.loadingText}>Loading your investment information...</p>
            </div>
          </div>
        )}
        <section className={`${stepStyles.card} ${isStep1Collapsed ? stepStyles.collapsed : ''}`}>
          <header className={stepStyles.cardHeader} onClick={() => { setActiveStep(1); setReviewModeStep1(false); setStep1Confirmed(false) }}>
            <div className={stepStyles.stepCircle}>1</div>
            <h2 className={stepStyles.cardTitle}>Investment</h2>
            {step1Confirmed && <div className={stepStyles.checkmark}>✓</div>}
          </header>
          {shouldShowSummaryStep1 && (
            <div className={stepStyles.reviewBlock}>
              {renderSummary(formattedInvestmentSummary)}
              <button
                type="button"
                className={stepStyles.secondaryButton}
                onClick={() => { setReviewModeStep1(false); setActiveStep(1); setStep1Confirmed(false) }}
              >
                Edit Selection
              </button>
            </div>
          )}
          {showStep1Edit && (
            <div className={stepStyles.cardBody}>
              <div className={stepStyles.sectionSpacer}>
                <TabbedInvestmentType
                  selectedValue={selectedAccountType}
                  lockedAccountType={lockedAccountType}
                  showContinueButton={false}
                  onChange={setSelectedAccountType}
                />
                {lockedAccountType && (
                  <p className={stepStyles.accountTypeDescription}>
                    Your account type is determined by your first investment and cannot be changed for future investments.
                  </p>
                )}
              </div>
              <InvestmentForm 
                accountType={selectedAccountType}
                initialAmount={investmentAmount}
                initialPaymentFrequency={investmentPaymentFrequency}
                initialLockup={investmentLockup}
                onValuesChange={(vals) => {
                  if (typeof vals.amount === 'number') setInvestmentAmount(vals.amount)
                  if (vals.paymentFrequency) setInvestmentPaymentFrequency(vals.paymentFrequency)
                  if (vals.lockupPeriod) setInvestmentLockup(vals.lockupPeriod)
                }}
                onReviewSummary={setInvestmentSummary}
                onCompleted={() => {
                  setIsStep1Completed(true)
                  setReviewModeStep1(true)
                  setStep1Confirmed(true)
                  setStep2Unlocked(true)
                  if (!isStep2Completed) {
                    setActiveStep(2)
                  }
                }}
                disableAuthGuard
              />
            </div>
          )}
        </section>

        <section className={`${stepStyles.card} ${isStep2Collapsed ? stepStyles.collapsed : ''}`}>
          <header className={stepStyles.cardHeader} onClick={() => { setStep2Unlocked(true); setActiveStep(2); setReviewModeStep2(false); setStep2Confirmed(false) }}>
            <div className={stepStyles.stepCircle}>2</div>
            <h2 className={stepStyles.cardTitle}>Investor Information</h2>
            {step2Confirmed && <div className={stepStyles.checkmark}>✓</div>}
          </header>
          {step2Unlocked && showStep2Edit && (
            <div className={stepStyles.cardBody}>
              <TabbedResidentialIdentity
                accountType={selectedAccountType}
                onReviewSummary={setIdentitySummary}
                onCompleted={() => {
                  setIsStep2Completed(true)
                  setReviewModeStep2(true)
                  setStep2Unlocked(true)
                  setStep2Confirmed(true)
                  // Do not collapse step 1 unless it was actually completed
                  setReviewModeStep1(v => (isStep1Completed ? true : v))
                  setActiveStep(2)
                }}
              />
            </div>
          )}
          {shouldShowSummaryStep2 && (
            <div className={stepStyles.reviewBlock}>
              {renderSummary(formattedIdentitySummary)}
              <button
                type="button"
                className={stepStyles.secondaryButton}
                onClick={() => { setReviewModeStep2(false); setActiveStep(2); setStep2Confirmed(false) }}
              >
                Edit Information
              </button>
            </div>
          )}
        </section>
        {canFinalize && (
          <div className={stepStyles.reviewActions}>
            <button
              type="button"
              className={stepStyles.primaryButton}
              onClick={() => router.push('/finalize-investment')}
            >
              Continue
            </button>
            {context !== 'onboarding' && (
              <p className={styles.cancelText}>
                <button
                  type="button"
                  className={styles.cancelLink}
                  onClick={() => router.push('/dashboard')}
                >
                  Cancel and return to Dashboard
                </button>
              </p>
            )}
          </div>
        )}
      </div>

      {context === 'onboarding' && (
        <div className={styles.footer}>
          <p className={styles.footerText}>
            Want to explore first?{' '}
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className={styles.linkButton}
            >
              Continue to Dashboard
            </button>
          </p>
        </div>
      )}
    </main>
  )
}

export default function InvestmentPage() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <Header />
        <div className={styles.container}>
          <p>Loading...</p>
        </div>
      </main>
    }>
      <InvestmentPageContent />
    </Suspense>
  )
}
