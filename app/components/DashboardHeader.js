'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { apiClient } from '@/lib/apiClient'
import logger from '@/lib/logger'
import { useUser } from '../contexts/UserContext'
import styles from './DashboardHeader.module.css'

export default function DashboardHeader({ onViewChange, activeView }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const { userData } = useUser()
  const [showMobileNav, setShowMobileNav] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleMakeInvestment = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('currentInvestmentId')
      }
    } catch {}
    router.push('/investment?context=new')
  }

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
        logger.error('Logout API error (will still redirect):', error)
      })
      
      // Redirect to sign-in page
      router.push('/sign-in')
    } catch (error) {
      logger.error('Logout error:', error)
      // Always redirect even if something goes wrong
      router.push('/sign-in')
    }
  }

  const toggleMobileNav = () => {
    setShowMobileNav(prev => !prev)
  }

  const handleNavSelect = (view) => {
    onViewChange(view)
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

  // Prevent hydration mismatch
  if (!mounted || !userData) {
    return <div className={styles.loading}>Loading...</div>
  }

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <Image
            src="/images/logo.png"
            alt="Robert Ventures"
            width={160}
            height={40}
            className={styles.logoImage}
            priority
          />
        </div>
        
        <nav className={styles.nav}>
          <button 
            onClick={() => onViewChange('portfolio')} 
            className={`${styles.navItem} ${activeView === 'portfolio' ? styles.active : ''}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => onViewChange('investments')} 
            className={`${styles.navItem} ${activeView === 'investments' ? styles.active : ''}`}
          >
            Investments
          </button>
          <button 
            onClick={() => onViewChange('profile')} 
            className={`${styles.navItem} ${activeView === 'profile' ? styles.active : ''}`}
          >
            Profile
          </button>
          <button 
            onClick={() => onViewChange('documents')} 
            className={`${styles.navItem} ${activeView === 'documents' ? styles.active : ''}`}
          >
            Documents
          </button>
          <button
            onClick={() => onViewChange('contact')}
            className={`${styles.navItem} ${activeView === 'contact' ? styles.active : ''}`}
          >
            Contact
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
              <div className={styles.mobileUserName}>{userData.firstName} {userData.lastName}</div>
              <div className={styles.mobileUserEmail}>{userData.email}</div>
            </div>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('portfolio')}>Dashboard</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('investments')}>Investments</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('profile')}>Profile</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('documents')}>Documents</button>
            <button className={styles.mobileNavItem} onClick={() => handleNavSelect('contact')}>Contact</button>
            <button className={styles.mobileNavItem} onClick={() => { 
              setShowMobileNav(false); 
              try { 
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('currentInvestmentId')
                }
              } catch {}
              router.push('/investment?context=new') 
            }}>Make an Investment</button>
            <div className={styles.mobileDivider}></div>
            <button className={styles.mobileNavItem} onClick={() => { 
              setShowMobileNav(false); 
              handleLogout(); 
            }}>Sign Out</button>
          </div>
        </div>
      )}
    </header>
  )
}
