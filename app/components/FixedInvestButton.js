'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import styles from './FixedInvestButton.module.css'

export default function FixedInvestButton() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [hide, setHide] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    
    const init = async () => {
      const userId = localStorage.getItem('currentUserId')
      if (!userId) return
      try {
        const data = await apiClient.getUser(userId)
        if (data.success && data.user && data.user.isAdmin) {
          setHide(true)
        }
      } catch {}
    }
    init()
  }, [])

  const handleMakeInvestment = () => {
    try {
      // Force a fresh draft on new investment flow
      localStorage.removeItem('currentInvestmentId')
    } catch {}
    router.push('/investment?context=new')
  }

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted || hide) return null

  return (
    <div className={styles.fixedButtonContainer}>
      <button onClick={handleMakeInvestment} className={styles.investButton}>
        Make an Investment
      </button>
    </div>
  )
}
