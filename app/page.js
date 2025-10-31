'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../lib/apiClient'
import Header from './components/Header'
import AccountCreationForm from './components/AccountCreationForm'
import styles from './page.module.css'

export default function Home() {
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  
  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      try {
        const response = await apiClient.getCurrentUser()
        if (response && response.success && response.user) {
          // User is already logged in, redirect to dashboard
          if (response.user.isAdmin) {
            router.push('/admin')
          } else {
            router.push('/dashboard')
          }
        } else {
          // Not logged in, show signup form
          setIsCheckingAuth(false)
        }
      } catch (error) {
        // Error checking auth, assume not logged in
        setIsCheckingAuth(false)
      }
    }
    
    checkAuth()
  }, [router])
  
  // Show nothing while checking auth to avoid flash
  if (isCheckingAuth) {
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
