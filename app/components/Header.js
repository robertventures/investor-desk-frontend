'use client'

import Link from 'next/link'
import Image from 'next/image'
import styles from './Header.module.css'

export default function Header({ showBackButton = false, backLink = '/dashboard', backText = 'Dashboard' }) {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {showBackButton && (
          <Link href={backLink} className={styles.backButton}>
            <svg className={styles.backIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span>{backText}</span>
          </Link>
        )}
        <div className={styles.logo}>
          <Image
            src="/images/logo.png"
            alt="Robert Ventures"
            width={192}
            height={48}
            className={styles.logoImage}
            priority
          />
        </div>
      </div>
    </header>
  )
}
