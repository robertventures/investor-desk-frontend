'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { apiClient } from '@/lib/apiClient'
import logger from '@/lib/logger'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isLoadingUserRef = useRef(false)

  const loadUser = useCallback(async () => {
    if (typeof window === 'undefined') return null
    // Prevent concurrent calls
    if (isLoadingUserRef.current) return null
    
    try {
      isLoadingUserRef.current = true
      setLoading(true)
      apiClient.ensureTokensLoaded()
      if (!apiClient.isAuthenticated()) {
        setUserData(null)
        setError(null)
        return null
      }

      const data = await apiClient.getCurrentUser()
      if (data.success && data.user) {
        // Backward compatibility for components still reading from localStorage
        try {
          localStorage.setItem('currentUserId', data.user.id)
          if (data.user.email) localStorage.setItem('signupEmail', data.user.email)
        } catch (e) {
          // ignore storage errors
        }

        setUserData(data.user)
        setError(null)
        return data.user
      }
      setUserData(null)
      return null
    } catch (e) {
      logger.error('Failed to load user data', e)
      setError(e.message)
      setUserData(null)
      return null
    } finally {
      setLoading(false)
      isLoadingUserRef.current = false
    }
  }, [])

  const refreshUser = useCallback(() => {
    return loadUser()
  }, [loadUser])

  // Seed from preloaded user (set during confirmation) then refresh in background
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const preloaded = sessionStorage.getItem('preloadedUser')
      if (preloaded) {
        const parsed = JSON.parse(preloaded)
        if (parsed && typeof parsed === 'object') {
          setUserData(parsed)
          setLoading(false)
        }
        sessionStorage.removeItem('preloadedUser')
      }
    } catch (e) {
      // ignore parse errors
    }
    // Always perform a background refresh to verify session
    loadUser()
  }, [loadUser])

  // Lazy loaders for heavy data
  const isLoadingInvestmentsRef = useRef(false)
  const isLoadingActivityRef = useRef(false)

  const loadInvestments = useCallback(async () => {
    // Prevent concurrent calls
    if (isLoadingInvestmentsRef.current) return []
    
    try {
      isLoadingInvestmentsRef.current = true
      const response = await apiClient.getInvestments()
      const investments = response?.investments || []
      setUserData(prev => prev ? { ...prev, investments } : prev)
      return investments
    } catch (e) {
      logger.warn('Failed to load investments data', e)
      // Set empty array on error to prevent infinite retries
      setUserData(prev => prev ? { ...prev, investments: [] } : prev)
      return []
    } finally {
      isLoadingInvestmentsRef.current = false
    }
  }, [])

  const loadActivity = useCallback(async () => {
    // Prevent concurrent calls
    if (isLoadingActivityRef.current) return []
    
    try {
      isLoadingActivityRef.current = true
      const activityResponse = await apiClient.getActivityEvents()
      const items = activityResponse?.items || []
      // Minimal normalization
      const activity = items.map(event => ({
        id: event.id,
        type: event.activityType,
        date: event.eventDate,
        investmentId: event.investmentId,
        status: event.status,
        ...(typeof event.eventMetadata === 'string' ? (() => { try { return JSON.parse(event.eventMetadata) } catch { return {} } })() : (event.eventMetadata || {}))
      }))
      setUserData(prev => prev ? { ...prev, activity } : prev)
      return activity
    } catch (e) {
      logger.warn('Failed to load activity data', e)
      // Set empty array to prevent retries
      setUserData(prev => prev ? { ...prev, activity: [] } : prev)
      return []
    } finally {
      isLoadingActivityRef.current = false
    }
  }, [])

  return (
    <UserContext.Provider value={{ userData, loading, error, refreshUser, loadInvestments, loadActivity }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}

