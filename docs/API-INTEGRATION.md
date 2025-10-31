# Backend API Integration Guide

This document describes the API contract between the Investor Desk frontend and the backend API.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [CORS Configuration](#cors-configuration)

## Overview

The frontend communicates with the backend exclusively through REST API endpoints. All requests include HTTP-only cookies for authentication.

**Base URL Configuration**:
- Development: `http://localhost:8000` (or as configured in `.env.local`)
- Production: Set via `NEXT_PUBLIC_API_URL` environment variable

## Authentication

### Session Management

Authentication is handled via HTTP-only cookies:

1. User logs in via `POST /api/auth/login`
2. Backend validates credentials and sets secure HTTP-only cookie
3. Frontend stores minimal user info (userId) in localStorage for routing
4. All subsequent requests automatically include the session cookie
5. Backend validates cookie on each request

### Cookie Requirements

The backend must set cookies with these attributes:
- `HttpOnly: true` - Prevents JavaScript access
- `Secure: true` (production) - HTTPS only
- `SameSite: Lax` or `Strict` - CSRF protection
- Appropriate `Max-Age` or `Expires`

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/login
Login with email and password.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "is_admin": false,
    "onboarding_status": "complete"
  }
}
```

**Error Response** (401):
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

#### POST /api/auth/logout
Logout current user and clear session.

**Request**: Empty body

**Success Response** (200):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### POST /api/auth/register-pending
Register a pending user (not yet verified).

**Request**:
```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "message": "Verification code sent to email"
}
```

---

#### POST /api/auth/verify-and-create
Verify email code and create user account.

**Request**:
```json
{
  "email": "newuser@example.com",
  "code": "123456"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "newuser@example.com",
    "full_name": null,
    "is_admin": false,
    "onboarding_status": "pending"
  }
}
```

---

#### POST /api/auth/request-reset
Request password reset email.

**Request**:
```json
{
  "email": "user@example.com"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "message": "Reset email sent"
}
```

---

#### POST /api/auth/reset-password
Reset password with token.

**Request**:
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePassword123"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

#### GET /api/auth/me
Get current authenticated user.

**Success Response** (200):
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_admin": false,
  "onboarding_status": "complete"
}
```

**Error Response** (401):
```json
{
  "error": "Not authenticated"
}
```

---

### User Endpoints

#### GET /api/users
Get all users (admin only).

**Success Response** (200):
```json
{
  "success": true,
  "users": [
    {
      "id": "user-uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "is_admin": false,
      "onboarding_status": "complete",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### GET /api/users/:userId
Get specific user by ID.

**Query Parameters**:
- `fresh` (optional): If "true", bypass cache

**Success Response** (200):
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "date_of_birth": "1990-01-01",
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "USA",
    "is_admin": false,
    "onboarding_status": "complete"
  }
}
```

---

#### PUT /api/users/:userId
Update user information.

**Request**:
```json
{
  "full_name": "John Smith",
  "phone": "+1234567890",
  "address": "456 Oak Ave"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "user": {
    // Updated user object
  }
}
```

---

#### DELETE /api/users/:userId
Delete user account (admin only).

**Success Response** (200):
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

---

#### GET /api/users/profile
Get current user's profile.

**Success Response** (200):
```json
{
  "success": true,
  "user": {
    // User object
  }
}
```

---

#### PUT /api/users/profile
Update current user's profile.

**Request**: Same as PUT /api/users/:userId

**Success Response**: Same as PUT /api/users/:userId

---

### Investment Endpoints

#### GET /api/users/:userId/investments
Get all investments for a user.

