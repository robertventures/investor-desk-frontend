# Robert Ventures API Reference

> Base URL: `https://backend-9r5h.onrender.com`
> OpenAPI Version: 3.1.0
> API Version: 0.1.0

---

## Quick Navigation

- [Activity](#activity)
- [Admin](#admin)
- [Auth](#auth)
- [Health](#health)
- [Investments](#investments)
- [Payment-methods](#payment-methods)
- [Plaid](#plaid)
- [Profile](#profile)
- [Support](#support)
- [Withdrawals](#withdrawals)
- [Schemas](#schemas)

---

## Activity

### `GET` /api/activity/events

**Activity:List User Activity**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |

**Responses:**

- `200`: Successful Response → `Page_ActivityEventResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

## Admin

### `GET` /api/admin/users

**Admin:Users:List**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |
| `is_verified` | query | any | No | - |
| `account_type` | query | any | No | - |
| `search` | query | any | No | - |

**Responses:**

- `200`: Successful Response → `Page_UserDetail_`
- `422`: Validation Error → `HTTPValidationError`

---

### `PATCH` /api/admin/users/{user_id}

**Admin:Users:Update**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Request Body:** `AdminUserUpdateRequest`

**Responses:**

- `200`: Successful Response → `UserDetail`
- `422`: Validation Error → `HTTPValidationError`

---

### `DELETE` /api/admin/users/{user_id}

**Admin:Users:Delete**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error → `HTTPValidationError`

---

### `DELETE` /api/admin/users/by-email/{email}

**Admin:Users:Delete By Email**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `email` | path | string | Yes | - |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/payment-methods

**Admin:Users:Payment-Methods**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |

**Responses:**

- `200`: Successful Response → `Page_PaymentMethodResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/users/{user_id}/balance-refresh

**Admin:Users:Balance-Refresh**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `PaymentMethodResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/users/{user_id}/onboarding/reset

**Admin:Users:Reset-Onboarding**

Reset onboarding for testing: reinitializes onboarding, sends email , returns token.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `OnboardingResetResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/activity/events

**Admin:Activity:List Events**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |
| `user_id` | query | any | No | - |
| `investment_id` | query | any | No | - |
| `activity_type` | query | any | No | - |
| `status` | query | any | No | - |
| `search` | query | any | No | - |
| `order_by` | query | any | No | - |

**Responses:**

- `200`: Successful Response → `Page_ActivityEventResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/investments

**Admin:Investments:List**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |
| `status` | query | any | No | - |
| `user_id` | query | any | No | - |
| `search` | query | any | No | - |

**Responses:**

- `200`: Successful Response → `Page_InvestmentResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/investments/{investment_id}/approve

**Admin:Investments:Approve**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `InvestmentResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/investments/{investment_id}/reject

**Admin:Investments:Reject**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `InvestmentResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/settings

**Admin:Settings:List**

List all available runtime settings.

Returns a list of all settings with their current values.

Available settings:
- **email_provider**: The email provider to use.

**Responses:**

- `200`: Successful Response → `AdminSettingsResponse`

---

### `GET` /api/admin/settings/{name}

**Admin:Settings:Get**

Get a specific runtime setting by name.

- **name**: The name of the setting to retrieve.

Available settings:
- **email_provider**: The email provider to use.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `name` | path | any | Yes | - |

**Responses:**

- `200`: Successful Response → `AdminSettingResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `PUT` /api/admin/settings/{name}

**Admin:Settings:Update**

Update a specific runtime setting.

- **name**: The name of the setting to update.
- **value**: The new value for the setting.

Available settings and values:
- **email_provider**:
    - `mock_service`: Use a mock email service (for testing/development).
    - `gohighlevel`: Use GoHighLevel integration (requires configuration).

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `name` | path | any | Yes | - |

**Request Body:** `AdminSettingUpdateRequest`

**Responses:**

- `200`: Successful Response → `AdminSettingResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/transactions/migrate

**Admin:Transactions:Migrate**

**Responses:**

- `200`: Successful Response → `TransactionMigrateResponse`

---

### `POST` /api/admin/transactions/{transaction_id}/achq-payment

**Admin:Transactions:Achq-Payment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `transaction_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `TransactionAchqPaymentResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/profile

**Admin:User-View:Profile**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `UserDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/profile/trusted_contact

**Admin:User-View:Trusted-Contact**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `TrustedContactResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/activity/events

**Admin:User-View:Activity-Events**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |

**Responses:**

- `200`: Successful Response → `Page_ActivityEventResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/payment-methods

**Admin:User-View:Payment-Methods**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `PaymentMethodListResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/users/{user_id}/view/payment-methods/{payment_method_id}/verify

**Admin:User-View:Verify-Micro-Deposits**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `payment_method_id` | path | string | Yes | Payment method ID |
| `user_id` | path | integer | Yes | - |

**Request Body:** `VerifyMicroDepositsRequest`

**Responses:**

- `200`: Successful Response → `VerifyMicroDepositsResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/investments

**Admin:User-View:Investments**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `InvestmentListResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/investments/attestations

**Admin:User-View:Attestations**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |

**Responses:**

- `200`: Successful Response → `Page_AccreditationAttestationResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/investments/{investment_id}

**Admin:User-View:Investment**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `InvestmentDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/investments/{investment_id}/transactions

**Admin:User-View:Investment-Transactions**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/investments/{investment_id}/calculation

**Admin:User-View:Investment-Calculation**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |
| `user_id` | path | integer | Yes | - |
| `asOfDate` | query | any | No | - |

**Responses:**

- `200`: Successful Response → `InvestmentCalculationResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/investments/{investment_id}/agreement

**Admin:User-View:Investment-Agreement**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/withdrawals

**Admin:User-View:Withdrawals**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `WithdrawalListResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/users/{user_id}/view/withdrawals/{withdrawal_id}

**Admin:User-View:Withdrawal**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `withdrawal_id` | path | integer | Yes | - |
| `user_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `WithdrawalDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/withdrawals

**Admin:Withdrawals:List**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |
| `status` | query | any | No | - |
| `user_id` | query | any | No | - |
| `investment_id` | query | any | No | - |
| `search` | query | any | No | - |

**Responses:**

- `200`: Successful Response → `Page_WithdrawalResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/withdrawals/{withdrawal_id}/approve

**Admin:Withdrawals:Approve**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `withdrawal_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `WithdrawalResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/mark-all-funding-success

**⚠️ Mark All Funding Success**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Responses:**

- `200`: Successful Response → `SandboxFundingResponse`

---

### `POST` /api/admin/mark-all-funding-failed

**⚠️ Mark All Funding Failed**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Responses:**

- `200`: Successful Response → `SandboxFundingResponse`

---

### `POST` /api/admin/plaid-create-test-token

**⚠️ Plaid Create Test Token**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Request Body:** `CreateTestTokenRequest`

**Responses:**

- `200`: Successful Response → `CreateTestTokenResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/admin/payment-methods/{payment_method_id}/micro-deposit-amount

**⚠️ Get Micro Deposit Amount**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `payment_method_id` | path | string | Yes | Payment method ID |

**Responses:**

- `200`: Successful Response → `MicroDepositAmountResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/create-test-payment-method

**⚠️ Create Test Payment Method**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Request Body:** `CreateTestPaymentMethodRequest`

**Responses:**

- `200`: Successful Response → `CreateTestPaymentMethodResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/time-machine/set

**⚠️ Set App Time**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Request Body:** `SetAppTimeRequest`

**Responses:**

- `200`: Successful Response → `AppTimeResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/admin/time-machine/reset

**⚠️ Reset App Time**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Responses:**

- `200`: Successful Response → `ResetAppTimeResponse`

---

### `GET` /api/admin/time-machine/status

**⚠️ Get Time Machine Status**

NOT FOR PRODUCTION - This endpoint is only available in development/local environments.

**Responses:**

- `200`: Successful Response → `TimeMachineStatusResponse`

---

## Auth

### `POST` /api/auth/token

**Auth:Token**

Authenticate with email and password.

**Request Body:** 

```json
{
  "email": "string",
  "password": "string"
}
```

**Responses:**

- `200`: Successful Response → `TokenResponse`

---

### `POST` /api/auth/refresh

**Auth:Refresh**

Use a valid refresh token to get a new access token.

**Request Body:** `RefreshTokenRequest`

**Responses:**

- `200`: Successful Response → `RefreshTokenResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/auth/request-reset

**Auth:Request-Reset**

Request a password reset email.

Always returns success to prevent email enumeration.

**Request Body:** `PasswordResetRequest`

**Responses:**

- `200`: Successful Response → `PasswordResetResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/auth/reset-password

**Auth:Reset-Password**

Reset password with valid token.

**Request Body:** `PasswordResetConfirm`

**Responses:**

- `200`: Successful Response → `PasswordResetResponse`
- `422`: Validation Error → `HTTPValidationError`

---

## Health

### `GET` /health

**Health:Check**

Return service health, reporting database connectivity state.

**Responses:**

- `200`: Successful Response

---

## Investments

### `GET` /api/investments

**Investments:List**

**Responses:**

- `200`: Successful Response → `InvestmentListResponse`

---

### `POST` /api/investments

**Investments:Create**

**Request Body:** `InvestmentCreateRequest`

**Responses:**

- `201`: Successful Response → `InvestmentDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/investments/attestations

**Investments:List-Attestations**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `page` | query | integer | No | Page number |
| `size` | query | integer | No | Page size |

**Responses:**

- `200`: Successful Response → `Page_AccreditationAttestationResponse_`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/investments/{investment_id}

**Investments:Get**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `InvestmentDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `PATCH` /api/investments/{investment_id}

**Investments:Update**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Request Body:** `InvestmentUpdateRequest`

**Responses:**

- `200`: Successful Response → `InvestmentDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `DELETE` /api/investments/{investment_id}

**Investments:Delete**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/investments/{investment_id}/transactions

**Investments:List-Transactions**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/investments/{investment_id}/submit

**Investments:Submit**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Request Body:** See schema

**Responses:**

- `200`: Successful Response → `InvestmentDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/investments/{investment_id}/calculation

**Investments:Calculation**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |
| `asOfDate` | query | any | No | - |

**Responses:**

- `200`: Successful Response → `InvestmentCalculationResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/investments/{investment_id}/withdraw

**Investments:Withdraw**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Responses:**

- `201`: Successful Response → `WithdrawalDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/investments/{investment_id}/agreement

**Investments:Get-Agreement**

Retrieve the investment agreement PDF document.

For investments in draft status, the PDF will be generated on the fly using the bond document
template. For investments that have been submitted or processed, the saved PDF will be loaded
from storage if it exists.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/investments/{investment_id}/attestations

**Investments:Create-Attestation**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `investment_id` | path | integer | Yes | - |

**Request Body:** `AccreditationAttestationCreateRequest`

**Responses:**

- `201`: Successful Response → `AccreditationAttestationDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

## Payment-methods

### `POST` /api/payment-methods/manual

**Payment-Methods:Create-Manual**

Create a payment method via manual bank account entry.

Raises:
    PaymentMethodAlreadyExistsError: User already has an active payment method
    InvalidRoutingNumberError: Routing number failed validation
    UserProfileIncompleteError: User profile missing required fields
    BankAccountVerificationError: Real-time bank verification failed
    ACHQRegistrationError: Failed to register with ACHQ
    ACHQResponseError: Invalid response from ACHQ

**Request Body:** `ManualEntryRequest`

**Responses:**

- `200`: Successful Response → `ManualEntryResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/payment-methods/{payment_method_id}/verify

**Payment-Methods:Verify-Micro-Deposits**

Verify micro deposit amounts to complete payment method setup.

.. deprecated::
    Use real-time verification (verification_method='real_time') in the
    /payment-methods/manual endpoint instead.

Raises:
    PaymentMethodNotFoundError: Payment method does not exist
    PaymentMethodValidationError: Validation failed (wrong amounts, expired, or max attempts exceeded)

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `payment_method_id` | path | string | Yes | Payment method ID |

**Request Body:** `VerifyMicroDepositsRequest`

**Responses:**

- `200`: Successful Response → `VerifyMicroDepositsResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/payment-methods

**Payment-Methods:List**

**Responses:**

- `200`: Successful Response → `PaymentMethodListResponse`

---

### `DELETE` /api/payment-methods/{payment_method_id}

**Payment-Methods:Delete**

Delete (deactivate) a payment method.

Raises:
    PaymentMethodNotFoundError: Payment method does not exist
    PaymentMethodValidationError: Payment method does not belong to user

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `payment_method_id` | path | string | Yes | Payment method ID |

**Responses:**

- `200`: Successful Response → `PaymentMethodDeleteResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/payment-methods/{payment_method_id}/balance/refresh

**Payment-Methods:Refresh-Balance**

Refresh balance for a payment method from Plaid.

Raises:
    PaymentMethodNotFoundError: Payment method does not exist
    PaymentMethodValidationError: Payment method does not belong to user or not connected via Plaid

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `payment_method_id` | path | string | Yes | Payment method ID |

**Responses:**

- `200`: Successful Response → `PaymentMethodResponse`
- `422`: Validation Error → `HTTPValidationError`

---

## Plaid

### `POST` /api/plaid/link-token

**Plaid:Create-Link-Token**

Create a Plaid Link token for initiating bank account authentication.

Raises:
    HTTPException: 502 Bad Gateway if Plaid API fails
    HTTPException: 500 Internal Server Error for other failures

**Responses:**

- `200`: Successful Response → `LinkTokenResponse`

---

### `POST` /api/plaid/link-success

**Plaid:Link-Success**

Process successful Plaid Link authentication and create payment method.

Raises:
    PaymentMethodAlreadyExistsError: User already has an active payment method
    PlaidTokenExchangeError: Failed to exchange public token for access token
    ProcessorTokenCreationError: Failed to create ACHQ processor token
    UserProfileIncompleteError: User profile missing required fields
    HTTPException: 502 Bad Gateway if Plaid API fails

**Request Body:** `LinkSuccessRequest`

**Responses:**

- `200`: Successful Response → `LinkSuccessResponse`
- `422`: Validation Error → `HTTPValidationError`

---

## Profile

### `GET` /api/profile

**Profile:Get**

**Responses:**

- `200`: Successful Response → `UserDetailResponse`

---

### `PUT` /api/profile

**Profile:Update**

Update user profile, allowing phone and address changes but blocking other fields for active investments.

**Request Body:** `ProfileUpdateRequest`

**Responses:**

- `200`: Successful Response → `ProfileUpdateResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/profile

**Profile:Register**

Create a new user account with email and password.

**Request Body:** `UserRegisterRequest`

**Responses:**

- `201`: Successful Response → `UserRegisterResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `PATCH` /api/profile

**Profile:Patch**

Patch user profile, blocking account type changes for active investments.

**Request Body:** `ProfilePatchRequest`

**Responses:**

- `200`: Successful Response → `ProfilePatchResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `PUT` /api/profile/confirm/{user_id}

**Profile:Confirm**

Verify email with token and auto-login user.

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `user_id` | path | integer | Yes | - |

**Request Body:** `ConfirmAccountRequest`

**Responses:**

- `200`: Successful Response → `ConfirmAccountResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `PUT` /api/profile/change_password

**Profile:Change Password**

**Request Body:** `ChangePasswordRequest`

**Responses:**

- `200`: Successful Response → `ChangePasswordResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `GET` /api/profile/trusted_contact

**Trusted Contact:Get**

Get the trusted contact for the current user.

**Responses:**

- `200`: Successful Response → `TrustedContactResponse`

---

### `PUT` /api/profile/trusted_contact

**Trusted Contact:Update**

Update the trusted contact for the current user.

**Request Body:** `TrustedContactUpdateRequest`

**Responses:**

- `200`: Successful Response → `TrustedContactResponse`
- `422`: Validation Error → `HTTPValidationError`

---

### `POST` /api/profile/trusted_contact

**Trusted Contact:Create**

Create a new trusted contact for the current user.

**Request Body:** `TrustedContactCreateRequest`

**Responses:**

- `201`: Successful Response → `TrustedContactResponse`
- `422`: Validation Error → `HTTPValidationError`

---

## Support

### `POST` /api/support/contact

**Support:Contact**

**Request Body:** `ContactRequestCreate`

**Responses:**

- `201`: Successful Response → `ContactRequestResponse`
- `422`: Validation Error → `HTTPValidationError`

---

## Withdrawals

### `GET` /api/withdrawals

**Withdrawals:List**

**Responses:**

- `200`: Successful Response → `WithdrawalListResponse`

---

### `GET` /api/withdrawals/{withdrawal_id}

**Withdrawals:Get**

**Parameters:**

| Name | In | Type | Required | Description |
|------|----|----|----------|-------------|
| `withdrawal_id` | path | integer | Yes | - |

**Responses:**

- `200`: Successful Response → `WithdrawalDetailResponse`
- `422`: Validation Error → `HTTPValidationError`

---

## Schemas

<details><summary>All Schemas (112)</summary>

- [`AccountType-Output`](#accounttype-output)
- [`AccreditationAttestationCreateRequest`](#accreditationattestationcreaterequest)
- [`AccreditationAttestationDetailResponse`](#accreditationattestationdetailresponse)
- [`AccreditationAttestationResponse`](#accreditationattestationresponse)
- [`AccreditationStatus`](#accreditationstatus)
- [`AccreditedType`](#accreditedtype)
- [`AccrualSegmentResponse`](#accrualsegmentresponse)
- [`ACHQCheckType`](#achqchecktype)
- [`ActivityEventResponse`](#activityeventresponse)
- [`AddressDetail`](#addressdetail)
- [`AddressUpdateRequest`](#addressupdaterequest)
- [`AdminSettingName`](#adminsettingname)
- [`AdminSettingResponse`](#adminsettingresponse)
- [`AdminSettingsResponse`](#adminsettingsresponse)
- [`AdminSettingUpdateRequest`](#adminsettingupdaterequest)
- [`AdminUserUpdateRequest`](#adminuserupdaterequest)
- [`app__payments__models__enums__AccountType`](#app__payments__models__enums__accounttype)
- [`app__users__models__enums__AccountType`](#app__users__models__enums__accounttype)
- [`AppTimeResponse`](#apptimeresponse)
- [`CalculationDetails`](#calculationdetails)
- [`ChangePasswordRequest`](#changepasswordrequest)
- [`ChangePasswordResponse`](#changepasswordresponse)
- [`ComplianceInfo`](#complianceinfo)
- [`ConfirmAccountRequest`](#confirmaccountrequest)
- [`ConfirmAccountResponse`](#confirmaccountresponse)
- [`ContactCategory`](#contactcategory)
- [`ContactPriority`](#contactpriority)
- [`ContactRequestCreate`](#contactrequestcreate)
- [`ContactRequestDetail`](#contactrequestdetail)
- [`ContactRequestResponse`](#contactrequestresponse)
- [`CreateTestPaymentMethodRequest`](#createtestpaymentmethodrequest)
- [`CreateTestPaymentMethodResponse`](#createtestpaymentmethodresponse)
- [`CreateTestTokenRequest`](#createtesttokenrequest)
- [`CreateTestTokenResponse`](#createtesttokenresponse)
- [`EntityDetail`](#entitydetail)
- [`EntityUpdateRequest`](#entityupdaterequest)
- [`FundingStatus`](#fundingstatus)
- [`HTTPValidationError`](#httpvalidationerror)
- [`InstitutionInfo`](#institutioninfo)
- [`InvestmentCalculationData`](#investmentcalculationdata)
- [`InvestmentCalculationResponse`](#investmentcalculationresponse)
- [`InvestmentCreateRequest`](#investmentcreaterequest)
- [`InvestmentDetailResponse`](#investmentdetailresponse)
- [`InvestmentListResponse`](#investmentlistresponse)
- [`InvestmentResponse`](#investmentresponse)
- [`InvestmentStatus`](#investmentstatus)
- [`InvestmentSubmitRequest`](#investmentsubmitrequest)
- [`InvestmentUpdateRequest`](#investmentupdaterequest)
- [`JointHolderAcknowledgementPayload`](#jointholderacknowledgementpayload)
- [`JointHolderDetail`](#jointholderdetail)
- [`JointHolderUpdateRequest`](#jointholderupdaterequest)
- [`LinkSuccessRequest`](#linksuccessrequest)
- [`LinkSuccessResponse`](#linksuccessresponse)
- [`LinkTokenResponse`](#linktokenresponse)
- [`LockupPeriod`](#lockupperiod)
- [`ManualEntryRequest`](#manualentryrequest)
- [`ManualEntryResponse`](#manualentryresponse)
- [`MicroDepositAmountResponse`](#microdepositamountresponse)
- [`OnboardingResetResponse`](#onboardingresetresponse)
- [`OnboardingStatus`](#onboardingstatus)
- [`Page_AccreditationAttestationResponse_`](#page_accreditationattestationresponse_)
- [`Page_ActivityEventResponse_`](#page_activityeventresponse_)
- [`Page_InvestmentResponse_`](#page_investmentresponse_)
- [`Page_PaymentMethodResponse_`](#page_paymentmethodresponse_)
- [`Page_UserDetail_`](#page_userdetail_)
- [`Page_WithdrawalResponse_`](#page_withdrawalresponse_)
- [`PasswordResetConfirm`](#passwordresetconfirm)
- [`PasswordResetRequest`](#passwordresetrequest)
- [`PasswordResetResponse`](#passwordresetresponse)
- [`PaymentFrequency`](#paymentfrequency)
- [`PaymentMethod`](#paymentmethod)
- [`PaymentMethodDeleteResponse`](#paymentmethoddeleteresponse)
- [`PaymentMethodListResponse`](#paymentmethodlistresponse)
- [`PaymentMethodResponse`](#paymentmethodresponse)
- [`PaymentMethodStatus`](#paymentmethodstatus)
- [`PaymentMethodType`](#paymentmethodtype)
- [`PreferredContactMethod`](#preferredcontactmethod)
- [`ProfilePatchRequest`](#profilepatchrequest)
- [`ProfilePatchResponse`](#profilepatchresponse)
- [`ProfileUpdateRequest`](#profileupdaterequest)
- [`ProfileUpdateResponse`](#profileupdateresponse)
- [`RefreshTokenRequest`](#refreshtokenrequest)
- [`RefreshTokenResponse`](#refreshtokenresponse)
- [`ResetAppTimeResponse`](#resetapptimeresponse)
- [`SandboxFundingResponse`](#sandboxfundingresponse)
- [`SetAppTimeRequest`](#setapptimerequest)
- [`TimeMachineStatusResponse`](#timemachinestatusresponse)
- [`TokenResponse`](#tokenresponse)
- [`TransactionAchqPaymentResponse`](#transactionachqpaymentresponse)
- [`TransactionMigrateResponse`](#transactionmigrateresponse)
- [`TransactionResponse`](#transactionresponse)
- [`TransactionStatus`](#transactionstatus)
- [`TransactionType`](#transactiontype)
- [`TrustedContactCreateRequest`](#trustedcontactcreaterequest)
- [`TrustedContactDetail`](#trustedcontactdetail)
- [`TrustedContactRelationship`](#trustedcontactrelationship)
- [`TrustedContactResponse`](#trustedcontactresponse)
- [`TrustedContactUpdateRequest`](#trustedcontactupdaterequest)
- [`UserDetail`](#userdetail)
- [`UserDetailResponse`](#userdetailresponse)
- [`UserRegisterRequest`](#userregisterrequest)
- [`UserRegisterResponse`](#userregisterresponse)
- [`UserResponse`](#userresponse)
- [`ValidationError`](#validationerror)
- [`VerificationMethod`](#verificationmethod)
- [`VerifyMicroDepositsRequest`](#verifymicrodepositsrequest)
- [`VerifyMicroDepositsResponse`](#verifymicrodepositsresponse)
- [`WithdrawalDetailResponse`](#withdrawaldetailresponse)
- [`WithdrawalListResponse`](#withdrawallistresponse)
- [`WithdrawalResponse`](#withdrawalresponse)
- [`WithdrawalStatus`](#withdrawalstatus)
- [`WithdrawalType`](#withdrawaltype)

</details>

### AccountType-Output

Enum values: `checking`, `savings`

### AccreditationAttestationCreateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | `AccreditationStatus` | Yes | - |
| `accreditedType` | `AccreditedType` | null | No | - |
| `tenPercentLimitConfirmed` | boolean | null | No | Tenpercentlimitconfirmed |

### AccreditationAttestationDetailResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `attestation` | `AccreditationAttestationResponse` | Yes | - |

### AccreditationAttestationResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | Id |
| `userId` | string | Yes | Userid |
| `investmentId` | string | Yes | Investmentid |
| `status` | `AccreditationStatus` | Yes | - |
| `accreditedType` | `AccreditedType` | null | Yes | - |
| `tenPercentLimitConfirmed` | boolean | Yes | Tenpercentlimitconfirmed |
| `attestedAt` | string | Yes | Attestedat |

### AccreditationStatus

Enum values: `accredited`, `not_accredited`

### AccreditedType

Enum values: `assets`, `income`

### AccrualSegmentResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `segmentType` | string | Yes | Segmenttype |
| `startDate` | string | Yes | Startdate |
| `endDate` | string | Yes | Enddate |
| `daysInSegment` | integer | Yes | Daysinsegment |
| `startingBalance` | string | Yes | Startingbalance |
| `endingBalance` | string | Yes | Endingbalance |
| `earningsInSegment` | string | Yes | Earningsinsegment |

### ACHQCheckType

Enum values: `Personal`, `Business`

### ActivityEventResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Id |
| `userId` | integer | Yes | Userid |
| `investmentId` | integer | null | No | Investmentid |
| `activityType` | string | Yes | Activitytype |
| `status` | string | Yes | Status |
| `title` | string | Yes | Title |
| `description` | string | null | No | Description |
| `eventMetadata` | string | null | No | Eventmetadata |
| `eventDate` | string | Yes | Eventdate |
| `createdAt` | string | Yes | Createdat |
| `transaction` | `TransactionResponse` | null | No | - |

### AddressDetail

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `street1` | string | Yes | Street1 |
| `street2` | string | null | No | Street2 |
| `city` | string | Yes | City |
| `state` | string | Yes | State |
| `zip` | string | Yes | Zip |

### AddressUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `street1` | string | null | No | Street1 |
| `street2` | string | null | No | Street2 |
| `city` | string | null | No | City |
| `state` | string | null | No | State |
| `zip` | string | null | No | Zip |

### AdminSettingName

Enum values: `email_provider`

### AdminSettingResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `AdminSettingName` | Yes | - |
| `value` | string | Yes | Value |

### AdminSettingsResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `settings` | array<`AdminSettingResponse`> | Yes | Settings |

### AdminSettingUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | string | Yes | Value |

### AdminUserUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `firstName` | string | null | No | Firstname |
| `lastName` | string | null | No | Lastname |
| `email` | string | null | No | Email |
| `ssn` | string | null | No | Ssn |

### app__payments__models__enums__AccountType

Enum values: `checking`, `savings`

### app__users__models__enums__AccountType

Enum values: `individual`, `joint`, `entity`, `ira`

### AppTimeResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `appTime` | string | Yes | Apptime |

### CalculationDetails

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `totalPeriods` | integer | Yes | Totalperiods |
| `monthsElapsed` | string | Yes | Monthselapsed |
| `accrualSegments` | array<`AccrualSegmentResponse`> | Yes | Accrualsegments |

### ChangePasswordRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `currentPassword` | string | Yes | Current password |
| `newPassword` | string | Yes | New password |

### ChangePasswordResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `user` | `UserResponse` | Yes | - |

### ComplianceInfo

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | `AccreditationStatus` | Yes | - |
| `accreditedType` | `AccreditedType` | null | Yes | - |
| `tenPercentLimitConfirmed` | boolean | null | Yes | Tenpercentlimitconfirmed |
| `attestedAt` | string | Yes | Attestedat |

### ConfirmAccountRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `verificationCode` | string | Yes | Email verification code |

### ConfirmAccountResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `user` | `UserResponse` | Yes | - |
| `access_token` | string | Yes | Access Token |
| `refresh_token` | string | Yes | Refresh Token |
| `auto_logged_in` | boolean | No | Auto Logged In |

### ContactCategory

Enum values: `investments`, `withdrawals`, `account`, `other`

### ContactPriority

Enum values: `low`, `medium`, `high`

### ContactRequestCreate

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subject` | string | Yes | Subject |
| `category` | `ContactCategory` | null | No | - |
| `priority` | `ContactPriority` | null | No | - |
| `message` | string | Yes | Message |
| `preferredContactMethod` | `PreferredContactMethod` | null | No | - |

### ContactRequestDetail

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | Id |
| `userId` | integer | null | Yes | Userid |
| `subject` | string | Yes | Subject |
| `category` | `ContactCategory` | null | Yes | - |
| `priority` | `ContactPriority` | null | Yes | - |
| `message` | string | Yes | Message |
| `preferredContactMethod` | `PreferredContactMethod` | null | Yes | - |
| `createdAt` | string | Yes | Createdat |

### ContactRequestResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `contactRequest` | `ContactRequestDetail` | Yes | - |

### CreateTestPaymentMethodRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `user_id` | integer | Yes | User Id |

### CreateTestPaymentMethodResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | Yes | Success |
| `payment_method_id` | string | Yes | Payment Method Id |
| `display_name` | string | Yes | Display Name |
| `status` | string | Yes | Status |

### CreateTestTokenRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `institution_id` | string | No | Plaid institution identifier (sandbox default: First Plaid Bank) |
| `initial_products` | array | No | Plaid products to enable (auth required for ACH) |

### CreateTestTokenResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `public_token` | string | Yes | Public Token |
| `institution_id` | string | Yes | Institution Id |
| `account_id` | string | Yes | Account Id |

### EntityDetail

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Name |
| `title` | string | null | No | Title |
| `formationDate` | string | null | No | Formationdate |
| `taxId` | string | Yes | Taxid |
| `phone` | string | null | No | Phone |
| `address` | `AddressDetail` | null | No | - |

### EntityUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Name |
| `title` | string | null | No | Title |
| `formationDate` | string | null | No | Formationdate |
| `taxId` | string | Yes | Taxid |
| `phone` | string | null | No | Phone |
| `address` | `AddressDetail` | null | No | - |

### FundingStatus

Enum values: `created`, `pending`, `submitted`, `settled`, `failed`, `returned`

### HTTPValidationError

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `detail` | array<`ValidationError`> | No | Detail |

### InstitutionInfo

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Plaid institution identifier |
| `name` | string | Yes | Bank or financial institution name |

### InvestmentCalculationData

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `investmentId` | integer | Yes | Investmentid |
| `principalAmount` | string | Yes | Principalamount |
| `currentValue` | string | Yes | Currentvalue |
| `totalEarnings` | string | Yes | Totalearnings |
| `apyRate` | string | Yes | Apyrate |
| `lockupPeriod` | `LockupPeriod` | Yes | - |
| `paymentFrequency` | `PaymentFrequency` | Yes | - |
| `confirmedAt` | string | null | No | Confirmedat |
| `lockupEndAt` | string | null | No | Lockupendat |
| `asOfDate` | string | null | Yes | Asofdate |
| `isWithdrawable` | boolean | Yes | Iswithdrawable |
| `daysUntilWithdrawable` | integer | null | No | Daysuntilwithdrawable |
| `details` | `CalculationDetails` | Yes | - |

### InvestmentCalculationResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `data` | `InvestmentCalculationData` | Yes | - |

### InvestmentCreateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `amount` | number | string | Yes | Amount |
| `lockupPeriod` | `LockupPeriod` | Yes | Supported values: ('1-year', '3-year') |
| `paymentFrequency` | `PaymentFrequency` | Yes | Supported values: ('monthly', 'compounding') |
| `paymentMethod` | `PaymentMethod` | null | No | Supported values: ('ach', 'wire') |
| `jointHolderAcknowledgement` | `JointHolderAcknowledgementPayload` | null | No | - |

### InvestmentDetailResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `investment` | `InvestmentResponse` | Yes | - |

### InvestmentListResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `investments` | array<`InvestmentResponse`> | Yes | Investments |

### InvestmentResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | Id |
| `userId` | integer | Yes | Userid |
| `amount` | string | Yes | Amount |
| `bonds` | integer | Yes | Bonds |
| `status` | `InvestmentStatus` | Yes | - |
| `state` | string | null | No | State |
| `lockupPeriod` | `LockupPeriod` | Yes | - |
| `paymentFrequency` | `PaymentFrequency` | Yes | - |
| `paymentMethod` | `PaymentMethod` | null | Yes | - |
| `autoApproved` | boolean | Yes | Autoapproved |
| `requiresManualApproval` | boolean | Yes | Requiresmanualapproval |
| `confirmedAt` | string | null | No | Confirmedat |
| `lockupEndAt` | string | null | No | Lockupendat |
| `createdAt` | string | null | Yes | Createdat |
| `updatedAt` | string | null | Yes | Updatedat |
| `compliance` | `ComplianceInfo` | null | No | - |

### InvestmentStatus

Enum values: `draft`, `pending`, `active`, `withdrawal_notice`, `withdrawn`, `rejected`

### InvestmentSubmitRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `paymentMethodId` | string | null | No | Paymentmethodid |

### InvestmentUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `amount` | number | string | null | No | Amount |
| `state` | string | null | No | State |
| `lockupPeriod` | `LockupPeriod` | null | No | Supported values: ('1-year', '3-year') |
| `paymentFrequency` | `PaymentFrequency` | null | No | Supported values: ('monthly', 'compounding') |
| `paymentMethod` | `PaymentMethod` | null | No | Supported values: ('ach', 'wire') |
| `jointHolderAcknowledgement` | `JointHolderAcknowledgementPayload` | null | No | - |

### JointHolderAcknowledgementPayload

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `accepted` | boolean | Yes | Accepted |
| `acceptedAt` | string | null | No | Acceptedat |

### JointHolderDetail

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `firstName` | string | Yes | Firstname |
| `lastName` | string | Yes | Lastname |
| `email` | string | null | No | Email |
| `phone` | string | null | No | Phone |
| `dob` | string | null | No | Dob |
| `ssn` | string | null | No | Ssn |
| `address` | `AddressDetail` | null | No | - |

### JointHolderUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `firstName` | string | Yes | Firstname |
| `lastName` | string | Yes | Lastname |
| `email` | string | Yes | Email |
| `phone` | string | Yes | Phone |
| `dob` | string | Yes | Dob |
| `ssn` | string | Yes | Ssn |
| `address` | `AddressDetail` | Yes | - |

### LinkSuccessRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `public_token` | string | Yes | Temporary token received from Plaid Link after user completes authentication |
| `account_id` | string | Yes | Plaid account identifier for the selected bank account |
| `institution` | `InstitutionInfo` | Yes | - |
| `account_mask` | string | Yes | Last 4 digits of the bank account |
| `account_name` | enum: `Checking`, `Savings` | Yes | Account Name |
| `save_for_reuse` | boolean | No | Save For Reuse |
| `idempotency_key` | string | Yes | Unique identifier to prevent duplicate payment method creation (UUID v4 recommended) |

### LinkSuccessResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `payment_method` | `PaymentMethodResponse` | Yes | - |

### LinkTokenResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `link_token` | string | Yes | Link Token |
| `expiration` | string | Yes | Expiration |

### LockupPeriod

Enum values: `1-year`, `3-year`

### ManualEntryRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `routing_number` | string | No | 9-digit ABA routing number (sandbox default: 123123123) |
| `account_number` | string | Yes | Bank account number |
| `account_type` | `app__payments__models__enums__AccountType` | No | Type of bank account |
| `account_holder_type` | `ACHQCheckType` | No | Account holder type (Personal or Business) |
| `idempotency_key` | string | Yes | Unique identifier to prevent duplicate payment method creation (UUID v4 recommended) |
| `verification_method` | `VerificationMethod` | No | Bank account verification method. 'real_time' uses ACHQ Bank Account ID for instant verification. 'micro_deposits' (deprecated) sends small deposits for manual verification. |

### ManualEntryResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `payment_method` | `PaymentMethodResponse` | Yes | - |

### MicroDepositAmountResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `amount_1` | integer | null | Yes | First micro-deposit amount in cents (only available in sandbox/test environments) |
| `amount_2` | integer | null | Yes | Second micro-deposit amount in cents (only available in sandbox/test environments) |

### OnboardingResetResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `user` | `UserDetail` | Yes | - |
| `passwordResetToken` | string | Yes | Passwordresettoken |

### OnboardingStatus

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `passwordSet` | boolean | Yes | Passwordset |
| `bankConnected` | boolean | Yes | Bankconnected |
| `isComplete` | boolean | Yes | Iscomplete |

### Page_AccreditationAttestationResponse_

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | array<`AccreditationAttestationResponse`> | Yes | Items |
| `total` | integer | Yes | Total |
| `page` | integer | Yes | Page |
| `size` | integer | Yes | Size |
| `pages` | integer | Yes | Pages |

### Page_ActivityEventResponse_

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | array<`ActivityEventResponse`> | Yes | Items |
| `total` | integer | Yes | Total |
| `page` | integer | Yes | Page |
| `size` | integer | Yes | Size |
| `pages` | integer | Yes | Pages |

### Page_InvestmentResponse_

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | array<`InvestmentResponse`> | Yes | Items |
| `total` | integer | Yes | Total |
| `page` | integer | Yes | Page |
| `size` | integer | Yes | Size |
| `pages` | integer | Yes | Pages |

### Page_PaymentMethodResponse_

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | array<`PaymentMethodResponse`> | Yes | Items |
| `total` | integer | Yes | Total |
| `page` | integer | Yes | Page |
| `size` | integer | Yes | Size |
| `pages` | integer | Yes | Pages |

### Page_UserDetail_

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | array<`UserDetail`> | Yes | Items |
| `total` | integer | Yes | Total |
| `page` | integer | Yes | Page |
| `size` | integer | Yes | Size |
| `pages` | integer | Yes | Pages |

### Page_WithdrawalResponse_

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | array<`WithdrawalResponse`> | Yes | Items |
| `total` | integer | Yes | Total |
| `page` | integer | Yes | Page |
| `size` | integer | Yes | Size |
| `pages` | integer | Yes | Pages |

### PasswordResetConfirm

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `token` | string | Yes | Password reset token |
| `new_password` | string | Yes | New password |

### PasswordResetRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string | Yes | Email address for reset |

### PasswordResetResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | Yes | Success |
| `message` | string | Yes | Message |

### PaymentFrequency

Enum values: `monthly`, `compounding`

### PaymentMethod

Enum values: `ach`, `wire`

### PaymentMethodDeleteResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | Yes | Message |
| `payment_method_id` | string | Yes | Payment Method Id |

### PaymentMethodListResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `payment_methods` | array<`PaymentMethodResponse`> | Yes | Payment Methods |

### PaymentMethodResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Id |
| `type` | `PaymentMethodType` | Yes | Payment method type |
| `display_name` | string | Yes | Human-readable display name |
| `bank_name` | string | Yes | Financial institution name |
| `account_type` | `AccountType-Output` | Yes | Bank account type |
| `last4` | string | Yes | Last 4 digits of account |
| `status` | `PaymentMethodStatus` | Yes | Payment method verification status |
| `provider_transaction_id` | string | null | No | Provider Transaction Id |
| `current_balance` | string | null | No | Current account balance in dollars (null for manual entry accounts) |
| `available_balance` | string | null | No | Available account balance in dollars (null for manual entry accounts) |
| `balance_last_updated` | string | null | No | ISO 8601 timestamp of last balance update (null if never fetched) |
| `created_at` | string | Yes | ISO 8601 timestamp |
| `verification_attempts_remaining` | integer | null | No | Number of verification attempts remaining (null if not applicable) |
| `verification_expires_at` | string | null | No | ISO 8601 timestamp when verification expires (null if not applicable) |

### PaymentMethodStatus

Enum values: `ready`, `verification_pending`, `verification_failed`

### PaymentMethodType

Enum values: `bank_ach`

### PreferredContactMethod

Enum values: `email`, `phone`

### ProfilePatchRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `phone` | string | null | No | Phone |
| `address` | `AddressUpdateRequest` | null | No | - |
| `accountType` | `app__users__models__enums__AccountType` | null | No | - |

### ProfilePatchResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `user` | `UserDetail` | Yes | - |

### ProfileUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `firstName` | string | null | No | Firstname |
| `lastName` | string | null | No | Lastname |
| `phone` | string | null | No | Phone |
| `dob` | string | null | No | Dob |
| `ssn` | string | null | No | Ssn |
| `address` | `AddressUpdateRequest` | null | No | - |
| `accountType` | `app__users__models__enums__AccountType` | null | No | - |
| `jointHoldingType` | string | null | No | Jointholdingtype |
| `jointHolder` | `JointHolderUpdateRequest` | null | No | - |
| `entity` | `EntityUpdateRequest` | null | No | - |

### ProfileUpdateResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `user` | `UserDetail` | Yes | - |

### RefreshTokenRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `refresh_token` | string | Yes | JWT refresh token |

### RefreshTokenResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `access_token` | string | Yes | New JWT access token |
| `token_type` | string | No | Token type |
| `expires_in` | integer | Yes | Access token expiration time in seconds |

### ResetAppTimeResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `appTime` | string | Yes | Apptime |
| `message` | string | Yes | Message |

### SandboxFundingResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | Yes | Success |
| `pending_count` | integer | Yes | Pending Count |
| `processed_count` | integer | Yes | Processed Count |
| `new_status` | string | Yes | New Status |

### SetAppTimeRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `appTime` | string | Yes | Apptime |

### TimeMachineStatusResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `appTime` | string | Yes | Apptime |
| `isOverridden` | boolean | Yes | Isoverridden |
| `systemTime` | string | Yes | Systemtime |
| `offsetSeconds` | number | Yes | Offsetseconds |
| `offsetDisplay` | string | Yes | Offsetdisplay |

### TokenResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `access_token` | string | Yes | JWT access token |
| `refresh_token` | string | Yes | JWT refresh token |
| `token_type` | string | No | Token type |
| `expires_in` | integer | Yes | Access token expiration time in seconds |

### TransactionAchqPaymentResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `transactionId` | integer | Yes | Transactionid |
| `transactionStatus` | `TransactionStatus` | Yes | - |
| `fundingId` | string | Yes | Fundingid |
| `fundingStatus` | `FundingStatus` | Yes | - |
| `achqTransactionId` | string | null | No | Achqtransactionid |

### TransactionMigrateResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `transactionsDeleted` | integer | Yes | Transactionsdeleted |
| `eventsDeleted` | integer | Yes | Eventsdeleted |
| `transactionsCreated` | integer | Yes | Transactionscreated |

### TransactionResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | Id |
| `transaction_type` | `TransactionType` | Yes | - |
| `amount` | string | Yes | Amount |
| `transaction_date` | string | Yes | Transaction Date |
| `status` | `TransactionStatus` | Yes | - |
| `description` | string | null | Yes | Description |
| `human_id` | string | Yes | Human Id |
| `created_at` | string | Yes | Created At |

### TransactionStatus

Enum values: `pending`, `submitted`, `approved`, `rejected`, `received`

### TransactionType

Enum values: `investment`, `distribution`, `contribution`, `redemption`

### TrustedContactCreateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `firstName` | string | Yes | Firstname |
| `lastName` | string | Yes | Lastname |
| `relationshipType` | `TrustedContactRelationship` | Yes | - |
| `email` | string | Yes | Email |
| `phone` | string | Yes | Phone |

### TrustedContactDetail

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | Id |
| `userId` | integer | Yes | Userid |
| `firstName` | string | Yes | Firstname |
| `lastName` | string | Yes | Lastname |
| `relationshipType` | `TrustedContactRelationship` | Yes | - |
| `email` | string | Yes | Email |
| `phone` | string | null | Yes | Phone |

### TrustedContactRelationship

Enum values: `spouse`, `parent`, `sibling`, `child`, `friend`, `attorney`, `financial_advisor`, `other`

### TrustedContactResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `trustedContact` | `TrustedContactDetail` | null | Yes | - |

### TrustedContactUpdateRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `firstName` | string | null | No | Firstname |
| `lastName` | string | null | No | Lastname |
| `relationshipType` | `TrustedContactRelationship` | null | No | - |
| `email` | string | null | No | Email |
| `phone` | string | null | No | Phone |

### UserDetail

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | User ID (can be numeric or human-readable like USR-1001) |
| `email` | string | Yes | Email |
| `isVerified` | boolean | Yes | Isverified |
| `verifiedAt` | string | null | No | Verifiedat |
| `isAdmin` | boolean | No | Isadmin |
| `firstName` | string | null | No | Firstname |
| `lastName` | string | null | No | Lastname |
| `phone` | string | null | No | Phone |
| `dob` | string | null | No | Dob |
| `ssn` | string | null | No | Ssn |
| `address` | `AddressDetail` | null | No | - |
| `accountType` | string | null | No | - |
| `jointHoldingType` | string | null | No | Jointholdingtype |
| `jointHolder` | `JointHolderDetail` | null | No | - |
| `entity` | `EntityDetail` | null | No | - |
| `createdAt` | string | null | No | Createdat |
| `updatedAt` | string | null | No | Updatedat |
| `lastActiveAt` | string | null | No | Lastactiveat |
| `sessionExpiresAt` | string | null | No | Sessionexpiresat |
| `onboardingStatus` | `OnboardingStatus` | null | No | - |

### UserDetailResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `user` | `UserDetail` | Yes | - |

### UserRegisterRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string | Yes | User's email address |
| `password` | string | Yes | User's password |

### UserRegisterResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `user` | `UserResponse` | Yes | - |

### UserResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Id |
| `email` | string | Yes | Email |
| `is_verified` | boolean | Yes | Is Verified |
| `created_at` | string | null | Yes | Created At |
| `updated_at` | string | null | Yes | Updated At |
| `last_active_at` | string | null | No | Last Active At |
| `session_expires_at` | string | null | No | Session Expires At |

### ValidationError

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `loc` | array | Yes | Location |
| `msg` | string | Yes | Message |
| `type` | string | Yes | Error Type |

### VerificationMethod

Enum values: `real_time`, `micro_deposits`

### VerifyMicroDepositsRequest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `amount_1` | integer | Yes | First micro-deposit amount in cents |
| `amount_2` | integer | Yes | Second micro-deposit amount in cents |

### VerifyMicroDepositsResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `payment_method` | `PaymentMethodResponse` | Yes | - |

### WithdrawalDetailResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `withdrawal` | `WithdrawalResponse` | Yes | - |

### WithdrawalListResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | boolean | No | Success |
| `withdrawals` | array<`WithdrawalResponse`> | Yes | Withdrawals |

### WithdrawalResponse

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | integer | Yes | Id |
| `userId` | integer | Yes | Userid |
| `investmentId` | integer | Yes | Investmentid |
| `amount` | string | Yes | Amount |
| `principalAmount` | string | Yes | Principalamount |
| `interestAmount` | string | Yes | Interestamount |
| `status` | `WithdrawalStatus` | Yes | - |
| `withdrawalType` | `WithdrawalType` | Yes | - |
| `adminTerminated` | boolean | Yes | Adminterminated |
| `adminUserId` | integer | null | No | Adminuserid |
| `lockupOverridden` | boolean | Yes | Lockupoverridden |
| `investmentSnapshot` | object | null | No | Investmentsnapshot |
| `requestedAt` | string | null | Yes | Requestedat |
| `approvedAt` | string | null | No | Approvedat |
| `rejectedAt` | string | null | No | Rejectedat |
| `paidAt` | string | null | No | Paidat |
| `payoutCalculatedAt` | string | null | No | Payoutcalculatedat |
| `rejectionReason` | string | null | No | Rejectionreason |
| `adminNotes` | string | null | No | Adminnotes |
| `createdAt` | string | null | Yes | Createdat |
| `updatedAt` | string | null | Yes | Updatedat |

### WithdrawalStatus

Enum values: `pending`, `approved`, `rejected`, `paid`, `cancelled`, `failed`

### WithdrawalType

Enum values: `normal`, `admin_terminated`

