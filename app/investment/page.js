'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/apiClient'
import logger from '@/lib/logger'
import { getInvestmentTypeLockInfo } from '@/lib/investmentAccess'
import Header from '../components/Header'
import styles from './page.module.css'
import stepStyles from '../components/TabbedSignup.module.css'
import TabbedInvestmentType from '../components/TabbedInvestmentType'
import InvestmentForm from '../components/InvestmentForm'
import TabbedResidentialIdentity from '../components/TabbedResidentialIdentity'

const ACCOUNT_TYPE_LABELS = {
  individual: 'Individual',
  joint: 'Joint',
  entity: 'Entity',
  sdira: 'SDIRA'
}

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
  const [lockingStatus, setLockingStatus] = useState(null)
  const [userAccountType, setUserAccountType] = useState(null)
  const [investmentAmount, setInvestmentAmount] = useState(0)
  const [investmentPaymentFrequency, setInvestmentPaymentFrequency] = useState('compounding')
  const [investmentLockup, setInvestmentLockup] = useState('3-year')
  const [investmentSummary, setInvestmentSummary] = useState(null)
  const [identitySummary, setIdentitySummary] = useState(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const lockedTypeLabel = useMemo(() => {
    if (!lockedAccountType) return null
    // Map "ira" from backend to "sdira" for display
    const displayType = lockedAccountType === 'ira' ? 'sdira' : lockedAccountType
    return ACCOUNT_TYPE_LABELS[displayType] || displayType
  }, [lockedAccountType])
  const topLockMessage = useMemo(() => {
    if (!lockedTypeLabel) return null
    return `Since you already have an investment type of ${lockedTypeLabel}, you can only make ${lockedTypeLabel} investments.`
  }, [lockedTypeLabel])
  const formattedInvestmentSummary = useMemo(() => {
    if (!investmentSummary) return []
    const lockupLabels = {
      '1-year': '1-Year Lock-Up',
      '3-year': '3-Year Lock-Up'
    }
    const lines = []
    lines.push({ label: 'Account Type', value: ACCOUNT_TYPE_LABELS[investmentSummary.accountType] || '—' })
    lines.push({ label: 'Investment Amount', value: typeof investmentSummary.amount === 'number' ? `$${Number(investmentSummary.amount).toLocaleString()}` : '—' })
    lines.push({ label: 'Total Bonds', value: typeof investmentSummary.bonds === 'number' ? investmentSummary.bonds.toLocaleString() : '—' })
    lines.push({ label: 'Payment Frequency', value: investmentSummary.paymentFrequency === 'monthly' ? 'Interest Paid Monthly' : 'Compounded Monthly' })
    lines.push({ label: 'Lockup Period', value: lockupLabels[investmentSummary.lockupPeriod] || '—' })
    return lines
  }, [investmentSummary])

  const formattedIdentitySummary = useMemo(() => {
    if (!identitySummary) return []
    const lines = []
    const accountType = identitySummary.accountType

    // INDIVIDUAL ACCOUNT
    if (accountType === 'individual') {
      const holderName = [identitySummary.firstName, identitySummary.lastName].filter(Boolean).join(' ')
      if (holderName) lines.push({ label: 'Holder Name', value: holderName })
      if (identitySummary.phone) lines.push({ label: 'Phone', value: identitySummary.phone })
      const addressParts = [identitySummary.street1, identitySummary.street2, identitySummary.city, identitySummary.state, identitySummary.zip].filter(Boolean)
      if (addressParts.length) lines.push({ label: 'Address', value: addressParts.join(', ') })
      if (identitySummary.dob) lines.push({ label: 'Date of Birth', value: identitySummary.dob })
      if (identitySummary.ssn) lines.push({ label: 'SSN', value: identitySummary.ssn })
    }

    // JOINT ACCOUNT
    else if (accountType === 'joint') {
      // Primary Holder Section
      lines.push({ label: 'Primary Holder', value: '', isSection: true })
      const primaryName = [identitySummary.firstName, identitySummary.lastName].filter(Boolean).join(' ')
      if (primaryName) lines.push({ label: 'Name', value: primaryName })
      if (identitySummary.phone) lines.push({ label: 'Phone', value: identitySummary.phone })
      const primaryAddress = [identitySummary.street1, identitySummary.street2, identitySummary.city, identitySummary.state, identitySummary.zip].filter(Boolean)
      if (primaryAddress.length) lines.push({ label: 'Address', value: primaryAddress.join(', ') })
      if (identitySummary.dob) lines.push({ label: 'Date of Birth', value: identitySummary.dob })
      if (identitySummary.ssn) lines.push({ label: 'SSN', value: identitySummary.ssn })
      if (identitySummary.jointHoldingType) lines.push({ label: 'Joint Holding Type', value: identitySummary.jointHoldingType })

      // Joint Holder Section
      const joint = identitySummary.jointHolder
      if (joint) {
        lines.push({ label: 'Joint Holder', value: '', isSection: true })
        const jointName = [joint.firstName, joint.lastName].filter(Boolean).join(' ')
        if (jointName) lines.push({ label: 'Name', value: jointName })
        if (joint.email) lines.push({ label: 'Email', value: joint.email })
        if (joint.phone) lines.push({ label: 'Phone', value: joint.phone })
        const jointAddress = [joint.address?.street1, joint.address?.street2, joint.address?.city, joint.address?.state, joint.address?.zip].filter(Boolean)
        if (jointAddress.length) lines.push({ label: 'Address', value: jointAddress.join(', ') })
        if (joint.dob) lines.push({ label: 'Date of Birth', value: joint.dob })
        if (joint.ssn) lines.push({ label: 'SSN', value: joint.ssn })
      }
    }

    // ENTITY ACCOUNT
    else if (accountType === 'entity') {
      // Entity Information Section
      lines.push({ label: 'Entity Information', value: '', isSection: true })
      if (identitySummary.entityName) lines.push({ label: 'Entity Name', value: identitySummary.entityName })
      
      // Entity formation date from entity object or legacy field
      const entityFormationDate = identitySummary.entity?.formationDate || identitySummary.entity?.registrationDate
      if (entityFormationDate) lines.push({ label: 'Formation Date', value: entityFormationDate })
      
      // Entity EIN from entity.taxId or fallback
      const entityEin = identitySummary.entity?.taxId || identitySummary.ssn
      if (entityEin) lines.push({ label: 'EIN/TIN', value: entityEin })
      
      // Entity Address
      const entityAddress = [
        identitySummary.entity?.address?.street1,
        identitySummary.entity?.address?.street2,
        identitySummary.entity?.address?.city,
        identitySummary.entity?.address?.state,
        identitySummary.entity?.address?.zip
      ].filter(Boolean)
      if (entityAddress.length) lines.push({ label: 'Entity Address', value: entityAddress.join(', ') })

      // Authorized Representative Section
      const rep = identitySummary.authorizedRep
      if (rep) {
        lines.push({ label: 'Authorized Representative', value: '', isSection: true })
        const repName = [rep.firstName, rep.lastName].filter(Boolean).join(' ')
        if (repName) lines.push({ label: 'Name', value: repName })
        if (rep.title) lines.push({ label: 'Title', value: rep.title })
        if (rep.phone) lines.push({ label: 'Phone', value: rep.phone })
        const repAddress = [rep.address?.street1, rep.address?.street2, rep.address?.city, rep.address?.state, rep.address?.zip].filter(Boolean)
        if (repAddress.length) lines.push({ label: 'Address', value: repAddress.join(', ') })
        if (rep.dob) lines.push({ label: 'Date of Birth', value: rep.dob })
        if (rep.ssn) lines.push({ label: 'SSN', value: rep.ssn })
      }
    }

    // SDIRA ACCOUNT
    else if (accountType === 'sdira' || accountType === 'ira') {
      // SDIRA/Custodian Information Section
      lines.push({ label: 'SDIRA Account Information', value: '', isSection: true })
      
      // Custodian name from entity or legacy ira fields
      const custodianName = identitySummary.entityName || 
        identitySummary.entity?.name || 
        identitySummary.ira?.accountName ||
        [identitySummary.ira?.firstName, identitySummary.ira?.lastName].filter(Boolean).join(' ')
      if (custodianName) lines.push({ label: 'Account Name', value: custodianName })
      
      // SDIRA Address from entity.address
      const custodianAddress = [
        identitySummary.entity?.address?.street1,
        identitySummary.entity?.address?.street2,
        identitySummary.entity?.address?.city,
        identitySummary.entity?.address?.state,
        identitySummary.entity?.address?.zip
      ].filter(Boolean)
      if (custodianAddress.length) lines.push({ label: 'SDIRA Address', value: custodianAddress.join(', ') })
      
      // Formation date from entity
      const formationDate = identitySummary.entity?.formationDate || identitySummary.entity?.registrationDate
      if (formationDate) lines.push({ label: 'Formation Date', value: formationDate })
      
      // TIN from entity.taxId or fallback
      const tin = identitySummary.entity?.taxId || identitySummary.ira?.taxId || identitySummary.ssn
      if (tin) lines.push({ label: 'TIN', value: tin })

      // Beneficiary Information Section
      lines.push({ label: 'Beneficiary Information', value: '', isSection: true })
      const beneficiaryName = [identitySummary.firstName, identitySummary.lastName].filter(Boolean).join(' ')
      if (beneficiaryName) lines.push({ label: 'Holder Name', value: beneficiaryName })
      if (identitySummary.phone) lines.push({ label: 'Phone', value: identitySummary.phone })
      
      // Beneficiary Address (primary address on user)
      const beneficiaryAddress = [identitySummary.street1, identitySummary.street2, identitySummary.city, identitySummary.state, identitySummary.zip].filter(Boolean)
      if (beneficiaryAddress.length) lines.push({ label: 'Address', value: beneficiaryAddress.join(', ') })
      if (identitySummary.dob) lines.push({ label: 'Date of Birth', value: identitySummary.dob })
      
      // Beneficiary SSN (different from TIN above)
      const beneficiarySSN = identitySummary.ssn
      if (beneficiarySSN && beneficiarySSN !== tin) {
        lines.push({ label: 'SSN', value: beneficiarySSN })
      }
    }

    return lines
  }, [identitySummary])

  const renderSummary = (items) => {
    if (!items.length) return null
    return (
      <div className={stepStyles.reviewSummary}>
        {items.map(({ label, value, isSection }, idx) => {
          if (isSection) {
            return (
              <div key={`${label}-${idx}`} className={stepStyles.sectionHeader}>
                {label}
              </div>
            )
          }
          return (
            <div key={`${label}-${idx}`} className={stepStyles.summaryRow}>
              <span className={stepStyles.summaryLabel}>{label}</span>
              <span className={stepStyles.summaryValue}>{value || '—'}</span>
            </div>
          )
        })}
      </div>
    )
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const userId = localStorage.getItem('currentUserId')
    if (!userId) {
      router.push('/')
    }
    const checkAdmin = async () => {
      try {
        const data = await apiClient.getCurrentUser()
        // If the account no longer exists, clear session and redirect
        if (!data.success || !data.user) {
          try {
            localStorage.removeItem('currentUserId')
            localStorage.removeItem('signupEmail')
            localStorage.removeItem('currentInvestmentId')
          } catch {}
          router.push('/')
          return
        }
        if (data.success && data.user?.isAdmin) {
          router.push('/dashboard')
          return
        }
        
        // Check if user is verified before allowing investment
        if (data.success && data.user && !data.user.isVerified) {
          router.push('/confirmation')
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
                if (existingInvestment.amount !== undefined && existingInvestment.amount !== null) {
                  const amountNumber = typeof existingInvestment.amount === 'number' ? existingInvestment.amount : parseFloat(existingInvestment.amount) || 0
                  setInvestmentAmount(amountNumber)
                }
                if (existingInvestment.paymentFrequency) setInvestmentPaymentFrequency(existingInvestment.paymentFrequency)
                if (existingInvestment.lockupPeriod) setInvestmentLockup(existingInvestment.lockupPeriod)
                // Extract accountType from draft investment
                if (existingInvestment.accountType) {
                  draftAccountType = existingInvestment.accountType
                }
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
        
        // Load user's investments (ensure we fetch them if not already present)
        let userInvestments = Array.isArray(data.user?.investments) ? data.user.investments : []
        if ((!userInvestments || userInvestments.length === 0) && data.success) {
          try {
            const investmentsResponse = await apiClient.getInvestments()
            if (Array.isArray(investmentsResponse?.investments)) {
              userInvestments = investmentsResponse.investments
            }
          } catch (err) {
            logger.warn('Failed to fetch investments for lock enforcement:', err)
          }
        }

        // Load user's account type and set as locked ONLY if user has pending/active investments
        if (data.success && data.user) {
          const lockInfo = getInvestmentTypeLockInfo({ investments: userInvestments, accountType: data.user.accountType })
          if (lockInfo.lockedAccountType) {
            // User has pending/active investments - lock to that type
            const mappedLockedType = lockInfo.lockedAccountType === 'ira' ? 'sdira' : lockInfo.lockedAccountType
            setUserAccountType(data.user.accountType || lockInfo.lockedAccountType)
            setLockedAccountType(mappedLockedType)
            setLockingStatus(lockInfo.lockingStatus)
            setSelectedAccountType(mappedLockedType)
          } else {
            // No lock - determine accountType from priority order
            setLockingStatus(null)
            setLockedAccountType(null)
            
            let accountType = null
            
            // Priority 1: Draft investment accountType (if resuming draft)
            if (draftAccountType) {
              accountType = draftAccountType === 'ira' ? 'sdira' : draftAccountType
            }
            // Priority 2: User profile accountType
            else if (data.user.accountType) {
              accountType = data.user.accountType === 'ira' ? 'sdira' : data.user.accountType
            }
            // Priority 3: Default to 'individual'
            else {
              accountType = 'individual'
            }
            
            setSelectedAccountType(accountType)
            setUserAccountType(data.user.accountType || null)
          }
        }
        
        // Mark loading as complete
        setIsLoadingDraft(false)
      } catch {
        // Mark loading as complete even on error
        setIsLoadingDraft(false)
      }
    }
    if (userId) checkAdmin()
  }, [router])

  // If user switches to SDIRA and payment frequency is monthly, force compounding
  useEffect(() => {
    if (selectedAccountType === 'sdira' && investmentPaymentFrequency === 'monthly') {
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
        {topLockMessage && (
          <div className={styles.lockNotice}>
            {topLockMessage}
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
