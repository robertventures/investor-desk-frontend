'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import styles from './TransactionsTable.module.css'

export default function TransactionsTable() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('purchases')
  const [userData, setUserData] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [earnings, setEarnings] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [appTime, setAppTime] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const loadData = async () => {
      const userId = localStorage.getItem('currentUserId')
      if (!userId) return

      try {
        // Fetch user data first
        const data = await apiClient.getUser(userId)
        
        // Get current app time to ensure earnings/payouts align with time machine - only if user is admin
        let currentAppTime = new Date().toISOString()
        if (data?.user?.isAdmin) {
          try {
            const timeData = await apiClient.getAppTime()
            currentAppTime = timeData?.success ? timeData.appTime : currentAppTime
          } catch (err) {
            console.warn('Failed to get app time, using system time:', err)
          }
        }
        setAppTime(currentAppTime)

        // Backfill persistent transactions prior to loading (admin only)
        if (data?.user?.isAdmin) {
          try {
            await apiClient.request('/api/migrate-transactions', { method: 'POST' })
          } catch (err) {
            console.warn('Failed to migrate transactions:', err)
          }
        }

        if (data && data.success && data.user) {
          setUserData(data.user)
          const investments = data.user.investments || []
          const investmentTransactions = investments.flatMap(inv => {
            const txs = Array.isArray(inv.transactions) ? inv.transactions : []
            return txs.map(tx => ({
              ...tx,
              investmentId: inv.id,
              lockupPeriod: inv.lockupPeriod,
              paymentFrequency: inv.paymentFrequency,
              investmentAmount: inv.amount || 0,
              investorName: `${data.user.firstName} ${data.user.lastName}`.trim()
            }))
          })
          
          // Convert investments to transaction format (for purchases tab)
          const transactionData = investments.map(inv => {
            // Calculate actual earnings for this investment
            let actualEarnings = 0
            // Only accrue/display earnings for confirmed investments from confirmedAt
            const isConfirmed = inv.status === 'active'
            if (isConfirmed && inv.amount && inv.paymentFrequency && inv.lockupPeriod && inv.confirmedAt) {
              const startDate = new Date(inv.confirmedAt)
              // Accrue starting the day AFTER confirmation
              startDate.setDate(startDate.getDate() + 1)
              const now = new Date(currentAppTime)
              const monthsElapsed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24 * 30.44))
              
              if (inv.paymentFrequency === 'monthly') {
                const annualRate = inv.lockupPeriod === '1-year' ? 0.08 : 0.10
                const monthlyRate = annualRate / 12
                const monthlyEarnings = inv.amount * monthlyRate
                actualEarnings = Math.max(0, monthlyEarnings * monthsElapsed)
              } else if (inv.paymentFrequency === 'compounding') {
                const annualRate = inv.lockupPeriod === '1-year' ? 0.08 : 0.10
                const monthlyRate = annualRate / 12
                actualEarnings = Math.max(0, inv.amount * Math.pow(1 + monthlyRate, monthsElapsed) - inv.amount)
              }
            }
            
            return {
              id: inv.id,
              recordId: inv.id.slice(-3).toUpperCase() + 'D',
              transactionDate: inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '-',
              type: 'Investment',
              offeringType: 'S1',
              associatedTo: `${data.user.firstName} ${data.user.lastName}`,
              status: inv.status ? inv.status[0].toUpperCase() + inv.status.slice(1) : 'Pending',
              amount: inv.amount || 0,
              bonds: inv.bonds || 0,
              rate: inv.lockupPeriod === '1-year' ? '8.00%' : '10.00%',
              term: inv.lockupPeriod === '1-year' ? '1' : '3',
              isCompounded: inv.paymentFrequency === 'compounding' ? 'Yes' : 'No',
              maturityDate: '-',
              ytdEarned: `$${actualEarnings.toFixed(2)}`,
              total: `$${actualEarnings.toFixed(2)}`
            }
          })
          
          // Build earnings tab from persisted monthly_distribution events
          const earningsData = investmentTransactions
            .filter(tx => tx.type === 'distribution')
            .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
            .map(ev => ({
              id: ev.id,
              recordId: `${String(ev.investmentId).slice(-3).toUpperCase()}E${String(ev.monthIndex || 0).toString().padStart(2, '0')}`,
              transactionDate: ev.date ? new Date(ev.date).toLocaleDateString() : '-',
              type: 'Distribution',
              offeringType: 'S1',
              associatedTo: `${data.user.firstName} ${data.user.lastName}`,
              status: ev.status ? ev.status[0].toUpperCase() + ev.status.slice(1) : 'Pending',
              amount: ev.amount || 0,
              bonds: 0,
              rate: ev.lockupPeriod === '1-year' ? '8.00%' : '10.00%',
              term: ev.lockupPeriod === '1-year' ? '1' : '3',
              isCompounded: 'No',
              maturityDate: '-',
              ytdEarned: `$${Number(ev.amount || 0).toFixed(2)}`,
              total: `$${Number(ev.amount || 0).toFixed(2)}`
            }))

          // Fetch withdrawals for this user and include them
          const wdRes = await fetch(`/api/withdrawals?userId=${userId}`)
          const wdData = await wdRes.json()
          const withdrawalRecords = (wdData.success ? wdData.withdrawals : []).map(wd => ({
            id: wd.id,
            recordId: wd.id.slice(-3).toUpperCase() + 'W',
            transactionDate: wd.requestedAt ? new Date(wd.requestedAt).toLocaleDateString() : '-',
            type: 'Withdrawal Request',
            offeringType: 'S1',
            associatedTo: `${data.user.firstName} ${data.user.lastName}`,
            status: wd.status ? wd.status[0].toUpperCase() + wd.status.slice(1) : 'Pending',
            amount: wd.amount || 0,
            bonds: wd.investment?.originalAmount ? Math.round((wd.investment.originalAmount / 10)) : 0,
            rate: wd.investment?.lockupPeriod === '1-year' ? '8.00%' : '10.00%',
            term: wd.investment?.lockupPeriod === '1-year' ? '1' : '3',
            isCompounded: wd.investment?.paymentFrequency === 'compounding' ? 'Yes' : 'No',
            maturityDate: wd.investment?.lockupEndDate ? new Date(wd.investment.lockupEndDate).toLocaleDateString() : '-',
            ytdEarned: `$${(wd.earningsAmount || 0).toFixed(2)}`,
            total: `$${(wd.amount || 0).toFixed(2)}`
          }))
          
          setTransactions(transactionData)
          setEarnings(earningsData)
          setWithdrawals(withdrawalRecords)
        }
      } catch (e) {
        console.error('Failed to load transaction data', e)
      }
    }
    loadData()
  }, [])

  if (!userData) {
    return <div className={styles.loading}>Loading transactions...</div>
  }

  return (
    <div className={styles.transactionsSection}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h2 className={styles.title}>YOUR TRANSACTIONS</h2>
          <p className={styles.subtitle}>
            For specific details including earnings and bank information for each investment select the Details link.
          </p>
        </div>
      </div>
      
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'purchases' ? styles.active : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          🛒 PURCHASES
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'earnings' ? styles.active : ''}`}
          onClick={() => setActiveTab('earnings')}
        >
          💰 EARNINGS
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'withdrawals' ? styles.active : ''}`}
          onClick={() => setActiveTab('withdrawals')}
        >
          🏦 WITHDRAWALS
        </button>
      </div>
      
      {activeTab === 'earnings' && earnings.length === 0 ? (
        <div className={styles.emptyEarningsState}>
          <div className={styles.emptyEarningsIcon}>🤲</div>
          <p className={styles.emptyEarningsText}>
            Once you start receiving distributions, your earnings will appear here.
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>DETAILS</th>
                <th>RECORD ID</th>
                <th>TRANSACTION DATE</th>
                <th>TYPE</th>
                <th>OFFERING TYPE</th>
                <th>ASSOCIATED TO</th>
                <th>STATUS</th>
                <th>AMOUNT</th>
                <th>BONDS</th>
                <th>RATE</th>
                <th>TERM</th>
                <th>IS COMPOUNDED?</th>
                <th>MATURITY DATE</th>
                <th>YTD EARNED</th>
                <th>TOTAL</th>
                <th>AGREEMENT</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'purchases' ? transactions : activeTab === 'earnings' ? earnings : withdrawals).length === 0 ? (
                <tr>
                  <td colSpan="16" className={styles.noData}>
                    No {activeTab} found
                  </td>
                </tr>
              ) : (
                (activeTab === 'purchases' ? transactions : activeTab === 'earnings' ? earnings : withdrawals).map((tx, index) => (
                  <tr key={tx.id}>
                    <td>
                      {activeTab === 'withdrawals' ? (
                        <span className={styles.detailsLink} style={{ opacity: 0.6, cursor: 'default' }}>—</span>
                      ) : (
                        <button 
                          onClick={() => router.push(`/investment-details/${tx.id}`)}
                          className={styles.detailsLink}
                        >
                          Details
                        </button>
                      )}
                    </td>
                    <td>{tx.recordId}</td>
                    <td>{tx.transactionDate}</td>
                    <td>{tx.type}</td>
                    <td>{tx.offeringType}</td>
                    <td>{tx.associatedTo}</td>
                    <td>
                      {(() => {
                        const isGreen = tx.status === 'Completed' || tx.status === 'Approved' || tx.status === 'Invested' || tx.status === 'Confirmed'
                        return (
                          <span className={`${styles.status} ${isGreen ? styles.completed : styles.pending}`}>
                            {tx.status}
                          </span>
                        )
                      })()}
                    </td>
                    <td className={styles.amount}>${tx.amount.toLocaleString()}</td>
                    <td>{tx.bonds}</td>
                    <td>{tx.rate}</td>
                    <td>{tx.term}</td>
                    <td>{tx.isCompounded}</td>
                    <td>{tx.maturityDate}</td>
                    <td>{tx.ytdEarned}</td>
                    <td>{tx.total}</td>
                    <td>
                      <div className={styles.agreementActions}>
                        <button className={styles.actionButton}>📥</button>
                        <button className={styles.actionButton}>👁️</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {activeTab === 'earnings' && earnings.length === 0 ? null : (
        <div className={styles.pagination}>
          <div className={styles.paginationInfo}>
            Showing 1 - {(activeTab === 'purchases' ? transactions : activeTab === 'earnings' ? earnings : withdrawals).length} of {(activeTab === 'purchases' ? transactions : activeTab === 'earnings' ? earnings : withdrawals).length}
          </div>
          <div className={styles.paginationControls}>
            <button className={styles.paginationButton} disabled>←</button>
            <button className={`${styles.paginationButton} ${styles.active}`}>1</button>
            <button className={styles.paginationButton} disabled>→</button>
          </div>
        </div>
      )}
    </div>
  )
}
