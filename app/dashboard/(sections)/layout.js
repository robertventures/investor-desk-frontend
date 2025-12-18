import DashboardHeader from '@/app/components/layout/DashboardHeader'
import FixedInvestButton from '@/app/components/ui/FixedInvestButton'
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

