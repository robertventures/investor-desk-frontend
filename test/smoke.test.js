import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatCurrency, formatPercentage, formatName } from '../lib/formatters.js'

describe('Smoke Test - Formatters', () => {
  it('should format currency correctly', () => {
    assert.strictEqual(formatCurrency(1000), '$1,000.00')
    assert.strictEqual(formatCurrency(1234.56), '$1,234.56')
    assert.strictEqual(formatCurrency(0), '$0.00')
  })

  it('should format percentage correctly', () => {
    assert.strictEqual(formatPercentage(0.12), '12.00%')
    assert.strictEqual(formatPercentage(0.055), '5.50%')
  })

  it('should format name by removing invalid characters', () => {
    assert.strictEqual(formatName('John Doe 123'), 'John Doe ')
    assert.strictEqual(formatName('O\'Connor'), 'O\'Connor')
    assert.strictEqual(formatName('Sarah-Jane'), 'Sarah-Jane')
  })
})

