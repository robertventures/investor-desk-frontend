'use client'
import { useEffect, useRef, useCallback } from 'react'
import { apiClient } from '../apiClient'
import logger from '../logger'

// Refresh token every 4 minutes (240,000ms) when activity is detected
const REFRESH_INTERVAL_MS = 4 * 60 * 1000

// Throttle activity events to 1 second to avoid performance issues
const ACTIVITY_THROTTLE_MS = 1000

/**
 * Hook for activity-based token refresh
 * 
 * Refreshes the access token every 4 minutes if user activity is detected.
 * If no activity is detected, the token is allowed to expire naturally.
 * 
 * @param {boolean} isAuthenticated - Whether the user is currently authenticated
 * @param {function} onRefreshFailure - Callback when token refresh fails (e.g., redirect to login)
 */
export function useTokenRefresh(isAuthenticated, onRefreshFailure) {
  const lastActivityRef = useRef(Date.now())
  const lastRefreshRef = useRef(Date.now())
  const isVisibleRef = useRef(true)
  const refreshIntervalRef = useRef(null)
  const activityThrottleRef = useRef(null)

  // Update last activity timestamp (throttled)
  const recordActivity = useCallback(() => {
    if (activityThrottleRef.current) return
    
    lastActivityRef.current = Date.now()
    
    activityThrottleRef.current = setTimeout(() => {
      activityThrottleRef.current = null
    }, ACTIVITY_THROTTLE_MS)
  }, [])

  // Attempt to refresh the token
  const refreshToken = useCallback(async () => {
    // Don't refresh if tab is hidden
    if (!isVisibleRef.current) {
      logger.debug('[TokenRefresh] Tab hidden, skipping refresh')
      return
    }

    // Don't refresh if no activity since last refresh
    if (lastActivityRef.current <= lastRefreshRef.current) {
      logger.debug('[TokenRefresh] No activity detected, skipping refresh')
      return
    }

    try {
      logger.debug('[TokenRefresh] Refreshing access token...')
      await apiClient.refreshAccessToken()
      lastRefreshRef.current = Date.now()
      logger.debug('[TokenRefresh] Token refreshed successfully')
    } catch (error) {
      logger.error('[TokenRefresh] Failed to refresh token:', error)
      onRefreshFailure?.()
    }
  }, [onRefreshFailure])

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    const wasHidden = !isVisibleRef.current
    isVisibleRef.current = document.visibilityState === 'visible'

    // When tab becomes visible again, check if we need to refresh
    if (wasHidden && isVisibleRef.current) {
      logger.debug('[TokenRefresh] Tab became visible, checking for refresh')
      // Record activity since user came back to the tab
      lastActivityRef.current = Date.now()
      
      // Check if it's been more than the refresh interval since last refresh
      const timeSinceRefresh = Date.now() - lastRefreshRef.current
      if (timeSinceRefresh >= REFRESH_INTERVAL_MS) {
        refreshToken()
      }
    }
  }, [refreshToken])

  // Set up activity listeners and refresh interval
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') {
      return
    }

    // Activity events to track
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ]

    // Add activity listeners with passive option for performance
    activityEvents.forEach(event => {
      window.addEventListener(event, recordActivity, { passive: true })
    })

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Set up refresh interval
    refreshIntervalRef.current = setInterval(refreshToken, REFRESH_INTERVAL_MS)

    // Initialize refs
    lastActivityRef.current = Date.now()
    lastRefreshRef.current = Date.now()
    isVisibleRef.current = document.visibilityState === 'visible'

    logger.debug('[TokenRefresh] Activity-based token refresh initialized')

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, recordActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
      
      if (activityThrottleRef.current) {
        clearTimeout(activityThrottleRef.current)
        activityThrottleRef.current = null
      }

      logger.debug('[TokenRefresh] Activity-based token refresh cleaned up')
    }
  }, [isAuthenticated, recordActivity, handleVisibilityChange, refreshToken])
}

export default useTokenRefresh

