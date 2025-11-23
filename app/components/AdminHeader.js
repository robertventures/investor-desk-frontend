'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { apiClient } from '../../lib/apiClient'
import styles from './AdminHeader.module.css'

export default function AdminHeader({ onTabChange, activeTab }) {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState(null)
  const [showMobileNav, setShowMobileNav] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const userId = localStorage.getItem('currentUserId')
    if (!userId) {
      router.push('/')
      return
    }

    const loadUser = async () => {
      try {
        const data = await apiClient.getUser(userId)
        if (data && data.success && data.user) {
          setCurrentUser(data.user)
        }
      } catch (e) {
        console.error('Failed to load user data', e)
      }
    }
    loadUser()
  }, [router])

  const handleLogout = async () => {
    try {
      // Clear all browser storage first (immediate feedback)
      if (typeof window !== 'undefined') {
        // Clear our app data
        localStorage.removeItem('currentUserId')
        localStorage.removeItem('signupEmail')
        localStorage.removeItem('currentInvestmentId')
        
        // Also clear sessionStorage to be thorough
        sessionStorage.clear()
      }
      
      // Call logout API to clear cookies with a timeout
      const logoutPromise = apiClient.logout()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Logout timeout')), 3000)
      )
      
      // Race between logout and timeout
      await Promise.race([logoutPromise, timeoutPromise]).catch((error) => {
        console.error('Logout API error (will still redirect):', error)
      })
      
      // Redirect to sign-in page
      router.push('/sign-in')
    } catch (error) {
      console.error('Logout error:', error)
      // Always redirect even if something goes wrong
      router.push('/sign-in')
    }
  }

  const toggleMobileNav = () => {
    setShowMobileNav(prev => !prev)
  }

  const handleNavSelect = (tab) => {
    // Sync tab selection to URL for deep-linkable sections
    try {
      router.push(`/admin?tab=${tab}`)
    } catch {}
    if (typeof onTabChange === 'function') onTabChange(tab)
    setShowMobileNav(false)
  }

  // Close mobile nav when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMobileNav && !event.target.closest(`.${styles.mobileNavWrapper}`) && !event.target.closest(`.${styles.mobileToggle}`)) {
        setShowMobileNav(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMobileNav])

  if (!currentUser) {
    return <div className={styles.loading}>Loading...</div>
  }

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.logo}>
          <Image
            src="/images/logo.png"
            alt="Robert Ventures"
            width={160}
            height={40}
            className={styles.logoImage}
            priority
          />
        </Link>

        <nav className={styles.nav}>
          <button
            onClick={() => handleNavSelect('dashboard')}
            className={`${styles.navItem} ${activeTab === 'dashboard' ? styles.active : ''}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => handleNavSelect('accounts')}
            className={`${styles.navItem} ${activeTab === 'accounts' ? styles.active : ''}`}
          >
            Accounts
          </button>
          <button
            onClick={() => handleNavSelect('distributions')}
            className={`${styles.navItem} ${activeTab === 'distributions' ? styles.active : ''}`}
          >
            Transactions
          </button>
          <button
            onClick={() => handleNavSelect('activity')}
            className={`${styles.navItem} ${activeTab === 'activity' ? styles.active : ''}`}
          >
            Activity
          </button>
          <button
            onClick={() => handleNavSelect('operations')}
            className={`${styles.navItem} ${activeTab === 'operations' ? styles.active : ''}`}
          >
            Operations
          </button>
        </nav>

        <div className={styles.userActions}>
          <button className={styles.navItem} onClick={handleLogout}>Sign Out</button>
          <button className={styles.mobileToggle} onClick={toggleMobileNav} aria-label="Toggle menu">
            ☰
          </button>
        </div>
      </div>

      {showMobileNav && (
        <div className={styles.mobileNavWrapper}>
          <div className={styles.mobileNav}>
            <div className={styles.mobileHeader}>
              <div className={styles.mobileUserName}>{currentUser.firstName} {currentUser.lastName}</div>
              <div className={styles.mobileUserEmail}>{currentUser.email}</div>
            </div>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('dashboard')}>Dashboard</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('accounts')}>Accounts</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('distributions')}>Transactions</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('activity')}>Activity</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('operations')}>Operations</button>
            <div className={styles.mobileDivider}></div>
            <button className={styles.mobileNavItem} onClick={() => { setShowMobileNav(false); handleLogout() }}>Sign Out</button>
          </div>
        </div>
      )}
    </header>
  )
}
