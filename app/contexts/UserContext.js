'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { apiClient } from '@/lib/apiClient'
import logger from '@/lib/logger'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  // Split state to prevent circular dependency loops
  // userProfile: Identity and core user details
  // investments: List of investments (heavy data)
  // activity: Activity log (heavy data)
  const [userProfile, setUserProfile] = useState(null)
  const [investments, setInvestments] = useState(null)
  const [activity, setActivity] = useState(null)
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isLoadingUserRef = useRef(false)

  // Memoize the constructed userData to prevent unnecessary re-renders of consumers
  // We use a ref to break the loop: if only investments update, we don't want 
  // to trigger effects that depend on user identity, BUT we do want components 
  // reading userData.investments to update.
  const legacyUserData = useMemo(() => {
    if (!userProfile) return null
    const combined = {
      ...userProfile,
      investments: investments || (userProfile.investments || []), // Fallback to profile's investments if preloaded
      activity: activity || (userProfile.activity || [])
    }
    console.log('[UserContext] legacyUserData updated:', { 
      hasProfile: !!userProfile, 
      investmentsCount: combined.investments.length,
      activityCount: combined.activity.length
    })
    return combined
  }, [userProfile, investments, activity])

  const loadUser = useCallback(async () => {
    if (typeof window === 'undefined') return null
    // Prevent concurrent calls
    if (isLoadingUserRef.current) return null
    
    try {
      isLoadingUserRef.current = true
      setLoading(true)
      apiClient.ensureTokensLoaded()
      if (!apiClient.isAuthenticated()) {
        setUserProfile(null)
        setInvestments(null)
        setActivity(null)
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

        setUserProfile(data.user)
        // If the user object already has these fields (e.g. preloaded), use them
        if (data.user.investments) setInvestments(data.user.investments)
        if (data.user.activity) setActivity(data.user.activity)
        
        setError(null)
        return data.user
      }
      setUserProfile(null)
      return null
    } catch (e) {
      logger.error('Failed to load user data', e)
      setError(e.message)
      setUserProfile(null)
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
          setUserProfile(parsed)
          if (parsed.investments) setInvestments(parsed.investments)
          if (parsed.activity) setActivity(parsed.activity)
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
    console.log('[UserContext] loadInvestments called')
    // Prevent concurrent calls
    if (isLoadingInvestmentsRef.current) return []
    
    try {
      isLoadingInvestmentsRef.current = true
      const response = await apiClient.getInvestments()
      const newInvestments = response?.investments || []
      console.log('[UserContext] investments loaded:', newInvestments.length)
      setInvestments(newInvestments)
      return newInvestments
    } catch (e) {
      logger.warn('Failed to load investments data', e)
      // Don't wipe data on error to prevent flashing empty state if we have fallback data
      // setInvestments([]) 
      return []
    } finally {
      isLoadingInvestmentsRef.current = false
    }
  }, [])

  const loadActivity = useCallback(async () => {
    console.log('[UserContext] loadActivity called')
    // Prevent concurrent calls
    if (isLoadingActivityRef.current) return []
    
    try {
      isLoadingActivityRef.current = true
      const activityResponse = await apiClient.getActivityEvents()
      const items = activityResponse?.items || []
      // Minimal normalization
      const newActivity = items.map(event => ({
        id: event.id,
        type: event.activityType,
        date: event.eventDate,
        investmentId: event.investmentId,
        status: event.status,
        ...(typeof event.eventMetadata === 'string' ? (() => { try { return JSON.parse(event.eventMetadata) } catch { return {} } })() : (event.eventMetadata || {}))
      }))
      console.log('[UserContext] activity loaded:', newActivity.length)
      setActivity(newActivity)
      return newActivity
    } catch (e) {
      logger.warn('Failed to load activity data', e)
      // Don't wipe data on error
      // setActivity([])
      return []
    } finally {
      isLoadingActivityRef.current = false
    }
  }, [])

  return (
    <UserContext.Provider value={{ 
      userData: legacyUserData, 
      userProfile,
      investments,
      activity,
      loading, 
      error, 
      refreshUser, 
      loadInvestments, 
      loadActivity 
    }}>
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
