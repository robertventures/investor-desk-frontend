'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '../../lib/apiClient'
import logger from '@/lib/logger'
import styles from './ProfileView.module.css'
import BankConnectionModal from './BankConnectionModal'

export default function ProfileView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const MIN_DOB = '1900-01-01'
  const maxDob = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate())
    return cutoff.toISOString().split('T')[0]
  }, [])
  const maxToday = useMemo(() => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  }, [])

  // Names: Allow only letters, spaces, hyphens, apostrophes, and periods
  const formatName = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')
  const formatEntityName = (value = '') => value.replace(/[^a-zA-Z0-9\s'\-\.&,]/g, '')

  // City names: Allow only letters, spaces, hyphens, apostrophes, and periods
  const formatCity = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

  // Street addresses: Allow letters, numbers, spaces, hyphens, periods, commas, and hash symbols
  const formatStreet = (value = '') => value.replace(/[^a-zA-Z0-9\s'\-\.,#]/g, '')

  // Format US phone numbers as (XXX) XXX-XXXX while typing (ignore leading country code 1)
  const formatPhone = (value = '') => {
    const digitsOnly = (value || '').replace(/\D/g, '')
    const withoutCountry = digitsOnly.startsWith('1') && digitsOnly.length === 11 ? digitsOnly.slice(1) : digitsOnly
    const len = withoutCountry.length
    if (len === 0) return ''
    if (len <= 3) return `(${withoutCountry}`
    if (len <= 6) return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3)}`
    return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3, 6)}-${withoutCountry.slice(6, 10)}`
  }

  // Mask SSN for display (show last 4 digits only)
  const maskSSN = (ssn = '') => {
    if (!ssn) return ''
    const digits = ssn.replace(/\D/g, '')
    if (digits.length === 9) {
      return `***-**-${digits.slice(-4)}`
    }
    return '***-**-****'
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

  // US phone validation aligned with backend: 10 digits; area code must start 2-9
  const isValidUSPhoneDigits = (raw = '') => {
    const digitsOnly = (raw || '').replace(/\D/g, '')
    const normalized = digitsOnly.length === 11 && digitsOnly.startsWith('1') ? digitsOnly.slice(1) : digitsOnly
    if (normalized.length !== 10) return false
    return /^[2-9][0-9]{9}$/.test(normalized)
  }

  const parseDateString = (value = '') => {
    const [year, month, day] = (value || '').split('-').map(Number)
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

  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState('primary-holder')
  const [userData, setUserData] = useState(null)
  const [formData, setFormData] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errors, setErrors] = useState({})
  const [investmentsLoading, setInvestmentsLoading] = useState(true) // Track if investments are still loading
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false)
  const [showSSN, setShowSSN] = useState(false)
  const [showJointSSN, setShowJointSSN] = useState(false)
  const [showRepSSN, setShowRepSSN] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [isRemovingBank, setIsRemovingBank] = useState(null)
  // Track if user has any joint investments to decide rendering the joint section
  const [hasJointInvestments, setHasJointInvestments] = useState(false)
  // Single user address (horizontal form in Addresses tab)
  const [addressForm, setAddressForm] = useState({
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States'
  })

  // Build and replace dashboard URL with a single section=profile and optional tab
  const replaceProfileUrl = (options = {}) => {
    const next = new URLSearchParams()
    // Copy existing params except section, from, and optionally tab (if provided)
    for (const [key, value] of searchParams.entries()) {
      if (key === 'section' || key === 'from') continue
      if (options.tab !== undefined && key === 'tab') continue
      next.append(key, value)
    }
    next.set('section', 'profile')
    if (options.tab !== undefined) {
      next.set('tab', options.tab)
    }
    router.replace(`/dashboard?${next.toString()}`, { scroll: false })
  }

  useEffect(() => {
    setMounted(true)
    loadUser()
  }, [])

  // Handle tab from URL params
  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab) {
      // Backward compatibility: map old 'investor-info' and removed 'addresses' to 'primary-holder'
      const remapped = tab === 'investor-info' || tab === 'addresses' ? 'primary-holder' : tab
      
      // Compute joint availability locally
      let localShowJoint = false
      if (userData) {
        const hasPendingOrActiveJointLocal = Array.isArray(userData?.investments) && 
          userData.investments.some(inv => inv.accountType === 'joint' && (inv.status === 'pending' || inv.status === 'active'))
        localShowJoint = userData?.accountType === 'joint' || hasPendingOrActiveJointLocal || hasJointInvestments
      }

      const allowed = ['primary-holder', 'joint-holder', 'entity-info', 'trusted-contact', 'banking', 'security']
      let resolved = allowed.includes(remapped) ? remapped : 'primary-holder'

      // Guard: entity tab requires entity investments
      if (resolved === 'entity-info' && userData) {
        const hasEntityInvestments = Array.isArray(userData?.investments) && 
          userData.investments.some(inv => inv.accountType === 'entity' && (inv.status === 'pending' || inv.status === 'active'))
        const allowEntityTab = userData?.accountType === 'entity' || hasEntityInvestments
        if (!allowEntityTab) {
          replaceProfileUrl({ tab: 'primary-holder' })
          setActiveTab('primary-holder')
          return
        }
      }

      // Guard: joint-holder tab only when joint is available
      if (resolved === 'joint-holder' && !localShowJoint) {
        replaceProfileUrl({ tab: 'primary-holder' })
        setActiveTab('primary-holder')
        return
      }

      // Apply mapping if changed
      if (remapped !== tab) {
        replaceProfileUrl({ tab: remapped })
      }
      setActiveTab(resolved)
    }
  }, [searchParams, userData, router])

  const loadUser = async () => {
    if (typeof window === 'undefined') return
    
    const userId = localStorage.getItem('currentUserId')
    if (!userId) return

    try {
      // Use apiClient to route to Python backend (not Next.js)
      const data = await apiClient.getUser(userId)
      if (data.success && data.user) {
        // Ensure investments array is included even if empty
        setUserData({ ...data.user, investments: data.user.investments || [] })
        
        setFormData({
          firstName: data.user.firstName || '',
          lastName: data.user.lastName || '',
          email: data.user.email || '',
          phoneNumber: formatPhone(data.user.phoneNumber || data.user.phone || ''),
          dob: data.user.dob || '',
          ssn: data.user.ssn || '',
          jointHolder: data.user.jointHolder ? {
            firstName: data.user.jointHolder.firstName || '',
            lastName: data.user.jointHolder.lastName || '',
            email: data.user.jointHolder.email || '',
            phone: formatPhone(data.user.jointHolder.phone || ''),
            dob: data.user.jointHolder.dob || '',
            ssn: data.user.jointHolder.ssn || '',
            address: {
              street1: data.user.jointHolder.address?.street1 || '',
              street2: data.user.jointHolder.address?.street2 || '',
              city: data.user.jointHolder.address?.city || '',
              state: data.user.jointHolder.address?.state || '',
              zip: data.user.jointHolder.address?.zip || '',
              country: data.user.jointHolder.address?.country || 'United States'
            }
          } : {
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            dob: '',
            ssn: '',
            address: {
              street1: '',
              street2: '',
              city: '',
              state: '',
              zip: '',
              country: 'United States'
            }
          },
          jointHoldingType: data.user.jointHoldingType || '',
          entity: {
            name: data.user.entity?.name || '',
            title: data.user.entity?.title || '',
            registrationDate: data.user.entity?.registrationDate || data.user.entity?.formationDate || '',
            taxId: data.user.entity?.taxId || '',
            address: {
              street1: data.user.entity?.address?.street1 || '',
              street2: data.user.entity?.address?.street2 || '',
              city: data.user.entity?.address?.city || '',
              state: data.user.entity?.address?.state || '',
              zip: data.user.entity?.address?.zip || '',
              country: data.user.entity?.address?.country || 'United States'
            }
          },
          trustedContact: {
            firstName: data.user.trustedContact?.firstName || '',
            lastName: data.user.trustedContact?.lastName || '',
            email: data.user.trustedContact?.email || '',
            phone: formatPhone(data.user.trustedContact?.phone || ''),
            relationship: data.user.trustedContact?.relationshipType || data.user.trustedContact?.relationship || ''
          }
        })
        // Prefill single address form from user.address
        setAddressForm({
          street1: data.user.address?.street1 || '',
          street2: data.user.address?.street2 || '',
          city: data.user.address?.city || '',
          state: data.user.address?.state || '',
          zip: data.user.address?.zip || '',
          country: data.user.address?.country || 'United States'
        })

        // Additionally, load joint investment details when profile doesn't include them
        try {
          const investmentsResp = await apiClient.getInvestments()
          const invs = investmentsResp?.investments || []
          
          // Update userData with investments so hasInvestments check works properly
          setUserData(prev => ({ ...prev, investments: invs }))
          
          // Mark investments as loaded so fields can be properly enabled/disabled
          setInvestmentsLoading(false)
          
          // Determine if the user has a joint investment (pending or active)
          const jointCandidates = invs.filter(inv => inv.accountType === 'joint' && (inv.status === 'pending' || inv.status === 'active'))
          setHasJointInvestments(jointCandidates.length > 0)
          // If profile lacks jointHolder but we have a joint draft/pending/active investment, fetch its details
          const preferred = jointCandidates
            .sort((a, b) => {
              // Prefer most recent by createdAt or by id as fallback
              const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0
              const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0
              if (ad !== bd) return bd - ad
              return (b.id || 0) - (a.id || 0)
            })[0]
          if (preferred && (!data.user.jointHolder || !data.user.jointHoldingType)) {
            try {
              const detail = await apiClient.getInvestment(preferred.id)
              const inv = detail?.investment || {}
              if (inv.jointHolder || inv.jointHoldingType) {
                setFormData(prev => ({
                  ...prev,
                  jointHoldingType: prev.jointHoldingType || inv.jointHoldingType || '',
                  jointHolder: {
                    ...(prev.jointHolder || {}),
                    firstName: prev.jointHolder?.firstName || inv.jointHolder?.firstName || '',
                    lastName: prev.jointHolder?.lastName || inv.jointHolder?.lastName || '',
                    email: prev.jointHolder?.email || inv.jointHolder?.email || '',
                    phone: prev.jointHolder?.phone || (inv.jointHolder?.phone ? formatPhone(inv.jointHolder.phone) : ''),
                    dob: prev.jointHolder?.dob || inv.jointHolder?.dob || '',
                    ssn: prev.jointHolder?.ssn || inv.jointHolder?.ssn || '',
                    address: {
                      street1: prev.jointHolder?.address?.street1 || inv.jointHolder?.address?.street1 || '',
                      street2: prev.jointHolder?.address?.street2 || inv.jointHolder?.address?.street2 || '',
                      city: prev.jointHolder?.address?.city || inv.jointHolder?.address?.city || '',
                      state: prev.jointHolder?.address?.state || inv.jointHolder?.address?.state || '',
                      zip: prev.jointHolder?.address?.zip || inv.jointHolder?.address?.zip || '',
                      country: prev.jointHolder?.address?.country || inv.jointHolder?.address?.country || 'United States'
                    }
                  }
                }))
              }
            } catch (e) {
              logger.warn('Failed to load joint investment detail', e)
            }
          }
        } catch (e) {
          logger.warn('Failed to load investments for joint prefill', e)
          // Still mark as loaded even if error, to avoid keeping fields disabled forever
          setInvestmentsLoading(false)
        }
      }
      } catch (e) {
        logger.error('Failed to load user data', e)
      }
  }

  // Load trusted contact via dedicated endpoint when opening the tab
  useEffect(() => {
    if (activeTab !== 'trusted-contact') return
    let isCancelled = false
    const loadTrustedContact = async () => {
      try {
        const resp = await apiClient.getTrustedContact()
        const trusted = resp?.trustedContact ?? null
        if (isCancelled) return
        // Update userData with the trusted contact
        setUserData(prev => ({ ...(prev || {}), trustedContact: trusted }))
        // Update form data if it's available
        setFormData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            trustedContact: {
              firstName: trusted?.firstName || '',
              lastName: trusted?.lastName || '',
              email: trusted?.email || '',
              phone: formatPhone(trusted?.phone || ''),
              relationship: trusted?.relationshipType || trusted?.relationship || ''
            }
          }
        })
      } catch (e) {
        // Silent fail; keep existing state
      }
    }
    loadTrustedContact()
    return () => { isCancelled = true }
  }, [activeTab])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    replaceProfileUrl({ tab })
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'firstName' || name === 'lastName') {
      formattedValue = formatName(value)
    }
    if (name === 'phoneNumber') {
      formattedValue = formatPhone(value)
    }
    setFormData(prev => ({ ...prev, [name]: formattedValue }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    setSaveSuccess(false)
  }


  const handleEntityChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'name') {
      formattedValue = formatEntityName(value)
    }
    setFormData(prev => ({ ...prev, entity: { ...prev.entity, [name]: formattedValue } }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    setSaveSuccess(false)
  }

  const handleJointHolderChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'firstName' || name === 'lastName') {
      formattedValue = formatName(value)
    }
    if (name === 'phone') {
      formattedValue = formatPhone(value)
    }
    setFormData(prev => ({ ...prev, jointHolder: { ...prev.jointHolder, [name]: formattedValue } }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    setSaveSuccess(false)
  }

  const handleJointAddressChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'city') {
      formattedValue = formatCity(value)
    } else if (name === 'street1' || name === 'street2') {
      formattedValue = formatStreet(value)
    }
    setFormData(prev => ({ ...prev, jointHolder: { ...prev.jointHolder, address: { ...prev.jointHolder.address, [name]: formattedValue } } }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    setSaveSuccess(false)
  }

  const handleEntityAddressChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'city') {
      formattedValue = formatCity(value)
    } else if (name === 'street1' || name === 'street2') {
      formattedValue = formatStreet(value)
    }
    setFormData(prev => ({ ...prev, entity: { ...prev.entity, address: { ...prev.entity.address, [name]: formattedValue } } }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    setSaveSuccess(false)
  }

  const handlePasswordChange = (e) => {
    const { name, value } = e.target
    setPasswordForm(prev => ({ ...prev, [name]: value }))
    setPasswordChangeSuccess(false)
  }

  const validatePasswordForm = () => {
    const pwdErrors = {}
    if (!passwordForm.currentPassword.trim()) pwdErrors.currentPassword = 'Required'
    if (!passwordForm.newPassword.trim()) pwdErrors.newPassword = 'Required'
    if (!passwordForm.confirmPassword.trim()) pwdErrors.confirmPassword = 'Required'
    if (passwordForm.newPassword && passwordForm.newPassword.length < 8) pwdErrors.newPassword = 'Min length 8'
    if (passwordForm.newPassword && !/[A-Z]/.test(passwordForm.newPassword)) pwdErrors.newPassword = 'Include an uppercase letter'
    if (passwordForm.newPassword && !/[a-z]/.test(passwordForm.newPassword)) pwdErrors.newPassword = 'Include a lowercase letter'
    if (passwordForm.newPassword && !/[0-9]/.test(passwordForm.newPassword)) pwdErrors.newPassword = 'Include a number'
    if (passwordForm.newPassword && !/[!@#$%^&*(),.?":{}|<>\-_=+\[\];']/.test(passwordForm.newPassword)) pwdErrors.newPassword = 'Include a special character'
    if (passwordForm.newPassword && passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword) pwdErrors.confirmPassword = 'Passwords do not match'
    setErrors(prev => ({ ...prev, ...pwdErrors }))
    return Object.keys(pwdErrors).length === 0
  }

  const handleChangePassword = async () => {
    if (!validatePasswordForm()) return
    setIsChangingPassword(true)
    setPasswordChangeSuccess(false)
    try {
      if (typeof window === 'undefined') return
      
      const data = await apiClient.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
      
      if (!data.success) {
        // Handle 422 Validation Error format
        if (data.detail && Array.isArray(data.detail)) {
          const validationErrors = {}
          data.detail.forEach(err => {
            // Map backend field names to frontend form fields
            // e.g., "new_password" -> "newPassword"
            const field = err.loc && err.loc[1]
            if (field === 'current_password') validationErrors.currentPassword = err.msg
            else if (field === 'new_password') validationErrors.newPassword = err.msg
            else validationErrors.currentPassword = err.msg // Fallback
          })
          setErrors(prev => ({ ...prev, ...validationErrors }))
        } else {
          alert(data.error || 'Failed to change password')
        }
        return
      }
      
      setPasswordChangeSuccess(true)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e) {
      logger.error('Failed to change password', e)
      // Handle API client errors that might contain responseData
      const errorData = e.responseData
      if (errorData && errorData.detail && Array.isArray(errorData.detail)) {
        const validationErrors = {}
        errorData.detail.forEach(err => {
          const field = err.loc && err.loc[1]
          if (field === 'current_password') validationErrors.currentPassword = err.msg
          else if (field === 'new_password') validationErrors.newPassword = err.msg
          else validationErrors.currentPassword = err.msg
        })
        setErrors(prev => ({ ...prev, ...validationErrors }))
      } else {
        alert(e.message || 'An error occurred. Please try again.')
      }
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleTrustedContactChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'firstName' || name === 'lastName') {
      formattedValue = formatName(value)
    }
    if (name === 'phone') {
      formattedValue = formatPhone(value)
    }
    setFormData(prev => ({ ...prev, trustedContact: { ...prev.trustedContact, [name]: formattedValue } }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    setSaveSuccess(false)
  }

  const validate = () => {
    const newErrors = {}
    // Primary Holder validations (only on Primary tab)
    if (activeTab === 'primary-holder') {
      if (!formData.firstName.trim()) newErrors.firstName = 'Required'
      if (!formData.lastName.trim()) newErrors.lastName = 'Required'
      if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email'
      if (!formData.phoneNumber.trim()) newErrors.phoneNumber = 'Required'
      else if (!isValidUSPhoneDigits(formData.phoneNumber)) newErrors.phoneNumber = 'Enter a valid US phone (10 digits; area code 2-9)'
      if (formData.dob && !isAdultDob(formData.dob)) newErrors.dob = `Enter a valid date (YYYY-MM-DD). Min ${MIN_DOB}. Must be 18+.`
      // Address required when saving on Primary tab
      if (!addressForm.street1.trim()) newErrors.addressStreet1 = 'Required'
      if (!addressForm.city.trim()) newErrors.addressCity = 'Required'
      if (!addressForm.state.trim()) newErrors.addressState = 'Required'
      if (!addressForm.zip.trim()) newErrors.addressZip = 'Required'
    }

    const hasPendingOrActiveEntity = Array.isArray(userData?.investments) && 
      userData.investments.some(inv => inv.accountType === 'entity' && (inv.status === 'pending' || inv.status === 'active'))
    // Entity validation only when user has entity investments and on the entity tab
    if (activeTab === 'entity-info') {
      if (hasPendingOrActiveEntity && formData.entity) {
        if (!formData.entity.name.trim()) newErrors.entityName = 'Required'
        if (!formData.entity.registrationDate) newErrors.entityRegistrationDate = 'Required'
        if (!formData.entity.taxId.trim()) newErrors.entityTaxId = 'Required'
        if (formData.entity.address) {
          if (!formData.entity.address.street1.trim()) newErrors.entityStreet1 = 'Required'
          if (!formData.entity.address.city.trim()) newErrors.entityCity = 'Required'
          else if (/[0-9]/.test(formData.entity.address.city)) newErrors.entityCity = 'No numbers allowed'
          if (!formData.entity.address.state) newErrors.entityState = 'Required'
          if (!formData.entity.address.zip.trim()) newErrors.entityZip = 'Required'
        }
      }
    }

    const hasPendingOrActiveJoint = Array.isArray(userData?.investments) && 
      userData.investments.some(inv => inv.accountType === 'joint' && (inv.status === 'pending' || inv.status === 'active'))
    const showJoint = userData?.accountType === 'joint' || hasPendingOrActiveJoint
    if (activeTab === 'joint-holder') {
      if (showJoint && formData.jointHolder) {
        if (!formData.jointHoldingType?.trim()) newErrors.jointHoldingType = 'Required'
        if (!formData.jointHolder.firstName.trim()) newErrors.jointFirstName = 'Required'
        if (!formData.jointHolder.lastName.trim()) newErrors.jointLastName = 'Required'
        if (!formData.jointHolder.email.trim() || !/\S+@\S+\.\S+/.test(formData.jointHolder.email)) newErrors.jointEmail = 'Valid email required'
        if (!formData.jointHolder.phone.trim()) newErrors.jointPhone = 'Required'
        else if (!isValidUSPhoneDigits(formData.jointHolder.phone)) newErrors.jointPhone = 'Enter a valid US phone (10 digits; area code 2-9)'
        if (!formData.jointHolder.dob || !isAdultDob(formData.jointHolder.dob)) newErrors.jointDob = `Enter a valid date (YYYY-MM-DD). Min ${MIN_DOB}. Must be 18+.`
        if (!formData.jointHolder.ssn.trim()) newErrors.jointSsn = 'Required'
        if (formData.jointHolder.address) {
          if (!formData.jointHolder.address.street1.trim()) newErrors.jointStreet1 = 'Required'
          if (!formData.jointHolder.address.city.trim()) newErrors.jointCity = 'Required'
          else if (/[0-9]/.test(formData.jointHolder.address.city)) newErrors.jointCity = 'No numbers allowed'
          if (!formData.jointHolder.address.state) newErrors.jointState = 'Required'
          if (!formData.jointHolder.address.zip.trim()) newErrors.jointZip = 'Required'
        }
      }
    }

    // Validate trusted contact (optional but if filled, validate format)
    if (activeTab === 'trusted-contact' && formData.trustedContact) {
      if (formData.trustedContact.email && !/\S+@\S+\.\S+/.test(formData.trustedContact.email)) {
        newErrors.trustedEmail = 'Invalid email format'
      }
      if (formData.trustedContact.phone) {
        if (!isValidUSPhoneDigits(formData.trustedContact.phone)) {
          newErrors.trustedPhone = 'Enter a valid US phone (10 digits; area code 2-9)'
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      if (typeof window === 'undefined') return
      
      const userId = localStorage.getItem('currentUserId')
      // Build payload based on active tab
      let payload = {}
      if (activeTab === 'primary-holder') {
        payload = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneNumber: normalizePhoneForDB(formData.phoneNumber),
          dob: formData.dob,
          ssn: formData.ssn,
          address: {
            street1: addressForm.street1 || '',
            street2: addressForm.street2 || '',
            city: addressForm.city || '',
            state: addressForm.state || '',
            zip: addressForm.zip || ''
          }
        }
      } else if (activeTab === 'joint-holder') {
        payload = {
          jointHoldingType: formData.jointHoldingType,
          jointHolder: {
            firstName: formData.jointHolder?.firstName || '',
            lastName: formData.jointHolder?.lastName || '',
            email: formData.jointHolder?.email || '',
            phone: normalizePhoneForDB(formData.jointHolder?.phone || ''),
            dob: formData.jointHolder?.dob || '',
            ssn: formData.jointHolder?.ssn || '',
            address: {
              street1: formData.jointHolder?.address?.street1 || '',
              street2: formData.jointHolder?.address?.street2 || '',
              city: formData.jointHolder?.address?.city || '',
              state: formData.jointHolder?.address?.state || '',
              zip: formData.jointHolder?.address?.zip || ''
            }
          }
        }
      } else if (activeTab === 'entity-info') {
        // Save authorized representative and entity information
        // For entity accounts, the user's dob/ssn represent the authorized rep
        payload = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneNumber: normalizePhoneForDB(formData.phoneNumber),
          dob: formData.dob,
          ssn: formData.ssn,
          entity: {
            name: formData.entity?.name || '',
            title: formData.entity?.title?.trim() || '',
            formationDate: formData.entity?.registrationDate || '',
            registrationDate: formData.entity?.registrationDate || '',
            taxId: formData.entity?.taxId || '',
            address: {
              street1: formData.entity?.address?.street1 || '',
              street2: formData.entity?.address?.street2 || '',
              city: formData.entity?.address?.city || '',
              state: formData.entity?.address?.state || '',
              zip: formData.entity?.address?.zip || ''
            }
          }
        }
      } else if (activeTab === 'trusted-contact') {
        // Use specific trusted contact endpoint to bypass profile lock
        const trustedContactData = {
          firstName: formData.trustedContact?.firstName || '',
          lastName: formData.trustedContact?.lastName || '',
          email: formData.trustedContact?.email || '',
          phone: normalizePhoneForDB(formData.trustedContact?.phone || ''),
          relationship: formData.trustedContact?.relationship || ''
        }
        
        try {
          // Check if trusted contact already exists (use saved userData, not form data)
          const contactExists = userData?.trustedContact && 
            (userData.trustedContact.firstName || userData.trustedContact.lastName || 
             userData.trustedContact.email || userData.trustedContact.phone)
          
          // Use POST to create or PUT to update
          const data = contactExists 
            ? await apiClient.updateTrustedContact(trustedContactData)
            : await apiClient.createTrustedContact(trustedContactData)
          
          if (data.success && data.trustedContact) {
            // Update local state with new trusted contact
            const updatedContact = data.trustedContact
            setUserData(prev => ({ ...prev, trustedContact: updatedContact }))
            
            // Update form data with formatted values
            setFormData(prev => ({
              ...prev,
              trustedContact: {
                firstName: updatedContact.firstName || '',
                lastName: updatedContact.lastName || '',
                email: updatedContact.email || '',
                phone: formatPhone(updatedContact.phone || ''),
                relationship: updatedContact.relationshipType || updatedContact.relationship || ''
              }
            }))
            
            setSaveSuccess(true)
            // Do not reload full user profile; keep local state authoritative
            setIsSaving(false)
            return true // Return success
          } else {
            // Handle unsuccessful save
            const errorMsg = data?.error || 'Failed to save trusted contact'
            alert(`Error: ${errorMsg}. The backend endpoint may not be implemented yet.`)
            setIsSaving(false)
            return false // Return failure
          }
        } catch (e) {
          logger.error('Failed to save trusted contact', e)
          const errorMsg = e?.responseData?.error || e?.message || 'Unknown error'
          alert(`Failed to save trusted contact: ${errorMsg}`)
          setIsSaving(false)
          return false // Return failure
        }
      } else {
        // Fallback - keep previous behavior
        payload = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneNumber: normalizePhoneForDB(formData.phoneNumber),
          dob: formData.dob,
          ssn: formData.ssn
        }
      }

      // Only send fields supported by the backend ProfileUpdateRequest
      const data = await apiClient.updateUser(userId, payload)
      if (data.success && data.user) {
        setUserData(data.user)
        setSaveSuccess(true)
      }
    } catch (e) {
      logger.error('Failed to save profile', e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleBankAccountAdded = async (bankAccount) => {
    try {
      if (typeof window === 'undefined') return
      
      const userId = localStorage.getItem('currentUserId')
      const data = await apiClient.updateUser(userId, {
        _action: 'addBankAccount',
        bankAccount
      })
      if (data.success) {
        await loadUser()
      } else {
        alert(data.error || 'Failed to add bank account')
      }
    } catch (e) {
      logger.error('Failed to add bank account', e)
      alert('An error occurred. Please try again.')
    }
  }

  const handleSetDefaultBank = async (bankId) => {
    try {
      if (typeof window === 'undefined') return
      
      const userId = localStorage.getItem('currentUserId')
      const data = await apiClient.updateUser(userId, {
        _action: 'setDefaultBank',
        bankAccountId: bankId
      })
      if (data.success) {
        await loadUser()
      } else {
        alert(data.error || 'Failed to set default bank')
      }
    } catch (e) {
      logger.error('Failed to set default bank', e)
      alert('An error occurred. Please try again.')
    }
  }

  const handleRemoveBank = async (bankId, bankName) => {
    if (!confirm(`Are you sure you want to remove ${bankName}?`)) return
    
    setIsRemovingBank(bankId)
    try {
      if (typeof window === 'undefined') return
      
      const userId = localStorage.getItem('currentUserId')
      const data = await apiClient.updateUser(userId, {
        _action: 'removeBankAccount',
        bankAccountId: bankId
      })
      if (data.success) {
        await loadUser()
      } else {
        alert(data.error || 'Failed to remove bank account')
      }
    } catch (e) {
      logger.error('Failed to remove bank account', e)
      alert('An error occurred. Please try again.')
    } finally {
      setIsRemovingBank(null)
    }
  }

  // Primary address change handler (moved from Address tab)
  const handleAddressFormChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'city') {
      formattedValue = formatCity(value)
    } else if (name === 'street1' || name === 'street2') {
      formattedValue = formatStreet(value)
    }
    setAddressForm(prev => ({ ...prev, [name]: formattedValue }))
  }

  if (!userData || !formData || !mounted) {
    return <div className={styles.loading}>Loading profile...</div>
  }

  // Only show account type sections if the account is locked to that type
  const hasPendingOrActiveJoint = Array.isArray(userData?.investments) && 
    userData.investments.some(inv => inv.accountType === 'joint' && (inv.status === 'pending' || inv.status === 'active'))
  const showJointSection = userData?.accountType === 'joint' || hasPendingOrActiveJoint || hasJointInvestments
  
  // Entity information should ONLY display when user has entity investments (not just accountType === 'entity')
  const hasEntityInvestments = Array.isArray(userData?.investments) && 
    userData.investments.some(inv => inv.accountType === 'entity' && (inv.status === 'pending' || inv.status === 'active'))

  // Check if user has any investment (pending or active) - if so, lock personal info
  const hasInvestments = Array.isArray(userData?.investments) && 
    userData.investments.some(inv => ['pending', 'active'].includes(inv.status))

  // Disable fields while loading investments OR if user has pending/active investments
  const shouldDisableFields = investmentsLoading || hasInvestments

  const isEntityView = (userData?.accountType === 'entity') || hasEntityInvestments
  const tabs = [
    { id: 'primary-holder', label: isEntityView ? 'Authorized Representative' : 'Primary Holder' },
    ...(showJointSection ? [{ id: 'joint-holder', label: 'Joint Holder' }] : []),
    ...(isEntityView ? [{ id: 'entity-info', label: 'Entity Information' }] : []),
    { id: 'trusted-contact', label: 'Trusted Contact' },
    { id: 'banking', label: 'Banking Information' },
    { id: 'security', label: 'Security' }
  ]

  return (
    <div className={styles.profileContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Profile Information</h1>
        <p className={styles.subtitle}>Manage your account details and preferences</p>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabNavigation}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {activeTab === 'primary-holder' && (
          <PrimaryHolderTab
            formData={formData}
            userData={userData}
            errors={errors}
            showSSN={showSSN}
            setShowSSN={setShowSSN}
            maskSSN={maskSSN}
            handleChange={handleChange}
            handleEntityChange={handleEntityChange}
            addressForm={addressForm}
            handleAddressFormChange={handleAddressFormChange}
            handleSave={handleSave}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
            MIN_DOB={MIN_DOB}
            maxDob={maxDob}
            maxToday={maxToday}
            hasInvestments={hasInvestments}
            shouldDisableFields={shouldDisableFields}
            isEntityView={isEntityView}
          />
        )}

        {activeTab === 'joint-holder' && showJointSection && (
          <JointHolderTab
            formData={formData}
            errors={errors}
            showJointSSN={showJointSSN}
            setShowJointSSN={setShowJointSSN}
            maskSSN={maskSSN}
            handleJointHolderChange={handleJointHolderChange}
            handleJointAddressChange={handleJointAddressChange}
            handleSave={handleSave}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
            MIN_DOB={MIN_DOB}
            maxDob={maxDob}
            hasInvestments={hasInvestments}
            shouldDisableFields={shouldDisableFields}
          />
        )}

        {activeTab === 'entity-info' && (userData?.accountType === 'entity' || hasEntityInvestments) && (
          <EntityInfoTab
            formData={formData}
            userData={userData}
            errors={errors}
            showRepSSN={showRepSSN}
            setShowRepSSN={setShowRepSSN}
            maskSSN={maskSSN}
            handleEntityChange={handleEntityChange}
            handleEntityAddressChange={handleEntityAddressChange}
            handleSave={handleSave}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
            MIN_DOB={MIN_DOB}
            maxDob={maxDob}
            maxToday={maxToday}
            entityLocked={shouldDisableFields}
            hasInvestments={hasInvestments}
          />
        )}

        {activeTab === 'trusted-contact' && (
          <TrustedContactTab
            formData={formData}
            errors={errors}
            handleTrustedContactChange={handleTrustedContactChange}
            handleSave={handleSave}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
            setFormData={setFormData}
            userData={userData}
            formatPhone={formatPhone}
          />
        )}

        {activeTab === 'banking' && (
          <BankingTab
            userData={userData}
            showBankModal={showBankModal}
            setShowBankModal={setShowBankModal}
            handleBankAccountAdded={handleBankAccountAdded}
            handleSetDefaultBank={handleSetDefaultBank}
            handleRemoveBank={handleRemoveBank}
            isRemovingBank={isRemovingBank}
          />
        )}

        {activeTab === 'security' && (
          <SecurityTab
            userData={userData}
            passwordForm={passwordForm}
            errors={errors}
            handlePasswordChange={handlePasswordChange}
            handleChangePassword={handleChangePassword}
            isChangingPassword={isChangingPassword}
            passwordChangeSuccess={passwordChangeSuccess}
          />
        )}
      </div>

      <BankConnectionModal
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        onAccountSelected={handleBankAccountAdded}
      />
    </div>
  )
}

// Individual Tab Components
function PrimaryHolderTab({ formData, userData, errors, showSSN, setShowSSN, maskSSN, handleChange, handleEntityChange, addressForm, handleAddressFormChange, handleSave, isSaving, saveSuccess, MIN_DOB, maxDob, maxToday, hasInvestments, shouldDisableFields, isEntityView }) {
  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{isEntityView ? 'Authorized Representative' : 'Primary Holder'}</h2>
        {hasInvestments && (
          <p style={{ fontSize: '14px', color: '#d97706', marginBottom: '16px', fontWeight: '500' }}>
            ⚠️ Your profile information is locked because you have pending or active investments.
          </p>
        )}

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Personal Information</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>First Name</label>
              <input className={`${styles.input} ${errors.firstName ? styles.inputError : ''}`} name="firstName" value={formData.firstName} onChange={handleChange} disabled={shouldDisableFields} maxLength={100} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last Name</label>
              <input className={`${styles.input} ${errors.lastName ? styles.inputError : ''}`} name="lastName" value={formData.lastName} onChange={handleChange} disabled={shouldDisableFields} maxLength={100} />
            </div>
            {isEntityView && (
              <div className={styles.field}>
                <label className={styles.label}>Title</label>
                <input
                  className={styles.input}
                  name="title"
                  value={formData.entity?.title || ''}
                  onChange={handleEntityChange}
                  placeholder="e.g., Manager, CEO"
                  disabled={shouldDisableFields}
                  maxLength={100}
                />
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label}>Date of Birth</label>
              <input
                className={`${styles.input} ${errors.dob ? styles.inputError : ''}`}
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleChange}
                min={MIN_DOB}
                max={maxDob}
                disabled={shouldDisableFields}
              />
              {errors.dob && <span className={styles.errorText}>{errors.dob}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Social Security Number</label>
              <div className={styles.inputWrapper}>
                <input 
                  className={`${styles.input} ${styles.inputWithToggle}`}
                  type="text"
                  name="ssn" 
                  value={showSSN ? formData.ssn : maskSSN(formData.ssn)} 
                  onChange={handleChange} 
                  placeholder="123-45-6789"
                  readOnly={!showSSN || hasInvestments}
                  disabled={shouldDisableFields}
                  maxLength={30}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={() => setShowSSN(!showSSN)}
                  aria-label={showSSN ? 'Hide SSN' : 'Show SSN'}
                  disabled={shouldDisableFields}
                >
                  {showSSN ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Contact Information</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input className={`${styles.input} ${errors.email ? styles.inputError : ''}`} name="email" value={formData.email} disabled />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Phone</label>
              <input className={`${styles.input} ${errors.phoneNumber ? styles.inputError : ''}`} type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} placeholder="(555) 555-5555" disabled={shouldDisableFields} maxLength={30} />
            </div>
          </div>
        </div>
      </section>

      {/* Primary Address */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Address</h2>
        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Primary Address</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 1</label>
              <input
                className={`${styles.input} ${errors.addressStreet1 ? styles.inputError : ''}`}
                name="street1"
                value={addressForm.street1}
                onChange={handleAddressFormChange}
                placeholder="123 Main St"
                disabled={shouldDisableFields}
                maxLength={200}
              />
              {errors.addressStreet1 && <span className={styles.errorText}>{errors.addressStreet1}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 2</label>
              <input
                className={styles.input}
                name="street2"
                value={addressForm.street2}
                onChange={handleAddressFormChange}
                placeholder="Apt, Suite, etc. (Optional)"
                disabled={shouldDisableFields}
                maxLength={200}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>City</label>
              <input
                className={`${styles.input} ${errors.addressCity ? styles.inputError : ''}`}
                name="city"
                value={addressForm.city}
                onChange={handleAddressFormChange}
                placeholder="New York"
                disabled={shouldDisableFields}
                maxLength={100}
              />
              {errors.addressCity && <span className={styles.errorText}>{errors.addressCity}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>State</label>
              <input
                className={`${styles.input} ${errors.addressState ? styles.inputError : ''}`}
                name="state"
                value={addressForm.state}
                onChange={handleAddressFormChange}
                placeholder="NY"
                disabled={shouldDisableFields}
                maxLength={100}
              />
              {errors.addressState && <span className={styles.errorText}>{errors.addressState}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>ZIP Code</label>
              <input
                className={`${styles.input} ${errors.addressZip ? styles.inputError : ''}`}
                name="zip"
                value={addressForm.zip}
                onChange={handleAddressFormChange}
                placeholder="10001"
                disabled={shouldDisableFields}
                maxLength={20}
              />
              {errors.addressZip && <span className={styles.errorText}>{errors.addressZip}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Country</label>
              <input
                className={styles.input}
                name="country"
                value={addressForm.country}
                disabled
              />
            </div>
          </div>
        </div>
      </section>


      <div className={styles.actions}>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        {saveSuccess && <span className={styles.success}>Saved!</span>}
      </div>
    </div>
  )
}

function JointHolderTab({ formData, errors, showJointSSN, setShowJointSSN, maskSSN, handleJointHolderChange, handleJointAddressChange, handleSave, isSaving, saveSuccess, MIN_DOB, maxDob, hasInvestments, shouldDisableFields }) {
  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Joint Holder</h2>
        {hasInvestments && (
          <p style={{ fontSize: '14px', color: '#d97706', marginBottom: '16px', fontWeight: '500' }}>
            ⚠️ Joint holder information is locked because you have pending or active investments.
          </p>
        )}

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Joint Details</h3>
          <div className={styles.compactGrid}>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label className={styles.label}>Joint Holder Relationship</label>
              <select
                className={`${styles.input} ${errors.jointHoldingType ? styles.inputError : ''}`}
                name="jointHoldingType"
                value={formData.jointHoldingType || ''}
                onChange={handleJointHolderChange}
                disabled={shouldDisableFields}
              >
                <option value="">Select relationship to primary holder</option>
                <option value="spouse">Spouse</option>
                <option value="sibling">Sibling</option>
                <option value="domestic_partner">Domestic Partner</option>
                <option value="business_partner">Business Partner</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Personal Information</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>First Name</label>
              <input className={`${styles.input} ${errors.jointFirstName ? styles.inputError : ''}`} name="firstName" value={formData.jointHolder?.firstName || ''} onChange={handleJointHolderChange} disabled={shouldDisableFields} maxLength={100} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last Name</label>
              <input className={`${styles.input} ${errors.jointLastName ? styles.inputError : ''}`} name="lastName" value={formData.jointHolder?.lastName || ''} onChange={handleJointHolderChange} disabled={shouldDisableFields} maxLength={100} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Date of Birth</label>
              <input className={`${styles.input} ${errors.jointDob ? styles.inputError : ''}`} type="date" name="dob" value={formData.jointHolder?.dob || ''} onChange={handleJointHolderChange} min={MIN_DOB} max={maxDob} disabled={shouldDisableFields} />
              {errors.jointDob && <span className={styles.errorText}>{errors.jointDob}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Social Security Number</label>
              <div className={styles.inputWrapper}>
                <input 
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.jointSsn ? styles.inputError : ''}`}
                  type="text"
                  name="ssn" 
                  value={showJointSSN ? (formData.jointHolder?.ssn || '') : maskSSN(formData.jointHolder?.ssn || '')} 
                  onChange={handleJointHolderChange}
                  readOnly={!showJointSSN || hasInvestments}
                  disabled={shouldDisableFields}
                  placeholder="123-45-6789"
                  maxLength={30}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={() => setShowJointSSN(!showJointSSN)}
                  aria-label={showJointSSN ? 'Hide SSN' : 'Show SSN'}
                  disabled={shouldDisableFields}
                >
                  {showJointSSN ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Contact Information</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input className={`${styles.input} ${errors.jointEmail ? styles.inputError : ''}`} name="email" value={formData.jointHolder?.email || ''} onChange={handleJointHolderChange} disabled={shouldDisableFields} maxLength={255} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Phone</label>
              <input className={`${styles.input} ${errors.jointPhone ? styles.inputError : ''}`} type="tel" name="phone" value={formData.jointHolder?.phone || ''} onChange={handleJointHolderChange} placeholder="(555) 555-5555" disabled={shouldDisableFields} maxLength={30} />
            </div>
          </div>
        </div>
      </section>

      {/* Joint Holder Address */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Address</h2>
        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Legal Address</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 1</label>
              <input className={`${styles.input} ${errors.jointStreet1 ? styles.inputError : ''}`} name="street1" value={formData.jointHolder?.address?.street1 || ''} onChange={handleJointAddressChange} placeholder="123 Main St" disabled={shouldDisableFields} maxLength={200} />
              {errors.jointStreet1 && <span className={styles.errorText}>{errors.jointStreet1}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 2</label>
              <input className={styles.input} name="street2" value={formData.jointHolder?.address?.street2 || ''} onChange={handleJointAddressChange} placeholder="Apt, Suite, etc. (Optional)" disabled={shouldDisableFields} maxLength={200} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>City</label>
              <input className={`${styles.input} ${errors.jointCity ? styles.inputError : ''}`} name="city" value={formData.jointHolder?.address?.city || ''} onChange={handleJointAddressChange} placeholder="New York" disabled={shouldDisableFields} maxLength={100} />
              {errors.jointCity && <span className={styles.errorText}>{errors.jointCity}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>State</label>
              <input className={`${styles.input} ${errors.jointState ? styles.inputError : ''}`} name="state" value={formData.jointHolder?.address?.state || ''} onChange={handleJointAddressChange} placeholder="NY" disabled={shouldDisableFields} maxLength={100} />
              {errors.jointState && <span className={styles.errorText}>{errors.jointState}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>ZIP Code</label>
              <input className={`${styles.input} ${errors.jointZip ? styles.inputError : ''}`} name="zip" value={formData.jointHolder?.address?.zip || ''} onChange={handleJointAddressChange} placeholder="10001" disabled={shouldDisableFields} maxLength={20} />
              {errors.jointZip && <span className={styles.errorText}>{errors.jointZip}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Country</label>
              <input className={styles.input} name="country" value={formData.jointHolder?.address?.country || 'United States'} disabled />
            </div>
          </div>
        </div>
      </section>

      <div className={styles.actions}>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        {saveSuccess && <span className={styles.success}>Saved!</span>}
      </div>
    </div>
  )
}

function EntityInfoTab({ formData, userData, errors, showRepSSN, setShowRepSSN, maskSSN, handleEntityChange, handleEntityAddressChange, handleSave, isSaving, saveSuccess, MIN_DOB, maxDob, maxToday, entityLocked, hasInvestments }) {
  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Entity Information</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
          Information about the entity associated with your investments. Note: Different LLCs require separate accounts with different email addresses.
        </p>
        {hasInvestments && (
          <p style={{ fontSize: '14px', color: '#d97706', marginBottom: '16px', fontWeight: '500' }}>
            ⚠️ Entity information is locked because you have pending or active investments.
          </p>
        )}
        <div className={styles.compactGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Entity Name</label>
            <input
              className={`${styles.input} ${errors.entityName ? styles.inputError : ''}`}
              type="text"
              name="name"
              value={formData.entity?.name || ''}
              onChange={handleEntityChange}
              disabled={entityLocked}
              maxLength={150}
            />
            {errors.entityName && <span className={styles.errorText}>{errors.entityName}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Formation Date</label>
            <input
              className={`${styles.input} ${errors.entityRegistrationDate ? styles.inputError : ''}`}
              type="date"
              name="registrationDate"
              value={formData.entity?.registrationDate || ''}
              onChange={handleEntityChange}
              min={MIN_DOB}
              max={maxToday}
              disabled={entityLocked}
            />
            {errors.entityRegistrationDate && <span className={styles.errorText}>{errors.entityRegistrationDate}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>EIN / Tax ID</label>
            <input
              className={`${styles.input} ${errors.entityTaxId ? styles.inputError : ''}`}
              type="text"
              name="taxId"
              value={formData.entity?.taxId || ''}
              onChange={handleEntityChange}
              disabled={entityLocked}
              maxLength={30}
            />
            {errors.entityTaxId && <span className={styles.errorText}>{errors.entityTaxId}</span>}
          </div>
        </div>
        <div className={styles.compactGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Street Address 1</label>
            <input
              className={`${styles.input} ${errors.entityStreet1 ? styles.inputError : ''}`}
              type="text"
              name="street1"
              value={formData.entity?.address?.street1 || ''}
              onChange={handleEntityAddressChange}
              disabled={entityLocked}
              maxLength={200}
            />
            {errors.entityStreet1 && <span className={styles.errorText}>{errors.entityStreet1}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Street Address 2</label>
            <input
              className={styles.input}
              type="text"
              name="street2"
              value={formData.entity?.address?.street2 || ''}
              onChange={handleEntityAddressChange}
              disabled={entityLocked}
              maxLength={200}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>City</label>
            <input
              className={`${styles.input} ${errors.entityCity ? styles.inputError : ''}`}
              type="text"
              name="city"
              value={formData.entity?.address?.city || ''}
              onChange={handleEntityAddressChange}
              disabled={entityLocked}
              maxLength={100}
            />
            {errors.entityCity && <span className={styles.errorText}>{errors.entityCity}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>State</label>
            <input
              className={`${styles.input} ${errors.entityState ? styles.inputError : ''}`}
              type="text"
              name="state"
              value={formData.entity?.address?.state || ''}
              onChange={handleEntityAddressChange}
              disabled={entityLocked}
              maxLength={100}
            />
            {errors.entityState && <span className={styles.errorText}>{errors.entityState}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>ZIP Code</label>
            <input
              className={`${styles.input} ${errors.entityZip ? styles.inputError : ''}`}
              type="text"
              name="zip"
              value={formData.entity?.address?.zip || ''}
              onChange={handleEntityAddressChange}
              disabled={entityLocked}
              maxLength={20}
            />
            {errors.entityZip && <span className={styles.errorText}>{errors.entityZip}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Country</label>
            <input
              className={styles.input}
              type="text"
              name="country"
              value={formData.entity?.address?.country || 'United States'}
              onChange={handleEntityAddressChange}
              disabled
            />
          </div>
        </div>
      </section>

      <div className={styles.actions}>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        {saveSuccess && <span className={styles.success}>Saved!</span>}
      </div>
    </div>
  )
}

function TrustedContactTab({ formData, errors, handleTrustedContactChange, handleSave, isSaving, saveSuccess, setFormData, userData, formatPhone }) {
  const [isEditing, setIsEditing] = useState(false)
  
  // Check if trusted contact exists and has meaningful data FROM SAVED DATA (not form data)
  const hasSavedTrustedContact = userData?.trustedContact && 
    (userData.trustedContact.firstName || userData.trustedContact.lastName || 
     userData.trustedContact.email || userData.trustedContact.phone)

  // Set editing mode based on whether contact exists - ONLY on mount or when userData changes
  // If contact exists: locked (not editing)
  // If no contact: unlocked (editing)
  useEffect(() => {
    if (!hasSavedTrustedContact) {
      setIsEditing(true)
    } else {
      setIsEditing(false)
    }
  }, [userData?.trustedContact])

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    if (!hasSavedTrustedContact) {
      // Cannot cancel if no contact exists
      return
    }
    // Revert form data to the saved userData
    setFormData(prev => ({
      ...prev,
      trustedContact: {
        firstName: userData?.trustedContact?.firstName || '',
        lastName: userData?.trustedContact?.lastName || '',
        email: userData?.trustedContact?.email || '',
        phone: formatPhone(userData?.trustedContact?.phone || ''),
        relationship: userData?.trustedContact?.relationshipType || userData?.trustedContact?.relationship || ''
      }
    }))
    setIsEditing(false)
  }

  const handleSaveWrapper = async () => {
    const success = await handleSave()
    // Only switch to view mode if save was successful
    if (success) {
      setIsEditing(false)
    }
  }

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Trusted Contact</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          You can only have one trusted contact. This person should be someone you trust who can be reached in emergency situations.
        </p>

        <div className={styles.subCard}>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>
                First Name <span className={styles.optional}>(Optional)</span>
              </label>
              <input
                className={`${styles.input} ${errors.trustedFirstName ? styles.inputError : ''}`}
                name="firstName"
                value={formData.trustedContact?.firstName || ''}
                onChange={handleTrustedContactChange}
                placeholder="Enter first name"
                disabled={!isEditing}
                maxLength={100}
              />
              {errors.trustedFirstName && <span className={styles.errorText}>{errors.trustedFirstName}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Last Name <span className={styles.optional}>(Optional)</span>
              </label>
              <input
                className={`${styles.input} ${errors.trustedLastName ? styles.inputError : ''}`}
                name="lastName"
                value={formData.trustedContact?.lastName || ''}
                onChange={handleTrustedContactChange}
                placeholder="Enter last name"
                disabled={!isEditing}
                maxLength={100}
              />
              {errors.trustedLastName && <span className={styles.errorText}>{errors.trustedLastName}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Relationship <span className={styles.optional}>(Optional)</span>
              </label>
              <select
                className={styles.input}
                name="relationship"
                value={formData.trustedContact?.relationship || ''}
                onChange={handleTrustedContactChange}
                disabled={!isEditing}
              >
                <option value="">Select relationship</option>
                <option value="spouse">Spouse</option>
                <option value="parent">Parent</option>
                <option value="sibling">Sibling</option>
                <option value="child">Child</option>
                <option value="friend">Friend</option>
                <option value="attorney">Attorney</option>
                <option value="financial_advisor">Financial Advisor</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Email <span className={styles.optional}>(Optional)</span>
              </label>
              <input
                className={`${styles.input} ${errors.trustedEmail ? styles.inputError : ''}`}
                type="email"
                name="email"
                value={formData.trustedContact?.email || ''}
                onChange={handleTrustedContactChange}
                placeholder="email@example.com"
                disabled={!isEditing}
                maxLength={255}
              />
              {errors.trustedEmail && <span className={styles.errorText}>{errors.trustedEmail}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Phone <span className={styles.optional}>(Optional)</span>
              </label>
              <input
                className={`${styles.input} ${errors.trustedPhone ? styles.inputError : ''}`}
                type="tel"
                name="phone"
                value={formData.trustedContact?.phone || ''}
                onChange={handleTrustedContactChange}
                placeholder="(555) 555-5555"
                disabled={!isEditing}
                maxLength={30}
              />
              {errors.trustedPhone && <span className={styles.errorText}>{errors.trustedPhone}</span>}
            </div>
          </div>
        </div>

        <div className={styles.buttonRow}>
          {isEditing ? (
            <>
              {hasSavedTrustedContact && (
                <button
                  className={styles.secondaryButton}
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              )}
              <button
                className={styles.primaryButton}
                onClick={handleSaveWrapper}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : (hasSavedTrustedContact ? 'Save Changes' : 'Save Trusted Contact')}
              </button>
            </>
          ) : (
            <button
              className={styles.primaryButton}
              onClick={handleEdit}
            >
              Edit
            </button>
          )}
        </div>

        {saveSuccess && (
          <div className={styles.successMessage}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Trusted contact saved successfully!
          </div>
        )}
      </section>
    </div>
  )
}


function BankingTab({ userData, showBankModal, setShowBankModal, handleBankAccountAdded, handleSetDefaultBank, handleRemoveBank, isRemovingBank }) {
  const availableBanks = Array.isArray(userData?.bankAccounts) ? userData.bankAccounts : []
  const defaultBankId = userData?.banking?.defaultBankAccountId || null

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Banking Information</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
          Manage your connected bank accounts. You can add multiple accounts and select which one to use for funding and payouts.
        </p>

        {availableBanks.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No bank accounts connected yet.</p>
            <button
              className={styles.addBankButton}
              onClick={() => setShowBankModal(true)}
            >
              Add Bank Account
            </button>
          </div>
        ) : (
          <>
            <div className={styles.bankCardsGrid}>
              {availableBanks.map(bank => (
                <BankAccountCard
                  key={bank.id}
                  bank={bank}
                  isDefault={bank.id === defaultBankId}
                  onSetDefault={handleSetDefaultBank}
                  onRemove={handleRemoveBank}
                  isRemoving={isRemovingBank === bank.id}
                />
              ))}
            </div>
            <div className={styles.actions}>
              <button
                className={styles.addBankButton}
                onClick={() => setShowBankModal(true)}
              >
                Add Bank Account
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function BankAccountCard({ bank, isDefault, onSetDefault, onRemove, isRemoving }) {
  const bankColor = bank.bank_color || bank.bankColor || '#117ACA'
  const bankLogo = bank.bank_logo || bank.bankLogo || '🏦'
  const bankName = bank.bank_name || bank.bankName || 'Bank'
  const accountType = (bank.account_type || bank.accountType || 'checking').charAt(0).toUpperCase() + (bank.account_type || bank.accountType || 'checking').slice(1)
  const last4 = bank.last4 || '****'
  const nickname = bank.nickname || `${bankName} ${accountType} (...${last4})`
  const lastUsed = bank.last_used_at || bank.lastUsedAt

  return (
    <div className={styles.bankCard} style={{ borderTopColor: bankColor }}>
      {isDefault && (
        <div className={styles.defaultBadge}>Default</div>
      )}
      <div className={styles.bankCardHeader}>
        <div className={styles.bankCardLogo} style={{ backgroundColor: `${bankColor}20` }}>
          {bankLogo}
        </div>
        <div className={styles.bankCardInfo}>
          <div className={styles.bankCardName}>{bankName}</div>
          <div className={styles.bankCardDetails}>{accountType} •••• {last4}</div>
        </div>
      </div>
      {lastUsed && (
        <div className={styles.bankCardMeta}>
          Last used: {new Date(lastUsed).toLocaleDateString()}
        </div>
      )}
      <div className={styles.bankCardActions}>
        {!isDefault && (
          <button
            className={styles.bankCardButton}
            onClick={() => onSetDefault(bank.id)}
          >
            Set as Default
          </button>
        )}
        <button
          className={`${styles.bankCardButton} ${styles.bankCardButtonDanger}`}
          onClick={() => onRemove(bank.id, nickname)}
          disabled={isRemoving || isDefault}
        >
          {isRemoving ? 'Removing...' : 'Remove'}
        </button>
      </div>
    </div>
  )
}

function SecurityTab({ userData, passwordForm, errors, handlePasswordChange, handleChangePassword, isChangingPassword, passwordChangeSuccess }) {
  const [showPasswords, setShowPasswords] = useState(false)

  const togglePasswords = () => setShowPasswords(prev => !prev)

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Security</h2>
        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Change Password</h3>
          
          <div className={styles.passwordFormLayout}>
            <div className={styles.field}>
              <label className={styles.label}>Current Password</label>
              <div className={styles.inputWrapper}>
                <input 
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.currentPassword ? styles.inputError : ''}`} 
                  type={showPasswords ? 'text' : 'password'} 
                  name="currentPassword" 
                  value={passwordForm.currentPassword} 
                  onChange={handlePasswordChange} 
                  maxLength={128}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={togglePasswords}
                  aria-label={showPasswords ? 'Hide password' : 'Show password'}
                >
                  {showPasswords ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <div className={styles.inputWrapper}>
                <input 
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.newPassword ? styles.inputError : ''}`} 
                  type={showPasswords ? 'text' : 'password'} 
                  name="newPassword" 
                  value={passwordForm.newPassword} 
                  onChange={handlePasswordChange} 
                  placeholder="At least 8 chars, mixed case, number, symbol" 
                  maxLength={128}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={togglePasswords}
                  aria-label={showPasswords ? 'Hide password' : 'Show password'}
                >
                  {showPasswords ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirm New Password</label>
              <div className={styles.inputWrapper}>
                <input 
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.confirmPassword ? styles.inputError : ''}`} 
                  type={showPasswords ? 'text' : 'password'} 
                  name="confirmPassword" 
                  value={passwordForm.confirmPassword} 
                  onChange={handlePasswordChange} 
                  maxLength={128}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={togglePasswords}
                  aria-label={showPasswords ? 'Hide password' : 'Show password'}
                >
                  {showPasswords ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className={`${styles.actions} ${styles.actionsInset}`}>
              <button className={styles.saveButton} onClick={handleChangePassword} disabled={isChangingPassword}>
                {isChangingPassword ? 'Updating...' : 'Update Password'}
              </button>
              {passwordChangeSuccess && <span className={styles.success}>Password updated</span>}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Account Information</h2>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Account Type</label>
            <div className={`${styles.value} ${styles.valueDisabled}`}>
              {userData.accountType ? userData.accountType.charAt(0).toUpperCase() + userData.accountType.slice(1) : 'Not set'}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Account Created</label>
            <div className={`${styles.value} ${styles.valueDisabled}`}>
              {userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : 'Not available'}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Total Investments</label>
            <div className={`${styles.value} ${styles.valueDisabled}`}>{userData.investments?.length || 0}</div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Account Status</label>
            <div className={`${styles.value} ${styles.statusActive} ${styles.valueDisabled}`}>Active</div>
          </div>
        </div>
      </section>
    </div>
  )
}

function AddressTab({ addressForm, setAddressForm, formatCity, formatStreet, errors, onSaveAddress, isSaving, saveSuccess }) {
  const handleAddressFormChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'city') {
      formattedValue = formatCity(value)
    } else if (name === 'street1' || name === 'street2') {
      formattedValue = formatStreet(value)
    }
    setAddressForm(prev => ({ ...prev, [name]: formattedValue }))
  }

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Address</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
          Your primary address for all investments. This address will be used to prefill forms when you make new investments.
        </p>

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Primary Address</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 1</label>
              <input
                className={`${styles.input} ${errors.addressStreet1 ? styles.inputError : ''}`}
                name="street1"
                value={addressForm.street1}
                onChange={handleAddressFormChange}
                placeholder="123 Main St"
                maxLength={200}
              />
              {errors.addressStreet1 && <span className={styles.errorText}>{errors.addressStreet1}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 2</label>
              <input
                className={styles.input}
                name="street2"
                value={addressForm.street2}
                onChange={handleAddressFormChange}
                placeholder="Apt, Suite, etc. (Optional)"
                maxLength={200}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>City</label>
              <input
                className={`${styles.input} ${errors.addressCity ? styles.inputError : ''}`}
                name="city"
                value={addressForm.city}
                onChange={handleAddressFormChange}
                placeholder="New York"
                maxLength={100}
              />
              {errors.addressCity && <span className={styles.errorText}>{errors.addressCity}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>State</label>
              <input
                className={`${styles.input} ${errors.addressState ? styles.inputError : ''}`}
                name="state"
                value={addressForm.state}
                onChange={handleAddressFormChange}
                placeholder="NY"
                maxLength={100}
              />
              {errors.addressState && <span className={styles.errorText}>{errors.addressState}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>ZIP Code</label>
              <input
                className={`${styles.input} ${errors.addressZip ? styles.inputError : ''}`}
                name="zip"
                value={addressForm.zip}
                onChange={handleAddressFormChange}
                placeholder="10001"
                maxLength={20}
              />
              {errors.addressZip && <span className={styles.errorText}>{errors.addressZip}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Country</label>
              <input
                className={styles.input}
                name="country"
                value={addressForm.country}
                disabled
              />
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.saveButton}
            onClick={onSaveAddress}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Address'}
          </button>
          {saveSuccess && <span className={styles.success}>Saved!</span>}
        </div>
      </section>
    </div>
  )
}
