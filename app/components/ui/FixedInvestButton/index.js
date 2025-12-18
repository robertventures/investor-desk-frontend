'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../../../contexts/UserContext'
import { getInvestmentTypeLockInfo } from '@/lib/investmentAccess'
import { INVESTMENTS_PAUSED } from '@/lib/featureFlags'
import styles from './FixedInvestButton.module.css'

const ACCOUNT_TYPE_LABELS = {
  individual: 'Individual',
  joint: 'Joint',
  entity: 'Entity',
  sdira: 'SDIRA'
}

export default function FixedInvestButton() {
  const router = useRouter()
  const { userData } = useUser()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const lockInfo = useMemo(
    () => (userData ? getInvestmentTypeLockInfo(userData) : { lockedAccountType: null, lockingStatus: null, investmentId: null }),
    [userData]
  )

  // Check if user has a pending investment
  const hasPendingInvestment = useMemo(() => {
    const investments = Array.isArray(userData?.investments) ? userData.investments : []
    return investments.some(inv => inv.status === 'pending')
  }, [userData])

  // Check if user has a draft investment (for auto-resume)
  const draftInvestment = useMemo(() => {
    const investments = Array.isArray(userData?.investments) ? userData.investments : []
    return investments.find(inv => inv.status === 'draft')
  }, [userData])

  const lockedTypeLabel = lockInfo.lockedAccountType ? (ACCOUNT_TYPE_LABELS[lockInfo.lockedAccountType] || lockInfo.lockedAccountType) : null

  const handleMakeInvestment = () => {
    if (typeof window !== 'undefined') {
      try {
        // Auto-resume draft investment if exists
        if (draftInvestment?.id) {
          localStorage.setItem('currentInvestmentId', draftInvestment.id)
        } else if (lockInfo.lockingStatus === 'draft' && lockInfo.investmentId) {
          localStorage.setItem('currentInvestmentId', lockInfo.investmentId)
        } else {
          localStorage.removeItem('currentInvestmentId')
        }
      } catch {
        // no-op
      }
    }
    router.push('/investment?context=new')
  }

  // Hide for admins or when investments are paused (SEC approval pending)
  const shouldHide = userData?.isAdmin || INVESTMENTS_PAUSED

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted || shouldHide) return null

  // If user has a pending investment, show disabled state with tooltip
  if (hasPendingInvestment) {
    return (
      <div className={styles.fixedButtonContainer}>
        <div className={styles.disabledButtonWrapper}>
          <button disabled className={`${styles.investButton} ${styles.disabled}`}>
            Make an Investment
          </button>
          <span className={styles.tooltip}>You have a pending investment</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.fixedButtonContainer}>
      <button onClick={handleMakeInvestment} className={styles.investButton}>
        {draftInvestment ? 'Continue Investment' : 'Make an Investment'}
      </button>
    </div>
  )
}
