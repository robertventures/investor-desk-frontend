/**
 * Finalize Investment Page
 * 
 * This page handles the final steps of investment submission including:
 * - Accreditation verification
 * - Document review and agreement
 * - Payment method selection (ACH via Plaid or Wire Transfer)
 * - Investment submission and funding initiation
 * 
 * PLAID INTEGRATION:
 * The page integrates with Plaid for bank account connection and ACH funding.
 * See BankConnectionModal component for Plaid Link implementation details.
 * 
 * Testing in sandbox mode: Set NEXT_PUBLIC_PLAID_ENV=sandbox
 */
"use client"
import Header from '../components/Header'
import BankConnectionModal from '../components/BankConnectionModal'
import { apiClient } from '../../lib/apiClient'
import {
  DRAFT_PAYMENT_METHOD_KEY,
  clearStoredPaymentMethod,
  determineDraftPaymentMethod,
  investmentPaymentMethodKey,
  persistDraftPaymentMethod,
  readStoredPaymentMethod
} from '../../lib/paymentMethodPreferences'
import styles from './page.module.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FinalizeInvestmentPage() {
  const router = useRouter()
  
  return (
    <main className={styles.main}>
      <Header />
      <div className={styles.container}>
        <div className={styles.card}>
          <button 
            className={styles.backButton}
            onClick={() => router.push('/investment')}
            type="button"
          >
            ← Back to Edit Investment
          </button>
          <h1 className={styles.title}>Finalize Your Investment</h1>
          <p className={styles.subtitle}>Confirm eligibility, complete documents, and choose a payment method to proceed.</p>
          <ClientContent />
        </div>
      </div>
    </main>
  )
}

