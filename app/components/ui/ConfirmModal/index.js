"use client"
import { useEffect } from 'react'
import styles from './ConfirmModal.module.css'

/**
 * ConfirmModal - A styled confirmation modal for delete/destructive actions
 */
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Delete",
  cancelText = "Cancel",
  isLoading = false,
  variant = "danger"
}) {
  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, isLoading, onClose])

  if (!isOpen) return null

  const getIcon = () => {
    if (variant === 'danger') return '🗑️'
    if (variant === 'warning') return '⚠️'
    return 'ℹ️'
  }

  const getIconClass = () => {
    if (variant === 'danger') return styles.iconDanger
    if (variant === 'warning') return styles.iconWarning
    return styles.iconInfo
  }

  return (
    <div className={styles.overlay} onClick={!isLoading ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.content}>
          <div className={`${styles.icon} ${getIconClass()}`}>
            {getIcon()}
          </div>
          
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.message}>{message}</p>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            className={`${styles.confirmButton} ${styles[variant]}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner}></span>
                Deleting...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}


