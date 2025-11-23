'use client'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { apiClient } from '@/lib/apiClient'
import logger from '@/lib/logger'
import { useUser } from '../contexts/UserContext'
import styles from './DashboardHeader.module.css'

const NAV_ITEMS = [
  { id: 'portfolio', label: 'Dashboard', href: '/dashboard' },
  { id: 'investments', label: 'Investments', href: '/dashboard/investments' },
  { id: 'profile', label: 'Profile', href: '/dashboard/profile' },
  { id: 'documents', label: 'Documents', href: '/dashboard/documents' },
  { id: 'contact', label: 'Contact', href: '/dashboard/contact' }
]

export default function DashboardHeader({ forceActiveView = null }) {
  const router = useRouter()
  const pathname = usePathname()
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

  const handleNavSelect = (href) => {
    router.push(href)
    setShowMobileNav(false)
  }

  const activeView = useMemo(() => {
    if (forceActiveView) return forceActiveView
    const match = NAV_ITEMS.find(item => {
      if (item.href === '/dashboard') {
        return pathname === '/dashboard'
      }
      return pathname.startsWith(item.href)
    })
    return match?.id || 'portfolio'
  }, [pathname, forceActiveView])

  useEffect(() => {
    if (showMobileNav) {
      setShowMobileNav(false)
    }
  }, [pathname])

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
        <Link href="/dashboard" className={styles.logo}>
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
          {NAV_ITEMS.map(item => (
            <Link
              key={item.id}
              href={item.href}
              className={`${styles.navItem} ${activeView === item.id ? styles.active : ''}`}
            >
              {item.label}
            </Link>
          ))}
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
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`${styles.mobileNavItem} ${activeView === item.id ? styles.active : ''}`}
                onClick={() => handleNavSelect(item.href)}
              >
                {item.label}
              </button>
            ))}
            <div className={styles.mobileDivider}></div>
            <button className={styles.mobileNavItem} onClick={() => { 
              setShowMobileNav(false); 
              handleLogout(); 
            }}>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
