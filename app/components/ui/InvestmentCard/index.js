'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import { formatCurrency } from '../../../../lib/investmentCalculations'
import ConfirmModal from '../ConfirmModal'
import styles from './InvestmentCard.module.css'

export default function InvestmentCard({ investment, onDelete }) {
  const router = useRouter()
  const inv = investment
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleClick = () => {
    if (inv?.status?.status === 'draft') {
      try { localStorage.setItem('currentInvestmentId', inv.id) } catch {}
      router.push('/investment')
      return
    }
    router.push(`/investment-details/${inv.id}`)
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    try {
      const userId = localStorage.getItem('currentUserId')
      if (!userId) {
        setIsDeleting(false)
        setShowDeleteModal(false)
        return
      }
      const result = await apiClient.deleteInvestment(userId, inv.id)
      if (result.success) {
        const currentInvestmentId = localStorage.getItem('currentInvestmentId')
        if (currentInvestmentId === String(inv.id)) {
          localStorage.removeItem('currentInvestmentId')
        }
        setShowDeleteModal(false)
        if (onDelete) onDelete()
      } else {
        setIsDeleting(false)
        setShowDeleteModal(false)
      }
    } catch (err) {
      console.error('Failed to delete draft:', err)
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  return (
    <>
      <div className={styles.investmentCard} onClick={handleClick}>
        <div className={styles.cardTop}>
          <div className={styles.cardLeft}>
            <div className={styles.amountLabel}>Investment #{String(inv.id).slice(-5)}</div>
            <div className={styles.investmentAmount}>{formatCurrency(inv.amount)}</div>
            <div className={styles.investmentType}>
              {inv.lockupPeriod === '3-year' ? '3Y' : '1Y'} • {inv.paymentFrequency === 'monthly' ? 'Monthly' : 'Compound'}
            </div>
          </div>
          <span className={`${styles.statusBadge} ${inv.status.status === 'withdrawn' ? styles.withdrawn : inv.status.status === 'draft' ? styles.draft : (inv.status.isLocked ? styles.locked : styles.available)}`}>
            {inv.status.statusLabel === 'Available for Withdrawal' ? 'Available' : inv.status.statusLabel}
          </span>
        </div>
        <div className={styles.cardMiddle}>
          <div className={styles.compactMetric}>
            <span className={styles.compactLabel}>Current Value</span>
            <span className={styles.compactValue}>{formatCurrency(inv.calculation.currentValue)}</span>
          </div>
          <div className={styles.compactMetric}>
            <span className={styles.compactLabel}>Earnings</span>
            <span className={styles.compactValue}>{formatCurrency(inv.calculation.totalEarnings)}</span>
          </div>
        </div>
        <div className={styles.cardActions}>
          {inv.status.status === 'draft' && (
            <button className={styles.deleteDraftBtn} onClick={handleDeleteClick}>
              Delete Draft
            </button>
          )}
          <span className={styles.viewDetails}>
            {inv.status.status === 'draft' ? 'Resume Draft →' : 'View Details →'}
          </span>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Draft Investment"
        message="Are you sure you want to delete this draft? This action cannot be undone."
        confirmText="Delete Draft"
        cancelText="Cancel"
        isLoading={isDeleting}
        variant="danger"
      />
    </>
  )
}
