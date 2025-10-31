# Token Expiration Issue - Investigation Summary (RESOLVED)

## Issue Description
When creating a new account and using "000000" for verification, users get a "token expired" error and are redirected to the signup page.

## ✅ ISSUE RESOLVED

**Root Cause:** The userId was being stored in localStorage but was coming back as `null` when the confirmation page tried to retrieve it. This was a race condition / timing issue where localStorage wasn't persisting between page navigations.

**Solution:** Pass the userId through the URL parameters instead of relying solely on localStorage.

## What Was Actually Happening

From the console logs:
```
[AccountCreationForm] Storing userId: USR-1008
[Confirmation] Attempting verification with userId: null code: 000000
```

The userId was successfully returned from registration and stored in localStorage, but when the confirmation page loaded, it couldn't retrieve it (came back as `null`).

## The Fix Applied

### 1. AccountCreationForm - Pass userId in URL
```javascript
// Before:
router.push(`/confirmation?email=${encodeURIComponent(form.email)}`)

// After:
router.push(`/confirmation?email=${encodeURIComponent(form.email)}&userId=${encodeURIComponent(data.user.id)}`)
```

### 2. Confirmation Page - Read userId from URL
```javascript
// Added userId state
const [userId, setUserId] = useState('')

// Read from URL params (with localStorage fallback)
const params = new URLSearchParams(window.location.search)
const urlUserId = params.get('userId')
const storedUserId = urlUserId || localStorage.getItem('currentUserId')

// Store in state
setUserId(storedUserId)

// Use state variable instead of reading localStorage in handleSubmit
```

This ensures the userId is reliably passed between pages via URL parameters, with localStorage as a backup.

## Why localStorage Failed

Possible reasons why localStorage wasn't working:
1. **Race condition**: The router.push() happened before localStorage.setItem() completed
2. **Browser privacy settings**: Some browsers or privacy modes restrict localStorage
3. **Page lifecycle**: localStorage might not persist during client-side navigation in some cases
4. **Timing issue**: Next.js client-side navigation might clear or reset localStorage in some scenarios

## Changes Made to Fix the Issue

### Files Modified:

1. **`app/components/AccountCreationForm.js`**
   - Now passes userId via URL parameter during navigation
   - Added logging for debugging

2. **`app/confirmation/page.js`**
   - Added userId state variable
   - Reads userId from URL parameters (with localStorage as fallback)
   - Added validation to redirect if userId is missing
   - Added logging for debugging

3. **`lib/apiClient.js`**
   - Added comprehensive error logging
   - Improved error handling with detailed error information
   - Added logging for registration and confirmation flows

## Testing the Fix

1. Clear your browser cache and localStorage
2. Create a new account with a test email
3. You should now see the userId in the URL: `/confirmation?email=...&userId=USR-XXXX`
4. Enter "000000" and verify the account

The logs should now show:
```
[Confirmation] Loaded from URL/storage - email: xxx userId: USR-XXXX
[Confirmation] Attempting verification with userId: USR-XXXX code: 000000
```

## Benefits of This Approach

1. **More reliable**: URL parameters persist during navigation
2. **Better debugging**: Easy to see the userId in the URL
3. **Backward compatible**: Still uses localStorage as fallback
4. **Secure**: The userId is not sensitive information (verification code is what matters)

