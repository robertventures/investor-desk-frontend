'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './InvestmentAdminHeader.module.css';

/**
 * InvestmentAdminHeader
 * 
 * Provides canonical breadcrumb navigation, robust Back action with fallback,
 * and context switching for admin investment detail pages.
 * 
 * @param {string} investmentId - Investment ID (e.g., "INV-10000")
 * @param {string} accountId - User/Account ID
 * @param {string} accountName - User's display name
 * @param {string} transactionsHref - Link to transactions view (optional)
 */
export default function InvestmentAdminHeader({ 
  investmentId, 
  accountId, 
  accountName,
  transactionsHref 
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origin = searchParams?.get('origin');

  const handleBack = () => {
    // Strategy: Prefer browser history, but fall back intelligently
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    
    // If no history, use origin or default to account page
    if (origin === 'transactions' && transactionsHref) {
      router.push(transactionsHref);
      return;
    }
    
    // Default: go to account page
    router.push(`/admin/users/${accountId}`);
  };

  return (
    <header className={styles.header}>
      {/* Back Button */}
      <button 
        onClick={handleBack} 
        className={styles.backButton}
        title="Go back"
      >
        ← Back
      </button>

      {/* Canonical Breadcrumb */}
      <nav className={styles.breadcrumb}>
        <Link href="/admin?tab=accounts" className={styles.breadcrumbLink}>
          Accounts
        </Link>
        <span className={styles.breadcrumbSeparator}>/</span>
        <Link 
          href={`/admin/users/${accountId}`} 
          className={styles.breadcrumbLink}
        >
          {accountName}
        </Link>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>Investment {investmentId}</span>
      </nav>

      {/* Context Actions */}
      <div className={styles.actions}>
        <Link 
          href={`/admin/users/${accountId}`} 
          className={styles.actionLink}
        >
          View Account
        </Link>
        {transactionsHref && (
          <Link 
            href={transactionsHref} 
            className={styles.actionLink}
          >
            View in Transactions
          </Link>
        )}
      </div>
    </header>
  );
}

