"use client"
import Header from '../components/Header'
import BankConnectionModal from '../components/BankConnectionModal'
import { apiClient } from '../../lib/apiClient'
import styles from './page.module.css'
import { useEffect, useState } from 'react'
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
      setFundingMethod(user.banking.fundingMethod || '')
      setPayoutMethod(user.banking.payoutMethod || 'bank-account')
      if (user.banking.defaultBankAccountId) {
        setSelectedBankId(user.banking.defaultBankAccountId)
        setSelectedFundingBankId(user.banking.defaultBankAccountId)
        setSelectedPayoutBankId(user.banking.defaultBankAccountId)
      }
    }
  }, [user?.banking])

  // Enforce payout method when monthly payments are selected
  useEffect(() => {
    if (investment?.paymentFrequency === 'monthly' && payoutMethod !== 'bank-account') {
      setPayoutMethod('bank-account')
    }
  }, [investment?.paymentFrequency, payoutMethod])

  // Force wire transfer for IRA accounts (must be declared before any conditional return)
  useEffect(() => {
    if ((investment?.accountType || user?.accountType) === 'ira' && fundingMethod !== 'wire-transfer') {
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

  // Prevent hydration mismatch
  if (!mounted || !user) return <div className={styles.loading}>Loading...</div>

  const isIra = (investment?.accountType || user?.accountType) === 'ira'
  const requiresWireTransfer = investment?.amount > 100000

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
              disabled={isSaving}
              onClick={async () => {
                if (!user || !investment) {
                  setSubmitError('Unable to generate agreement. Please refresh the page and try again.')
                  return
                }
                
                setIsSaving(true)
                setSubmitError('')
                
                try {
                  // Generate PDF bond agreement via backend
                  const response = await apiClient.generateBondAgreement(investment.id, user.id)
                  
                  if (response.success && response.data?.signed_url) {
                    // Open the PDF in a new tab
                    window.open(response.data.signed_url, '_blank', 'noopener,noreferrer')
                  } else {
                    setSubmitError('Failed to generate bond agreement. Please try again.')
                  }
                } catch (error) {
                  console.error('Error generating bond agreement:', error)
                  setSubmitError('An error occurred while generating the bond agreement. Please try again.')
                } finally {
                  setIsSaving(false)
                }
              }}
            >
              {isSaving ? '⏳ Generating...' : '📄 View Agreement'}
            </button>
          </div>

          <div className={styles.confirm}>
            <input type="checkbox" id="agree" checked={agreeToTerms} onChange={(e) => setAgreeToTerms(e.target.checked)} />
            <label htmlFor="agree">I have reviewed the agreement and agree to the terms.</label>
          </div>
        </div>
      </Section>

      <Section title="Payment" raw>
        {/* Funding method */}
        <div className={styles.subSection}>
          <div className={styles.groupTitle}>Funding</div>
          <div className={styles.radioGroup}>
            {!isIra && !requiresWireTransfer && (
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
                  <div className={styles.wireRow}><b>Beneficiary:</b> Robert Ventures</div>
                  <div className={styles.wireRow}><b>Bank:</b> Example Bank</div>
                  <div className={styles.wireRow}><b>Routing #:</b> 123456789</div>
                  <div className={styles.wireRow}><b>Account #:</b> 987654321</div>
                  <div className={styles.wireRow}><b>Reference:</b> {user.firstName} {user.lastName}</div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    style={{ marginTop: '12px' }}
                    onClick={() => {
                      const content = `Wire Transfer Instructions\n\n` +
                        `Beneficiary: Robert Ventures\n` +
                        `Bank: Example Bank\n` +
                        `Routing #: 123456789\n` +
                        `Account #: 987654321\n` +
                        `Reference: ${user.firstName} ${user.lastName}`
                      const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Wire Transfer Instructions</title>` +
                        `<style>body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;color:#111}.h{font-size:20px;font-weight:700;margin:0 0 12px}p{margin:6px 0}</style>` +
                        `</head><body><div class=\"h\">Wire Transfer Instructions</div>` +
                        `<p><b>Beneficiary:</b> Robert Ventures</p>` +
                        `<p><b>Bank:</b> Example Bank</p>` +
                        `<p><b>Routing #:</b> 123456789</p>` +
                        `<p><b>Account #:</b> 987654321</p>` +
                        `<p><b>Reference:</b> ${user.firstName} ${user.lastName}</p>` +
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
          <div className={styles.warning} style={{ marginBottom: '12px' }}>
            <div className={styles.warningTitle}>
              Funding status: {fundingInfo.status?.toUpperCase() || 'PENDING'}
            </div>
            {fundingInfo.expected_settlement_date && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Expected settlement: {new Date(fundingInfo.expected_settlement_date).toLocaleString()}
              </div>
            )}
          </div>
        )}
        {fundingError && (
          <div className={styles.submitError}>
            <p className={styles.submitErrorText}>{fundingError}</p>
          </div>
        )}
        <p style={{ 
          fontSize: '14px', 
          color: '#6b7280', 
          textAlign: 'center', 
          marginBottom: '16px',
          lineHeight: '1.6'
        }}>
          By clicking Continue & Submit, <b><i>you are agreeing to all Investor Acknowledgements</i></b> and agree to be bound by the terms of the <a href="#" style={{ color: '#0891b2', textDecoration: 'underline' }}>Investor Bond Agreement.</a>
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
                  const amountCents = Math.round((investment.amount || 0) * 100)
                  const idempotencyKey = generateIdempotencyKey()
                  const fundRes = await apiClient.fundInvestment(
                    investmentId,
                    selectedFundingBankId,
                    amountCents,
                    idempotencyKey,
                    `Investment ${investmentId}`
                  )
                  setFundingInfo(fundRes?.funding || null)
                  setFundingError('')
                } catch (fe) {
                  console.error('Funding initiation failed:', fe)
                  setFundingError(fe?.message || 'Failed to initiate funding')
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
          setSelectedBankId(method.id)
          setSelectedFundingBankId(method.id)
          setSelectedPayoutBankId(method.id)
          setIsSavingBank(true)
          try {
            const pmRes = await apiClient.listPaymentMethods('bank_ach')
            const pms = Array.isArray(pmRes?.payment_methods) ? pmRes.payment_methods : []
            setAvailableBanks(pms)
          } catch (e) {
            // ignore, keep current state
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


