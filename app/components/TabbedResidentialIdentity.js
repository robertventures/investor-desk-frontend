'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import { apiClient } from '@/lib/apiClient'
import { useUser } from '@/app/contexts/UserContext'
import styles from './TabbedResidentialIdentity.module.css'

const MIN_DOB = '1900-01-01'

// Feature flag: use server-side identity drafts (default true)
const USE_SERVER_IDENTITY_DRAFTS = typeof process !== 'undefined'
  ? (process.env.NEXT_PUBLIC_USE_SERVER_IDENTITY_DRAFTS !== 'false')
  : true

const formatZip = (value = '') => value.replace(/\D/g, '').slice(0, 5)

const formatPhone = (value = '') => {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const isCompletePhone = (value = '') => value.replace(/\D/g, '').length === 10

// US phone validation aligned with backend: 10 digits; area code must start 2-9
const isValidUSPhone = (value = '') => {
  const digits = (value || '').replace(/\D/g, '')
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (normalized.length !== 10) return false
  // Only enforce leading area code digit 2-9; backend will handle deeper checks
  return /^[2-9][0-9]{9}$/.test(normalized)
}

// Normalize phone number to E.164 format for database storage (+1XXXXXXXXXX)
const normalizePhoneForDB = (value = '') => {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+1${digits}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  return value // Return original if format is unexpected
}

// Convert E.164 phone number back to display format
const formatPhoneFromDB = (value = '') => {
  if (!value) return ''
  // Handle E.164 +1XXXXXXXXXX
  if (value.startsWith('+1')) {
    const digits = value.slice(2) // Remove +1
    if (digits.length === 10) {
      return formatPhone(digits)
    }
  }
  // Handle plain 10-digit numbers from backend
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) {
    return formatPhone(digits)
  }
  return value // Return original if format is unexpected
}

const formatSsn = (value = '') => {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

const isCompleteSsn = (value = '') => value.replace(/\D/g, '').length === 9

// Format EIN/TIN for entity: XX-XXXXXXX (2 digits, dash, 7 digits)
const formatTaxId = (value = '') => {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

const isCompleteTaxId = (value = '') => value.replace(/\D/g, '').length === 9

// Convert Tax ID from DB (9 digits) back to display format (XX-XXXXXXX)
const formatTaxIdFromDB = (value = '') => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length === 9) {
    return formatTaxId(digits)
  }
  return value // Return original if format is unexpected
}

// Names: Allow only letters, spaces, hyphens, apostrophes, and periods
const formatName = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

// City names: Allow only letters, spaces, hyphens, apostrophes, and periods
const formatCity = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

