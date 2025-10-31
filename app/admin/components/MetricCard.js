import styles from './MetricCard.module.css'

/**
 * Reusable metric card component for displaying key metrics
 */
export default function MetricCard({ label, value, subtext, className, onClick }) {
  return (
    <div 
      className={`${styles.metricCard} ${className || ''} ${onClick ? styles.clickable : ''}`}
      onClick={onClick}
    >
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
      {subtext && <div className={styles.metricSubtext}>{subtext}</div>}
    </div>
  )
}

