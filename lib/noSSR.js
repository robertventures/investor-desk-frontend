/**
 * No-SSR Component Wrapper
 * Prevents server-side rendering for components that must run client-only
 */

import dynamic from 'next/dynamic'

/**
 * Dynamically import a component with no SSR
 * Use this for components that use browser-only APIs
 * 
 * Example:
 * const ClientComponent = noSSR(() => import('./ClientComponent'))
 */
export function noSSR(importFunc, options = {}) {
  return dynamic(importFunc, {
    ssr: false,
    loading: () => options.loading || null,
    ...options
  })
}

/**
 * Wrapper component for no-SSR content
 * Alternative to using dynamic imports
 * 
 * Example:
 * <NoSSR>
 *   <ComponentThatNeedsWindow />
 * </NoSSR>
 */
export function NoSSR({ children }) {
  if (typeof window === 'undefined') {
    return null
  }
  return children
}

export default noSSR

