import { useMemo } from 'react'
import { calculateInvestmentValue } from '../../../lib/investmentCalculations.js'

/**
 * Custom hook to calculate dashboard metrics from users data
 */
export function useAdminMetrics(users, withdrawals = [], pendingPayouts = [], appTime = null) {
  const nonAdminUsers = useMemo(() => 
    (users || []).filter(u => !u.isAdmin), 
    [users]
  )

  const metrics = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const currentTime = appTime || now
    
    let totalAUM = 0
    let totalAmountOwed = 0
    let pendingCapital = 0
    let totalAmountRaised = 0
    let pendingInvestmentsCount = 0
    let activeInvestmentsCount = 0
    let totalInvestmentsCount = 0
    let newAccountsCount = 0
    let unverifiedAccountsCount = 0
    let recentInvestments = []
    let recentSignups = []
    
    nonAdminUsers.forEach(user => {
      // New accounts (last 30 days)
      if (user.createdAt && new Date(user.createdAt) > thirtyDaysAgo) {
        newAccountsCount++
        recentSignups.push({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`,
          email: user.email,
          createdAt: user.createdAt
        })
      }
      
      // Unverified accounts
      if (!user.isVerified) {
        unverifiedAccountsCount++
      }
      
      // Process investments
      (user.investments || []).forEach(inv => {
        totalInvestmentsCount++
        const amount = Number(inv.amount) || 0
        
        if (['active', 'withdrawal_notice', 'withdrawn'].includes(inv.status)) {
          totalAmountRaised += amount
        }

        if (inv.status === 'active' || inv.status === 'withdrawal_notice') {
          totalAUM += amount
          activeInvestmentsCount++
          
          // Calculate current value with compound interest for total amount owed
          const calculation = calculateInvestmentValue(inv, currentTime)
          totalAmountOwed += calculation.currentValue
        } else if (inv.status === 'pending') {
          pendingCapital += amount
          pendingInvestmentsCount++
        }
        
        // Recent investments
        recentInvestments.push({
          id: inv.id,
          userId: user.id,
          userName: `${user.firstName || ''} ${user.lastName || ''}`,
          amount: amount,
          status: inv.status,
          createdAt: inv.createdAt
        })
      })
    })
    
    // Sort and limit recent items
    recentInvestments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    recentInvestments = recentInvestments.slice(0, 10)
    
    recentSignups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    recentSignups = recentSignups.slice(0, 5)
    
    const avgInvestmentSize = activeInvestmentsCount > 0 
      ? totalAUM / activeInvestmentsCount 
      : 0
    
    const investorsCount = nonAdminUsers.filter(u => 
      (u.investments || []).some(inv => inv.status === 'active')
    ).length

    return {
      // Primary metrics
      totalAUM,
      totalAmountRaised,
      totalAmountOwed,
      totalAccounts: nonAdminUsers.length,
      investorsCount,
      activeInvestmentsCount,
      
      // Secondary metrics
      pendingCapital,
      pendingInvestmentsCount,
      totalInvestmentsCount,
      newAccountsCount,
      unverifiedAccountsCount,
      avgInvestmentSize,
      
      // Action items
      pendingWithdrawalsCount: withdrawals.filter(w => w.status === 'pending').length,
      pendingPayoutsCount: pendingPayouts.length,
      
      // Recent activity
      recentInvestments,
      recentSignups
    }
  }, [nonAdminUsers, withdrawals, pendingPayouts, appTime])

  return metrics
}

