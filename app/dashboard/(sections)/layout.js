import DashboardHeader from '@/app/components/DashboardHeader'
import FixedInvestButton from '@/app/components/FixedInvestButton'
import DashboardShell from '../components/DashboardShell'
import styles from '../page.module.css'

export default function DashboardSectionsLayout({ children }) {
  return (
    <DashboardShell>
      <div className={styles.main}>
        <DashboardHeader />
        <div className={styles.container}>
          {children}
        </div>
        <FixedInvestButton />
      </div>
    </DashboardShell>
  )
}

