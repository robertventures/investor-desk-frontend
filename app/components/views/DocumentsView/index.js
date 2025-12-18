'use client'
import { useEffect, useState } from 'react'
import { apiClient } from '../../../../lib/apiClient'
import styles from './DocumentsView.module.css'
import { formatCurrency } from '../../../../lib/formatters.js'
import { formatDateLocale } from '../../../../lib/dateUtils.js'
import { getInvestmentStatus } from '../../../../lib/investmentCalculations.js'

export default function DocumentsView() {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState(null)
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(true)
  const [agreementLoadingId, setAgreementLoadingId] = useState(null)
  
  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    
    const loadUser = async () => {
      const userId = localStorage.getItem('currentUserId')
      if (!userId) {
        setLoading(false)
        return
      }

      try {
        // Load user data
        const data = await apiClient.getCurrentUser()
        if (data.success) {
          setUser(data.user)
          
          // Load investments separately
          const investmentsData = await apiClient.getInvestments(userId)
          if (investmentsData.success) {
            setInvestments(investmentsData.investments || [])
          }
        }
      } catch (error) {
        console.error('Failed to load user data:', error)
      }
      setLoading(false)
    }

    loadUser()
  }, [])

  const openAgreementData = (data) => {
    if (typeof window === 'undefined' || !data) return false

    if (data.signed_url) {
      const win = window.open(data.signed_url, '_blank', 'noopener,noreferrer')
      if (!win) {
        console.warn('Agreement pop-up was blocked.')
        return false
      }
      return true
    }

    if (data.pdf_base64) {
      try {
        let base64 = data.pdf_base64.trim()
        const commaIndex = base64.indexOf(',')
        if (commaIndex !== -1) {
          base64 = base64.slice(commaIndex + 1)
        }
        base64 = base64.replace(/\s+/g, '')
        if (!base64) return false

        const byteCharacters = atob(base64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i += 1) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: data.content_type || 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const win = window.open(url, '_blank', 'noopener,noreferrer')
        if (!win) {
          URL.revokeObjectURL(url)
          console.warn('Agreement pop-up was blocked.')
          return false
        }
        setTimeout(() => {
          URL.revokeObjectURL(url)
        }, 60_000)
        return true
      } catch (error) {
        console.error('Failed to decode agreement PDF', error)
        return false
      }
    }

    return false
  }

  const viewAgreement = async (investment) => {
    if (!investment?.id) return

    setAgreementLoadingId(investment.id)

    try {
      const response = await apiClient.getBondAgreement(investment.id, user?.id)
      if (response?.success && response.data) {
        openAgreementData(response.data)
      } else if (response?.error) {
        console.warn('Failed to retrieve bond agreement:', response.error)
        alert('Unable to retrieve the agreement. Please try again or contact support.')
      }
    } catch (error) {
      console.error('Error retrieving bond agreement:', error)
      alert('An error occurred while retrieving the agreement. Please try again.')
    } finally {
      setAgreementLoadingId(null)
    }
  }

  if (loading) {
    return (
      <div className={styles.documentsContainer}>
        <div className={styles.header}>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>Manage your investment documents and agreements</p>
        </div>
        <div className={styles.content}>
          <div className={styles.loading}>Loading documents...</div>
        </div>
      </div>
    )
  }

  // Get finalized investments (both regular and imported)
  // Include pending, active, withdrawal_notice, and withdrawn investments
  const finalizedInvestments = investments.filter(investment =>
    investment.status === 'pending' || 
    investment.status === 'active' ||
    investment.status === 'withdrawal_notice' ||
    investment.status === 'withdrawn'
  )

  // Prevent hydration mismatch
  if (!mounted) {
    return <div className={styles.documentsContainer}>Loading documents...</div>
  }

  return (
    <div className={styles.documentsContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Documents</h1>
        <p className={styles.subtitle}>Manage your investment documents and agreements</p>
      </div>

      <div className={styles.content}>
        {/* Investment Agreements Section */}
        {finalizedInvestments.length > 0 ? (
          <div className={styles.documentsList}>
            <h3 className={styles.sectionTitle}>Investment Agreements</h3>
            <div className={styles.documentsGrid}>
              {finalizedInvestments.map(investment => {
                const status = getInvestmentStatus(investment)
                
                // Format investment type - check accountType first, then infer from other fields
                const getInvestmentType = () => {
                  const accountType = investment.accountType
                  
                  // First check explicit accountType field
                  if (accountType === 'individual') return 'Individual'
                  if (accountType === 'joint') return 'Joint'
                  if (accountType === 'entity') return 'Entity'
                  if (accountType === 'ira' || accountType === 'sdira') return 'IRA'
                  
                  // If accountType is not set, infer from other fields
                  if (investment.entity) return 'Entity'
                  if (investment.jointHolder) return 'Joint'
                  if (investment.ira || investment.sdira) return 'IRA'
                  
                  // Default to Individual if none of the above
                  return 'Individual'
                }
                
                return (
                  <div key={investment.id} className={styles.documentCard}>
                    <div className={styles.documentIcon}>📄</div>
                    <div className={styles.documentInfo}>
                      <div className={styles.documentTitleWithBadge}>
                        <h4 className={styles.documentTitle}>
                          Bond Agreement - {investment.id.toString().slice(-8)}
                        </h4>
                        <span className={`${styles.statusBadge} ${
                          status.status === 'withdrawn' ? styles.withdrawn :
                          status.isLocked ? styles.pending : styles.completed
                        }`}>
                          {status.statusLabel}
                        </span>
                      </div>
                      <div className={styles.documentDetails}>
                        <p><strong>Amount:</strong> {formatCurrency(investment.amount)}</p>
                        <p><strong>Investment Type:</strong> {getInvestmentType()}</p>
                        <p><strong>Payment Frequency:</strong> {investment.paymentFrequency || 'N/A'}</p>
                        <p><strong>Lockup Period:</strong> {investment.lockupPeriod || 'N/A'}</p>
                        <p><strong>Bond Issued:</strong> {formatDateLocale(investment.submittedAt || investment.createdAt)}</p>
                        <p><strong>Bond Approved:</strong> {investment.confirmedAt ? formatDateLocale(investment.confirmedAt) : 'Pending'}</p>
                      </div>
                    </div>
                    <div className={styles.documentActions}>
                      <button
                        className={styles.downloadButton}
                        onClick={() => viewAgreement(investment)}
                        disabled={agreementLoadingId === investment.id}
                      >
                        {agreementLoadingId === investment.id
                          ? '⏳ Preparing...'
                          : '📄 View Agreement'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📄</div>
            <h3 className={styles.emptyTitle}>No Documents Yet</h3>
            <p className={styles.emptyDescription}>
              Documents will appear here once you complete an investment.
            </p>
            <ul className={styles.documentTypes}>
              <li>Investment Agreements</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
