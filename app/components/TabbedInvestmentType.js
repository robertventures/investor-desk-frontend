'use client'
import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import styles from './TabbedInvestmentType.module.css'

const options = [
  { key: 'individual', label: 'Individual' },
  { key: 'joint', label: 'Joint' },
  { key: 'entity', label: 'Entity' },
  { key: 'sdira', label: 'SDIRA' }
]

export default function TabbedInvestmentType({ onCompleted, showContinueButton = true, autoSaveOnSelect = false, onChange, selectedValue, lockedAccountType }) {
  const [selected, setSelected] = useState(selectedValue || 'individual')
  const [isSaving, setIsSaving] = useState(false)

  // Map "ira" from backend to "sdira" for frontend comparison
  const normalizedLockedType = lockedAccountType === 'ira' ? 'sdira' : lockedAccountType

  // Optionally we could warn if session is missing, but keep the button state as Continue
  useEffect(() => {
    // no-op
  }, [])

  useEffect(() => {
    if (selectedValue) setSelected(selectedValue)
  }, [selectedValue])

  const handleSelect = async (key) => {
    if (normalizedLockedType && key !== normalizedLockedType) return
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
      // Map "sdira" to "ira" for user profile (backend expects "ira" for SDIRA accounts)
      const profileAccountType = key === 'sdira' ? 'ira' : key
      await apiClient.patchUserProfile({ accountType: profileAccountType })
      console.log(`✅ Auto-saved account type to profile: ${profileAccountType}`)
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
          const isLockedOther = Boolean(normalizedLockedType && opt.key !== normalizedLockedType)
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


