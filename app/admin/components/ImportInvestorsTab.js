'use client'

import { useState } from 'react'
import { fetchWithCsrf } from '../../../lib/csrfClient'
import styles from './ImportInvestorsTab.module.css'
import { isoToDateOnly, formatDateForDisplay } from '../../../lib/dateUtils.js'

const IMPORT_STAGES = {
  ADD: 'add',
  REVIEW: 'review',
  IMPORTING: 'importing',
  COMPLETE: 'complete'
}

// US States list
const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
]

// Phone formatting and validation
const formatPhone = (value = '') => {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const isCompletePhone = (value = '') => value.replace(/\D/g, '').length === 10

// Normalize phone number to E.164 format for database storage (+1XXXXXXXXXX)
const normalizePhoneForDB = (value = '') => {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+1${digits}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  return value
}

// ZIP code formatting (5 digits max)
const formatZip = (value = '') => value.replace(/\D/g, '').slice(0, 5)

// Names: Allow only letters, spaces, hyphens, apostrophes, and periods
const formatName = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

// SSN formatting (XXX-XX-XXXX)
const formatSsn = (value = '') => {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

const isCompleteSsn = (value = '') => value.replace(/\D/g, '').length === 9

export default function ImportInvestorsTab({ currentUser, onImportComplete }) {
  const [stage, setStage] = useState(IMPORT_STAGES.ADD)
  const [editableData, setEditableData] = useState([])
  const [importResults, setImportResults] = useState(null)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  
  // Manual form state
  const [manualForm, setManualForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    dob: '',
    ssn: '',
    accountCreatedDate: '', // Date when account was originally created on Wealthblock
    accountType: 'individual',
    address: {
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: ''
    },
    // Joint account fields
    jointHoldingType: '',
    jointHolder: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      dob: '',
      address: {
        street1: '',
        street2: '',
        city: '',
        state: '',
        zip: ''
      }
    },
    // Entity fields
    entity: {
      entityType: 'LLC',
      name: '',
      registrationDate: '',
      taxId: '',
      address: {
        street1: '',
        street2: '',
        city: '',
        state: '',
        zip: ''
      }
    },
    authorizedRepresentative: {
      firstName: '',
      lastName: '',
      dob: '',
      address: {
        street1: '',
        street2: '',
        city: '',
        state: '',
        zip: ''
      }
    },
    // IRA fields
    ira: {
      accountType: 'traditional',
      custodian: '',
      accountNumber: ''
    },
    investments: []
  })

  // Current investment being added
  const [currentInvestment, setCurrentInvestment] = useState({
    amount: '',
    paymentFrequency: 'compounding',
    lockupPeriod: '1-year',
    createdDate: '',
    confirmedDate: '',
    status: 'active'
  })


  // Handle data editing in review stage
  const handleDataEdit = (rowId, field, value) => {
    setEditableData(prev => prev.map(row => {
      if (row._rowId !== rowId) return row
      
      // Handle nested fields
      if (field.includes('.')) {
        const [parent, child] = field.split('.')
        return {
          ...row,
          [parent]: {
            ...row[parent],
            [child]: value
          }
        }
      }
      
      return {
        ...row,
        [field]: value
      }
    }))
  }

  // Remove row from import
  const handleRemoveRow = (rowId) => {
    setEditableData(prev => prev.filter(row => row._rowId !== rowId))
  }

  // Import investors
  // Perform the actual import (extracted for reuse)
  const performImport = async (dataToImport) => {
    setIsProcessing(true)
    setError(null)

    try {
      // Prepare data for import
      const investors = dataToImport.map(row => {
        const investor = { ...row }
        delete investor._rowId
        
        console.log('[Import] DEBUG - Raw investor before processing:', investor)
        console.log('[Import] DEBUG - Raw investments before processing:', investor.investments)
        
        // Process investments array
        if (investor.investments && Array.isArray(investor.investments)) {
          investor.investments = investor.investments.map(inv => {
            console.log('[Import] DEBUG - Processing investment:', inv)
            console.log('[Import] DEBUG - inv.amount value:', inv.amount, 'type:', typeof inv.amount)
            const parsed = parseFloat(inv.amount)
            console.log('[Import] DEBUG - parsed amount:', parsed)
            
            return {
              amount: parseFloat(inv.amount) || 0,
              paymentFrequency: inv.paymentFrequency || 'compounding',
              lockupPeriod: inv.lockupPeriod || '1-year',
              // Keep dates in YYYY-MM-DD format from date inputs (don't convert to ISO yet)
              // The API will convert them using dateOnlyToISO to prevent timezone shifts
              createdDate: inv.createdDate || null,
              confirmedDate: inv.confirmedDate || inv.createdDate || null,
              status: inv.status || 'active',
              accountType: investor.accountType || 'individual'
            }
          }).filter(inv => {
            console.log('[Import] DEBUG - Filtering investment with amount:', inv.amount)
            return inv.amount > 0
          }) // Only include investments with amount
        }
        
        console.log('[Import] DEBUG - Final processed investor:', investor)
        console.log('[Import] DEBUG - Final investments:', investor.investments)
        
        return investor
      })

      console.log('[Import] DEBUG - All investors to send:', investors)

      // Call import API
      const response = await fetchWithCsrf('/api/admin/import-investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUserId: currentUser.id,
          investors
        })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Import failed')
      }

      setImportResults(result)
      setStage(IMPORT_STAGES.COMPLETE)
      
      if (onImportComplete) {
        onImportComplete(result)
      }

    } catch (error) {
      console.error('Import error:', error)
      setError(error.message)
      setStage(IMPORT_STAGES.REVIEW)
    } finally {
      setIsProcessing(false)
    }
  }

  // Wrapper for importing from review stage
  const handleImport = async () => {
    setStage(IMPORT_STAGES.IMPORTING)
    await performImport(editableData)
  }

  // Handle manual form field changes
  const handleManualFormChange = (field, value) => {
    // Apply formatting based on field type
    let formattedValue = value
    
    if (field === 'phoneNumber' || field.endsWith('.phoneNumber')) {
      formattedValue = formatPhone(value)
    } else if (field === 'ssn' || field.endsWith('.ssn')) {
      formattedValue = formatSsn(value)
    } else if (field === 'firstName' || field === 'lastName' || 
               field.endsWith('.firstName') || field.endsWith('.lastName')) {
      formattedValue = formatName(value)
    } else if (field.endsWith('.zip')) {
      formattedValue = formatZip(value)
    }
    
    // Handle nested fields (e.g., address.street1, jointHolder.firstName, entity.name)
    if (field.includes('.')) {
      const parts = field.split('.')
      
      if (parts.length === 2) {
        const [parent, child] = parts
        setManualForm(prev => ({
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: formattedValue
          }
        }))
      } else if (parts.length === 3) {
        // Three levels deep (e.g., jointHolder.address.street1)
        const [grandparent, parent, child] = parts
        setManualForm(prev => ({
          ...prev,
          [grandparent]: {
            ...prev[grandparent],
            [parent]: {
              ...prev[grandparent][parent],
              [child]: formattedValue
            }
          }
        }))
      }
    } else {
      setManualForm(prev => ({
        ...prev,
        [field]: formattedValue
      }))
    }
  }

  // Handle current investment field changes
  const handleInvestmentChange = (field, value) => {
    setCurrentInvestment(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Add investment to list
  const handleAddInvestment = () => {
    if (!currentInvestment.amount) {
      setError('Investment amount is required')
      return
    }

    // Validate investment dates against account creation date
    if (manualForm.accountCreatedDate) {
      if (currentInvestment.createdDate && currentInvestment.createdDate < manualForm.accountCreatedDate) {
        setError(`Investment created date (${formatDateForDisplay(currentInvestment.createdDate)}) cannot be before account creation date (${formatDateForDisplay(manualForm.accountCreatedDate)})`)
        return
      }
      if (currentInvestment.confirmedDate && currentInvestment.confirmedDate < manualForm.accountCreatedDate) {
        setError(`Investment confirmed date (${formatDateForDisplay(currentInvestment.confirmedDate)}) cannot be before account creation date (${formatDateForDisplay(manualForm.accountCreatedDate)})`)
        return
      }
    }

    const newInvestment = {
      ...currentInvestment,
      id: `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    setManualForm(prev => ({
      ...prev,
      investments: [...prev.investments, newInvestment]
    }))

    // Reset current investment form
    setCurrentInvestment({
      amount: '',
      paymentFrequency: 'compounding',
      lockupPeriod: '1-year',
      createdDate: '',
      confirmedDate: '',
      status: 'active'
    })

    setError(null)
  }

  // Remove investment from list
  const handleRemoveInvestment = (investmentId) => {
    setManualForm(prev => ({
      ...prev,
      investments: prev.investments.filter(inv => inv.id !== investmentId)
    }))
  }

  // Add manual form data and immediately import (single-user workflow)
  const handleAddManualInvestor = async () => {
    // Validate required fields
    if (!manualForm.email || !manualForm.firstName || !manualForm.lastName) {
      setError('Email, First Name, and Last Name are required')
      return
    }

    // Validate email format
    if (!/\S+@\S+\.\S+/.test(manualForm.email)) {
      setError('Please enter a valid email address')
      return
    }

    // Validate phone number if provided
    if (manualForm.phoneNumber && !isCompletePhone(manualForm.phoneNumber)) {
      setError('Phone number must be 10 digits')
      return
    }

    // Validate investment dates against account creation date
    if (manualForm.accountCreatedDate && manualForm.investments.length > 0) {
      for (let i = 0; i < manualForm.investments.length; i++) {
        const inv = manualForm.investments[i]
        if (inv.createdDate && inv.createdDate < manualForm.accountCreatedDate) {
          setError(`Investment #${i + 1} created date (${formatDateForDisplay(inv.createdDate)}) cannot be before account creation date (${formatDateForDisplay(manualForm.accountCreatedDate)})`)
          return
        }
        if (inv.confirmedDate && inv.confirmedDate < manualForm.accountCreatedDate) {
          setError(`Investment #${i + 1} confirmed date (${formatDateForDisplay(inv.confirmedDate)}) cannot be before account creation date (${formatDateForDisplay(manualForm.accountCreatedDate)})`)
          return
        }
      }
    }

    // Validate account-type-specific required fields
    if (manualForm.accountType === 'joint') {
      if (!manualForm.jointHoldingType) {
        setError('Joint holding type is required for joint accounts')
        return
      }
      if (!manualForm.jointHolder.firstName || !manualForm.jointHolder.lastName) {
        setError('Joint holder first name and last name are required')
        return
      }
      if (!manualForm.jointHolder.email) {
        setError('Joint holder email is required')
        return
      }
      if (manualForm.jointHolder.phoneNumber && !isCompletePhone(manualForm.jointHolder.phoneNumber)) {
        setError('Joint holder phone number must be 10 digits')
        return
      }
    }

    if (manualForm.accountType === 'entity') {
      if (!manualForm.entity.name) {
        setError('Entity name is required for entity accounts')
        return
      }
      if (!manualForm.entity.taxId) {
        setError('Entity Tax ID/EIN is required')
        return
      }
      if (!manualForm.authorizedRepresentative.firstName || !manualForm.authorizedRepresentative.lastName) {
        setError('Authorized representative name is required')
        return
      }
    }

    if (manualForm.accountType === 'ira') {
      if (!manualForm.ira.custodian) {
        setError('IRA custodian is required')
        return
      }
      if (!manualForm.ira.accountNumber) {
        setError('IRA account number is required')
        return
      }
    }

    // Normalize phone numbers before adding
    const newInvestor = {
      ...manualForm,
      phoneNumber: manualForm.phoneNumber ? normalizePhoneForDB(manualForm.phoneNumber) : '',
      _rowId: 0
    }

    // Normalize joint holder phone if applicable
    if (newInvestor.accountType === 'joint' && newInvestor.jointHolder.phoneNumber) {
      newInvestor.jointHolder.phoneNumber = normalizePhoneForDB(newInvestor.jointHolder.phoneNumber)
    }
    
    // For single-user import: go directly to importing
    setEditableData([newInvestor])
    setError(null)
    setStage(IMPORT_STAGES.IMPORTING)
    
    // Immediately trigger import
    await performImport([newInvestor])
    
    // Reset form
    setManualForm({
      email: '',
      firstName: '',
      lastName: '',
      phoneNumber: '',
      dob: '',
      ssn: '',
      accountCreatedDate: '',
      accountType: 'individual',
      address: {
        street1: '',
        street2: '',
        city: '',
        state: '',
        zip: ''
      },
      jointHoldingType: '',
      jointHolder: {
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        dob: '',
        address: {
          street1: '',
          street2: '',
          city: '',
          state: '',
          zip: ''
        }
      },
      entity: {
        entityType: 'LLC',
        name: '',
        registrationDate: '',
        taxId: '',
        address: {
          street1: '',
          street2: '',
          city: '',
          state: '',
          zip: ''
        }
      },
      authorizedRepresentative: {
        firstName: '',
        lastName: '',
        dob: '',
        address: {
          street1: '',
          street2: '',
          city: '',
          state: '',
          zip: ''
        }
      },
      ira: {
        accountType: 'traditional',
        custodian: '',
        accountNumber: ''
      },
      investments: []
    })

    setCurrentInvestment({
      amount: '',
      paymentFrequency: 'compounding',
      lockupPeriod: '1-year',
      createdDate: '',
      confirmedDate: '',
      status: 'active'
    })
    
    setError(null)
    setShowForm(false)
    // Note: Don't reset stage here - performImport already set it to COMPLETE
  }

  // Reset to start
  const handleReset = () => {
    setStage(IMPORT_STAGES.ADD)
    setEditableData([])
    setImportResults(null)
    setError(null)
  }

  return (
    <div className={styles.container}>
      {/* Stage Indicator */}
      <div className={styles.stageIndicator}>
        <div className={`${styles.stageItem} ${stage === IMPORT_STAGES.ADD ? styles.active : ''}`}>
          1. Add Investor
        </div>
        <div className={`${styles.stageItem} ${stage === IMPORT_STAGES.REVIEW ? styles.active : ''}`}>
          2. Review & Edit
        </div>
        <div className={`${styles.stageItem} ${stage === IMPORT_STAGES.IMPORTING || stage === IMPORT_STAGES.COMPLETE ? styles.active : ''}`}>
          3. Import
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className={styles.error}>
          ❌ {error}
        </div>
      )}

      {/* Stage: Add Investor */}
      {stage === IMPORT_STAGES.ADD && (
        <div className={styles.stage}>
          <h3>Import Investor from Wealthblock</h3>
          <p>Fill out the form to import a single investor from your Wealthblock system. The investor will be imported immediately with all historical distributions calculated.</p>
          
          {!showForm && (
            <div className={styles.addButtonContainer}>
              <button onClick={() => setShowForm(true)} className={styles.addNewInvestorButton}>
                + Import New Investor
              </button>
            </div>
          )}

          {showForm && (
          <>
          <div className={styles.manualForm}>
            {/* User Information Section */}
            <div className={styles.formSection}>
              <h4>User Information</h4>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Email *</label>
                  <input
                    type="email"
                    value={manualForm.email}
                    onChange={(e) => handleManualFormChange('email', e.target.value)}
                    placeholder="investor@example.com"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Account Type *</label>
                  <select
                    value={manualForm.accountType}
                    onChange={(e) => handleManualFormChange('accountType', e.target.value)}
                  >
                    <option value="individual">Individual</option>
                    <option value="joint">Joint</option>
                    <option value="entity">Entity</option>
                    <option value="ira">IRA</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>First Name *</label>
                  <input
                    type="text"
                    value={manualForm.firstName}
                    onChange={(e) => handleManualFormChange('firstName', e.target.value)}
                    placeholder="John"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Last Name *</label>
                  <input
                    type="text"
                    value={manualForm.lastName}
                    onChange={(e) => handleManualFormChange('lastName', e.target.value)}
                    placeholder="Doe"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={manualForm.phoneNumber}
                    onChange={(e) => handleManualFormChange('phoneNumber', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                  {manualForm.phoneNumber && !isCompletePhone(manualForm.phoneNumber) && (
                    <span className={styles.fieldHint}>Enter 10 digits</span>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label>Date of Birth</label>
                  <input
                    type="date"
                    value={manualForm.dob}
                    onChange={(e) => handleManualFormChange('dob', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>SSN</label>
                  <input
                    type="text"
                    value={manualForm.ssn}
                    onChange={(e) => handleManualFormChange('ssn', e.target.value)}
                    placeholder="123-45-6789"
                    maxLength="11"
                  />
                  {manualForm.ssn && !isCompleteSsn(manualForm.ssn) && (
                    <span className={styles.fieldHint}>Enter 9 digits</span>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label>Account Created Date</label>
                  <input
                    type="date"
                    value={manualForm.accountCreatedDate}
                    onChange={(e) => handleManualFormChange('accountCreatedDate', e.target.value)}
                    placeholder="When was this account created on Wealthblock?"
                  />
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div className={styles.formSection}>
              <h4>Address</h4>
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label>Street Address 1</label>
                  <input
                    type="text"
                    value={manualForm.address.street1}
                    onChange={(e) => handleManualFormChange('address.street1', e.target.value)}
                    placeholder="123 Main St"
                  />
                </div>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label>Street Address 2</label>
                  <input
                    type="text"
                    value={manualForm.address.street2}
                    onChange={(e) => handleManualFormChange('address.street2', e.target.value)}
                    placeholder="Apt 4B"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>City</label>
                  <input
                    type="text"
                    value={manualForm.address.city}
                    onChange={(e) => handleManualFormChange('address.city', e.target.value)}
                    placeholder="San Francisco"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>State</label>
                  <select
                    value={manualForm.address.state}
                    onChange={(e) => handleManualFormChange('address.state', e.target.value)}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>ZIP Code</label>
                  <input
                    type="text"
                    value={manualForm.address.zip}
                    onChange={(e) => handleManualFormChange('address.zip', e.target.value)}
                    placeholder="94102"
                    maxLength="5"
                  />
                </div>
              </div>
            </div>

            {/* Joint Account Fields */}
            {manualForm.accountType === 'joint' && (
              <>
                <div className={styles.formSection}>
                  <h4>Joint Account Details</h4>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label>Joint Holding Type *</label>
                      <select
                        value={manualForm.jointHoldingType}
                        onChange={(e) => handleManualFormChange('jointHoldingType', e.target.value)}
                        required
                      >
                        <option value="">Select holding type</option>
                        <option value="joint-tenants">Joint Tenants with Right of Survivorship</option>
                        <option value="tenants-common">Tenants in Common</option>
                        <option value="community-property">Community Property</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <h4>Joint Holder Information</h4>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label>First Name *</label>
                      <input
                        type="text"
                        value={manualForm.jointHolder.firstName}
                        onChange={(e) => handleManualFormChange('jointHolder.firstName', e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Last Name *</label>
                      <input
                        type="text"
                        value={manualForm.jointHolder.lastName}
                        onChange={(e) => handleManualFormChange('jointHolder.lastName', e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Email *</label>
                      <input
                        type="email"
                        value={manualForm.jointHolder.email}
                        onChange={(e) => handleManualFormChange('jointHolder.email', e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Phone Number</label>
                      <input
                        type="tel"
                        value={manualForm.jointHolder.phoneNumber}
                        onChange={(e) => handleManualFormChange('jointHolder.phoneNumber', e.target.value)}
                        placeholder="(555) 123-4567"
                      />
                      {manualForm.jointHolder.phoneNumber && !isCompletePhone(manualForm.jointHolder.phoneNumber) && (
                        <span className={styles.fieldHint}>Enter 10 digits</span>
                      )}
                    </div>
                    <div className={styles.formGroup}>
                      <label>Date of Birth</label>
                      <input
                        type="date"
                        value={manualForm.jointHolder.dob}
                        onChange={(e) => handleManualFormChange('jointHolder.dob', e.target.value)}
                      />
                    </div>
                  </div>

                  <h5 className={styles.subheading}>Joint Holder Address</h5>
                  <div className={styles.formGrid}>
                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                      <label>Street Address 1</label>
                      <input
                        type="text"
                        value={manualForm.jointHolder.address.street1}
                        onChange={(e) => handleManualFormChange('jointHolder.address.street1', e.target.value)}
                      />
                    </div>
                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                      <label>Street Address 2</label>
                      <input
                        type="text"
                        value={manualForm.jointHolder.address.street2}
                        onChange={(e) => handleManualFormChange('jointHolder.address.street2', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>City</label>
                      <input
                        type="text"
                        value={manualForm.jointHolder.address.city}
                        onChange={(e) => handleManualFormChange('jointHolder.address.city', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>State</label>
                      <select
                        value={manualForm.jointHolder.address.state}
                        onChange={(e) => handleManualFormChange('jointHolder.address.state', e.target.value)}
                      >
                        <option value="">Select state</option>
                        {US_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>ZIP Code</label>
                      <input
                        type="text"
                        value={manualForm.jointHolder.address.zip}
                        onChange={(e) => handleManualFormChange('jointHolder.address.zip', e.target.value)}
                        maxLength="5"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Entity Account Fields */}
            {manualForm.accountType === 'entity' && (
              <>
                <div className={styles.formSection}>
                  <h4>Entity Information</h4>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label>Entity Type *</label>
                      <select
                        value={manualForm.entity.entityType}
                        onChange={(e) => handleManualFormChange('entity.entityType', e.target.value)}
                        required
                      >
                        <option value="LLC">LLC</option>
                        <option value="Corporation">Corporation</option>
                        <option value="Partnership">Partnership</option>
                        <option value="Trust">Trust</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Entity Name *</label>
                      <input
                        type="text"
                        value={manualForm.entity.name}
                        onChange={(e) => handleManualFormChange('entity.name', e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Tax ID / EIN *</label>
                      <input
                        type="text"
                        value={manualForm.entity.taxId}
                        onChange={(e) => handleManualFormChange('entity.taxId', e.target.value)}
                        placeholder="12-3456789"
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Registration Date</label>
                      <input
                        type="date"
                        value={manualForm.entity.registrationDate}
                        onChange={(e) => handleManualFormChange('entity.registrationDate', e.target.value)}
                      />
                    </div>
                  </div>

                  <h5 className={styles.subheading}>Entity Address</h5>
                  <div className={styles.formGrid}>
                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                      <label>Street Address 1</label>
                      <input
                        type="text"
                        value={manualForm.entity.address.street1}
                        onChange={(e) => handleManualFormChange('entity.address.street1', e.target.value)}
                      />
                    </div>
                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                      <label>Street Address 2</label>
                      <input
                        type="text"
                        value={manualForm.entity.address.street2}
                        onChange={(e) => handleManualFormChange('entity.address.street2', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>City</label>
                      <input
                        type="text"
                        value={manualForm.entity.address.city}
                        onChange={(e) => handleManualFormChange('entity.address.city', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>State</label>
                      <select
                        value={manualForm.entity.address.state}
                        onChange={(e) => handleManualFormChange('entity.address.state', e.target.value)}
                      >
                        <option value="">Select state</option>
                        {US_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>ZIP Code</label>
                      <input
                        type="text"
                        value={manualForm.entity.address.zip}
                        onChange={(e) => handleManualFormChange('entity.address.zip', e.target.value)}
                        maxLength="5"
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <h4>Authorized Representative</h4>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                      <label>First Name *</label>
                      <input
                        type="text"
                        value={manualForm.authorizedRepresentative.firstName}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.firstName', e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Last Name *</label>
                      <input
                        type="text"
                        value={manualForm.authorizedRepresentative.lastName}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.lastName', e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Date of Birth</label>
                      <input
                        type="date"
                        value={manualForm.authorizedRepresentative.dob}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.dob', e.target.value)}
                      />
                    </div>
                  </div>

                  <h5 className={styles.subheading}>Representative Address</h5>
                  <div className={styles.formGrid}>
                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                      <label>Street Address 1</label>
                      <input
                        type="text"
                        value={manualForm.authorizedRepresentative.address.street1}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.address.street1', e.target.value)}
                      />
                    </div>
                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                      <label>Street Address 2</label>
                      <input
                        type="text"
                        value={manualForm.authorizedRepresentative.address.street2}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.address.street2', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>City</label>
                      <input
                        type="text"
                        value={manualForm.authorizedRepresentative.address.city}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.address.city', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>State</label>
                      <select
                        value={manualForm.authorizedRepresentative.address.state}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.address.state', e.target.value)}
                      >
                        <option value="">Select state</option>
                        {US_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>ZIP Code</label>
                      <input
                        type="text"
                        value={manualForm.authorizedRepresentative.address.zip}
                        onChange={(e) => handleManualFormChange('authorizedRepresentative.address.zip', e.target.value)}
                        maxLength="5"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* IRA Account Fields */}
            {manualForm.accountType === 'ira' && (
              <div className={styles.formSection}>
                <h4>IRA Account Information</h4>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>IRA Type *</label>
                    <select
                      value={manualForm.ira.accountType}
                      onChange={(e) => handleManualFormChange('ira.accountType', e.target.value)}
                      required
                    >
                      <option value="traditional">Traditional IRA</option>
                      <option value="roth">Roth IRA</option>
                      <option value="sep">SEP IRA</option>
                      <option value="simple">SIMPLE IRA</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Custodian *</label>
                    <input
                      type="text"
                      value={manualForm.ira.custodian}
                      onChange={(e) => handleManualFormChange('ira.custodian', e.target.value)}
                      placeholder="e.g., Fidelity, Charles Schwab"
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>IRA Account Number *</label>
                    <input
                      type="text"
                      value={manualForm.ira.accountNumber}
                      onChange={(e) => handleManualFormChange('ira.accountNumber', e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Investment Section */}
            <div className={styles.formSection}>
              <h4>Investment Details (Optional)</h4>
              <p className={styles.sectionNote}>
                Add investments for this investor. You can add multiple investments.
              </p>
              
              {/* Add Investment Form */}
              <div className={styles.investmentForm}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Investment Amount</label>
                    <input
                      type="number"
                      value={currentInvestment.amount}
                      onChange={(e) => handleInvestmentChange('amount', e.target.value)}
                      placeholder="50000"
                      min="0"
                      step="1000"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Payment Frequency</label>
                    <select
                      value={currentInvestment.paymentFrequency}
                      onChange={(e) => handleInvestmentChange('paymentFrequency', e.target.value)}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="compounding">Compounding</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Lockup Period</label>
                    <select
                      value={currentInvestment.lockupPeriod}
                      onChange={(e) => handleInvestmentChange('lockupPeriod', e.target.value)}
                    >
                      <option value="1-year">1 Year</option>
                      <option value="3-year">3 Years</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Investment Created Date</label>
                    <input
                      type="date"
                      value={currentInvestment.createdDate}
                      onChange={(e) => handleInvestmentChange('createdDate', e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Investment Confirmed Date</label>
                    <input
                      type="date"
                      value={currentInvestment.confirmedDate}
                      onChange={(e) => handleInvestmentChange('confirmedDate', e.target.value)}
                    />
                  </div>
                </div>
                
                {/* Real-time validation warning */}
                {manualForm.accountCreatedDate && (
                  (currentInvestment.createdDate && currentInvestment.createdDate < manualForm.accountCreatedDate) ||
                  (currentInvestment.confirmedDate && currentInvestment.confirmedDate < manualForm.accountCreatedDate)
                ) && (
                  <div style={{ 
                    padding: '12px', 
                    marginTop: '12px',
                    marginBottom: '12px',
                    background: '#fef3c7', 
                    border: '1px solid #f59e0b', 
                    borderRadius: '6px',
                    color: '#92400e',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <span>
                      <strong>Warning:</strong> Investment date
                      {currentInvestment.createdDate && currentInvestment.createdDate < manualForm.accountCreatedDate && 
                        ` (Created: ${formatDateForDisplay(currentInvestment.createdDate)})`}
                      {currentInvestment.confirmedDate && currentInvestment.confirmedDate < manualForm.accountCreatedDate && 
                        ` (Confirmed: ${formatDateForDisplay(currentInvestment.confirmedDate)})`}
                      {' '}cannot be before account creation date ({formatDateForDisplay(manualForm.accountCreatedDate)})
                    </span>
                  </div>
                )}

                <button 
                  type="button"
                  onClick={handleAddInvestment} 
                  className={styles.addInvestmentButton}
                >
                  + Add Investment
                </button>
              </div>

              {/* Display Added Investments */}
              {manualForm.investments.length > 0 && (
                <div className={styles.investmentsList}>
                  <h5>Added Investments ({manualForm.investments.length})</h5>
                  
                  {/* Warning for existing investments with date conflicts */}
                  {manualForm.accountCreatedDate && manualForm.investments.some(inv => 
                    (inv.createdDate && inv.createdDate < manualForm.accountCreatedDate) ||
                    (inv.confirmedDate && inv.confirmedDate < manualForm.accountCreatedDate)
                  ) && (
                    <div style={{ 
                      padding: '12px', 
                      marginBottom: '12px',
                      background: '#fee2e2', 
                      border: '1px solid #ef4444', 
                      borderRadius: '6px',
                      color: '#991b1b',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '18px' }}>⚠️</span>
                      <span>
                        <strong>Date Conflict Detected:</strong> One or more investments have dates before the account creation date ({formatDateForDisplay(manualForm.accountCreatedDate)}). Please remove them and add with corrected dates.
                      </span>
                    </div>
                  )}

                  <div className={styles.investmentItems}>
                    {manualForm.investments.map((inv, idx) => {
                      const hasDateConflict = manualForm.accountCreatedDate && (
                        (inv.createdDate && inv.createdDate < manualForm.accountCreatedDate) ||
                        (inv.confirmedDate && inv.confirmedDate < manualForm.accountCreatedDate)
                      )
                      
                      return (
                        <div 
                          key={inv.id} 
                          className={styles.investmentItem}
                          style={hasDateConflict ? { 
                            border: '2px solid #ef4444',
                            background: '#fef2f2'
                          } : {}}
                        >
                          <div className={styles.investmentInfo}>
                            <span className={styles.investmentAmount}>${parseFloat(inv.amount).toLocaleString()}</span>
                            <span className={styles.investmentDetails}>
                              {inv.paymentFrequency} • {inv.lockupPeriod}
                            </span>
                            {inv.createdDate && (
                              <span 
                                className={styles.investmentDate}
                                style={hasDateConflict && inv.createdDate < manualForm.accountCreatedDate ? { color: '#dc2626', fontWeight: 'bold' } : {}}
                              >
                                Created: {formatDateForDisplay(inv.createdDate)}
                                {hasDateConflict && inv.createdDate < manualForm.accountCreatedDate && ' ⚠️'}
                              </span>
                            )}
                            {inv.confirmedDate && (
                              <span 
                                className={styles.investmentDate}
                                style={hasDateConflict && inv.confirmedDate < manualForm.accountCreatedDate ? { color: '#dc2626', fontWeight: 'bold' } : {}}
                              >
                                Confirmed: {formatDateForDisplay(inv.confirmedDate)}
                                {hasDateConflict && inv.confirmedDate < manualForm.accountCreatedDate && ' ⚠️'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveInvestment(inv.id)}
                            className={styles.investmentRemove}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <div className={styles.investmentTotal}>
                    Total Investment Amount: ${manualForm.investments.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className={styles.actions}>
            <button 
              onClick={() => {
                setShowForm(false)
                setError(null)
              }} 
              className={styles.secondaryButton}
              type="button"
            >
              Cancel
            </button>
            <button onClick={handleAddManualInvestor} className={styles.primaryButton} type="button">
              Import Investor
              {manualForm.investments.length > 0 && (
                <span className={styles.investmentBadge}>
                  {manualForm.investments.length} investment{manualForm.investments.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          </div>
          </>
      )}
        </div>
      )}

      {/* Stage: Review */}
      {stage === IMPORT_STAGES.REVIEW && (
        <div className={styles.stage}>
          <h3>Review & Edit Data</h3>
          <p>Review the mapped data and make any necessary edits before importing.</p>
          <p className={styles.recordCount}>
            <strong>{editableData.length}</strong> investors ready to import
          </p>

          {/* Summary Cards */}
          <div className={styles.reviewSummary}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Total Investors</div>
              <div className={styles.summaryValue}>{editableData.length}</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>With Investments</div>
              <div className={styles.summaryValue}>
                {editableData.filter(row => row.investments?.length > 0).length}
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Total Investments</div>
              <div className={styles.summaryValue}>
                {editableData.reduce((sum, row) => sum + (row.investments?.length || 0), 0)}
              </div>
            </div>
          </div>

          {/* Detailed Review - Expandable Cards */}
          <div className={styles.reviewCards}>
            {editableData.map(row => (
              <div key={row._rowId} className={styles.investorCard}>
                <div className={styles.investorCardHeader}>
                  <div className={styles.investorCardTitle}>
                    <h4>{row.firstName} {row.lastName}</h4>
                    <span className={styles.investorEmail}>{row.email}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveRow(row._rowId)}
                    className={styles.cardRemoveButton}
                  >
                    Remove
                  </button>
                </div>

                <div className={styles.investorCardBody}>
                  {/* Basic Info */}
                  <div className={styles.cardSection}>
                    <h5>Basic Information</h5>
                    <div className={styles.cardGrid}>
                      <div className={styles.cardField}>
                        <label>Email</label>
                        <input
                          type="email"
                          value={row.email || ''}
                          onChange={(e) => handleDataEdit(row._rowId, 'email', e.target.value)}
                          className={styles.editInput}
                        />
                      </div>
                      <div className={styles.cardField}>
                        <label>Account Type</label>
                        <select
                          value={row.accountType || 'individual'}
                          onChange={(e) => handleDataEdit(row._rowId, 'accountType', e.target.value)}
                          className={styles.editSelect}
                        >
                          <option value="individual">Individual</option>
                          <option value="joint">Joint</option>
                          <option value="entity">Entity</option>
                          <option value="ira">IRA</option>
                        </select>
                      </div>
                      <div className={styles.cardField}>
                        <label>First Name</label>
                        <input
                          type="text"
                          value={row.firstName || ''}
                          onChange={(e) => handleDataEdit(row._rowId, 'firstName', e.target.value)}
                          className={styles.editInput}
                        />
                      </div>
                      <div className={styles.cardField}>
                        <label>Last Name</label>
                        <input
                          type="text"
                          value={row.lastName || ''}
                          onChange={(e) => handleDataEdit(row._rowId, 'lastName', e.target.value)}
                          className={styles.editInput}
                        />
                      </div>
                      <div className={styles.cardField}>
                        <label>Phone</label>
                        <input
                          type="text"
                          value={row.phoneNumber || ''}
                          onChange={(e) => handleDataEdit(row._rowId, 'phoneNumber', e.target.value)}
                          className={styles.editInput}
                        />
                      </div>
                      <div className={styles.cardField}>
                        <label>DOB</label>
                        <input
                          type="date"
                          value={row.dob || ''}
                          onChange={(e) => handleDataEdit(row._rowId, 'dob', e.target.value)}
                          className={styles.editInput}
                        />
                      </div>
                    </div>
                    <div className={styles.note}>
                      ℹ️ <strong>Note:</strong> SSN will be requested when investor sets up their account
                    </div>
                  </div>

                  {/* Address */}
                  {row.address && Object.values(row.address).some(v => v) && (
                    <div className={styles.cardSection}>
                      <h5>Address</h5>
                      <div className={styles.addressDisplay}>
                        {row.address.street1 && <div>{row.address.street1}</div>}
                        {row.address.street2 && <div>{row.address.street2}</div>}
                        {(row.address.city || row.address.state || row.address.zip) && (
                          <div>
                            {row.address.city}{row.address.city && row.address.state && ', '}
                            {row.address.state} {row.address.zip}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Investments */}
                  {row.investments && row.investments.length > 0 && (
                    <div className={styles.cardSection}>
                      <h5>Investments ({row.investments.length})</h5>
                      {row.investments.map((inv, idx) => (
                        <div key={idx} className={styles.investmentDisplay}>
                          <div className={styles.investmentAmount}>
                            ${parseFloat(inv.amount || 0).toLocaleString()}
                          </div>
                          <div className={styles.investmentDetails}>
                            <span>{inv.paymentFrequency || 'compounding'}</span>
                            <span>•</span>
                            <span>{inv.lockupPeriod || '1-year'}</span>
                            {inv.createdDate && (
                              <>
                                <span>•</span>
                                <span>Created: {formatDateForDisplay(inv.createdDate)}</span>
                              </>
                            )}
                            {inv.confirmedDate && (
                              <>
                                <span>•</span>
                                <span>Confirmed: {formatDateForDisplay(inv.confirmedDate)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className={styles.investmentTotal}>
                        Total: ${row.investments.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0).toLocaleString()}
                      </div>
                      <div className={styles.note}>
                        ℹ️ <strong>Note:</strong> Distributions will be auto-calculated after import based on these dates
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button onClick={() => setStage(IMPORT_STAGES.ADD)} className={styles.secondaryButton}>
              Add Another Investor
            </button>
            <button onClick={handleImport} className={styles.primaryButton} disabled={isProcessing}>
              {isProcessing ? 'Importing...' : `Import ${editableData.length} Investor${editableData.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Stage: Importing */}
      {stage === IMPORT_STAGES.IMPORTING && (
        <div className={styles.stage}>
          <h3>Importing...</h3>
          <p>Please wait while we import the investors.</p>
          <div className={styles.loader}></div>
        </div>
      )}

      {/* Stage: Complete */}
      {stage === IMPORT_STAGES.COMPLETE && importResults && (
        <div className={styles.stage}>
          <h3>✅ Import Complete!</h3>
          
          {importResults.imported?.users > 0 && (
            <div className={styles.successMessage}>
              <strong>✅ SUCCESS:</strong> Successfully imported {importResults.imported.users} user(s) with {importResults.imported.investments} investment(s). Historical distributions have been automatically generated for monthly payout investments.
            </div>
          )}
          
          {importResults.imported?.users === 0 && importResults.errors?.length > 0 && (
            <div className={styles.warningMessage}>
              <strong>⚠️ IMPORT FAILED:</strong> No users were imported. Please review the errors below and try again.
            </div>
          )}
          
          {importResults.message && (
            <div className={styles.importMessage}>
              ℹ️ {importResults.message}
            </div>
          )}
          
          <div className={styles.results}>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Users Imported</div>
              <div className={styles.resultValue}>{importResults.imported?.users || 0}</div>
            </div>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Investments Created</div>
              <div className={styles.resultValue}>{importResults.imported?.investments || 0}</div>
            </div>
            <div className={styles.resultCard}>
              <div className={styles.resultLabel}>Errors</div>
              <div className={styles.resultValue}>{importResults.errors?.length || 0}</div>
            </div>
          </div>

          {importResults.errors && importResults.errors.length > 0 && (
            <div className={styles.errorList}>
              <h4>Errors:</h4>
              <ul>
                {importResults.errors.map((err, idx) => (
                  <li key={idx}>
                    <strong>{err.investor}</strong>: {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.actions}>
            <button onClick={handleReset} className={styles.primaryButton}>
              Import Another Investor
            </button>
          </div>
          
          <div className={styles.note} style={{ marginTop: '16px', padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
            <strong>📝 Next Steps:</strong> Review each imported user's information and investments from the Accounts tab, then send setup invitations individually from their user detail page.
          </div>
        </div>
      )}
    </div>
  )
}

