'use client'

import Header from '../components/layout/Header'
import LoginForm from '../components/forms/LoginForm'
import styles from '../page.module.css'

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <Header />
      
      <div className={styles.container}>
        <section className={styles.welcomeSection}>
          <h1 className={styles.welcomeTitle}>Welcome back</h1>
          <p className={styles.welcomeSubtitle}>Log in to your Robert Ventures account</p>
        </section>
        
        <LoginForm />
      </div>
    </main>
  )
}

