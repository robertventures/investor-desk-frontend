'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './InvestmentDetailsHeader.module.css'

export default function InvestmentDetailsHeader({ investmentId }) {
  const router = useRouter()
  const [investmentData, setInvestmentData] = useState(null)

  useEffect(() => {
    const loadInvestment = async () => {
      const userId = localStorage.getItem('currentUserId')
      if (!userId) {
        router.push('/')
        return
      }

      try {
        const data = await apiClient.getCurrentUser()
        if (data.success && data.user) {
          const investment = data.user.investments?.find(inv => inv.id === investmentId)
          if (investment) {
            setInvestmentData(investment)
          } else {
            router.push('/dashboard')
          }
        }
      } catch (e) {
        console.error('Failed to load investment data', e)
        router.push('/dashboard')
      }
    }
    loadInvestment()
  }, [investmentId, router])

  if (!investmentData) {
    return <div className={styles.loading}>Loading...</div>
  }

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.leftSection}>
          <button 
            onClick={() => router.push('/dashboard')} 
            className={styles.backButton}
          >
            ← Back to Portfolio
          </button>
          <div className={styles.titleSection}>
            <div className={styles.icon}>📈</div>
            <h1 className={styles.title}>INVESTMENT DETAILS</h1>
          </div>
        </div>
      </div>
    </header>
  )
}
