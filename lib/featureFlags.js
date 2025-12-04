/**
 * Feature Flags
 * 
 * Simple configuration flags to control feature availability.
 * Change these values and redeploy to enable/disable features.
 */

/**
 * SEC Approval Pending
 * 
 * When true: New investments are paused
 * - Hides "Start an Investment" button on dashboard
 * - Redirects /investment and /finalize-investment to /dashboard
 * 
 * Set to false when SEC approval is received.
 */
export const INVESTMENTS_PAUSED = false

