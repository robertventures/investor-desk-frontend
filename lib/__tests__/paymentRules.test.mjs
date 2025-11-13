import test from 'node:test'
import assert from 'node:assert/strict'

import { validateInvestmentData, validatePaymentMethod } from '../validation.js'
import { determineDraftPaymentMethod } from '../paymentMethodPreferences.js'

test('IRA draft can be created without selecting a payment method', () => {
  const result = validateInvestmentData({
    amount: 10000,
    lockupPeriod: '3-year',
    paymentFrequency: 'compounding',
    accountType: 'ira'
  })

  assert.equal(result.accountType, 'ira')
  assert.equal(result.paymentMethod, null)
})

test('IRA submissions still require wire payment method', () => {
  assert.throws(
    () => validatePaymentMethod('ach', 25000, 'ira'),
    /IRA accounts must use wire transfer/
  )
})

test('High dollar investments still require wire', () => {
  assert.throws(
    () => validatePaymentMethod('ACH', 150001, 'individual'),
    /must use wire transfer/
  )
})

test('Payment method validation normalizes casing', () => {
  const method = validatePaymentMethod('ACH', 5000, 'individual')
  assert.equal(method, 'ach')
})

test('Draft payment helper prefers wire in required scenarios', () => {
  assert.equal(determineDraftPaymentMethod('ira', 1000), 'wire')
  assert.equal(determineDraftPaymentMethod('individual', 250000), 'wire')
  assert.equal(determineDraftPaymentMethod('individual', 5000), 'ach')
})

