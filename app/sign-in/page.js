'use client'

import Header from '../components/Header'
import SignInForm from '../components/SignInForm'
import styles from '../page.module.css'

export default function SignInPage() {
  return (
    <main className={styles.main}>
      <Header />
      
      <div className={styles.container}>
        <section className={styles.welcomeSection}>
          <h1 className={styles.welcomeTitle}>Welcome back</h1>
          <p className={styles.welcomeSubtitle}>Sign in to your Robert Ventures account</p>
        </section>
        
        <SignInForm />
      </div>
    </main>
  )
}