function ClientContent() {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState(null)
  const [investment, setInvestment] = useState(null)
  const [accredited, setAccredited] = useState('')
  const [accreditedType, setAccreditedType] = useState('')
  const [tenPercentConfirmed, setTenPercentConfirmed] = useState(false)
  const [fundingMethod, setFundingMethod] = useState('')
  const [fundingMethodInitialized, setFundingMethodInitialized] = useState(false)
  const [payoutMethod, setPayoutMethod] = useState('bank-account')
  const [isSaving, setIsSaving] = useState(false)
  const [validationErrors, setValidationErrors] = useState([])
  const [submitError, setSubmitError] = useState('')
  const [availableBanks, setAvailableBanks] = useState([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [connectedBank, setConnectedBank] = useState(null)
  const [isSavingBank, setIsSavingBank] = useState(false)
  const [selectedFundingBankId, setSelectedFundingBankId] = useState('')
  const [selectedPayoutBankId, setSelectedPayoutBankId] = useState('')
  const [showAllBanksModal, setShowAllBanksModal] = useState(false)
  const [bankSelectionMode, setBankSelectionMode] = useState('') // 'funding' or 'payout'
  const [fundingInfo, setFundingInfo] = useState(null)
  const [fundingError, setFundingError] = useState('')
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [agreementState, setAgreementState] = useState({
    status: 'idle',
    data: null,
    error: '',
    investmentId: null
  })
  const agreementStateRef = useRef(agreementState)
  const agreementBlobUrlRef = useRef(null)
  const agreementRequestIdRef = useRef(0)

  useEffect(() => {
    agreementStateRef.current = agreementState
  }, [agreementState])

  const releaseAgreementBlobUrl = useCallback(() => {
    if (agreementBlobUrlRef.current) {
      URL.revokeObjectURL(agreementBlobUrlRef.current)
      agreementBlobUrlRef.current = null
    }
  }, [])

  const openAgreementAsset = useCallback(
    (data) => {
      if (typeof window === 'undefined' || !data) return false

      const signedUrl =
        data.signed_url ||
        data.signedUrl ||
        data.url ||
        data.download_url ||
        data.downloadUrl ||
        null

      if (signedUrl) {
        const win = window.open(signedUrl, '_blank')
        if (!win) {
          console.warn('Agreement pop-up was blocked.')
          return false
        }
        try {
          win.opener = null
        } catch {}
        return true
      }

      const pdfBase64 = data.pdf_base64 || data.pdfBase64 || data.pdf || null
      if (typeof pdfBase64 === 'string' && pdfBase64.trim()) {
        try {
          let base64 = pdfBase64.trim()
          if (base64.includes(',')) {
            base64 = base64.slice(base64.indexOf(',') + 1)
          }
          base64 = base64.replace(/\s+/g, '')
          if (!base64) {
            return false
          }

          const binary = atob(base64)
          const len = binary.length
          const bytes = new Uint8Array(len)
          for (let i = 0; i < len; i += 1) {
            bytes[i] = binary.charCodeAt(i)
          }

          const blob = new Blob([bytes], {
            type: data.content_type || data.contentType || 'application/pdf'
          })
          releaseAgreementBlobUrl()
          const blobUrl = URL.createObjectURL(blob)
          agreementBlobUrlRef.current = blobUrl
          const win = window.open(blobUrl, '_blank')
          if (!win) {
            console.warn('Agreement pop-up was blocked.')
            releaseAgreementBlobUrl()
            return false
          }
          try {
            win.opener = null
          } catch {}
          return true
        } catch (err) {
          console.error('Failed to decode agreement PDF', err)
          releaseAgreementBlobUrl()
          return false
        }
      }

      return false
    },
    [releaseAgreementBlobUrl]
  )

  const fetchAgreement = useCallback(
    async ({ force = false, openOnSuccess = false } = {}) => {
      if (!investment?.id) {
        const message = 'Missing investment context for agreement.'
        setAgreementState((prev) => ({
          ...prev,
          status: 'error',
          error: message,
          investmentId: null,
          data: null
        }))
        return { success: false, error: message, data: null }
      }

      const current = agreementStateRef.current
      if (!force && current.investmentId === investment.id) {
        if (current.status === 'ready') {
          if (openOnSuccess) {
            const opened = openAgreementAsset(current.data)
            if (!opened) {
              const message = 'Agreement file could not be opened. Please allow pop-ups and try again.'
              setAgreementState({
                status: 'error',
                data: current.data,
                error: message,
                investmentId: investment.id
              })
              return { success: false, error: message, data: current.data }
            }
          }
          return { success: true, data: current.data }
        }
        if (current.status === 'loading') {
          return { success: false, pending: true, data: current.data }
        }
      }

      const requestId = agreementRequestIdRef.current + 1
      agreementRequestIdRef.current = requestId
      releaseAgreementBlobUrl()
      setAgreementState({
        status: 'loading',
        data: current.investmentId === investment.id ? current.data : null,
        error: '',
        investmentId: investment.id
      })

      try {
        console.log('[FinalizeInvestment] Fetching agreement for investment', {
          investmentId: investment.id,
          lockupPeriod: investment.lockupPeriod,
          paymentFrequency: investment.paymentFrequency,
          amount: investment.amount,
          status: investment.status
        })
        const response = await apiClient.generateBondAgreement(investment.id, user?.id)
        if (agreementRequestIdRef.current !== requestId) {
          return { success: false, cancelled: true }
        }

        if (response?.success && response.data) {
          console.log('[FinalizeInvestment] Agreement response received', {
            hasSignedUrl: Boolean(response.data?.signed_url),
            hasPdfBase64: Boolean(response.data?.pdf_base64),
            fileName: response.data?.file_name,
            expiresAt: response.data?.expires_at
          })
          const nextState = {
            status: 'ready',
            data: response.data,
            error: '',
            investmentId: investment.id
          }
          setAgreementState(nextState)

          if (openOnSuccess) {
            const opened = openAgreementAsset(response.data)
            if (!opened) {
              const message = 'Agreement file could not be opened. Please allow pop-ups and try again.'
              setAgreementState({
                status: 'error',
                data: response.data,
                error: message,
                investmentId: investment.id
              })
              return { success: false, error: message, data: response.data }
            }
          }

          return { success: true, data: response.data }
        }

        const message = response?.error || 'Failed to load agreement'
        setAgreementState({
          status: 'error',
          data: response?.data || null,
          error: message,
          investmentId: investment.id
        })
        return { success: false, error: message, data: response?.data || null }
      } catch (error) {
        if (agreementRequestIdRef.current !== requestId) {
          return { success: false, cancelled: true }
        }
        const message = error?.message || 'Failed to load agreement'
        setAgreementState({
          status: 'error',
          data: null,
          error: message,
          investmentId: investment.id
        })
        return { success: false, error: message, data: null }
      }
    },
    [investment?.id, openAgreementAsset, releaseAgreementBlobUrl, user?.id]
  )

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    
    const load = async () => {
      const userId = localStorage.getItem('currentUserId')
      const investmentId = localStorage.getItem('currentInvestmentId')
      console.log('[FinalizeInvestment] Loading page - userId:', userId, 'investmentId:', investmentId)
      
      if (!userId) {
        console.log('[FinalizeInvestment] No userId found, redirecting to home')
        window.location.href = '/'
        return
      }
      
      console.log('[FinalizeInvestment] Fetching user data...')
      const data = await apiClient.getUser(userId)
      console.log('[FinalizeInvestment] User data:', data)
      
      if (data.success && data.user) {
        setUser(data.user)
        
        // Fetch investments separately (API doesn't return them in profile)
        console.log('[FinalizeInvestment] Fetching investments...')
        const investmentsData = await apiClient.getInvestments(userId)
        console.log('[FinalizeInvestment] Investments data:', investmentsData)
        
        const investments = investmentsData?.investments || []
        console.log('[FinalizeInvestment] User investments:', investments)
        console.log('[FinalizeInvestment] Investment IDs and statuses:', investments.map(i => ({ id: i.id, status: i.status })))
        console.log('[FinalizeInvestment] Looking for investmentId:', investmentId)
        
        let inv = investments.find(i => i.id.toString() === investmentId?.toString()) || null
        console.log('[FinalizeInvestment] Found investment:', inv)
        
        // If no specific investment ID, try to find the most recent draft
        if (!inv && investments.length > 0) {
          const draftInvestments = investments.filter(i => i.status === 'draft')
          console.log('[FinalizeInvestment] Draft investments found:', draftInvestments.length)
          if (draftInvestments.length > 0) {
            const mostRecentDraft = draftInvestments[0] // Assuming API returns most recent first
            console.log('[FinalizeInvestment] Using most recent draft:', mostRecentDraft.id)
            // Update localStorage with this ID for future use
            localStorage.setItem('currentInvestmentId', mostRecentDraft.id)
            // Use this investment directly instead of reloading
            inv = mostRecentDraft
            console.log('[FinalizeInvestment] Using draft investment:', inv)
          }
        }
        
        // SECURITY: Only allow finalization of draft investments
        // If no draft investment exists, redirect to dashboard
        if (!inv) {
          console.error('[FinalizeInvestment] No investment found with ID:', investmentId)
          try {
            localStorage.removeItem('currentInvestmentId')
          } catch {}
          window.location.href = '/dashboard'
          return
        }
        
        if (inv.status !== 'draft') {
          console.error('[FinalizeInvestment] Investment is not in draft status:', inv.status)
          try {
            localStorage.removeItem('currentInvestmentId')
          } catch {}
          window.location.href = '/dashboard'
          return
        }
        
        setInvestment(inv)
        try {
          const pmRes = await apiClient.listPaymentMethods('bank_ach')
          const pms = Array.isArray(pmRes?.payment_methods) ? pmRes.payment_methods : []
          setAvailableBanks(pms)
          if (pms.length > 0) {
            const first = pms[0]
            if (first?.id) {
              setSelectedBankId(first.id)
              setSelectedFundingBankId(first.id)
              setSelectedPayoutBankId(first.id)
            }
          }
        } catch (e) {
          // Fallback to any legacy user bank accounts if present
          const banks = Array.isArray(data.user.bankAccounts) ? data.user.bankAccounts : []
          setAvailableBanks(banks)
          if (banks.length > 0) {
            const first = banks[0]
            if (first?.id) {
              setSelectedBankId(first.id)
              setSelectedFundingBankId(first.id)
              setSelectedPayoutBankId(first.id)
            }
          }
        }
      } else {
        try {
          localStorage.removeItem('currentUserId')
          localStorage.removeItem('signupEmail')
          localStorage.removeItem('currentInvestmentId')
        } catch {}
        window.location.href = '/'
        return
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!investment?.id) {
      agreementRequestIdRef.current += 1
      releaseAgreementBlobUrl()
      setAgreementState({
        status: 'idle',
        data: null,
        error: '',
        investmentId: null
      })
      return
    }

    fetchAgreement()
  }, [fetchAgreement, investment?.id, releaseAgreementBlobUrl, user?.id])

  useEffect(() => {
    return () => {
      releaseAgreementBlobUrl()
    }
  }, [releaseAgreementBlobUrl])

  const handleViewAgreement = useCallback(async () => {
    if (!user || !investment) {
      const message = 'Unable to prepare agreement. Please refresh the page and try again.'
      setAgreementState((prev) => ({
        ...prev,
        status: 'error',
        error: message,
        investmentId: investment?.id ?? prev.investmentId
      }))
      return
    }

    setSubmitError('')
    const current = agreementStateRef.current
    if (current.investmentId === investment.id && current.status === 'ready') {
      const opened = openAgreementAsset(current.data)
      if (!opened) {
        setAgreementState({
          status: 'error',
          data: current.data,
          error: 'Agreement file could not be opened. Please allow pop-ups and try again.',
          investmentId: investment.id
        })
      } else {
        // Clear any previous errors on successful open
        setAgreementState({
          status: 'ready',
          data: current.data,
          error: '', // Clear the error
          investmentId: investment.id
        })
      }
      return
    }

    const result = await fetchAgreement({ force: true, openOnSuccess: true })
    if (!result.success && !result.cancelled && result.error) {
      setAgreementState((prev) => ({
        status: 'error',
        data: result.data ?? prev.data,
        error: result.error,
        investmentId: investment.id
      }))
    } else if (result.success) {
      // Clear error on success
      setAgreementState((prev) => ({
        ...prev,
        error: ''
      }))
    }
  }, [fetchAgreement, investment, openAgreementAsset, setSubmitError, user])

  const {
    status: agreementStatus,
    data: agreementData,
    error: agreementError
  } = agreementState

  useEffect(() => {
    if (investment?.compliance) {
      setAccredited(investment.compliance.accredited || '')
      setAccreditedType(investment.compliance.accreditedType || '')
      setTenPercentConfirmed(Boolean(investment.compliance.tenPercentLimitConfirmed))
    }
  }, [investment?.compliance])

  // Poll funding status if a funding is in progress
  useEffect(() => {
    if (!fundingInfo?.id || !investment?.id) return
    let isMounted = true
    const interval = setInterval(async () => {
      try {
        const res = await apiClient.getFundingStatus(investment.id, fundingInfo.id)
        if (!isMounted) return
        if (res?.funding) {
          setFundingInfo(res.funding)
          const s = res.funding.status
          if (s === 'settled' || s === 'failed' || s === 'returned') {
            clearInterval(interval)
          }
        }
      } catch (e) {
        // keep polling silently
      }
    }, 3000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [fundingInfo?.id, investment?.id])

  // Load banking details from user account
  useEffect(() => {
    if (user?.banking) {
      setFundingMethod((current) => current || user.banking.fundingMethod || '')
      setPayoutMethod(user.banking.payoutMethod || 'bank-account')
      if (user.banking.defaultBankAccountId) {
        setSelectedBankId(user.banking.defaultBankAccountId)
        setSelectedFundingBankId(user.banking.defaultBankAccountId)
        setSelectedPayoutBankId(user.banking.defaultBankAccountId)
      }
    }
  }, [user?.banking])

  useEffect(() => {
    if (!investment || fundingMethodInitialized) return

    const accountTypeForDefault = investment.accountType || user?.accountType || null

    let resolvedMethod = investment.paymentMethod
    if (!resolvedMethod && investment?.id) {
      resolvedMethod = readStoredPaymentMethod(investmentPaymentMethodKey(investment.id))
    }
    if (!resolvedMethod) {
      resolvedMethod = readStoredPaymentMethod(DRAFT_PAYMENT_METHOD_KEY)
    }
    if (!resolvedMethod) {
      resolvedMethod = determineDraftPaymentMethod(accountTypeForDefault, investment.amount)
    }

    if (resolvedMethod === 'wire') {
      setFundingMethod('wire-transfer')
    } else if (resolvedMethod === 'ach') {
      setFundingMethod('bank-transfer')
    }

    if (investment?.id && resolvedMethod) {
      persistDraftPaymentMethod(investmentPaymentMethodKey(investment.id), resolvedMethod)
    }

    clearStoredPaymentMethod(DRAFT_PAYMENT_METHOD_KEY)
    setFundingMethodInitialized(true)
  }, [investment, user?.accountType, fundingMethodInitialized])

  // Enforce payout method when monthly payments are selected
  useEffect(() => {
    if (investment?.paymentFrequency === 'monthly' && payoutMethod !== 'bank-account') {
      setPayoutMethod('bank-account')
    }
  }, [investment?.paymentFrequency, payoutMethod])
  useEffect(() => {
    if (!investment?.id) return
    const method =
      fundingMethod === 'wire-transfer'
        ? 'wire'
        : fundingMethod === 'bank-transfer'
          ? 'ach'
          : null
    if (!method) return
    persistDraftPaymentMethod(investmentPaymentMethodKey(investment.id), method)
    clearStoredPaymentMethod(DRAFT_PAYMENT_METHOD_KEY)
  }, [fundingMethod, investment?.id])

  // Force wire transfer for SDIRA accounts (must be declared before any conditional return)
  useEffect(() => {
    if ((investment?.accountType || user?.accountType) === 'sdira' && fundingMethod !== 'wire-transfer') {
      setFundingMethod('wire-transfer')
    }
  }, [investment?.accountType, user?.accountType, fundingMethod])

  // Force wire transfer for investments above $100,000
  useEffect(() => {
    if (investment?.amount > 100000 && fundingMethod !== 'wire-transfer') {
      setFundingMethod('wire-transfer')
    }
  }, [investment?.amount, fundingMethod])

  // Clear validation errors when relevant inputs change
  useEffect(() => {
    if (validationErrors.length) {
      setValidationErrors([])
    }
  }, [accredited, accreditedType, tenPercentConfirmed, fundingMethod, payoutMethod, selectedBankId, agreeToTerms])

  // Keep investment summary up-to-date after modifications (e.g. lockup period)
  useEffect(() => {
    if (!investment?.id) return

    let cancelled = false

    const refreshInvestment = async () => {
      try {
        const detail = await apiClient.getInvestment(investment.id)
        if (!cancelled && detail?.success && detail.investment) {
          setInvestment(detail.investment)
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[FinalizeInvestment] Failed to refresh investment details', err)
        }
      }
    }

    refreshInvestment()

    return () => {
      cancelled = true
    }
  }, [investment?.id])

  // Prevent hydration mismatch
  if (!mounted || !user) return <div className={styles.loading}>Loading...</div>

  const isSdira = (investment?.accountType || user?.accountType) === 'sdira'
  const requiresWireTransfer = investment?.amount > 100000
  const agreementExpiresDisplay = (() => {
    if (!agreementData?.expires_at) return ''
    const expiresDate = new Date(agreementData.expires_at)
    return Number.isNaN(expiresDate.getTime()) ? '' : expiresDate.toLocaleString()
  })()

  const generateIdempotencyKey = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  return (
    <div className={styles.sections}>
      <Section title="Investor Confirmation">
        <div className={styles.radioGroup}>
          <div 
            className={styles.radioOption}
            onClick={() => {
              setAccredited('accredited')
              setAccreditedType('')
              setTenPercentConfirmed(false)
            }}
          >
            <label>
              <input
                type="radio"
                name="accredited"
                value="accredited"
                checked={accredited === 'accredited'}
                onChange={() => {
                  setAccredited('accredited')
                  setAccreditedType('')
                  setTenPercentConfirmed(false)
                }}
              />
              <span>Investor meets the definition of "accredited investor"</span>
            </label>
            
            {accredited === 'accredited' && (
              <div className={styles.subOptions} onClick={(e) => e.stopPropagation()}>
                <div 
                  className={styles.subOption}
                  onClick={() => setAccreditedType('assets')}
                >
                  <input
                    type="radio"
                    name="accreditedType"
                    value="assets"
                    checked={accreditedType === 'assets'}
                    onChange={() => setAccreditedType('assets')}
                  />
                  <span>Net worth over $1 million (excluding primary residence)</span>
                </div>
                <div 
                  className={styles.subOption}
                  onClick={() => setAccreditedType('income')}
                >
                  <input
                    type="radio"
                    name="accreditedType"
                    value="income"
                    checked={accreditedType === 'income'}
                    onChange={() => setAccreditedType('income')}
                  />
                  <span>Annual income over $200,000 (individual) or $300,000 (joint)</span>
                </div>
              </div>
            )}
          </div>
          
          <div 
            className={styles.radioOption}
            onClick={() => {
              setAccredited('not_accredited')
              setAccreditedType('')
            }}
          >
            <label>
              <input
                type="radio"
                name="accredited"
                value="not_accredited"
                checked={accredited === 'not_accredited'}
                onChange={() => {
                  setAccredited('not_accredited')
                  setAccreditedType('')
                }}
              />
              <span>Investor does not meet the definition of "accredited investor" or is not sure</span>
            </label>
            {accredited === 'not_accredited' && (
              <div className={styles.subOptions} onClick={(e) => e.stopPropagation()}>
                <div 
                  className={styles.subOption}
                  onClick={() => setTenPercentConfirmed(!tenPercentConfirmed)}
                >
                  <input
                    type="checkbox"
                    checked={tenPercentConfirmed}
                    onChange={(e) => setTenPercentConfirmed(e.target.checked)}
                  />
                  <span>the investor confirms their investment is not more than 10% of their net worth or annual income.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Bond Documents" raw>
        <div className={styles.rows}>
          <div>
            <button
              type="button"
              className={styles.downloadButton}
              disabled={isSaving || agreementStatus === 'loading'}
              onClick={handleViewAgreement}
            >
              {agreementStatus === 'loading' ? '⏳ Preparing...' : '📄 View Agreement'}
            </button>
            {agreementStatus === 'loading' && (
              <p className={styles.agreementMeta}>Preparing agreement…</p>
            )}
            {agreementStatus === 'ready' && (
              <p className={styles.agreementMeta}>
                Agreement ready
                {agreementData?.file_name ? ` • ${agreementData.file_name}` : ''}
                {agreementExpiresDisplay ? ` • Link expires ${agreementExpiresDisplay}` : ''}
              </p>
            )}
            {agreementStatus === 'error' && agreementError && (
              <p className={styles.agreementError}>{agreementError}</p>
            )}
          </div>

          <div className={styles.confirm}>
            <input type="checkbox" id="agree" checked={agreeToTerms} onChange={(e) => setAgreeToTerms(e.target.checked)} />
            <label htmlFor="agree">I confirm I have reviewed and understood the Investor Bond Agreement, including all terms, risks, and obligations; agree to be bound by it; and consent to electronic signature of this agreement.</label>
          </div>
        </div>
      </Section>

      <Section title="Payment" raw>
        {/* 
          PLAID INTEGRATION - Funding Method Selection
          
          This section allows investors to connect their bank account via Plaid for ACH transfers.
          
          TESTING IN SANDBOX:
          1. Ensure NEXT_PUBLIC_PLAID_ENV=sandbox in .env.local
          2. Select "Bank Account" funding method
          3. Click "Connect Bank Account" to open Plaid modal
          4. Use test credentials: username="user_good", password="pass_good"
          5. Select any test institution (e.g., Chase: ins_109508)
          6. Complete the flow to create a payment method
          7. Submit the investment to trigger ACH funding
          
          The flow will:
          - Create a Plaid link token (POST /api/plaid/link-token)
          - Exchange public token for processor token (POST /api/plaid/link-success)
          - Store the payment method for reuse
          - Initiate ACH funding on investment submission (POST /api/investments/:id/fund)
        */}
        {/* Funding method */}
        <div className={styles.subSection}>
          <div className={styles.groupTitle}>Funding</div>
          <div className={styles.radioGroup}>
            {!isSdira && !requiresWireTransfer && (
              <div 
                className={styles.radioOption}
                onClick={(e) => {
                  // Only trigger if not clicking on nested interactive elements
                  if (!e.target.closest('button') && !e.target.closest('[class*="Bank"]')) {
                    setFundingMethod('bank-transfer')
                  }
                }}
              >
                <label>
                  <input
                    type="radio"
                    name="funding"
                    value="bank-transfer"
                    checked={fundingMethod === 'bank-transfer'}
                    onChange={() => setFundingMethod('bank-transfer')}
                  />
                  <span>Bank Transfer</span>
                </label>
                {fundingMethod === 'bank-transfer' && (
                  <div className={styles.bankConnectionSection}>
                    {/* 
                      Display saved payment methods from Plaid
                      These are fetched from /api/payment-methods?type=bank_ach
                    */}
                    {availableBanks.length > 0 ? (
                      <>
                        <div className={styles.savedBanksGrid}>
                          {availableBanks.slice(0, 2).map((bank) => (
                            <div
                              key={bank.id}
                              className={`${styles.savedBankCard} ${selectedFundingBankId === bank.id ? styles.selectedBankCard : ''}`}
                              onClick={() => setSelectedFundingBankId(bank.id)}
                            >
                              <div className={styles.savedBankLeft}>
                                <span className={styles.savedBankLogo} style={{ backgroundColor: bank.bankColor ? bank.bankColor + '20' : '#e5e7eb' }}>
                                  {bank.bankLogo || '🏦'}
                                </span>
                              <div className={styles.savedBankDetails}>
                                <div className={styles.savedBankName}>{bank.display_name || bank.nickname || bank.bank_name || bank.bankName || 'Bank Account'}</div>
                                <div className={styles.savedBankAccount}>
                                  {(bank.account_type || bank.accountType || 'Account').toString().charAt(0).toUpperCase() + (bank.account_type || bank.accountType || 'Account').toString().slice(1)} •••• {bank.last4 || '****'}
                                </div>
                              </div>
                              </div>
                              {selectedFundingBankId === bank.id && (
                                <span className={styles.selectedCheck}>✓</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className={styles.bankActionButtons}>
                          {availableBanks.length > 2 && (
                            <button
                              type="button"
                              className={styles.viewAllBanksButton}
                              onClick={() => {
                                setBankSelectionMode('funding')
                                setShowAllBanksModal(true)
                              }}
                            >
                              View All Banks ({availableBanks.length})
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.addNewBankButton}
                            onClick={() => setShowBankModal(true)}
                          >
                            + Add New Bank
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.connectBankButton}
                        onClick={() => setShowBankModal(true)}
                      >
                        <span className={styles.connectIcon}>🏦</span>
                        <span>Connect Bank Account</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div 
              className={styles.radioOption}
              onClick={(e) => {
                // Only trigger if not clicking on nested buttons
                if (!e.target.closest('button')) {
                  setFundingMethod('wire-transfer')
                }
              }}
            >
              <label>
                <input
                  type="radio"
                  name="funding"
                  value="wire-transfer"
                  checked={fundingMethod === 'wire-transfer'}
                  onChange={() => setFundingMethod('wire-transfer')}
                />
                <span>Wire Transfer</span>
              </label>
              {fundingMethod === 'wire-transfer' && (
                <div>
                  <div className={styles.wireRow}><b>Bank:</b> Bank of America</div>
                  <div className={styles.wireRow}><b>Bank Location:</b> 7950 Brier Creek Pkwy, Raleigh NC 27617</div>
                  <div className={styles.wireRow}><b>Routing for Wires:</b> 026009593</div>
                  <div className={styles.wireRow}><b>Account Name:</b> Robert Ventures Holdings LLC</div>
                  <div className={styles.wireRow}><b>Account #:</b> 237047915756</div>
                  <div className={styles.wireRow}><b>RVH Address:</b> 2810 N Church St, Num 28283, Wilmington DE 19802</div>
                  <div className={styles.wireRow}><b>Office#:</b> 302-404-6341 - Joseph Robert</div>
                  <div className={styles.wireRow}><b>Email:</b> ir@robertventures.com</div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    style={{ marginTop: '12px' }}
                    onClick={() => {
                      const content = `Wire Instructions\n\n` +
                        `Bank: Bank of America\n` +
                        `Bank Location: 7950 Brier Creek Pkwy, Raleigh NC 27617\n` +
                        `Routing for Wires: 026009593\n` +
                        `Account Name: Robert Ventures Holdings LLC\n` +
                        `Account #: 237047915756\n` +
                        `RVH Address: 2810 N Church St, Num 28283, Wilmington DE 19802\n` +
                        `Office#: 302-404-6341 - Joseph Robert\n` +
                        `Email: ir@robertventures.com`
                      const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Wire Instructions</title>` +
                        `<style>body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;color:#111}.h{font-size:20px;font-weight:700;margin:0 0 12px;text-decoration:underline}p{margin:6px 0}</style>` +
                        `</head><body><div class=\"h\">Wire Instructions</div>` +
                        `<p><b>Bank:</b> Bank of America</p>` +
                        `<p><b>Bank Location:</b> 7950 Brier Creek Pkwy, Raleigh NC 27617</p>` +
                        `<p><b>Routing for Wires:</b> 026009593</p>` +
                        `<p><b>Account Name:</b> Robert Ventures Holdings LLC</p>` +
                        `<p><b>Account #:</b> 237047915756</p>` +
                        `<p><b>RVH Address:</b> 2810 N Church St, Num 28283, Wilmington DE 19802</p>` +
                        `<p><b>Office#:</b> 302-404-6341 - Joseph Robert</p>` +
                        `<p><b>Email:</b> ir@robertventures.com</p>` +
                        `</body></html>`
                      const w = window.open('', '_blank', 'noopener,noreferrer')
                      if (w) {
                        w.document.open()
                        w.document.write(html)
                        w.document.close()
                        w.focus()
                        w.print()
                      } else {
                        // Fallback to text download
                        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = 'wire-instructions.txt'
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        URL.revokeObjectURL(url)
                      }
                    }}
                  >
                    Download PDF Instructions
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payout method (only for monthly payments) */}
        {investment?.paymentFrequency === 'monthly' && (
          <div className={styles.subSection}>
            <div className={styles.groupTitle}>Payout</div>
            <div className={styles.radioGroup}>
              <div 
                className={styles.radioOption}
                onClick={(e) => {
                  // Only trigger if not clicking on nested interactive elements
                  if (!e.target.closest('button') && !e.target.closest('[class*="Bank"]')) {
                    setPayoutMethod('bank-account')
                  }
                }}
              >
                <label>
                  <input
                    type="radio"
                    name="payout"
                    value="bank-account"
                    checked={payoutMethod === 'bank-account'}
                    onChange={() => setPayoutMethod('bank-account')}
                  />
                  <span>Bank Account</span>
                </label>
              </div>
            </div>
            {payoutMethod === 'bank-account' && (
              <div className={styles.bankConnectionSection}>
                {availableBanks.length > 0 ? (
                  <>
                    <div className={styles.savedBanksGrid}>
                      {availableBanks.slice(0, 2).map((bank) => (
                        <div
                          key={bank.id}
                          className={`${styles.savedBankCard} ${selectedPayoutBankId === bank.id ? styles.selectedBankCard : ''}`}
                          onClick={() => setSelectedPayoutBankId(bank.id)}
                        >
                          <div className={styles.savedBankLeft}>
                            <span className={styles.savedBankLogo} style={{ backgroundColor: bank.bankColor ? bank.bankColor + '20' : '#e5e7eb' }}>
                              {bank.bankLogo || '🏦'}
                            </span>
                            <div className={styles.savedBankDetails}>
                              <div className={styles.savedBankName}>{bank.nickname || bank.bankName || 'Bank Account'}</div>
                              <div className={styles.savedBankAccount}>
                                {bank.accountType ? bank.accountType.charAt(0).toUpperCase() + bank.accountType.slice(1) : 'Account'} •••• {bank.last4 || '****'}
                              </div>
                            </div>
                          </div>
                          {selectedPayoutBankId === bank.id && (
                            <span className={styles.selectedCheck}>✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className={styles.bankActionButtons}>
                      {availableBanks.length > 2 && (
                        <button
                          type="button"
                          className={styles.viewAllBanksButton}
                          onClick={() => {
                            setBankSelectionMode('payout')
                            setShowAllBanksModal(true)
                          }}
                        >
                          View All Banks ({availableBanks.length})
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.addNewBankButton}
                        onClick={() => setShowBankModal(true)}
                      >
                        + Add New Bank
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.connectBankButton}
                    onClick={() => setShowBankModal(true)}
                  >
                    <span className={styles.connectIcon}>🏦</span>
                    <span>Connect Bank Account</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      <div className={styles.actions}>
        {fundingInfo && (
          <div className={styles.warning} style={{ marginBottom: '12px', backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' }}>
            <div className={styles.warningTitle} style={{ color: '#0369a1' }}>
              💳 ACH Funding Initiated: {fundingInfo.status?.toUpperCase() || 'PENDING'}
            </div>
            <div style={{ fontSize: '13px', color: '#075985', marginTop: '8px', lineHeight: '1.6' }}>
              {fundingInfo.id && (
                <div>Funding ID: <code style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', padding: '2px 6px', borderRadius: '3px' }}>{fundingInfo.id}</code></div>
              )}
              {fundingInfo.amount_cents && (
                <div>Amount: ${(fundingInfo.amount_cents / 100).toFixed(2)}</div>
              )}
              {fundingInfo.expected_settlement_date && (
                <div>Expected Settlement: {new Date(fundingInfo.expected_settlement_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              )}
              {fundingInfo.achq_transaction_id && (
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                  Transaction ID: {fundingInfo.achq_transaction_id}
                </div>
              )}
            </div>
          </div>
        )}
        {fundingError && (
          <div className={styles.submitError} style={{ marginBottom: '12px' }}>
            <p className={styles.submitErrorText} style={{ fontSize: '13px', lineHeight: '1.6' }}>
              ⚠️ {fundingError}
            </p>
          </div>
        )}
        <p style={{ 
          fontSize: '14px', 
          color: '#6b7280', 
          textAlign: 'center', 
          marginBottom: '16px',
          lineHeight: '1.6'
        }}>
          By clicking Continue & Submit, you confirm you have reviewed the <a href="https://l.robertventures.com/OfferingCircular" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>Offering Circular</a> and its exhibits/related documents.
        </p>
        <button
          className={styles.primaryButton}
          disabled={isSaving}
          onClick={async () => {
            if (!investment) return
            // Validate required fields before continuing
            const errors = []
            if (!accredited) {
              errors.push('Select whether you are an accredited investor.')
            }
            if (accredited === 'accredited' && !accreditedType) {
              errors.push('Select an accredited investor type.')
            }
            if (accredited === 'not_accredited' && !tenPercentConfirmed) {
              errors.push('Confirm the 10% investment limit acknowledgement.')
            }
            if (!fundingMethod) {
              errors.push('Choose a funding method.')
            }
            if (fundingMethod === 'bank-transfer' && !selectedFundingBankId) {
              errors.push('Please select a bank account for funding.')
            }
            if (investment?.paymentFrequency === 'monthly' && payoutMethod !== 'bank-account') {
              errors.push('Select a payout method for monthly earnings.')
            }
            if (investment?.paymentFrequency === 'monthly' && payoutMethod === 'bank-account' && !selectedPayoutBankId) {
              errors.push('Please select a bank account for payouts.')
            }
            if (!agreeToTerms) {
              errors.push('Please review and agree to the investment agreement terms.')
            }
            if (errors.length) {
              setValidationErrors(errors)
              return
            }
            console.log('Starting investment submission...')
            setIsSaving(true)
            try {
              const userId = user.id
              const investmentId = investment.id
              const earningsMethod = investment.paymentFrequency === 'monthly' ? payoutMethod : 'compounding'
              console.log('Investment details:', { userId, investmentId, paymentMethod: fundingMethod, earningsMethod })

              // Fetch current app time (Time Machine) from server - only if user is admin
              let appTime = new Date().toISOString()
              if (user?.isAdmin) {
                try {
                  const timeData = await apiClient.getAppTime()
                  appTime = timeData?.success ? timeData.appTime : appTime
                } catch (err) {
                  console.warn('Failed to get app time, using system time:', err)
                }
              }
              console.log('Using app time for timestamps:', appTime)

              // Determine bank account to use for funding and payout
              let fundingBankToUse = null
              let payoutBankToUse = null
              
              if (fundingMethod === 'bank-transfer' && selectedFundingBankId) {
                const existing = availableBanks.find(b => b.id === selectedFundingBankId)
                if (existing) {
                  fundingBankToUse = { ...existing, lastUsedAt: appTime }
                }
              }
              
              if (investment.paymentFrequency === 'monthly' && payoutMethod === 'bank-account' && selectedPayoutBankId) {
                const existing = availableBanks.find(b => b.id === selectedPayoutBankId)
                if (existing) {
                  payoutBankToUse = { ...existing, lastUsedAt: appTime }
                }
              }
              
              // Map frontend fundingMethod to backend paymentMethod
              // 'bank-transfer' → 'ach'
              // 'wire-transfer' → 'wire'
              const paymentMethod = fundingMethod === 'bank-transfer' ? 'ach' : 'wire'
              
              // Log finalization data for debugging
              console.log('Finalizing investment with data:', {
                investmentId,
                paymentMethod,
                fundingMethod,
                earningsMethod,
                accredited,
                accreditedType,
                tenPercentConfirmed,
                fundingBank: fundingBankToUse?.nickname,
                payoutBank: payoutBankToUse?.nickname
              })
              
              // Update the investment's payment method using the investments endpoint
              console.log('Updating investment payment method...')
              const investmentUpdateData = await apiClient.updateInvestment(userId, investmentId, {
                paymentMethod
              })

              console.log('Investment update API response:', investmentUpdateData)
              if (!investmentUpdateData.success) {
                console.error('Investment update failed:', investmentUpdateData.error)
                setSubmitError(`Failed to submit investment: ${investmentUpdateData.error || 'Unknown error'}. Please try again.`)
                return
              }
              console.log('Investment updated successfully!')

              // Create accreditation attestation BEFORE submitting (immutable once created)
              try {
                const alreadyAttested = Boolean(investment?.compliance?.attestedAt || investment?.compliance?.status)
                if (!alreadyAttested) {
                  const attestationPayload = {
                    status: accredited,
                    accreditedType: accredited === 'accredited' ? accreditedType : null,
                    tenPercentLimitConfirmed: accredited === 'not_accredited' ? !!tenPercentConfirmed : null
                  }
                  console.log('Creating accreditation attestation with payload:', attestationPayload)
                  await apiClient.createAttestation(investmentId, attestationPayload)
                  console.log('Accreditation attestation created successfully')
                } else {
                  console.log('Accreditation attestation already exists for this investment; skipping creation')
                }
              } catch (attErr) {
                const msg = (attErr && attErr.message) ? attErr.message : 'Unknown error'
                const detail = attErr?.responseData?.detail
                const detailStr = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => d.msg || d).join(', ') : '')
                const combined = detailStr || msg
                // If backend indicates the attestation already exists, proceed; otherwise block
                const lower = (combined || '').toLowerCase()
                const isAlreadyExists = attErr?.statusCode === 409 || lower.includes('already') || lower.includes('exists')
                if (!isAlreadyExists) {
                  console.error('Creating accreditation attestation failed:', attErr)
                  setSubmitError(`Failed to save accreditation attestation: ${combined}`)
                  return
                } else {
                  console.log('Attestation appears to already exist; proceeding with submission.')
                }
              }
              
              // Submit the investment to move it from DRAFT to PENDING status
              console.log('Submitting investment...')
              const submitResponse = await apiClient.submitInvestment(investmentId)
              console.log('Investment submit API response:', submitResponse)
              
              if (!submitResponse.success) {
                console.error('Investment submission failed:', submitResponse.error)
                setSubmitError(`Failed to submit investment: ${submitResponse.error || 'Unknown error'}. Please try again.`)
                return
              }
              console.log('Investment submitted successfully! Status changed to PENDING.')

              // Initiate ACH funding if bank-transfer selected and amount <= $100,000
              if (paymentMethod === 'ach' && selectedFundingBankId && (investment?.amount || 0) <= 100000) {
                try {
                  console.log('[FinalizeInvestment] Initiating ACH funding...', {
                    investmentId,
                    paymentMethodId: selectedFundingBankId,
                    amount: investment.amount,
                    paymentMethod
                  })
                  
                  const amountCents = Math.round((investment.amount || 0) * 100)
                  const idempotencyKey = generateIdempotencyKey()
                  
                  console.log('[FinalizeInvestment] Calling fundInvestment API:', {
                    amountCents,
                    idempotencyKey
                  })
                  
                  const fundRes = await apiClient.fundInvestment(
                    investmentId,
                    selectedFundingBankId,
                    amountCents,
                    idempotencyKey,
                    `Investment ${investmentId}`
                  )
                  
                  console.log('[FinalizeInvestment] Funding initiated successfully:', fundRes)
                  setFundingInfo(fundRes?.funding || null)
                  setFundingError('')
                } catch (fe) {
                  console.error('[FinalizeInvestment] Funding initiation failed:', fe)
                  const errorMessage = fe?.message || 'Failed to initiate funding'
                  
                  // Special handling for investment status errors
                  if (errorMessage.includes('ACTIVE') || errorMessage.includes('PENDING')) {
                    setFundingError(
                      'The investment was submitted successfully, but ACH funding could not be initiated due to investment status. ' +
                      'This is a backend configuration issue - the investment should remain in PENDING status until funding is processed. ' +
                      'Please contact your backend team to ensure investments stay PENDING after submission until funding settles.'
                    )
                  } else {
                    setFundingError(`${errorMessage}. The investment has been submitted but funding was not initiated. Please contact support.`)
                  }
                }
              }
              
              // Store finalization data in localStorage for future reference
              // Note: Compliance data is now stored via backend attestation; we also keep a local snapshot
              const finalizationData = {
                investmentId,
                timestamp: appTime,
                compliance: {
                  accredited,
                  accreditedType: accredited === 'accredited' ? accreditedType : null,
                  tenPercentConfirmed: accredited === 'not_accredited' ? tenPercentConfirmed : null
                },
                banking: {
                  fundingMethod,
                  earningsMethod,
                  payoutMethod,
                  fundingBank: fundingBankToUse ? { id: fundingBankToUse.id, nickname: fundingBankToUse.nickname } : null,
                  payoutBank: payoutBankToUse ? { id: payoutBankToUse.id, nickname: payoutBankToUse.nickname } : null
                },
                documents: {
                  agreementAccepted: true,
                  acceptedAt: appTime,
                  signature: [user.firstName, user.lastName].filter(Boolean).join(' ')
                }
              }
              
              try {
                localStorage.setItem(`investment_${investmentId}_finalization`, JSON.stringify(finalizationData))
                console.log('Finalization data stored in localStorage')
              } catch (err) {
                console.warn('Failed to store finalization data in localStorage:', err)
              }
              
              // If we started funding, remain on page for polling in next step; otherwise redirect
              if (!(paymentMethod === 'ach' && selectedFundingBankId && (investment?.amount || 0) <= 100000)) {
                // Small delay to ensure UI doesn't flash before redirect
                console.log('Investment submitted successfully, redirecting to dashboard...')
                await new Promise(resolve => setTimeout(resolve, 500))
                console.log('Redirecting to dashboard...')
                window.location.href = '/dashboard'
              }
            } catch (e) {
              console.error('Failed to save finalization data', e)
              setSubmitError('An error occurred while submitting your investment. Please try again. If the problem persists, contact support.')
            } finally {
              setIsSaving(false)
            }
          }}
        >
          {isSaving ? 'Saving...' : 'Continue & Submit'}
        </button>
        {submitError && (
          <div className={styles.submitError}>
            <p className={styles.submitErrorText}>{submitError}</p>
          </div>
        )}
        {validationErrors.length > 0 && (
          <div className={styles.warning}>
            <div className={styles.warningTitle}>Please complete the following before continuing:</div>
            <ul className={styles.warningList}>
              {validationErrors.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bank Connection Modal */}
      <BankConnectionModal
        isOpen={showBankModal}
        onClose={() => !isSavingBank && setShowBankModal(false)}
        onAccountSelected={async (method) => {
          console.log('[FinalizeInvestment] Bank account selected from Plaid:', method)
          
          // Ensure the payment method has the expected structure
          const paymentMethod = {
            id: method.id,
            type: method.type || 'bank_ach',
            display_name: method.display_name || method.bank_name || 'Bank Account',
            bank_name: method.bank_name || method.display_name || 'Bank',
            account_type: method.account_type || 'checking',
            last4: method.last4 || '****',
            status: method.status || 'ready',
            ...method
          }
          
          console.log('[FinalizeInvestment] Normalized payment method:', paymentMethod)
          
          setSelectedBankId(paymentMethod.id)
          setSelectedFundingBankId(paymentMethod.id)
          setSelectedPayoutBankId(paymentMethod.id)
          setIsSavingBank(true)
          
          try {
            console.log('[FinalizeInvestment] Refreshing payment methods list...')
            const pmRes = await apiClient.listPaymentMethods('bank_ach')
            const pms = Array.isArray(pmRes?.payment_methods) ? pmRes.payment_methods : []
            console.log('[FinalizeInvestment] Available payment methods:', pms.length)
            setAvailableBanks(pms)
          } catch (e) {
            console.error('[FinalizeInvestment] Failed to refresh payment methods:', e)
            // Add the new bank to the list manually if refresh failed
            setAvailableBanks(prev => [...prev, paymentMethod])
          } finally {
            setIsSavingBank(false)
            setShowBankModal(false)
          }
        }}
      />
      
      {/* View All Banks Modal */}
      {showAllBanksModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAllBanksModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Select Bank Account</h3>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setShowAllBanksModal(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.allBanksList}>
                {availableBanks.map((bank) => {
                  const isSelected = bankSelectionMode === 'funding' 
                    ? selectedFundingBankId === bank.id 
                    : selectedPayoutBankId === bank.id
                  return (
                    <div
                      key={bank.id}
                      className={`${styles.modalBankCard} ${isSelected ? styles.modalBankCardSelected : ''}`}
                      onClick={() => {
                        if (bankSelectionMode === 'funding') {
                          setSelectedFundingBankId(bank.id)
                        } else {
                          setSelectedPayoutBankId(bank.id)
                        }
                        setShowAllBanksModal(false)
                      }}
                    >
                      <div className={styles.modalBankLeft}>
                        <span className={styles.modalBankLogo} style={{ backgroundColor: bank.bankColor ? bank.bankColor + '20' : '#e5e7eb' }}>
                          {bank.bankLogo || '🏦'}
                        </span>
                        <div className={styles.modalBankDetails}>
                          <div className={styles.modalBankName}>{bank.display_name || bank.nickname || bank.bank_name || bank.bankName || 'Bank Account'}</div>
                          <div className={styles.modalBankAccount}>
                            {(bank.account_type || bank.accountType || 'Account').toString().charAt(0).toUpperCase() + (bank.account_type || bank.accountType || 'Account').toString().slice(1)} •••• {bank.last4 || '****'}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <span className={styles.modalSelectedCheck}>✓</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saving Bank Account Overlay */}
      {isSavingBank && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: '#ffffff',
            padding: '32px 48px',
            borderRadius: '12px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #1a1a1a',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>
              Saving Bank Account
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
              Please wait while we securely save your bank account information...
            </p>
          </div>
        </div>
      )}

      {/* Development Debug Panel */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#1f2937',
          color: '#f9fafb',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
          maxWidth: '400px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: showDebugPanel ? '1px solid #374151' : 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: '600'
            }}
          >
            <span>🔧 Plaid Debug Panel</span>
            <span>{showDebugPanel ? '▼' : '▶'}</span>
          </div>
          {showDebugPanel && (
            <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ color: '#9ca3af', marginBottom: '4px' }}>Environment:</div>
                <div style={{ color: '#10b981' }}>
                  {process.env.NEXT_PUBLIC_PLAID_ENV || 'not set (defaults to sandbox)'}
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ color: '#9ca3af', marginBottom: '4px' }}>Payment Methods ({availableBanks.length}):</div>
                {availableBanks.length === 0 ? (
                  <div style={{ color: '#ef4444' }}>No banks connected</div>
                ) : (
                  availableBanks.map((bank, idx) => (
                    <div key={bank.id || idx} style={{ 
                      padding: '6px 8px', 
                      background: '#374151', 
                      borderRadius: '4px',
                      marginBottom: '4px'
                    }}>
                      <div>{bank.display_name || bank.bank_name}</div>
                      <div style={{ color: '#9ca3af', fontSize: '10px' }}>
                        {bank.account_type} ••{bank.last4} | {bank.status}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ color: '#9ca3af', marginBottom: '4px' }}>Selected Funding Bank:</div>
                <div style={{ color: selectedFundingBankId ? '#10b981' : '#ef4444' }}>
                  {selectedFundingBankId || 'None'}
                </div>
              </div>

              {fundingInfo && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: '#9ca3af', marginBottom: '4px' }}>Funding Status:</div>
                  <div style={{ 
                    padding: '8px', 
                    background: '#374151', 
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {JSON.stringify(fundingInfo, null, 2)}
                  </div>
                </div>
              )}

              {fundingError && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: '#9ca3af', marginBottom: '4px' }}>Funding Error:</div>
                  <div style={{ color: '#ef4444' }}>{fundingError}</div>
                </div>
              )}

              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #374151' }}>
                <button
                  onClick={() => {
                    console.log('=== PLAID DEBUG INFO ===')
                    console.log('Environment:', process.env.NEXT_PUBLIC_PLAID_ENV)
                    console.log('Available Banks:', availableBanks)
                    console.log('Selected Funding Bank ID:', selectedFundingBankId)
                    console.log('Funding Info:', fundingInfo)
                    console.log('Funding Error:', fundingError)
                    console.log('Investment:', investment)
                    console.log('=======================')
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}
                >
                  Log Debug Info to Console
                </button>
                <div style={{ marginTop: '8px', fontSize: '10px', color: '#9ca3af', lineHeight: '1.4' }}>
                  <div>Test Credentials:</div>
                  <div>• user_good / pass_good</div>
                  <div>• Chase: ins_109508</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function Section({ title, children, raw = false }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {raw ? (
        children
      ) : (
        <div className={styles.rows}>{children}</div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>{label}</div>
      <div className={styles.rowValue}>{value || '-'}</div>
    </div>
  )
}


