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
        setUserData(data.user)
        setError(null)
        return data.user
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

