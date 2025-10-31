/**
 * Client-Only Rendering Utilities
 * Prevents hydration mismatches by only rendering certain components on the client
 */

import { useEffect, useState } from 'react'

/**
 * Hook to check if component is mounted (client-side)
 * Prevents hydration mismatches by returning false during SSR
 */
export function useIsMounted() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return isMounted
}

/**
 * Hook to safely use localStorage
 * Returns null during SSR to prevent hydration errors
 */
export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === 'undefined') {
      return initialValue
    }
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error('Error reading localStorage:', error)
      return initialValue
    }
  })

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.error('Error setting localStorage:', error)
    }
  }

  return [storedValue, setValue]
}

/**
 * Component that only renders children on the client
 * Prevents hydration mismatches for client-only content
 */
export function ClientOnly({ children, fallback = null }) {
  const isMounted = useIsMounted()

  if (!isMounted) {
    return fallback
  }

  return children
}

