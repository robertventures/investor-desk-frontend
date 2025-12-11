"use client"
import { useEffect } from 'react'
import styles from './ConfirmModal.module.css'

/**
 * ConfirmModal - A simple confirmation modal for delete/destructive actions
 * 
 * @param {boolean} isOpen - Whether the modal is open
 * @param {function} onClose - Callback when modal is closed
 * @param {function} onConfirm - Callback when action is confirmed
 * @param {string} title - Modal title
 * @param {string} message - Modal message/description
 * @param {string} confirmText - Text for confirm button (default: "Delete")
 * @param {string} cancelText - Text for cancel button (default: "Cancel")
 * @param {boolean} isLoading - Whether the action is in progress
 * @param {boolean} isSuccess - Whether the action completed successfully
 * @param {string} successMessage - Message to show on success
 * @param {string} variant - "danger" | "warning" | "info" (default: "danger")
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
  isSuccess = false,
  successMessage = "Action completed successfully",
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
    if (isSuccess) return '✓'
    if (variant === 'danger') return '🗑️'
    if (variant === 'warning') return '⚠️'
    return 'ℹ️'
  }

  const getIconClass = () => {
    if (isSuccess) return styles.iconSuccess
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
          
          <h3 className={styles.title}>
            {isSuccess ? 'Success' : title}
          </h3>
          
          <p className={styles.message}>
            {isSuccess ? successMessage : message}
          </p>
        </div>

        <div className={styles.actions}>
          {isSuccess ? (
            <button
              className={styles.closeButton}
              onClick={onClose}
            >
              Close
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