**Success Response** (200):
```json
{
  "success": true,
  "investments": [
    {
      "id": "inv-uuid",
      "user_id": "user-uuid",
      "amount": 10000.00,
      "type": "bond",
      "status": "confirmed",
      "interest_rate": 10.0,
      "term_months": 12,
      "start_date": "2024-01-01T00:00:00Z",
      "maturity_date": "2025-01-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/users/:userId/investments
Create new investment.

**Request**:
```json
{
  "amount": 10000.00,
  "type": "bond",
  "term_months": 12,
  "interest_rate": 10.0,
  "start_date": "2024-01-01T00:00:00Z"
}
```

**Success Response** (201):
```json
{
  "success": true,
  "investment": {
    "id": "inv-uuid",
    // Full investment object
  }
}
```

---

#### PATCH /api/users/:userId/investments
Update investment.

**Request**:
```json
{
  "investmentId": "inv-uuid",
  "status": "confirmed",
  "notes": "Updated notes"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "investment": {
    // Updated investment object
  }
}
```

---

#### DELETE /api/users/:userId/investments
Delete investment.

**Query Parameters**:
- `investmentId`: ID of investment to delete

**Success Response** (200):
```json
{
  "success": true,
  "message": "Investment deleted successfully"
}
```

---

### Transaction Endpoints

#### GET /api/users/:userId/transactions
Get user's transactions.

**Query Parameters**:
- `investmentId` (optional): Filter by specific investment

**Success Response** (200):
```json
{
  "success": true,
  "transactions": [
    {
      "id": "txn-uuid",
      "user_id": "user-uuid",
      "investment_id": "inv-uuid",
      "type": "interest",
      "amount": 83.33,
      "date": "2024-02-01T00:00:00Z",
      "description": "Monthly interest payment",
      "created_at": "2024-02-01T00:00:00Z"
    }
  ]
}
```

---

### Withdrawal Endpoints

#### GET /api/users/:userId/withdrawals
Get user's withdrawal requests.

**Success Response** (200):
```json
{
  "success": true,
  "withdrawals": [
    {
      "id": "wd-uuid",
      "user_id": "user-uuid",
      "investment_id": "inv-uuid",
      "amount": 10000.00,
      "status": "pending",
      "requested_at": "2024-06-01T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/withdrawals
Create withdrawal request.

**Request**:
```json
{
  "userId": "user-uuid",
  "investmentId": "inv-uuid"
}
```

**Success Response** (201):
```json
{
  "success": true,
  "withdrawal": {
    "id": "wd-uuid",
    "user_id": "user-uuid",
    "investment_id": "inv-uuid",
    "amount": 10000.00,
    "status": "pending",
    "requested_at": "2024-06-01T00:00:00Z"
  }
}
```

---

### Admin Endpoints

#### GET /api/admin/time-machine
Get current app time (for testing/simulation).

**Success Response** (200):
```json
{
  "success": true,
  "appTime": "2024-06-01T00:00:00Z",
  "isOverridden": true
}
```

---

#### POST /api/admin/time-machine
Set app time override.

**Request**:
```json
{
  "timestamp": "2024-06-01T00:00:00Z"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "appTime": "2024-06-01T00:00:00Z"
}
```

---

#### DELETE /api/admin/time-machine
Reset app time to system time.

**Success Response** (200):
```json
{
  "success": true,
  "message": "App time reset to system time"
}
```

---

#### GET /api/admin/withdrawals
Get all withdrawal requests (admin only).

**Success Response** (200):
```json
{
  "success": true,
  "withdrawals": [
    // Array of withdrawal objects with user info
  ]
}
```

---

#### GET /api/admin/pending-payouts
Get pending payout calculations.

**Success Response** (200):
```json
{
  "success": true,
  "payouts": [
    {
      "user_id": "user-uuid",
      "user_name": "John Doe",
      "total_payout": 1083.33,
      "details": [
        {
          "investment_id": "inv-uuid",
          "principal": 1000.00,
          "interest": 83.33
        }
      ]
    }
  ]
}
```

---

### Document Endpoints

#### POST /api/v1/documents/generate-bond-agreement
Generate bond agreement PDF.

**Request**:
```json
{
  "investment_id": "inv-uuid",
  "user_id": "user-uuid"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "document_id": "doc-uuid",
  "generated_at": "2024-01-01T00:00:00Z"
}
```

---

#### GET /api/v1/documents/bond-agreement/:investmentId
Get bond agreement metadata.

**Query Parameters**:
- `user_id` (optional): User ID for authorization

**Success Response** (200):
```json
{
  "success": true,
  "document": {
    "id": "doc-uuid",
    "investment_id": "inv-uuid",
    "generated_at": "2024-01-01T00:00:00Z"
  }
}
```

---

#### GET /api/v1/documents/bond-agreement/:investmentId/download
Download bond agreement PDF.

**Query Parameters**:
- `user_id` (optional): User ID for authorization

**Success Response**: PDF file download

---

## Data Models

### User
```typescript
{
  id: string              // UUID
  email: string           // Valid email
  full_name: string | null
  phone: string | null
  date_of_birth: string | null  // ISO date
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  is_admin: boolean
  onboarding_status: 'pending' | 'in_progress' | 'complete'
  created_at: string      // ISO timestamp
  updated_at: string      // ISO timestamp
}
```

### Investment
```typescript
{
  id: string              // UUID
  user_id: string         // UUID
  amount: number          // Decimal
  type: 'bond' | 'equity'
  status: 'pending' | 'confirmed' | 'matured' | 'withdrawn'
  interest_rate: number   // Percentage
  term_months: number     // Integer
  start_date: string      // ISO timestamp
  maturity_date: string   // ISO timestamp
  notes: string | null
  created_at: string      // ISO timestamp
  updated_at: string      // ISO timestamp
}
```

### Transaction
```typescript
{
  id: string              // UUID
  user_id: string         // UUID
  investment_id: string   // UUID
  type: 'principal' | 'interest' | 'withdrawal' | 'fee'
  amount: number          // Decimal
  date: string            // ISO timestamp
  description: string
  created_at: string      // ISO timestamp
}
```

### Withdrawal
```typescript
{
  id: string              // UUID
  user_id: string         // UUID
  investment_id: string   // UUID
  amount: number          // Decimal
  status: 'pending' | 'approved' | 'completed' | 'rejected'
  requested_at: string    // ISO timestamp
  processed_at: string | null  // ISO timestamp
}
```

## Error Handling

### Error Response Format

All errors should follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "detail": "Optional detailed error information"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (e.g., duplicate email)
- `422` - Unprocessable Entity (validation failed)
- `500` - Internal Server Error

### Frontend Error Handling

The frontend API client (`lib/apiClient.js`) handles errors as follows:

1. Catches network errors
2. Parses JSON error responses
3. Extracts `detail` or `error` field
4. Throws Error with message for component to catch

## CORS Configuration

The backend must configure CORS to allow requests from the frontend:

### Required Headers

```
Access-Control-Allow-Origin: https://your-frontend-domain.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

### Development Configuration

For local development, allow:
```
Access-Control-Allow-Origin: http://localhost:3000
```

**Important**: Never use `Access-Control-Allow-Origin: *` when using credentials.

## Testing the Integration

### Using cURL

```bash
# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# Get current user (with cookie)
curl -X GET http://localhost:8000/api/auth/me \
  -b cookies.txt

# Get investments
curl -X GET http://localhost:8000/api/users/USER_ID/investments \
  -b cookies.txt
```

### Frontend Testing

1. Start backend on port 8000
2. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`
3. Start frontend: `npm run dev`
4. Open browser to http://localhost:3000
5. Check browser console for API client logs
6. Use Network tab to inspect requests/responses

## TODO: Integration Checklist

When integrating with a new backend, verify:

- [ ] All authentication endpoints implemented
- [ ] Session cookies set with correct attributes
- [ ] CORS configured properly
- [ ] All user endpoints implemented
- [ ] All investment endpoints implemented
- [ ] All transaction endpoints implemented
- [ ] All withdrawal endpoints implemented
- [ ] All admin endpoints implemented (if needed)
- [ ] All document endpoints implemented (if needed)
- [ ] Error responses follow standard format
- [ ] Data models match expected structure
- [ ] Date/time formats are ISO 8601
- [ ] Currency amounts are decimals (not integers)
- [ ] Proper authorization checks on protected endpoints

## Support

For questions about the API contract or integration issues, contact the backend development team or refer to their API documentation.

