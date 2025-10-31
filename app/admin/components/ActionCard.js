import styles from './ActionCard.module.css'

/**
 * Action card for items requiring attention
 */
export default function ActionCard({ value, label, variant = 'default', onClick }) {
  return (
    <div 
      className={`${styles.actionCard} ${styles[variant]}`}
      onClick={onClick}
    >
      <div className={styles.actionValue}>{value}</div>
      <div className={styles.actionLabel}>{label}</div>
    </div>
  )
}

