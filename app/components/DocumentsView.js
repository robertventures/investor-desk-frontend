'use client'
import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'
import styles from './DocumentsView.module.css'
import { formatCurrency } from '../../lib/formatters.js'
import { formatDateLocale } from '../../lib/dateUtils.js'

export default function DocumentsView() {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

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
        const data = await apiClient.getUser(userId)
        if (data.success) {
          setUser(data.user)
        }
      } catch (error) {
        console.error('Failed to load user data:', error)
      }
      setLoading(false)
    }

    loadUser()
  }, [])

  const viewAgreement = async (investment) => {
    // Check if bond agreement PDF exists
    const bondAgreementUrl = investment.documents?.bondAgreementUrl
    
    if (bondAgreementUrl) {
      // PDF exists - fetch signed URL and open it
      try {
        const response = await apiClient.getBondAgreement(investment.id, user.id)
        if (response.success && response.data?.signed_url) {
          window.open(response.data.signed_url, '_blank', 'noopener,noreferrer')
        } else {
          alert('Failed to retrieve bond agreement. Please try again.')
        }
      } catch (error) {
        console.error('Error retrieving bond agreement:', error)
        alert('An error occurred while retrieving the bond agreement.')
      }
    } else {
      // Fallback: Generate JSON for legacy investments
      downloadLegacyAgreement(investment)
    }
  }

  const downloadLegacyAgreement = (investment) => {
    // Generate agreement data on-demand for legacy investments without PDF
    const agreementData = {
      // If documents.agreement exists, use it; otherwise generate basic structure
      ...(investment.documents?.agreement || {}),
      
      // Basic investment information
      investmentId: investment.id,
      userId: user.id,
      amount: investment.amount,
      bonds: investment.bonds,
      lockupPeriod: investment.lockupPeriod,
      paymentFrequency: investment.paymentFrequency,
      accountType: investment.accountType,
      status: investment.status,
      submittedAt: investment.submittedAt || investment.createdAt,
      confirmedAt: investment.confirmedAt,
      lockupEndDate: investment.lockupEndDate,
      
      // User information
      investor: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        dob: user.dob,
        address: user.address
      },
      
      // Add entity and joint holder data if applicable
      ...(investment.accountType === 'entity' && user?.entity ? { entity: user.entity } : {}),
      ...(investment.accountType === 'joint' && user?.jointHolder ? { jointHolder: user.jointHolder } : {}),
      
      // Metadata
      generatedAt: new Date().toISOString(),
      source: investment.documents?.agreement ? 'original' : 'generated'
    }

    const jsonString = JSON.stringify(agreementData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `investment-agreement-${investment.id}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
  const finalizedInvestments = (user?.investments || []).filter(investment =>
    investment.status === 'pending' || 
    investment.status === 'active' ||
    investment.status === 'withdrawal_notice' ||
    investment.status === 'withdrawn'
  )

  // Get documents and sort by upload date (most recent first)
  const userDocuments = (user?.documents || [])
    .filter(doc => doc.type === 'document')
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))

  const downloadDocument = async (docId, fileName) => {
    try {
      if (typeof window === 'undefined') return
      
      const userId = localStorage.getItem('currentUserId')
      const res = await fetch(`/api/users/${userId}/documents/${docId}?requestingUserId=${userId}`)
      
      if (!res.ok) {
        alert('Failed to download document')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download document:', error)
      alert('Failed to download document')
    }
  }

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
        {/* Documents Section */}
        {userDocuments.length > 0 && (
          <div className={styles.documentsList}>
            <h3 className={styles.sectionTitle}>Documents</h3>
            <div className={styles.documentsGrid}>
              {userDocuments.map(doc => (
                <div key={doc.id} className={styles.documentCard}>
                  <div className={styles.documentIcon}>📄</div>
                  <div className={styles.documentInfo}>
                    <h4 className={styles.documentTitle}>
                      Document
                    </h4>
                    <div className={styles.documentDetails}>
                      <p><strong>File:</strong> {doc.fileName}</p>
                      <p><strong>Uploaded:</strong> {formatDateLocale(doc.uploadedAt)}</p>
                    </div>
                  </div>
                  <div className={styles.documentActions}>
                    <button
                      className={styles.downloadButton}
                      onClick={() => downloadDocument(doc.id, doc.fileName)}
                    >
                      📥 Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Investment Agreements Section */}
        {finalizedInvestments.length > 0 ? (
          <div className={styles.documentsList}>
            <h3 className={styles.sectionTitle}>Investment Agreements</h3>
            <div className={styles.documentsGrid}>
              {finalizedInvestments.map(investment => {
                const hasPdf = !!investment.documents?.bondAgreementUrl
                return (
                  <div key={investment.id} className={styles.documentCard}>
                    <div className={styles.documentIcon}>📄</div>
                    <div className={styles.documentInfo}>
                      <h4 className={styles.documentTitle}>
                        Bond Agreement - {investment.id.slice(-8)}
                        {hasPdf && <span style={{marginLeft: '8px', fontSize: '12px', color: '#10b981'}}>PDF</span>}
                      </h4>
                      <div className={styles.documentDetails}>
                        <p><strong>Amount:</strong> {formatCurrency(investment.amount)}</p>
                        <p><strong>Account Type:</strong> {investment.accountType?.toUpperCase() || 'N/A'}</p>
                        <p><strong>Payment Frequency:</strong> {investment.paymentFrequency || 'N/A'}</p>
                        <p><strong>Lockup Period:</strong> {investment.lockupPeriod || 'N/A'}</p>
                        <p><strong>Status:</strong> {investment.status?.toUpperCase() || 'N/A'}</p>
                        <p><strong>Submitted:</strong> {formatDateLocale(investment.submittedAt || investment.updatedAt)}</p>
                      </div>
                    </div>
                    <div className={styles.documentActions}>
                      <button
                        className={styles.downloadButton}
                        onClick={() => viewAgreement(investment)}
                      >
                        {hasPdf ? '📄 View PDF' : '📥 Download'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : userDocuments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📄</div>
            <h3 className={styles.emptyTitle}>No Documents Yet</h3>
            <p className={styles.emptyDescription}>
              Documents will appear here once you complete an investment. This includes:
            </p>
            <ul className={styles.documentTypes}>
              <li>Investment Agreements</li>
              <li>Account Statements</li>
              <li>Important Notices</li>
              <li>Compliance Forms</li>
            </ul>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button className={styles.uploadButton}>
            📤 Upload Document
          </button>
          <button className={styles.requestButton}>
            📋 Request Document
          </button>
        </div>
      </div>
    </div>
  )
}
