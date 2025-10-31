'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/apiClient'
import logger from '@/lib/logger'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadUser = useCallback(async (fresh = false) => {
    if (typeof window === 'undefined') return

    const userId = localStorage.getItem('currentUserId')
    if (!userId) {
      setLoading(false)
      return null
    }

    try {
      setLoading(true)
      const data = await apiClient.getUser(userId, fresh)
      if (data.success && data.user) {
        // Fetch investments separately
        let investments = []
        try {
          const investmentsResponse = await apiClient.getInvestments()
          if (investmentsResponse && investmentsResponse.investments) {
            investments = investmentsResponse.investments
          }
        } catch (investmentsError) {
          logger.warn('Failed to load investments data', investmentsError)
          // Don't fail the whole user load if investments fails
        }

        // Fetch activity events separately
        let activityEvents = []
        try {
          const activityResponse = await apiClient.getActivityEvents()
          if (activityResponse && activityResponse.items) {
            // Map API response to frontend format
            activityEvents = activityResponse.items.map(event => {
              let metadata = {}
              try {
                if (event.eventMetadata && typeof event.eventMetadata === 'string') {
                  metadata = JSON.parse(event.eventMetadata)
                } else if (event.eventMetadata && typeof event.eventMetadata === 'object') {
                  metadata = event.eventMetadata
                }
              } catch (parseError) {
                logger.warn('Failed to parse event metadata for event', event.id, parseError)
              }
              
              // For investment events, try to get the amount from the investment if not in metadata
              let amount = metadata.amount || 0
              if (!amount && event.investmentId && investments.length > 0) {
                const relatedInvestment = investments.find(inv => inv.id === event.investmentId)
                if (relatedInvestment) {
                  amount = relatedInvestment.amount || 0
                }
              }
              
              return {
                id: event.id,
                type: event.activityType,
                date: event.eventDate,
                investmentId: event.investmentId,
                status: event.status,
                amount,
                // Include any other metadata fields
                ...metadata
              }
            })
          }
        } catch (activityError) {
          logger.warn('Failed to load activity data', activityError)
          // Don't fail the whole user load if activity fails
        }

        // Merge investments and activity into user data
        const userWithData = {
          ...data.user,
          investments,
          activity: activityEvents
        }
        
        setUserData(userWithData)
        setError(null)
        return userWithData
      } else {
        setError('Failed to load user data')
        return null
      }
    } catch (e) {
      logger.error('Failed to load user data', e)
      setError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshUser = useCallback(() => {
    return loadUser(true)
  }, [loadUser])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  return (
    <UserContext.Provider value={{ userData, loading, error, refreshUser }}>
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

