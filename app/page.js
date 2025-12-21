'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from './components/layout/Header'
import AccountCreationForm from './components/forms/AccountCreationForm'
import styles from './page.module.css'
import { useUser } from './contexts/UserContext'

export default function Home() {
  const router = useRouter()
  const { userData, loading } = useUser()
  
  useEffect(() => {
    // DEBUG LOGS
    console.log('[Home] Page loaded')
    console.log('[Home] Loading:', loading)
    console.log('[Home] User data:', userData ? 'exists' : 'null')
    
    if (loading) return
    if (userData) {
      console.log('[Home] User authenticated, redirecting...')
      if (userData.isAdmin) router.push('/admin')
      else router.push('/dashboard')
    }
  }, [router, userData, loading])
  
  // Show nothing while checking auth to avoid flash
  if (loading) {
    return null
  }
  
  return (
    <main className={styles.main}>
      <Header />
      <div className={styles.container}>
        <section className={styles.welcomeSection}>
          <h1 className={styles.welcomeTitle}>Create your account</h1>
          <p className={styles.welcomeSubtitle}>Start by creating your profile, then set your investment.</p>
        </section>
        
        <AccountCreationForm />
      </div>
    </main>
  )
}
