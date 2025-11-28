'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import styles from './InvestmentReviewForm.module.css'

export default function InvestmentReviewForm() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('bond-selection')
  const [investmentData, setInvestmentData] = useState(null)
  const [userData, setUserData] = useState(null)
  const [isSigned, setIsSigned] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const bootstrap = async () => {
      const userId = localStorage.getItem('currentUserId')
      const investmentId = localStorage.getItem('currentInvestmentId')
      if (!userId || !investmentId) {
        router.push('/')
        return
      }
      try {
        // Use getCurrentUser() which handles token refresh and ignore legacy ID param
        const data = await apiClient.getCurrentUser()
        if (!data.success || !data.user) return
        
        const user = data.user
        const investments = Array.isArray(user.investments) ? user.investments : []
        const currentInv = investments.find(inv => inv.id === investmentId)
        
        setUserData(user)
        setInvestmentData(currentInv)
      } catch (e) {
        console.error('Failed to load investment data', e)
      }
    }
    bootstrap()
  }, [router])

  const handleSign = async () => {
    try {
      if (typeof window === 'undefined') return
      
      const investmentId = localStorage.getItem('currentInvestmentId')
      
      // Use the submit endpoint which generates and stores the bond document
      const response = await apiClient.submitInvestment(investmentId)
      
      if (!response.success) {
        alert(response.error || 'Failed to sign investment')
        return
      }
      
      setIsSigned(true)
      setShowSuccessModal(true)
    } catch (err) {
      console.error(err)
      alert('An error occurred. Please try again.')
    }
  }

  const tabs = [
    { id: 'bond-selection', label: 'Bond Selection' },
    { id: 'personal-info', label: 'Personal Information' },
    { id: 'banking', label: 'Banking Information' }
  ]

  if (!investmentData || !userData) {
    return <div className={styles.loading}>Loading...</div>
  }

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>Review Your Investment</h2>
      <p className={styles.subtitle}>Please review all information before signing your investment agreement.</p>
      
      <div className={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'bond-selection' && (
          <div className={styles.tabContent}>
            <h3 className={styles.sectionTitle}>Bond Selection Details</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.label}>Investment Amount:</span>
                <span className={styles.value}>${investmentData.amount?.toLocaleString() || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Number of Bonds:</span>
                <span className={styles.value}>{investmentData.bonds || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Lock-up Period:</span>
                <span className={styles.value}>{investmentData.lockupPeriod || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>APY:</span>
                <span className={styles.value}>{investmentData.lockupPeriod === '1-year' ? '8%' : '10%'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Payment Frequency:</span>
                <span className={styles.value}>{investmentData.paymentFrequency === 'monthly' ? 'Interest Paid Monthly' : 'Compounded Monthly'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Estimated annual earnings:</span>
                <span className={styles.value}>${(() => {
                  const amount = investmentData.amount || 0
                  const apy = investmentData.lockupPeriod === '1-year' ? 0.08 : 0.10
                  const years = investmentData.lockupPeriod === '1-year' ? 1 : 3

                  if (investmentData.paymentFrequency === 'monthly') {
                    return (amount * apy * years).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  } else {
                    const monthlyRate = apy / 12
                    const totalMonths = years * 12
                    const compoundAmount = amount * Math.pow(1 + monthlyRate, totalMonths)
                    return (compoundAmount - amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  }
                })()}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'personal-info' && (
          <div className={styles.tabContent}>
            <h3 className={styles.sectionTitle}>Personal Information</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.label}>First Name:</span>
                <span className={styles.value}>{investmentData.personalInfo?.firstName || userData.firstName || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Last Name:</span>
                <span className={styles.value}>{investmentData.personalInfo?.lastName || userData.lastName || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Email:</span>
                <span className={styles.value}>{investmentData.personalInfo?.email || userData.email || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Phone:</span>
                <span className={styles.value}>{investmentData.personalInfo?.phone || userData.phoneNumber || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Date of Birth:</span>
                <span className={styles.value}>{investmentData.personalInfo?.dob || userData.dob || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>SSN:</span>
                <span className={styles.value}>{investmentData.personalInfo?.ssn ? '***-**-' + investmentData.personalInfo.ssn.slice(-4) : 'N/A'}</span>
              </div>
            </div>
            
            <h4 className={styles.subsectionTitle}>Residential Address</h4>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.label}>Country:</span>
                <span className={styles.value}>{userData.address?.country || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>State:</span>
                <span className={styles.value}>{userData.address?.state || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Street 1:</span>
                <span className={styles.value}>{userData.address?.street1 || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Street 2:</span>
                <span className={styles.value}>{userData.address?.street2 || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>City:</span>
                <span className={styles.value}>{userData.address?.city || 'N/A'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Zip Code:</span>
                <span className={styles.value}>{userData.address?.zip || 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'banking' && (
          <div className={styles.tabContent}>
            <h3 className={styles.sectionTitle}>Banking Information</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.label}>Funding Method:</span>
                <span className={styles.value}>{investmentData.banking?.fundingMethod === 'bank-transfer' ? 'Bank Transfer' : 'Wire Transfer'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Bank:</span>
                <span className={styles.value}>{investmentData.banking?.bank?.nickname || (investmentData.banking?.fundingMethod === 'bank-transfer' ? 'Default Bank' : 'N/A')}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>Earnings Method:</span>
                <span className={styles.value}>
                  {investmentData.banking?.earningsMethod === 'bank-account' ? 'Bank Account' : 
                   investmentData.banking?.earningsMethod === 'check' ? 'Check' : 
                   investmentData.banking?.earningsMethod === 'compounding' ? 'Compounding' : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button 
          onClick={handleSign} 
          className={`${styles.signButton} ${isSigned ? styles.signed : ''}`}
          disabled={isSigned}
        >
          {isSigned ? '✓ Investment Signed Successfully!' : 'Sign Investment Agreement'}
        </button>
      </div>

      {showSuccessModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <div className={styles.successIcon}>✓</div>
              <h3 className={styles.modalTitle}>Investment Signed Successfully!</h3>
              <p className={styles.modalText}>
                Your investment has been processed and is now pending. You can view your portfolio and track your investment progress in your dashboard.
              </p>
              <button 
                onClick={() => {
                  localStorage.removeItem('currentInvestmentId')
                  router.push('/dashboard')
                }}
                className={styles.dashboardButton}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