// Street addresses: Allow letters, numbers, spaces, hyphens, periods, commas, and hash symbols
const formatStreet = (value = '') => value.replace(/[^a-zA-Z0-9\s'\-\.,#]/g, '')

// Normalize to backend expected format: 10 digits only (strip leading +1 if present)
const normalizePhoneForBackend = (value = '') => {
  const digitsRaw = (value || '').replace(/\D/g, '')
  if (digitsRaw.length === 11 && digitsRaw.startsWith('1')) {
    return digitsRaw.slice(1)
  }
  if (digitsRaw.length >= 10) {
    return digitsRaw.slice(0, 10)
  }
  return digitsRaw
}

// Reduce address to backend expected shape
const formatAddressForBackend = (address = {}) => {
  return {
    street1: address.street1 || '',
    street2: address.street2 || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || '',
    ...(address.country ? { country: address.country } : {})
  }
}

const parseDateString = (value = '') => {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

const isAdultDob = (value = '') => {
  const date = parseDateString(value)
  if (!date) return false
  const minimum = parseDateString(MIN_DOB)
  if (!minimum || date < minimum) return false
  const today = new Date()
  const adultCutoff = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
  return date <= adultCutoff
}

// Map state abbreviations to full names to ensure select pre-fills correctly
const STATE_ABBR_TO_NAME = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
}

const toFullStateName = (value = '') => {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length === 2) {
    return STATE_ABBR_TO_NAME[trimmed.toUpperCase()] || trimmed
  }
  return trimmed
}

export default function TabbedResidentialIdentity({ onCompleted, onReviewSummary, accountType: accountTypeProp }) {
  const US_STATES = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
  ]
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States',
    dob: '',
    ssn: '',
    jointHoldingType: '',
    jointHolder: {
      firstName: '',
      lastName: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      dob: '',
      ssn: '',
      email: '',
      phone: ''
    },
    authorizedRep: {
      firstName: '',
      lastName: '',
      phone: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      dob: '',
      ssn: ''
    },
    entity: {
      name: '',
      phone: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      registrationDate: '',
      taxId: ''
    }
  })
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [accountType, setAccountType] = useState(accountTypeProp || 'individual')
  const [jointUsePrimaryAddress, setJointUsePrimaryAddress] = useState(true)
  const [showSsnHelp, setShowSsnHelp] = useState(false)
  const [showAuthorizedRepSsnHelp, setShowAuthorizedRepSsnHelp] = useState(false)
  const [showJointSsnHelp, setShowJointSsnHelp] = useState(false)
  const [hasActiveInvestments, setHasActiveInvestments] = useState(false)
  
  // Get user data first before using it
  const { userData, refreshUser } = useUser()
  const hasLoadedUserDataRef = useRef(false)
  
  const idLabel = accountType === 'entity' ? 'EIN or TIN' : 'SSN'
  const dateLabel = accountType === 'entity' ? 'Formation Date' : 'Date of Birth'
  const primaryFullName = (
    accountType === 'entity'
      ? [form.authorizedRep.firstName, form.authorizedRep.lastName]
      : [form.firstName, form.lastName]
  ).filter(Boolean).join(' ').trim() || null
  const governingStateDisplay = accountType === 'entity'
    ? (form.entity.state || form.authorizedRep.state || userData?.entity?.address?.state || userData?.address?.state || 'their state of residence')
    : (form.state || (userData?.address?.state || 'their state of residence'))
  const nameSegment = primaryFullName ? `, ${primaryFullName},` : ''

  const maxAdultDob = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate())
    return cutoff.toISOString().split('T')[0]
  }, [])
  const maxToday = useMemo(() => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  }, [])

  useEffect(() => {
    if (accountTypeProp) setAccountType(accountTypeProp)
  }, [accountTypeProp])

  // Load local snapshot as early fallback so Edit shows previous entries even if backend fails
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const invId = localStorage.getItem('currentInvestmentId')
      const snapshotKey = invId ? `investmentIdentityDraft:${invId}` : 'investmentIdentityDraft'
      const raw = localStorage.getItem(snapshotKey)
      if (!raw) return
      const snap = JSON.parse(raw)
      if (snap?.accountType && !accountTypeProp) {
        setAccountType(snap.accountType)
      }
      if (snap?.form) {
        setForm(prev => ({
          ...prev,
          ...snap.form,
          jointHolder: { ...prev.jointHolder, ...(snap.form.jointHolder || {}) },
          authorizedRep: { ...prev.authorizedRep, ...(snap.form.authorizedRep || {}) },
          entity: { ...prev.entity, ...(snap.form.entity || {}) }
        }))
      }
    } catch {}
  }, [accountTypeProp])

  // Refresh user data when component mounts to ensure we have the latest investor information
  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  useEffect(() => {
    if (!userData) return
    const u = userData

    const investments = Array.isArray(u.investments) ? u.investments : []
    const currentInvId = typeof window !== 'undefined' ? localStorage.getItem('currentInvestmentId') : null
    const currentInv = investments.find(inv => inv.id === currentInvId)
    if (!accountTypeProp && currentInv?.accountType) setAccountType(currentInv.accountType)

    const hasPendingOrActive = investments.some(inv => inv.status === 'pending' || inv.status === 'active')
    setHasActiveInvestments(hasPendingOrActive)

    const addressForPrefill = u.address || null
    const savedSsn = u.ssn || u.taxId || ''
    const isSsnOnFile = savedSsn && (savedSsn === '•••-••-••••' || savedSsn.includes(':') || savedSsn.length > 20)
    const savedJointSsn = u.jointHolder?.ssn || ''
    const isJointSsnOnFile = savedJointSsn && (savedJointSsn === '•••-••-••••' || savedJointSsn.includes(':') || savedJointSsn.length > 20)
    const savedAuthRepSsn = u.authorizedRepresentative?.ssn || ''
    const isAuthRepSsnOnFile = savedAuthRepSsn && (savedAuthRepSsn === '•••-••-••••' || savedAuthRepSsn.includes(':') || savedAuthRepSsn.length > 20)

    // Only log once when data is first loaded to reduce console noise
    if (!hasLoadedUserDataRef.current) {
      console.log('✅ User data loaded for investment form:', { userId: u.id, hasSSN: !!u.ssn })
      hasLoadedUserDataRef.current = true
    }

    setForm(prev => {
      const updated = { ...prev }
      if (u.firstName) updated.firstName = u.firstName
      if (u.lastName) updated.lastName = u.lastName
      if (u.phoneNumber) updated.phone = formatPhoneFromDB(u.phoneNumber)
      if (addressForPrefill?.street1) updated.street1 = addressForPrefill.street1
      if (addressForPrefill?.street2) updated.street2 = addressForPrefill.street2
      if (addressForPrefill?.city) updated.city = addressForPrefill.city
      if (addressForPrefill?.state) updated.state = toFullStateName(addressForPrefill.state)
      if (addressForPrefill?.zip) updated.zip = addressForPrefill.zip
      if (addressForPrefill?.country) updated.country = addressForPrefill.country
      if (u.dob) updated.dob = u.dob
      if (savedSsn) updated.ssn = isSsnOnFile ? '•••-••-••••' : savedSsn
      if (u.jointHoldingType) updated.jointHoldingType = u.jointHoldingType
      // Joint holder - only apply known values to avoid wiping user input
      const j = u.jointHolder || {}
      updated.jointHolder = {
        ...prev.jointHolder,
        ...(j.firstName ? { firstName: j.firstName } : {}),
        ...(j.lastName ? { lastName: j.lastName } : {}),
        ...(j.address?.street1 ? { street1: j.address.street1 } : {}),
        ...(j.address?.street2 ? { street2: j.address.street2 } : {}),
        ...(j.address?.city ? { city: j.address.city } : {}),
        ...(j.address?.state ? { state: toFullStateName(j.address.state) } : {}),
        ...(j.address?.zip ? { zip: j.address.zip } : {}),
        ...(j.address?.country ? { country: j.address.country } : {}),
        ...(j.dob ? { dob: j.dob } : {}),
        ...(savedJointSsn ? { ssn: isJointSsnOnFile ? '•••-••-••••' : savedJointSsn } : {}),
        ...(j.email ? { email: j.email } : {}),
        ...(j.phone ? { phone: formatPhoneFromDB(j.phone) } : {})
      }
      // Entity profile information
      const entityProfile = u.entity || {}
      const savedEntityTaxId = entityProfile.taxId || u.entityTaxId || ''
      const isEntityTaxIdOnFile = savedEntityTaxId && (savedEntityTaxId === '•••-••-••••' || savedEntityTaxId.includes(':') || savedEntityTaxId.length > 20)
      updated.entity = {
        ...prev.entity,
        ...(u.entityName ? { name: u.entityName } : {}),
        ...(entityProfile.name ? { name: entityProfile.name } : {}),
        ...(entityProfile.phone ? { phone: formatPhoneFromDB(entityProfile.phone) } : {}),
        ...(entityProfile.address?.street1 ? { street1: entityProfile.address.street1 } : {}),
        ...(entityProfile.address?.street2 ? { street2: entityProfile.address.street2 } : {}),
        ...(entityProfile.address?.city ? { city: entityProfile.address.city } : {}),
        ...(entityProfile.address?.state ? { state: toFullStateName(entityProfile.address.state) } : {}),
        ...(entityProfile.address?.zip ? { zip: entityProfile.address.zip } : {}),
        ...(entityProfile.address?.country ? { country: entityProfile.address.country } : {}),
        ...(entityProfile.registrationDate ? { registrationDate: entityProfile.registrationDate } : {}),
        ...(entityProfile.formationDate ? { registrationDate: entityProfile.formationDate } : {}),
        ...(savedEntityTaxId ? { taxId: isEntityTaxIdOnFile ? '•••-••-••••' : formatTaxIdFromDB(savedEntityTaxId) } : {}),
        // Allow fallback to investment-level registration date if stored on user legacy fields
        ...(u.entityRegistrationDate && !entityProfile.registrationDate && !entityProfile.formationDate ? { registrationDate: u.entityRegistrationDate } : {})
      }

      // Authorized Representative
      const r = u.authorizedRepresentative || {}
      const repAddress = r.address || u.address || {}
      const repSsnSource = savedAuthRepSsn || (u.accountType === 'entity' ? savedSsn : '')
      const repSsnMasked = savedAuthRepSsn ? isAuthRepSsnOnFile : (repSsnSource ? isSsnOnFile : false)
      updated.authorizedRep = {
        ...prev.authorizedRep,
        ...(r.firstName || u.firstName ? { firstName: r.firstName || u.firstName } : {}),
        ...(r.lastName || u.lastName ? { lastName: r.lastName || u.lastName } : {}),
        ...((r.phone || u.phoneNumber) ? { phone: formatPhoneFromDB(r.phone || u.phoneNumber) } : {}),
        ...(repAddress.street1 ? { street1: repAddress.street1 } : {}),
        ...(repAddress.street2 ? { street2: repAddress.street2 } : {}),
        ...(repAddress.city ? { city: repAddress.city } : {}),
        ...(repAddress.state ? { state: toFullStateName(repAddress.state) } : {}),
        ...(repAddress.zip ? { zip: repAddress.zip } : {}),
        ...(repAddress.country ? { country: repAddress.country } : {}),
        ...(r.dob || u.dob ? { dob: r.dob || u.dob } : {}),
        ...(repSsnSource ? { ssn: repSsnMasked ? '•••-••-••••' : repSsnSource } : {})
      }
      return updated
    })
  }, [userData, accountTypeProp])

  // Load investment-specific data when editing
  useEffect(() => {
    const loadInvestmentData = async () => {
      if (typeof window === 'undefined') return
      
      const investmentId = localStorage.getItem('currentInvestmentId')
      if (!investmentId) return
      
      try {
        const response = await apiClient.getInvestment(investmentId)
        if (!response.success || !response.investment) return
        
        const investment = response.investment
        // Only populate if this is a draft investment
        if (investment.status !== 'draft') return
        
        console.log('✅ Investment-specific data loaded:', { 
          investmentId, 
          accountType: investment.accountType,
          hasJointHolder: !!investment.jointHolder,
          hasEntity: !!investment.entity,
          hasAuthorizedRep: !!investment.authorizedRepresentative
        })
        
        // Populate form with investment-specific data if available
        setForm(prev => {
          const updated = { ...prev }
          
          // Entity-specific fields (no EIN/TIN hydration from investment)
          if (investment.entity) {
            const entity = investment.entity
            updated.entity = {
              ...prev.entity,
              ...(entity.name ? { name: entity.name } : {}),
              ...(entity.phone ? { phone: formatPhoneFromDB(entity.phone) } : {}),
              ...(entity.address?.street1 ? { street1: entity.address.street1 } : {}),
              ...(entity.address?.street2 ? { street2: entity.address.street2 } : {}),
              ...(entity.address?.city ? { city: entity.address.city } : {}),
              ...(entity.address?.state ? { state: toFullStateName(entity.address.state) } : {}),
              ...(entity.address?.zip ? { zip: entity.address.zip } : {}),
              ...(entity.address?.country ? { country: entity.address.country } : {}),
              ...(entity.registrationDate ? { registrationDate: entity.registrationDate } : {}),
              ...(entity.formationDate ? { registrationDate: entity.formationDate } : {})
            }
          }
          
          // Authorized representative for entity accounts
          if (investment.authorizedRepresentative) {
            const rep = investment.authorizedRepresentative
            updated.authorizedRep = {
              firstName: rep.firstName || prev.authorizedRep.firstName,
              lastName: rep.lastName || prev.authorizedRep.lastName,
              phone: formatPhoneFromDB(rep.phone) || prev.authorizedRep.phone,
              street1: rep.address?.street1 || prev.authorizedRep.street1,
              street2: rep.address?.street2 || prev.authorizedRep.street2,
              city: rep.address?.city || prev.authorizedRep.city,
              state: toFullStateName(rep.address?.state) || prev.authorizedRep.state,
              zip: rep.address?.zip || prev.authorizedRep.zip,
              country: rep.address?.country || prev.authorizedRep.country,
              dob: rep.dob || prev.authorizedRep.dob
            }
          }
          
          // Joint holder for joint accounts
          if (investment.jointHolder) {
            const joint = investment.jointHolder
            console.log('✅ Loading joint holder data:', {
              hasFirstName: !!joint.firstName,
              hasLastName: !!joint.lastName,
              hasEmail: !!joint.email,
              hasPhone: !!joint.phone,
              hasDob: !!joint.dob,
              hasAddress: !!joint.address
            })
            updated.jointHolder = {
              firstName: joint.firstName || prev.jointHolder.firstName,
              lastName: joint.lastName || prev.jointHolder.lastName,
              street1: joint.address?.street1 || prev.jointHolder.street1,
              street2: joint.address?.street2 || prev.jointHolder.street2,
              city: joint.address?.city || prev.jointHolder.city,
              state: toFullStateName(joint.address?.state) || prev.jointHolder.state,
              zip: joint.address?.zip || prev.jointHolder.zip,
              country: joint.address?.country || prev.jointHolder.country,
              dob: joint.dob || prev.jointHolder.dob,
              email: joint.email || prev.jointHolder.email,
              phone: formatPhoneFromDB(joint.phone) || prev.jointHolder.phone
            }
            
            // Check if joint holder has different address
            if (joint.address && prev.street1) {
              const isDifferent = joint.address.street1 !== prev.street1 ||
                                joint.address.city !== prev.city ||
                                joint.address.state !== prev.state
              if (isDifferent) {
                setJointUsePrimaryAddress(false)
              }
            }
          }
          
          // Joint holding type
          if (investment.jointHoldingType) {
            updated.jointHoldingType = investment.jointHoldingType
            console.log('✅ Loaded joint holding type:', investment.jointHoldingType)
          }
          
          // Individual draft (identityDraft.holder)
          const holderDraft = investment.identityDraft?.holder
          if (holderDraft) {
            updated.firstName = holderDraft.firstName || updated.firstName
            updated.lastName = holderDraft.lastName || updated.lastName
            updated.phone = formatPhoneFromDB(holderDraft.phone) || updated.phone
            if (holderDraft.address) {
              updated.street1 = holderDraft.address.street1 || updated.street1
              updated.street2 = holderDraft.address.street2 || updated.street2
              updated.city = holderDraft.address.city || updated.city
              updated.state = toFullStateName(holderDraft.address.state) || updated.state
              updated.zip = holderDraft.address.zip || updated.zip
              updated.country = holderDraft.address.country || updated.country
            }
            updated.dob = holderDraft.dob || updated.dob
          }
          
          return updated
        })
      } catch (error) {
        console.error('❌ Failed to load investment data:', error)
        // If the stored investmentId is stale, clear it to avoid repeated 404s
        try {
          const msg = String(error?.message || error || '').toLowerCase()
          if (msg.includes('not found')) {
            const badId = localStorage.getItem('currentInvestmentId')
            localStorage.removeItem('currentInvestmentId')
            // Remove any snapshot associated with this ID as a precaution
            if (badId) localStorage.removeItem(`investmentIdentityDraft:${badId}`)
          }
        } catch {}
      }
    }
    
    loadInvestmentData()
  }, [userData]) // Run after userData is loaded

  // Joint holding type should not be auto-defaulted - user must select explicitly

  useEffect(() => {
    if (accountType !== 'joint') return
    if (!jointUsePrimaryAddress) return
    setForm(prev => ({
      ...prev,
      jointHolder: {
        ...prev.jointHolder,
        street1: prev.street1,
        street2: prev.street2,
        city: prev.city,
        state: prev.state,
        zip: prev.zip,
        country: prev.country
      }
    }))
  }, [accountType, jointUsePrimaryAddress, form.street1, form.street2, form.city, form.state, form.zip, form.country])

  // Handlers to toggle joint address mode
  const handleDifferentAddress = () => {
    setJointUsePrimaryAddress(false)
    // Clear joint holder address fields so user starts with empty inputs
    setForm(prev => ({
      ...prev,
      jointHolder: {
        ...prev.jointHolder,
        street1: '',
        street2: '',
        city: '',
        state: '',
        zip: '',
        country: 'United States'
      }
    }))
  }

  const handleUseSameAddress = () => {
    setJointUsePrimaryAddress(true)
    // Immediately mirror primary address for better UX (effect also ensures sync)
    setForm(prev => ({
      ...prev,
      jointHolder: {
        ...prev.jointHolder,
        street1: prev.street1,
        street2: prev.street2,
        city: prev.city,
        state: prev.state,
        zip: prev.zip,
        country: prev.country
      }
    }))
  }

  const setFieldValue = (name, value) => {
    if (name.startsWith('jointHolder.')) {
      const fieldName = name.replace('jointHolder.', '')
      setForm(prev => ({ 
        ...prev, 
        jointHolder: { ...prev.jointHolder, [fieldName]: value }
      }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    } else if (name.startsWith('entity.')) {
      const fieldName = name.replace('entity.', '')
      setForm(prev => ({
        ...prev,
        entity: { ...prev.entity, [fieldName]: value }
      }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    } else if (name.startsWith('authorizedRep.')) {
      const fieldName = name.replace('authorizedRep.', '')
      setForm(prev => ({
        ...prev,
        authorizedRep: { ...prev.authorizedRep, [fieldName]: value }
      }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name.endsWith('firstName') || name.endsWith('lastName')) {
      setFieldValue(name, formatName(value))
      return
    }
    if (name === 'entity.name') {
      setFieldValue(name, formatName(value))
      return
    }
    if (name.endsWith('.city') || name === 'city') {
      setFieldValue(name, formatCity(value))
      return
    }
    if (name.endsWith('.street1') || name === 'street1' || name.endsWith('.street2') || name === 'street2') {
      setFieldValue(name, formatStreet(value))
      return
    }
    if (name.endsWith('.zip') || name === 'zip') {
      setFieldValue(name, formatZip(value))
      return
    }
    if (name.endsWith('.phone') || name === 'phone') {
      setFieldValue(name, formatPhone(value))
      return
    }
    if (name.endsWith('.ssn') || name === 'ssn') {
      setFieldValue(name, formatSsn(value))
      return
    }
    if (name === 'entity.taxId') {
      setFieldValue(name, formatTaxId(value))
      return
    }
    setFieldValue(name, value)
  }

  const validate = () => {
    const newErrors = {}

    if (accountType === 'entity') {
      if (!form.entity.name.trim()) newErrors['entity.name'] = 'Required'
      if (!form.entity.phone.trim()) newErrors['entity.phone'] = 'Required'
      else if (!isValidUSPhone(form.entity.phone)) newErrors['entity.phone'] = 'Enter a valid US phone (10 digits; area code 2-9)'
      if (!form.entity.street1.trim()) newErrors['entity.street1'] = 'Required'
      if (!form.entity.city.trim()) newErrors['entity.city'] = 'Required'
      else if (/[0-9]/.test(form.entity.city)) newErrors['entity.city'] = 'No numbers allowed'
      if (!form.entity.state.trim()) newErrors['entity.state'] = 'Required'
      if (!form.entity.zip.trim()) newErrors['entity.zip'] = 'Required'
      else if (form.entity.zip.length !== 5) newErrors['entity.zip'] = 'Enter 5 digits'
      if (!form.entity.registrationDate) {
        newErrors['entity.registrationDate'] = 'Required'
      } else {
        const [y, m, d] = form.entity.registrationDate.split('-').map(Number)
        const date = new Date(y, m - 1, d)
        const today = new Date()
        const [minY, minM, minD] = MIN_DOB.split('-').map(Number)
        const min = new Date(minY, minM - 1, minD)
        if (!(date >= min && date <= today)) {
          newErrors['entity.registrationDate'] = `Enter a valid date (YYYY-MM-DD). Min ${MIN_DOB}. Cannot be in the future.`
        }
      }
      if (!form.entity.taxId.trim()) newErrors['entity.taxId'] = 'Required'
      else if (!isCompleteTaxId(form.entity.taxId)) newErrors['entity.taxId'] = 'Enter full EIN/TIN (9 digits)'
    } else {
      if (!form.firstName.trim()) newErrors.firstName = 'Required'
      if (!form.lastName.trim()) newErrors.lastName = 'Required'
      if (!form.phone.trim()) newErrors.phone = 'Required'
      else if (!isValidUSPhone(form.phone)) newErrors.phone = 'Enter a valid US phone (10 digits; area code 2-9)'
      if (!form.street1.trim()) newErrors.street1 = 'Required'
      if (!form.city.trim()) newErrors.city = 'Required'
      else if (/[0-9]/.test(form.city)) newErrors.city = 'No numbers allowed'
      if (!form.state.trim()) newErrors.state = 'Required'
      if (!form.zip.trim()) newErrors.zip = 'Required'
      else if (form.zip.length !== 5) newErrors.zip = 'Enter 5 digits'
      if (!form.dob) newErrors.dob = 'Required'
      else if (!isAdultDob(form.dob)) {
        newErrors.dob = `Enter a valid date (YYYY-MM-DD). Min ${MIN_DOB}. Must be 18+.`
      }
      // Skip SSN validation if it's masked (already on file)
      if (!form.ssn.trim()) newErrors.ssn = 'Required'
      else if (form.ssn !== '•••-••-••••' && !isCompleteSsn(form.ssn)) newErrors.ssn = 'Enter full SSN'
    }

    // Validate joint holder fields if account type is joint
    if (accountType === 'joint') {
      if (!form.jointHoldingType.trim()) newErrors.jointHoldingType = 'Required'
      if (!form.jointHolder.firstName.trim()) newErrors['jointHolder.firstName'] = 'Required'
      if (!form.jointHolder.lastName.trim()) newErrors['jointHolder.lastName'] = 'Required'
      if (!form.jointHolder.street1.trim()) newErrors['jointHolder.street1'] = 'Required'
      if (!form.jointHolder.city.trim()) newErrors['jointHolder.city'] = 'Required'
      else if (/[0-9]/.test(form.jointHolder.city)) newErrors['jointHolder.city'] = 'No numbers allowed'
      if (!form.jointHolder.state.trim()) newErrors['jointHolder.state'] = 'Required'
      if (!form.jointHolder.zip.trim()) newErrors['jointHolder.zip'] = 'Required'
      else if (form.jointHolder.zip.length !== 5) newErrors['jointHolder.zip'] = 'Enter 5 digits'
      if (!form.jointHolder.dob || !isAdultDob(form.jointHolder.dob)) newErrors['jointHolder.dob'] = `Enter a valid date (YYYY-MM-DD). Min ${MIN_DOB}. Must be 18+.`
      // Skip joint holder SSN validation if it's masked (already on file)
      if (!form.jointHolder.ssn.trim()) newErrors['jointHolder.ssn'] = 'Required'
      else if (form.jointHolder.ssn !== '•••-••-••••' && !isCompleteSsn(form.jointHolder.ssn)) newErrors['jointHolder.ssn'] = 'Enter full SSN'
      if (!/\S+@\S+\.\S+/.test(form.jointHolder.email)) newErrors['jointHolder.email'] = 'Invalid email'
      if (!form.jointHolder.phone.trim()) newErrors['jointHolder.phone'] = 'Required'
      else if (!isValidUSPhone(form.jointHolder.phone)) newErrors['jointHolder.phone'] = 'Enter a valid US phone (10 digits; area code 2-9)'
    }

    if (accountType === 'entity') {
      // Authorized representative must also be provided
      if (!form.authorizedRep.firstName.trim()) newErrors['authorizedRep.firstName'] = 'Required'
      if (!form.authorizedRep.lastName.trim()) newErrors['authorizedRep.lastName'] = 'Required'
      if (!form.authorizedRep.phone.trim()) newErrors['authorizedRep.phone'] = 'Required'
      else if (!isValidUSPhone(form.authorizedRep.phone)) newErrors['authorizedRep.phone'] = 'Enter a valid US phone (10 digits; area code 2-9)'
      if (!form.authorizedRep.street1.trim()) newErrors['authorizedRep.street1'] = 'Required'
      if (!form.authorizedRep.city.trim()) newErrors['authorizedRep.city'] = 'Required'
      else if (/[0-9]/.test(form.authorizedRep.city)) newErrors['authorizedRep.city'] = 'No numbers allowed'
      if (!form.authorizedRep.state.trim()) newErrors['authorizedRep.state'] = 'Required'
      if (!form.authorizedRep.zip.trim()) newErrors['authorizedRep.zip'] = 'Required'
      else if (form.authorizedRep.zip.length !== 5) newErrors['authorizedRep.zip'] = 'Enter 5 digits'
      if (!form.authorizedRep.dob || !isAdultDob(form.authorizedRep.dob)) newErrors['authorizedRep.dob'] = `Enter a valid date (YYYY-MM-DD). Min ${MIN_DOB}. Must be 18+.`
      // Skip authorized rep SSN validation if it's masked (already on file)
      if (!form.authorizedRep.ssn.trim()) newErrors['authorizedRep.ssn'] = 'Required'
      else if (form.authorizedRep.ssn !== '•••-••-••••' && !isCompleteSsn(form.authorizedRep.ssn)) newErrors['authorizedRep.ssn'] = 'Enter full SSN'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    
    // Note: Identity fields (name, DOB, SSN) are disabled when there are active investments
    // Contact info (phone, address) can still be updated per investment
    
    setIsSaving(true)
    try {
      if (typeof window === 'undefined') return
      
      const userId = localStorage.getItem('currentUserId')
      const investmentId = localStorage.getItem('currentInvestmentId')
      if (!userId) return

      // Update user profile
      const primaryAddress = accountType === 'entity'
        ? {
            street1: form.authorizedRep.street1,
            street2: form.authorizedRep.street2,
            city: form.authorizedRep.city,
            state: form.authorizedRep.state,
            zip: form.authorizedRep.zip,
            country: form.authorizedRep.country
          }
        : {
            street1: form.street1,
            street2: form.street2,
            city: form.city,
            state: form.state,
            zip: form.zip,
            country: form.country
          }

      const jointAddress = jointUsePrimaryAddress ? {
        street1: form.street1,
        street2: form.street2,
        city: form.city,
        state: form.state,
        zip: form.zip,
        country: form.country
      } : {
        street1: form.jointHolder.street1,
        street2: form.jointHolder.street2,
        city: form.jointHolder.city,
        state: form.jointHolder.state,
        zip: form.jointHolder.zip,
        country: form.jointHolder.country
      }

      const entityAddress = {
        street1: form.entity.street1,
        street2: form.entity.street2,
        city: form.entity.city,
        state: form.entity.state,
        zip: form.entity.zip,
        country: form.entity.country
      }

      // Don't send masked SSN values - they're already on file
      const isSsnMasked = form.ssn === '•••-••-••••'
      const isAuthRepSsnMasked = form.authorizedRep.ssn === '•••-••-••••'

      const primaryPhoneDisplay = accountType === 'entity' ? form.authorizedRep.phone : form.phone
      const normalizedPrimaryPhone = normalizePhoneForDB((primaryPhoneDisplay || '').trim())
      const normalizedAuthorizedRepPhone = normalizePhoneForBackend(form.authorizedRep.phone)
      const normalizedEntityPhone = form.entity.phone ? normalizePhoneForBackend(form.entity.phone) : ''

      const userData = {
        phoneNumber: normalizedPrimaryPhone,
        // Always update user's single address with latest values (match backend schema)
        address: formatAddressForBackend(primaryAddress),
        ...(accountType === 'joint' ? {
          // Declare joint profile with holding type and holder details
          accountType: 'joint',
          jointHoldingType: form.jointHoldingType,
          jointHolder: {
            firstName: form.jointHolder.firstName.trim(),
            lastName: form.jointHolder.lastName.trim(),
            email: form.jointHolder.email,
            phone: normalizePhoneForBackend(form.jointHolder.phone),
            dob: form.jointHolder.dob,
            // Only send joint holder SSN if it isn't masked
            ...(form.jointHolder.ssn === '•••-••-••••' ? {} : { ssn: form.jointHolder.ssn }),
            address: formatAddressForBackend(jointAddress)
          }
        } : {}),
        ...(accountType === 'entity'
          ? {
              accountType: 'entity',
              firstName: form.authorizedRep.firstName.trim(),
              lastName: form.authorizedRep.lastName.trim(),
              dob: form.authorizedRep.dob,
              ...(isAuthRepSsnMasked ? {} : { ssn: form.authorizedRep.ssn }),
              authorizedRepresentative: {
                firstName: form.authorizedRep.firstName.trim(),
                lastName: form.authorizedRep.lastName.trim(),
                phone: normalizedAuthorizedRepPhone,
                dob: form.authorizedRep.dob,
                ...(isAuthRepSsnMasked ? {} : { ssn: form.authorizedRep.ssn }),
                address: formatAddressForBackend(primaryAddress)
              },
              entity: {
                name: form.entity.name.trim(),
                formationDate: form.entity.registrationDate,
                registrationDate: form.entity.registrationDate,
                taxId: form.entity.taxId,
                ...(form.entity.phone ? { phone: normalizedEntityPhone } : {}),
                address: formatAddressForBackend(entityAddress)
              }
            }
          : {
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              dob: form.dob,
              // Only send ssn if it's not masked (already on file)
              ...(isSsnMasked ? {} : { ssn: form.ssn })
            })
      }

      // Note: Joint holder data is investment-specific; do not send in /api/profile payload

      // Build summary immediately and advance UI
      const summary = {
        accountType,
        firstName: accountType === 'entity' ? form.authorizedRep.firstName.trim() : form.firstName.trim(),
        lastName: accountType === 'entity' ? form.authorizedRep.lastName.trim() : form.lastName.trim(),
        phone: (primaryPhoneDisplay || '').trim(),
        street1: primaryAddress.street1,
        street2: primaryAddress.street2,
        city: primaryAddress.city,
        state: primaryAddress.state,
        zip: primaryAddress.zip,
        country: primaryAddress.country,
        dob: accountType === 'entity' ? form.authorizedRep.dob : form.dob,
        // For entity accounts, show EIN/TIN in the summary's 'ssn' field (renderer switches label)
        ssn: accountType === 'entity' ? form.entity.taxId : form.ssn,
        jointHoldingType: form.jointHoldingType,
        jointHolder: accountType === 'joint' ? {
          firstName: form.jointHolder.firstName,
          lastName: form.jointHolder.lastName,
          email: form.jointHolder.email,
          phone: form.jointHolder.phone,
          dob: form.jointHolder.dob,
          ssn: form.jointHolder.ssn,
          address: jointAddress
        } : undefined,
        entityName: accountType === 'entity' ? form.entity.name : undefined,
        entity: accountType === 'entity' ? {
          name: form.entity.name,
          phone: form.entity.phone,
          registrationDate: form.entity.registrationDate,
          taxId: form.entity.taxId,
          address: entityAddress
        } : undefined,
        authorizedRep: accountType === 'entity' ? {
          firstName: form.authorizedRep.firstName,
          lastName: form.authorizedRep.lastName,
          phone: form.authorizedRep.phone,
          dob: form.authorizedRep.dob,
          ssn: form.authorizedRep.ssn,
          address: primaryAddress
        } : undefined
      }
      // Persist a sanitized local snapshot so Edit rehydrates even if backend save fails
      try {
        const invId = localStorage.getItem('currentInvestmentId')
        const snapshotKey = invId ? `investmentIdentityDraft:${invId}` : 'investmentIdentityDraft'
        const sanitized = {
          ...form,
          ssn: '',
          dob: '',
          authorizedRep: { ...form.authorizedRep, ssn: '', dob: '' },
          jointHolder: { ...form.jointHolder, ssn: '', dob: '' },
          entity: { ...form.entity, taxId: '' }
        }
        localStorage.setItem(snapshotKey, JSON.stringify({ accountType, form: sanitized }))
      } catch {}
      if (typeof onReviewSummary === 'function') onReviewSummary(summary)
      if (typeof onCompleted === 'function') onCompleted(summary)

      // No longer persist client-side snapshots; rely solely on backend as source of truth

      // Use apiClient to call backend (background save). If profile is locked (403), silently ignore.
      apiClient.updateUser(userId, userData)
        .then(userResponse => {
          if (!userResponse.success) {
            // If backend returned structured failure, only warn when actionable
            const msg = String(userResponse.error || '').toLowerCase()
            if (msg.includes('profile is complete') || msg.includes('cannot be modified')) {
              console.log('ℹ️ Profile is complete; skipping profile update.')
            } else {
              console.error('Failed to update user profile:', userResponse.error)
            }
          } else {
            console.log('✅ User profile updated successfully')
          }
        })
        .catch(e => {
          const msg = String(e?.message || '').toLowerCase()
          if (e?.statusCode === 403 || msg.includes('profile is complete') || msg.includes('cannot be modified')) {
            console.log('ℹ️ Profile is complete; skipping profile update.')
          } else {
            console.error('Failed saving user data', e)
          }
        })

      // Prepare address data for saving (defined BEFORE usage below)
      const mainAddress = {
        street1: primaryAddress.street1,
        street2: primaryAddress.street2,
        city: primaryAddress.city,
        state: primaryAddress.state,
        zip: primaryAddress.zip,
        country: primaryAddress.country,
        label: accountType === 'entity' ? 'Authorized Rep' : 'Home',
        isPrimary: true
      }

      const jointAddressData = accountType === 'joint' ? {
        street1: form.jointHolder.street1,
        street2: form.jointHolder.street2,
        city: form.jointHolder.city,
        state: form.jointHolder.state,
        zip: form.jointHolder.zip,
        country: form.jointHolder.country,
        label: 'Joint Holder',
        isPrimary: false
      } : null

      const repAddressData = accountType === 'entity' ? {
        street1: form.authorizedRep.street1,
        street2: form.authorizedRep.street2,
        city: form.authorizedRep.city,
        state: form.authorizedRep.state,
        zip: form.authorizedRep.zip,
        country: form.authorizedRep.country,
        label: 'Authorized Rep',
        isPrimary: false
      } : null

      // No longer write to addresses table; user's address is updated above

      // Also reflect into the current investment if available
      if (investmentId) {
        let investmentFields = {
          // Always include accountType to ensure it's persisted
          accountType: accountType
        }
        
        if (accountType === 'entity') {
          investmentFields.entity = {
            name: form.entity.name.trim(),
            formationDate: form.entity.registrationDate,
            registrationDate: form.entity.registrationDate,
            ...(form.entity.phone ? { phone: normalizedEntityPhone } : {}),
            address: formatAddressForBackend(entityAddress)
          }
          investmentFields.authorizedRepresentative = {
            firstName: form.authorizedRep.firstName.trim(),
            lastName: form.authorizedRep.lastName.trim(),
            phone: normalizedAuthorizedRepPhone,
            dob: form.authorizedRep.dob,
            ...(isAuthRepSsnMasked ? {} : { ssn: form.authorizedRep.ssn }),
            address: formatAddressForBackend(primaryAddress)
          }
        } else if (accountType === 'joint') {
          // Add joint holder data to investment
          investmentFields.jointHoldingType = form.jointHoldingType
          investmentFields.jointHolder = {
            firstName: form.jointHolder.firstName.trim(),
            lastName: form.jointHolder.lastName.trim(),
            address: formatAddressForBackend(jointAddress),
            dob: form.jointHolder.dob,
            email: form.jointHolder.email,
            phone: normalizePhoneForBackend(form.jointHolder.phone)
          }
          // Record acknowledgement at time of completing identity step
          investmentFields.jointHolderAcknowledgement = {
            accepted: true,
            acceptedAt: new Date().toISOString()
          }
        } else if (accountType === 'individual' && USE_SERVER_IDENTITY_DRAFTS) {
          // Persist individual identity draft without sensitive numbers
          investmentFields.identityDraft = {
            holder: {
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              phone: normalizePhoneForBackend(form.phone),
              dob: form.dob,
              address: formatAddressForBackend(primaryAddress),
              ssnOnFile: isSsnMasked || Boolean(userData?.ssn)
            }
          }
        }

        try {
          console.log('💾 Saving investment identity fields:', { investmentId, keys: Object.keys(investmentFields || {}) })
          const investmentResponse = await apiClient.updateInvestment(userId, investmentId, investmentFields)
          if (!investmentResponse.success) {
            console.error('Failed to update investment:', investmentResponse.error)
          } else {
            console.log('✅ Investment data saved (investment):', {
              success: investmentResponse.success,
              hasInvestment: !!investmentResponse.investment,
              returnedAccountType: investmentResponse.investment?.accountType
            })
            // Fallback: if backend doesn't include accountType on investment, persist on user profile
            if (!investmentResponse.investment?.accountType && accountType === 'individual') {
              try {
                const userResp = await apiClient.updateUser(userId, { accountType })
                console.log('ℹ️ Fallback user accountType update after identity save (individual):', {
                  success: userResp?.success,
                  accountType
                })
              } catch (e) {
                console.warn('⚠️ Fallback user accountType update failed after identity save:', e)
              }
            } else if (!investmentResponse.investment?.accountType) {
              console.log('ℹ️ Skipping profile fallback for non-individual accountType after identity save')
            }
          }
        } catch (error) {
          console.error('Failed to update investment:', error)
        }
      }
    } catch (e) {
      console.error('Failed saving address & identity', e)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Warning message if user has active investments */}
      {hasActiveInvestments && (
        <div style={{
          padding: '16px',
          marginBottom: '20px',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          color: '#92400e',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          <strong>⚠️ Identity Information Locked:</strong> Your name, date of birth, and SSN/TIN cannot be modified while you have pending or active investments. You can still update your phone number and address for this investment.
        </div>
      )}
      
      {/* Joint Holding Type Selection - only show for joint accounts */}
      {accountType === 'joint' && (
        <div className={styles.jointHoldingTypeSection}>
          <div className={styles.field}>
            <label className={styles.label}>Joint Holding Type</label>
            <select
              name="jointHoldingType"
              value={form.jointHoldingType}
              onChange={handleChange}
              className={`${styles.input} ${errors.jointHoldingType ? styles.inputError : ''}`}
            >
              <option value="">Select joint holding type</option>
              <option value="spouse">Spouse</option>
              <option value="sibling">Sibling</option>
              <option value="domestic_partner">Domestic Partner</option>
              <option value="business_partner">Business Partner</option>
              <option value="other">Other</option>
            </select>
            {errors.jointHoldingType && <span className={styles.error}>{errors.jointHoldingType}</span>}
          </div>
        </div>
      )}

      {/* Authorized Representative first for Entities */}
      {accountType === 'entity' && (
        <>
          <div className={styles.sectionTitle}>
            <h3>Authorized Representative Information</h3>
          </div>
          <div className={styles.grid}>
            <div className={styles.field}> 
              <label className={styles.label}>First Name</label>
              <input className={`${styles.input} ${errors['authorizedRep.firstName'] ? styles.inputError : ''}`} name="authorizedRep.firstName" value={form.authorizedRep.firstName} onChange={handleChange} placeholder="Enter first name" disabled={hasActiveInvestments} />
              {errors['authorizedRep.firstName'] && <span className={styles.error}>{errors['authorizedRep.firstName']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Last Name</label>
              <input className={`${styles.input} ${errors['authorizedRep.lastName'] ? styles.inputError : ''}`} name="authorizedRep.lastName" value={form.authorizedRep.lastName} onChange={handleChange} placeholder="Enter last name" disabled={hasActiveInvestments} />
              {errors['authorizedRep.lastName'] && <span className={styles.error}>{errors['authorizedRep.lastName']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Phone Number</label>
              <input className={`${styles.input} ${errors['authorizedRep.phone'] ? styles.inputError : ''}`} name="authorizedRep.phone" value={form.authorizedRep.phone} onChange={handleChange} placeholder="(555) 555-5555" inputMode="tel" />
              {errors['authorizedRep.phone'] && <span className={styles.error}>{errors['authorizedRep.phone']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Street Address</label>
              <input className={`${styles.input} ${errors['authorizedRep.street1'] ? styles.inputError : ''}`} name="authorizedRep.street1" value={form.authorizedRep.street1} onChange={handleChange} placeholder="No PO Boxes" />
              {errors['authorizedRep.street1'] && <span className={styles.error}>{errors['authorizedRep.street1']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Apt or Unit</label>
              <input className={styles.input} name="authorizedRep.street2" value={form.authorizedRep.street2} onChange={handleChange} placeholder="Apt, unit, etc." />
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>City</label>
              <input className={`${styles.input} ${errors['authorizedRep.city'] ? styles.inputError : ''}`} name="authorizedRep.city" value={form.authorizedRep.city} onChange={handleChange} placeholder="Enter city" />
              {errors['authorizedRep.city'] && <span className={styles.error}>{errors['authorizedRep.city']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Zip Code</label>
              <input className={`${styles.input} ${errors['authorizedRep.zip'] ? styles.inputError : ''}`} name="authorizedRep.zip" value={form.authorizedRep.zip} onChange={handleChange} placeholder="Enter ZIP code" inputMode="numeric" />
              {errors['authorizedRep.zip'] && <span className={styles.error}>{errors['authorizedRep.zip']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>State</label>
              <select
                name="authorizedRep.state"
                value={form.authorizedRep.state}
                onChange={handleChange}
                className={`${styles.input} ${errors['authorizedRep.state'] ? styles.inputError : ''}`}
              >
                <option value="">Select state</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors['authorizedRep.state'] && <span className={styles.error}>{errors['authorizedRep.state']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Country</label>
              <input className={styles.input} name="authorizedRep.country" value={form.authorizedRep.country} readOnly disabled />
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Date of Birth</label>
              <input className={`${styles.input} ${errors['authorizedRep.dob'] ? styles.inputError : ''}`} type="date" name="authorizedRep.dob" value={form.authorizedRep.dob} onChange={handleChange} min={MIN_DOB} max={maxAdultDob} disabled={hasActiveInvestments} />
              {errors['authorizedRep.dob'] && <span className={styles.error}>{errors['authorizedRep.dob']}</span>}
            </div>
            <div className={styles.field}> 
              <div className={styles.labelRow}>
                <label className={styles.label}>SSN</label>
                <button type="button" className={styles.helpLink} onClick={() => setShowAuthorizedRepSsnHelp(v => !v)}>Why do we need this?</button>
              </div>
              <input 
                className={`${styles.input} ${errors['authorizedRep.ssn'] ? styles.inputError : ''}`} 
                type="text"
                name="authorizedRep.ssn" 
                value={form.authorizedRep.ssn} 
                onChange={handleChange} 
                placeholder="123-45-6789" 
                inputMode="numeric" 
                disabled={hasActiveInvestments || form.authorizedRep.ssn === '•••-••-••••'} 
                readOnly={hasActiveInvestments || form.authorizedRep.ssn === '•••-••-••••'}
                autoComplete="off"
                title={form.authorizedRep.ssn === '•••-••-••••' ? 'SSN on file - cannot be modified' : ''}
              />
              {errors['authorizedRep.ssn'] && <span className={styles.error}>{errors['authorizedRep.ssn']}</span>}
              {showAuthorizedRepSsnHelp && (
                <div className={styles.helpText}>
                  A Taxpayer Identification Number (TIN) is necessary for compliance with Anti-Money Laundering (AML) and Know Your Customer (KYC) regulations. This information is securely stored and used only for verification purposes.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Holder / Entity Information Section */}
      <div className={styles.sectionTitle}>
        <h3>{accountType === 'entity' ? 'Entity Information' : (accountType === 'joint' ? 'Primary Holder Information' : 'Holder Information')}</h3>
      </div>
      <div className={styles.grid}>
        {accountType === 'entity' ? (
          <>
            <div className={styles.field}> 
              <label className={styles.label}>Entity Name</label>
              <input
                className={`${styles.input} ${errors['entity.name'] ? styles.inputError : ''}`}
                name="entity.name"
                value={form.entity.name}
                onChange={handleChange}
                placeholder="Enter entity name"
                disabled={hasActiveInvestments}
              />
              {errors['entity.name'] && <span className={styles.error}>{errors['entity.name']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Phone Number</label>
              <input
                className={`${styles.input} ${errors['entity.phone'] ? styles.inputError : ''}`}
                name="entity.phone"
                value={form.entity.phone}
                onChange={handleChange}
                placeholder="(555) 555-5555"
                inputMode="tel"
              />
              {errors['entity.phone'] && <span className={styles.error}>{errors['entity.phone']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Street Address</label>
              <input
                className={`${styles.input} ${errors['entity.street1'] ? styles.inputError : ''}`}
                name="entity.street1"
                value={form.entity.street1}
                onChange={handleChange}
                placeholder="No PO Boxes"
              />
              {errors['entity.street1'] && <span className={styles.error}>{errors['entity.street1']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Apt or Unit</label>
              <input
                className={styles.input}
                name="entity.street2"
                value={form.entity.street2}
                onChange={handleChange}
                placeholder="Apt, unit, etc."
              />
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>City</label>
              <input
                className={`${styles.input} ${errors['entity.city'] ? styles.inputError : ''}`}
                name="entity.city"
                value={form.entity.city}
                onChange={handleChange}
                placeholder="Enter city"
              />
              {errors['entity.city'] && <span className={styles.error}>{errors['entity.city']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Zip Code</label>
              <input
                className={`${styles.input} ${errors['entity.zip'] ? styles.inputError : ''}`}
                name="entity.zip"
                value={form.entity.zip}
                onChange={handleChange}
                placeholder="Enter ZIP code"
                inputMode="numeric"
              />
              {errors['entity.zip'] && <span className={styles.error}>{errors['entity.zip']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>State</label>
              <select
                name="entity.state"
                value={form.entity.state}
                onChange={handleChange}
                className={`${styles.input} ${errors['entity.state'] ? styles.inputError : ''}`}
              >
                <option value="">Select state</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors['entity.state'] && <span className={styles.error}>{errors['entity.state']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Country</label>
              <input className={styles.input} name="entity.country" value={form.entity.country} readOnly disabled />
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>{dateLabel}</label>
              <input
                className={`${styles.input} ${errors['entity.registrationDate'] ? styles.inputError : ''}`}
                type="date"
                name="entity.registrationDate"
                value={form.entity.registrationDate}
                onChange={handleChange}
                min={MIN_DOB}
                max={maxToday}
                disabled={hasActiveInvestments}
              />
              {errors['entity.registrationDate'] && <span className={styles.error}>{errors['entity.registrationDate']}</span>}
            </div>
            <div className={styles.field}> 
              <div className={styles.labelRow}>
                <label className={styles.label}>{idLabel}</label>
                <button type="button" className={styles.helpLink} onClick={() => setShowSsnHelp(v => !v)}>
                  Why do we need this?
                </button>
              </div>
              <input 
                className={`${styles.input} ${errors['entity.taxId'] ? styles.inputError : ''}`} 
                type="text"
                name="entity.taxId" 
                value={form.entity.taxId} 
                onChange={handleChange} 
                placeholder="Enter EIN or TIN"
                inputMode="numeric" 
                disabled={hasActiveInvestments || form.entity.taxId === '•••-••-••••'} 
                readOnly={hasActiveInvestments || form.entity.taxId === '•••-••-••••'}
                autoComplete="off"
                title={form.entity.taxId === '•••-••-••••' ? 'TIN on file - cannot be modified' : ''}
              />
              {errors['entity.taxId'] && <span className={styles.error}>{errors['entity.taxId']}</span>}
              {showSsnHelp && (
                <div className={styles.helpText}>
                  A Taxpayer Identification Number (TIN) is necessary for compliance with Anti-Money Laundering (AML) and Know Your Customer (KYC) regulations. This information is securely stored and used only for verification purposes.
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={styles.field}> 
              <label className={styles.label}>First Name</label>
              <input className={`${styles.input} ${errors.firstName ? styles.inputError : ''}`} name="firstName" value={form.firstName} onChange={handleChange} placeholder="Enter first name" disabled={hasActiveInvestments} />
              {errors.firstName && <span className={styles.error}>{errors.firstName}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Last Name</label>
              <input className={`${styles.input} ${errors.lastName ? styles.inputError : ''}`} name="lastName" value={form.lastName} onChange={handleChange} placeholder="Enter last name" disabled={hasActiveInvestments} />
              {errors.lastName && <span className={styles.error}>{errors.lastName}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Phone Number</label>
              <input className={`${styles.input} ${errors.phone ? styles.inputError : ''}`} name="phone" value={form.phone} onChange={handleChange} placeholder="(555) 555-5555" inputMode="tel" />
              {errors.phone && <span className={styles.error}>{errors.phone}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Street Address</label>
              <input className={`${styles.input} ${errors.street1 ? styles.inputError : ''}`} name="street1" value={form.street1} onChange={handleChange} placeholder="No PO Boxes" />
              {errors.street1 && <span className={styles.error}>{errors.street1}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Apt or Unit</label>
              <input className={styles.input} name="street2" value={form.street2} onChange={handleChange} placeholder="Apt, unit, etc." />
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>City</label>
              <input className={`${styles.input} ${errors.city ? styles.inputError : ''}`} name="city" value={form.city} onChange={handleChange} placeholder="Enter city" />
              {errors.city && <span className={styles.error}>{errors.city}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Zip Code</label>
              <input className={`${styles.input} ${errors.zip ? styles.inputError : ''}`} name="zip" value={form.zip} onChange={handleChange} placeholder="Enter ZIP code" inputMode="numeric" />
              {errors.zip && <span className={styles.error}>{errors.zip}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>State</label>
              <select
                name="state"
                value={form.state}
                onChange={handleChange}
                className={`${styles.input} ${errors.state ? styles.inputError : ''}`}
              >
                <option value="">Select state</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.state && <span className={styles.error}>{errors.state}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Country</label>
              <input className={styles.input} name="country" value={form.country} readOnly disabled />
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>{dateLabel}</label>
              <input className={`${styles.input} ${errors.dob ? styles.inputError : ''}`} type="date" name="dob" value={form.dob} onChange={handleChange} min={MIN_DOB} max={maxAdultDob} disabled={hasActiveInvestments} />
              {errors.dob && <span className={styles.error}>{errors.dob}</span>}
            </div>
            <div className={styles.field}> 
              <div className={styles.labelRow}>
                <label className={styles.label}>{idLabel}</label>
                <button type="button" className={styles.helpLink} onClick={() => setShowSsnHelp(v => !v)}>
                  Why do we need this?
                </button>
              </div>
              <input 
                className={`${styles.input} ${errors.ssn ? styles.inputError : ''}`} 
                type="text"
                name="ssn" 
                value={form.ssn} 
                onChange={handleChange} 
                placeholder="123-45-6789"
                inputMode="numeric" 
                disabled={hasActiveInvestments || form.ssn === '•••-••-••••'} 
                readOnly={hasActiveInvestments || form.ssn === '•••-••-••••'}
                autoComplete="off"
                title={form.ssn === '•••-••-••••' ? 'SSN on file - cannot be modified' : ''}
              />
              {errors.ssn && <span className={styles.error}>{errors.ssn}</span>}
              {!form.ssn && !errors.ssn && hasActiveInvestments && (
                <span className={styles.helpText} style={{color: '#f59e0b', marginTop: '4px'}}>
                  ⚠️ No SSN on file. Contact your administrator to add SSN to your profile before making an investment.
                </span>
              )}
              {showSsnHelp && (
                <div className={styles.helpText}>
                  A Taxpayer Identification Number (TIN) is necessary for compliance with Anti-Money Laundering (AML) and Know Your Customer (KYC) regulations. This information is securely stored and used only for verification purposes.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Authorized Representative Information for Entities - section moved above */}

      {/* Joint Holder Information Section - only show for joint accounts */}
      {accountType === 'joint' && (
        <>
          <div className={styles.sectionTitle}>
            <h3>Joint Holder Information</h3>
          </div>
          {/* Move the toggle below identity fields for better flow */}

          <div className={styles.grid}>
            <div className={styles.field}> 
              <label className={styles.label}>First Name</label>
              <input className={`${styles.input} ${errors['jointHolder.firstName'] ? styles.inputError : ''}`} name="jointHolder.firstName" value={form.jointHolder.firstName} onChange={handleChange} placeholder="Enter first name" disabled={hasActiveInvestments} />
              {errors['jointHolder.firstName'] && <span className={styles.error}>{errors['jointHolder.firstName']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Last Name</label>
              <input className={`${styles.input} ${errors['jointHolder.lastName'] ? styles.inputError : ''}`} name="jointHolder.lastName" value={form.jointHolder.lastName} onChange={handleChange} placeholder="Enter last name" disabled={hasActiveInvestments} />
              {errors['jointHolder.lastName'] && <span className={styles.error}>{errors['jointHolder.lastName']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Email</label>
              <input className={`${styles.input} ${errors['jointHolder.email'] ? styles.inputError : ''}`} name="jointHolder.email" value={form.jointHolder.email} onChange={handleChange} placeholder="name@example.com" />
              {errors['jointHolder.email'] && <span className={styles.error}>{errors['jointHolder.email']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Phone</label>
              <input className={`${styles.input} ${errors['jointHolder.phone'] ? styles.inputError : ''}`} name="jointHolder.phone" value={form.jointHolder.phone} onChange={handleChange} placeholder="(555) 555-5555" />
              {errors['jointHolder.phone'] && <span className={styles.error}>{errors['jointHolder.phone']}</span>}
            </div>
            <div className={styles.field}> 
              <label className={styles.label}>Date of Birth</label>
              <input className={`${styles.input} ${errors['jointHolder.dob'] ? styles.inputError : ''}`} type="date" name="jointHolder.dob" value={form.jointHolder.dob} onChange={handleChange} min={MIN_DOB} max={maxAdultDob} disabled={hasActiveInvestments} />
              {errors['jointHolder.dob'] && <span className={styles.error}>{errors['jointHolder.dob']}</span>}
            </div>
            <div className={styles.field}> 
              <div className={styles.labelRow}>
                <label className={styles.label}>SSN</label>
                <button type="button" className={styles.helpLink} onClick={() => setShowJointSsnHelp(v => !v)}>Why do we need this?</button>
              </div>
              <input 
                className={`${styles.input} ${errors['jointHolder.ssn'] ? styles.inputError : ''}`} 
                type="text"
                name="jointHolder.ssn" 
                value={form.jointHolder.ssn} 
                onChange={handleChange} 
                placeholder="123-45-6789" 
                inputMode="numeric" 
                disabled={hasActiveInvestments || form.jointHolder.ssn === '•••-••-••••'} 
                readOnly={hasActiveInvestments || form.jointHolder.ssn === '•••-••-••••'}
                autoComplete="off"
                title={form.jointHolder.ssn === '•••-••-••••' ? 'SSN on file - cannot be modified' : ''}
              />
              {errors['jointHolder.ssn'] && <span className={styles.error}>{errors['jointHolder.ssn']}</span>}
              {showJointSsnHelp && (
                <div className={styles.helpText}>
                  A Taxpayer Identification Number (TIN) is necessary for compliance with Anti-Money Laundering (AML) and Know Your Customer (KYC) regulations. This information is securely stored and used only for verification purposes.
                </div>
              )}
            </div>
          </div>

          <div style={{ margin: '16px 0 12px 0' }}>
            {jointUsePrimaryAddress ? (
              <button type="button" onClick={handleDifferentAddress} className={styles.secondaryButton}>
                The joint holder has a different address
              </button>
            ) : (
              <button type="button" onClick={handleUseSameAddress} className={styles.secondaryButton}>
                Use same address as primary
              </button>
            )}
          </div>

          {/* Address fields are revealed below the toggle to keep flow */}
          {!jointUsePrimaryAddress && (
            <div className={styles.grid}>
              <div className={styles.field}> 
                <label className={styles.label}>Street Address</label>
                <input className={`${styles.input} ${errors['jointHolder.street1'] ? styles.inputError : ''}`} name="jointHolder.street1" value={form.jointHolder.street1} onChange={handleChange} placeholder="No PO Boxes" />
                {errors['jointHolder.street1'] && <span className={styles.error}>{errors['jointHolder.street1']}</span>}
              </div>
              <div className={styles.field}> 
                <label className={styles.label}>Apt or Unit</label>
                <input className={styles.input} name="jointHolder.street2" value={form.jointHolder.street2} onChange={handleChange} placeholder="Apt, unit, etc." />
              </div>
              <div className={styles.field}> 
                <label className={styles.label}>City</label>
                <input className={`${styles.input} ${errors['jointHolder.city'] ? styles.inputError : ''}`} name="jointHolder.city" value={form.jointHolder.city} onChange={handleChange} placeholder="Enter city" />
                {errors['jointHolder.city'] && <span className={styles.error}>{errors['jointHolder.city']}</span>}
              </div>
              <div className={styles.field}> 
                <label className={styles.label}>Zip Code</label>
                <input className={`${styles.input} ${errors['jointHolder.zip'] ? styles.inputError : ''}`} name="jointHolder.zip" value={form.jointHolder.zip} onChange={handleChange} placeholder="Enter ZIP code" inputMode="numeric" />
                {errors['jointHolder.zip'] && <span className={styles.error}>{errors['jointHolder.zip']}</span>}
              </div>
              <div className={styles.field}> 
                <label className={styles.label}>State</label>
                <select
                  name="jointHolder.state"
                  value={form.jointHolder.state}
                  onChange={handleChange}
                  className={`${styles.input} ${errors['jointHolder.state'] ? styles.inputError : ''}`}
                >
                  <option value="">Select state</option>
                  {US_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors['jointHolder.state'] && <span className={styles.error}>{errors['jointHolder.state']}</span>}
              </div>
              <div className={styles.field}> 
                <label className={styles.label}>Country</label>
                <input className={styles.input} name="jointHolder.country" value={form.jointHolder.country} readOnly disabled />
              </div>
            </div>
          )}

          <p className={styles.acknowledgement} style={{ marginTop: '12px' }}>
            By clicking "Continue" I{nameSegment} confirm that I have informed my Joint Holder of the terms of the Subscription Agreement, including the investment risks and amount, and my Joint Holder consents to and authorizes me to enter into it on our behalf with respect to any such interests, waiving any challenge based on lack of joint holder consent under the laws of {governingStateDisplay}.
          </p>
        </>
      )}

      <div className={styles.actions}>
        <button className={styles.primaryButton} onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}


