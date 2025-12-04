'use client'
import { useEffect, useRef, useCallback } from 'react'
import { apiClient } from '../apiClient'
import logger from '../logger'

// Refresh token every 4 minutes (240,000ms) when activity is detected
const REFRESH_INTERVAL_MS = 4 * 60 * 1000

// Idle timeout: 15 minutes
const IDLE_TIMEOUT_MS = 15 * 60 * 1000

// Throttle activity events to 1 second to avoid performance issues
const ACTIVITY_THROTTLE_MS = 1000

/**
 * Hook for activity-based token refresh and idle timeout
 * 
 * Refreshes the access token every 4 minutes if user activity is detected.
 * Logs the user out if they are inactive for more than 15 minutes.
 * 
 * @param {boolean} isAuthenticated - Whether the user is currently authenticated
 * @param {function} onRefreshFailure - Callback when token refresh fails or idle timeout occurs (e.g., redirect to login)
 */
export function useTokenRefresh(isAuthenticated, onRefreshFailure) {
  const lastActivityRef = useRef(Date.now())
  const lastRefreshRef = useRef(Date.now())
  const isVisibleRef = useRef(true)
  const refreshIntervalRef = useRef(null)
  const idleCheckIntervalRef = useRef(null)
  const activityThrottleRef = useRef(null)

  // Check for idle timeout
  const checkIdle = useCallback(() => {
    const timeSinceLastActivity = Date.now() - lastActivityRef.current
    if (timeSinceLastActivity > IDLE_TIMEOUT_MS) {
      logger.warn('[TokenRefresh] User inactive for > 15 mins, logging out')
      onRefreshFailure?.()
      return true
    }
    return false
  }, [onRefreshFailure])

  // Update last activity timestamp (throttled)
  const recordActivity = useCallback(() => {
    // Check if user has ALREADY been idle for too long before updating the timestamp
    // This catches the case where user comes back after 20 mins and moves mouse
    if (checkIdle()) return

    if (activityThrottleRef.current) return
    
    lastActivityRef.current = Date.now()
    
    activityThrottleRef.current = setTimeout(() => {
      activityThrottleRef.current = null
    }, ACTIVITY_THROTTLE_MS)
  }, [checkIdle])

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
    
    // Also check idle here just in case
    if (checkIdle()) return

    try {
      logger.debug('[TokenRefresh] Refreshing access token...')
      await apiClient.refreshAccessToken()
      lastRefreshRef.current = Date.now()
      logger.debug('[TokenRefresh] Token refreshed successfully')
    } catch (error) {
      logger.error('[TokenRefresh] Failed to refresh token:', error)
      onRefreshFailure?.()
    }
  }, [onRefreshFailure, checkIdle])

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    const wasHidden = !isVisibleRef.current
    isVisibleRef.current = document.visibilityState === 'visible'

    // When tab becomes visible again, check if we need to refresh
    if (wasHidden && isVisibleRef.current) {
      logger.debug('[TokenRefresh] Tab became visible, checking status')
      
      // Check for idle timeout immediately upon return
      if (checkIdle()) return

      // Record activity since user came back to the tab
      lastActivityRef.current = Date.now()
      
      // Check if it's been more than the refresh interval since last refresh
      const timeSinceRefresh = Date.now() - lastRefreshRef.current
      if (timeSinceRefresh >= REFRESH_INTERVAL_MS) {
        refreshToken()
      }
    }
  }, [refreshToken, checkIdle])

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
    
    // Set up idle check interval (check every minute)
    idleCheckIntervalRef.current = setInterval(checkIdle, 60 * 1000)

    // Initialize refs
    lastActivityRef.current = Date.now()
    lastRefreshRef.current = Date.now()
    isVisibleRef.current = document.visibilityState === 'visible'

    logger.debug('[TokenRefresh] Activity-based token refresh and idle check initialized')

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
      
      if (idleCheckIntervalRef.current) {
        clearInterval(idleCheckIntervalRef.current)
        idleCheckIntervalRef.current = null
      }
      
      if (activityThrottleRef.current) {
        clearTimeout(activityThrottleRef.current)
        activityThrottleRef.current = null
      }

      logger.debug('[TokenRefresh] Cleaned up')
    }
  }, [isAuthenticated, recordActivity, handleVisibilityChange, refreshToken, checkIdle])
}

export default useTokenRefresh
