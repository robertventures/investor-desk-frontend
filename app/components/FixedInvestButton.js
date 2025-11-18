'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../contexts/UserContext'
import { getInvestmentTypeLockInfo } from '@/lib/investmentAccess'
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

  const lockedTypeLabel = lockInfo.lockedAccountType ? (ACCOUNT_TYPE_LABELS[lockInfo.lockedAccountType] || lockInfo.lockedAccountType) : null

  const handleMakeInvestment = () => {
    if (typeof window !== 'undefined') {
      try {
        if (lockInfo.lockingStatus === 'draft' && lockInfo.investmentId) {
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

  const shouldHide = userData?.isAdmin

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted || shouldHide) return null

  return (
    <div className={styles.fixedButtonContainer}>
      <button onClick={handleMakeInvestment} className={styles.investButton}>
        Make an Investment
      </button>
    </div>
  )
}
