import styles from './SectionCard.module.css'

/**
 * Container card for dashboard sections
 */
export default function SectionCard({ title, children, className, actions }) {
  return (
    <div className={`${styles.sectionCard} ${className || ''}`}>
      {title && (
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {actions && <div className={styles.sectionActions}>{actions}</div>}
        </div>
      )}
      <div className={styles.sectionContent}>
        {children}
      </div>
    </div>
  )
}

