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

/**
 * Time Machine Feature
 * 
 * When true: Time Machine UI is visible in admin panel
 * - Shows Time Machine tab in Operations section
 * - Allows testing time-based operations (payouts, compounding, month boundaries)
 * 
 * Set via NEXT_PUBLIC_ENABLE_TIME_MACHINE environment variable:
 * - Localhost: Set to 'true' in .env.local
 * - Staging: Set to 'true' in Netlify environment variables
 * - Production: Leave unset or set to 'false' (defaults to false)
 */
export const TIME_MACHINE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_TIME_MACHINE === 'true'

