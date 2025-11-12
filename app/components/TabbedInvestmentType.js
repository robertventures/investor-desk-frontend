'use client'
import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import styles from './TabbedInvestmentType.module.css'

const options = [
  { key: 'individual', label: 'Individual' },
  { key: 'joint', label: 'Joint' },
  { key: 'entity', label: 'Entity' },
  { key: 'ira', label: 'IRA' }
]

export default function TabbedInvestmentType({ onCompleted, showContinueButton = true, autoSaveOnSelect = false, onChange, selectedValue, lockedAccountType }) {
  const [selected, setSelected] = useState(selectedValue || 'individual')
  const [isSaving, setIsSaving] = useState(false)

  // Optionally we could warn if session is missing, but keep the button state as Continue
  useEffect(() => {
    // no-op
  }, [])

  useEffect(() => {
    if (selectedValue) setSelected(selectedValue)
  }, [selectedValue])

  const handleSelect = async (key) => {
    if (lockedAccountType && key !== lockedAccountType) return
    setSelected(key)
    if (typeof onChange === 'function') onChange(key)

    // Save a local draft fallback for resume scenarios
    try {
      if (typeof window !== 'undefined') {
        const invId = localStorage.getItem('currentInvestmentId')
        const storageKey = invId ? `investment_${invId}_accountType` : 'investment_draft_accountType'
        localStorage.setItem(storageKey, key)
      }
    } catch {}

    // Don't auto-save to backend on select unless explicitly enabled
    if (!autoSaveOnSelect) return
    
    // If auto-save is enabled, update the profile immediately
    try {
      if (typeof window === 'undefined') return
      const userId = localStorage.getItem('currentUserId')
      if (!userId) return
      
      setIsSaving(true)
      await apiClient.patchUserProfile({ accountType: key })
      console.log(`✅ Auto-saved account type to profile: ${key}`)
      if (typeof onCompleted === 'function') onCompleted(key)
    } catch (e) {
      // Silently ignore if profile is locked or backend rejects
      console.log('Account type auto-save skipped/failed:', e?.message || e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleContinue = async () => {
    if (typeof onCompleted === 'function') {
      onCompleted(selected)
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.grid}>
        {options.map(opt => {
          const isLockedOther = Boolean(lockedAccountType && opt.key !== lockedAccountType)
          return (
            <button
              key={opt.key}
              type="button"
              className={`${styles.card} ${selected === opt.key ? styles.selected : ''} ${isLockedOther ? styles.disabled : ''}`}
              onClick={() => handleSelect(opt.key)}
              disabled={isLockedOther}
              aria-disabled={isLockedOther}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {showContinueButton && (
        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={handleContinue} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  )
}


