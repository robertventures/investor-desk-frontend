'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import { MANUAL_BANK_ENTRY_ENABLED } from '../../../../lib/featureFlags'
import logger from '@/lib/logger'
import { 
  formatName, 
  formatEntityName, 
  formatCity, 
  formatStreet, 
  formatPhone, 
  maskSSN 
} from '@/lib/formatters'

// Format ZIP code: only numbers, max 5 digits
const formatZip = (value = '') => value.replace(/\D/g, '').slice(0, 5)

// Format SSN: XXX-XX-XXXX format
const formatSsn = (value = '') => {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

// US States list for dropdown
const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
]
import { 
  normalizePhoneForDB, 
  isValidUSPhoneDigits, 
  parseDateString, 
  isAdultDob, 
  MIN_DOB 
} from '@/lib/validation'
import styles from './ProfileView.module.css'
import BankConnectionModal, { usePlaidBankConnection } from '../../ui/BankConnectionModal'

export default function ProfileView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const maxDob = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const now = new Date()
    const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate())
    return cutoff.toISOString().split('T')[0]
  }, [])
  const maxToday = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const now = new Date()
    return now.toISOString().split('T')[0]
  }, [])

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
  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState([])
  // Single user address (horizontal form in Addresses tab)
  const [addressForm, setAddressForm] = useState({
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States'
  })

  // Build and replace dashboard URL with optional profile tab param
  const replaceProfileUrl = (options = {}) => {
    const next = new URLSearchParams()
    // Copy existing params except from, and optionally tab (if provided)
    for (const [key, value] of searchParams.entries()) {
      if (key === 'from') continue
      if (options.tab !== undefined && key === 'tab') continue
      next.append(key, value)
    }
    if (options.tab !== undefined) {
      next.set('tab', options.tab)
    }
    const query = next.toString()
    router.replace(query ? `/dashboard/profile?${query}` : '/dashboard/profile', { scroll: false })
  }

  // Fetch bank accounts separately
  const fetchBankAccounts = async () => {
    try {
      const res = await apiClient.listPaymentMethods('bank_ach')
      if (res.payment_methods) {
        setBankAccounts(res.payment_methods)
      }
    } catch (e) {
      logger.error('Failed to fetch bank accounts', e)
    }
  }

  useEffect(() => {
    let isMounted = true
    setMounted(true)
    loadUser()
    
    const fetchBanks = async () => {
      try {
        const res = await apiClient.listPaymentMethods('bank_ach')
        if (isMounted && res.payment_methods) {
          setBankAccounts(res.payment_methods)
        }
      } catch (e) {
        if (isMounted) {
          logger.error('Failed to fetch bank accounts', e)
        }
      }
    }
    
    fetchBanks()
    
    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, userData, router])

  // Refresh banks when banking tab is active
  useEffect(() => {
    if (activeTab === 'banking') {
      let isMounted = true
      // Trigger a fresh fetch
      apiClient.listPaymentMethods('bank_ach')
        .then(res => {
          if (isMounted && res.payment_methods) setBankAccounts(res.payment_methods)
        })
        .catch(e => {
          if (isMounted) logger.error('Failed to fetch bank accounts', e)
        })
        
      return () => {
        isMounted = false
      }
    }
  }, [activeTab])

  const loadUser = async () => {
    if (typeof window === 'undefined') return
    
    const userId = localStorage.getItem('currentUserId')
    if (!userId) return

    try {
      // Use apiClient to route to Python backend (not Next.js)
      const data = await apiClient.getCurrentUser()
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
    if (name === 'ssn') {
      formattedValue = formatSsn(value)
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
    if (name === 'ssn') {
      formattedValue = formatSsn(value)
    }
    // Handle jointHoldingType specially as it's stored at the top level
    if (name === 'jointHoldingType') {
      setFormData(prev => ({ ...prev, jointHoldingType: formattedValue }))
    } else {
      setFormData(prev => ({ ...prev, jointHolder: { ...prev.jointHolder, [name]: formattedValue } }))
    }
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
    } else if (name === 'zip') {
      formattedValue = formatZip(value)
    }
    setFormData(prev => ({ ...prev, jointHolder: { ...prev.jointHolder, address: { ...prev.jointHolder.address, [name]: formattedValue } } }))
    if (errors[`joint${name.charAt(0).toUpperCase() + name.slice(1)}`]) {
      setErrors(prev => ({ ...prev, [`joint${name.charAt(0).toUpperCase() + name.slice(1)}`]: '' }))
    }
    setSaveSuccess(false)
  }

  const handleEntityAddressChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    if (name === 'city') {
      formattedValue = formatCity(value)
    } else if (name === 'street1' || name === 'street2') {
      formattedValue = formatStreet(value)
    } else if (name === 'zip') {
      formattedValue = formatZip(value)
    }
    setFormData(prev => ({ ...prev, entity: { ...prev.entity, address: { ...prev.entity.address, [name]: formattedValue } } }))
    if (errors[`entity${name.charAt(0).toUpperCase() + name.slice(1)}`]) {
      setErrors(prev => ({ ...prev, [`entity${name.charAt(0).toUpperCase() + name.slice(1)}`]: '' }))
    }
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
      else if (addressForm.zip.length !== 5) newErrors.addressZip = 'Enter 5 digits'
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
          else if (formData.entity.address.zip.length !== 5) newErrors.entityZip = 'Enter 5 digits'
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
          else if (formData.jointHolder.address.zip.length !== 5) newErrors.jointZip = 'Enter 5 digits'
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
          email: formData.email,
          phoneNumber: normalizePhoneForDB(formData.phoneNumber),
          address: {
            street1: addressForm.street1 || '',
            street2: addressForm.street2 || '',
            city: addressForm.city || '',
            state: addressForm.state || '',
            zip: addressForm.zip || ''
          }
        }
        // Only include dob if it has a valid value (YYYY-MM-DD format)
        if (formData.dob && /^\d{4}-\d{2}-\d{2}$/.test(formData.dob)) {
          payload.dob = formData.dob
        }
        // Only include ssn if it has a valid value (XXX-XX-XXXX format, 9 digits)
        if (formData.ssn && formData.ssn.replace(/\D/g, '').length === 9) {
          payload.ssn = formData.ssn
        }
      } else if (activeTab === 'joint-holder') {
        const jointHolderData = {
          firstName: formData.jointHolder?.firstName || '',
          lastName: formData.jointHolder?.lastName || '',
          email: formData.jointHolder?.email || '',
          phone: normalizePhoneForDB(formData.jointHolder?.phone || ''),
          address: {
            street1: formData.jointHolder?.address?.street1 || '',
            street2: formData.jointHolder?.address?.street2 || '',
            city: formData.jointHolder?.address?.city || '',
            state: formData.jointHolder?.address?.state || '',
            zip: formData.jointHolder?.address?.zip || ''
          }
        }
        // Only include dob if valid
        if (formData.jointHolder?.dob && /^\d{4}-\d{2}-\d{2}$/.test(formData.jointHolder.dob)) {
          jointHolderData.dob = formData.jointHolder.dob
        }
        // Only include ssn if valid (9 digits)
        if (formData.jointHolder?.ssn && formData.jointHolder.ssn.replace(/\D/g, '').length === 9) {
          jointHolderData.ssn = formData.jointHolder.ssn
        }
        payload = {
          jointHoldingType: formData.jointHoldingType,
          jointHolder: jointHolderData
        }
      } else if (activeTab === 'entity-info') {
        // Save authorized representative and entity information
        // For entity accounts, the user's dob/ssn represent the authorized rep
        payload = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneNumber: normalizePhoneForDB(formData.phoneNumber),
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
        // Only include dob if it has a valid value
        if (formData.dob && /^\d{4}-\d{2}-\d{2}$/.test(formData.dob)) {
          payload.dob = formData.dob
        }
        // Only include ssn if it has a valid value (9 digits)
        if (formData.ssn && formData.ssn.replace(/\D/g, '').length === 9) {
          payload.ssn = formData.ssn
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
        // Merge the response with existing userData to preserve fields not returned by backend
        const mergedUser = {
          ...userData,
          ...data.user,
          // Preserve nested objects by merging them properly
          address: {
            ...(userData?.address || {}),
            ...(data.user.address || {})
          },
          entity: {
            ...(userData?.entity || {}),
            ...(data.user.entity || {}),
            address: {
              ...(userData?.entity?.address || {}),
              ...(data.user.entity?.address || {})
            }
          },
          jointHolder: {
            ...(userData?.jointHolder || {}),
            ...(data.user.jointHolder || {}),
            address: {
              ...(userData?.jointHolder?.address || {}),
              ...(data.user.jointHolder?.address || {})
            }
          },
          trustedContact: {
            ...(userData?.trustedContact || {}),
            ...(data.user.trustedContact || {})
          },
          // Preserve investments array
          investments: data.user.investments || userData?.investments || []
        }
        
        setUserData(mergedUser)
        
        // Also update addressForm to keep it in sync for the missing fields check
        if (activeTab === 'primary-holder' && mergedUser.address) {
          setAddressForm({
            street1: mergedUser.address.street1 || '',
            street2: mergedUser.address.street2 || '',
            city: mergedUser.address.city || '',
            state: mergedUser.address.state || '',
            zip: mergedUser.address.zip || '',
            country: mergedUser.address.country || 'United States'
          })
        }
        
        // Sync formData for joint holder tab to update missing fields check
        if (activeTab === 'joint-holder' && mergedUser.jointHolder) {
          setFormData(prev => ({
            ...prev,
            jointHoldingType: mergedUser.jointHoldingType || prev.jointHoldingType || '',
            jointHolder: {
              firstName: mergedUser.jointHolder.firstName || '',
              lastName: mergedUser.jointHolder.lastName || '',
              email: mergedUser.jointHolder.email || '',
              phone: formatPhone(mergedUser.jointHolder.phone || ''),
              dob: mergedUser.jointHolder.dob || '',
              ssn: mergedUser.jointHolder.ssn || '',
              address: {
                street1: mergedUser.jointHolder.address?.street1 || '',
                street2: mergedUser.jointHolder.address?.street2 || '',
                city: mergedUser.jointHolder.address?.city || '',
                state: mergedUser.jointHolder.address?.state || '',
                zip: mergedUser.jointHolder.address?.zip || '',
                country: mergedUser.jointHolder.address?.country || 'United States'
              }
            }
          }))
        }
        
        // Sync formData for entity tab to update missing fields check
        if (activeTab === 'entity-info' && mergedUser.entity) {
          setFormData(prev => ({
            ...prev,
            entity: {
              name: mergedUser.entity.name || '',
              title: mergedUser.entity.title || '',
              registrationDate: mergedUser.entity.registrationDate || mergedUser.entity.formationDate || '',
              taxId: mergedUser.entity.taxId || '',
              address: {
                street1: mergedUser.entity.address?.street1 || '',
                street2: mergedUser.entity.address?.street2 || '',
                city: mergedUser.entity.address?.city || '',
                state: mergedUser.entity.address?.state || '',
                zip: mergedUser.entity.address?.zip || '',
                country: mergedUser.entity.address?.country || 'United States'
              }
            }
          }))
        }
        
        setSaveSuccess(true)
        return true
      }
      return false
    } catch (e) {
      logger.error('Failed to save profile', e)
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleBankAccountAdded = useCallback(async (bankAccount) => {
    try {
      // Refresh bank list directly
      await fetchBankAccounts()
      
      // Also reload user to keep other data in sync if needed, though banks are now separate
      await loadUser()
    } catch (e) {
      logger.error('Failed to refresh after adding bank account', e)
    }
  }, [])

  // Stable callbacks for Plaid hook to avoid unnecessary re-renders
  const handlePlaidError = useCallback((err) => {
    logger.error('[ProfileView] Plaid error:', err)
  }, [])

  const handlePlaidClose = useCallback(() => {
    setShowBankModal(false)
  }, [])

  // Plaid hook for direct connection (when manual entry is disabled)
  const plaid = usePlaidBankConnection({
    onAccountSelected: handleBankAccountAdded,
    onError: handlePlaidError,
    onClose: handlePlaidClose
  })

  // Fetch Plaid token when on banking tab and manual entry is disabled
  useEffect(() => {
    if (activeTab === 'banking' && !MANUAL_BANK_ENTRY_ENABLED) {
      plaid.fetchToken()
    }
  }, [activeTab, plaid.fetchToken, MANUAL_BANK_ENTRY_ENABLED])

  // Handler for "Connect Bank Account" button
  const handleConnectBankClick = useCallback(() => {
    if (MANUAL_BANK_ENTRY_ENABLED) {
      setShowBankModal(true)
    } else if (plaid.ready) {
      plaid.open()
    }
  }, [plaid])

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
        await fetchBankAccounts()
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
      
      // Use deletePaymentMethod instead of updateUser action for cleaner API usage
      // Try the direct API first
      try {
        await apiClient.deletePaymentMethod(bankId)
        await fetchBankAccounts()
        await loadUser() // Sync user profile too
      } catch (apiErr) {
        // Fallback to legacy updateUser approach if direct delete fails
        const userId = localStorage.getItem('currentUserId')
        const data = await apiClient.updateUser(userId, {
          _action: 'removeBankAccount',
          bankAccountId: bankId
        })
        if (data.success) {
          await loadUser()
          await fetchBankAccounts()
        } else {
          throw new Error(data.error || 'Failed to remove bank account')
        }
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
    } else if (name === 'zip') {
      formattedValue = formatZip(value)
    }
    setAddressForm(prev => ({ ...prev, [name]: formattedValue }))
    if (errors[`address${name.charAt(0).toUpperCase() + name.slice(1)}`]) {
      setErrors(prev => ({ ...prev, [`address${name.charAt(0).toUpperCase() + name.slice(1)}`]: '' }))
    }
    setSaveSuccess(false)
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

      {/* Mobile Tab Navigation (Dropdown) */}
      <div className={styles.mobileTabNavigation}>
        <select
          value={activeTab}
          onChange={(e) => handleTabChange(e.target.value)}
          className={styles.mobileTabSelect}
          aria-label="Profile section navigation"
        >
          {tabs.map(tab => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
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
            setFormData={setFormData}
            userData={userData}
            errors={errors}
            showSSN={showSSN}
            setShowSSN={setShowSSN}
            maskSSN={maskSSN}
            handleChange={handleChange}
            handleEntityChange={handleEntityChange}
            addressForm={addressForm}
            setAddressForm={setAddressForm}
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
            formatPhone={formatPhone}
          />
        )}

        {activeTab === 'joint-holder' && showJointSection && (
          <JointHolderTab
            formData={formData}
            userData={userData}
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
            bankAccounts={bankAccounts}
            handleConnectBankClick={handleConnectBankClick}
            plaidReady={plaid.ready}
            plaidLoading={plaid.isLoading}
            handleSetDefaultBank={handleSetDefaultBank}
            handleRemoveBank={handleRemoveBank}
            isRemovingBank={isRemovingBank}
            mounted={mounted}
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
            mounted={mounted}
          />
        )}
      </div>

      {/* Bank Connection Modal - only used when manual entry is enabled */}
      {MANUAL_BANK_ENTRY_ENABLED && (
        <BankConnectionModal
          isOpen={showBankModal}
          onClose={() => setShowBankModal(false)}
          onAccountSelected={handleBankAccountAdded}
        />
      )}
    </div>
  )
}

// Helper function to check if a field value is missing/empty
const isFieldEmpty = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

// Individual Tab Components
function PrimaryHolderTab({ formData, setFormData, userData, errors, showSSN, setShowSSN, maskSSN, handleChange, handleEntityChange, addressForm, setAddressForm, handleAddressFormChange, handleSave, isSaving, saveSuccess, MIN_DOB, maxDob, maxToday, hasInvestments, shouldDisableFields, isEntityView, formatPhone }) {
  // Check for missing fields that can be edited even with active investments
  // Use userData for fields that were originally loaded from the server
  const missingFields = {
    firstName: isFieldEmpty(userData?.firstName),
    lastName: isFieldEmpty(userData?.lastName),
    email: isFieldEmpty(userData?.email),
    phoneNumber: isFieldEmpty(userData?.phoneNumber) && isFieldEmpty(userData?.phone),
    dob: isFieldEmpty(userData?.dob),
    ssn: isFieldEmpty(userData?.ssn),
    street1: isFieldEmpty(userData?.address?.street1),
    street2: isFieldEmpty(userData?.address?.street2), // Optional but editable
    city: isFieldEmpty(userData?.address?.city),
    state: isFieldEmpty(userData?.address?.state),
    zip: isFieldEmpty(userData?.address?.zip),
  }
  
  // Check if there are any missing/editable fields (including optional street2) - for save button
  const hasMissingFields = Object.values(missingFields).some(v => v)
  
  // Check if there are any missing REQUIRED fields - for showing the info message
  const hasMissingRequiredFields = missingFields.firstName || missingFields.lastName || 
    missingFields.email || missingFields.phoneNumber || missingFields.dob || missingFields.ssn ||
    missingFields.street1 || missingFields.city || missingFields.state || missingFields.zip
  
  // A field should be disabled only if:
  // - User has investments AND the field already has data (not missing)
  const shouldDisableField = (fieldName) => {
    if (!hasInvestments) return false // No investments = all fields editable
    return !missingFields[fieldName] // Has investments but field is missing = editable
  }

  return (
    <div className={styles.content}>
      {/* Identity Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '16px'}}>
            <h2 className={styles.sectionTitle} style={{borderBottom: 'none', paddingBottom: 0, marginBottom: 0}}>
                {isEntityView ? 'Authorized Representative' : 'Identity Information'}
            </h2>
        </div>
        
        {hasInvestments && !hasMissingRequiredFields && (
          <p style={{ fontSize: '14px', color: '#d97706', marginBottom: '16px', fontWeight: '500' }}>
            ⚠️ Your profile information is locked because you have pending or active investments.
          </p>
        )}
        
        {hasInvestments && hasMissingRequiredFields && (
          <p style={{ fontSize: '14px', color: '#2563eb', marginBottom: '16px', fontWeight: '500' }}>
            ℹ️ Some of your profile information is missing. You can fill in the empty fields below and save your changes.
          </p>
        )}

        <div className={styles.subCard}>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>First Name {missingFields.firstName && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input 
                className={`${styles.input} ${errors.firstName ? styles.inputError : ''}`} 
                name="firstName" 
                value={formData.firstName} 
                onChange={handleChange} 
                disabled={shouldDisableField('firstName')} 
                maxLength={100} 
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last Name {missingFields.lastName && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input 
                className={`${styles.input} ${errors.lastName ? styles.inputError : ''}`} 
                name="lastName" 
                value={formData.lastName} 
                onChange={handleChange} 
                disabled={shouldDisableField('lastName')} 
                maxLength={100} 
              />
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
              <label className={styles.label}>Date of Birth {missingFields.dob && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input
                className={`${styles.input} ${errors.dob ? styles.inputError : ''}`}
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleChange}
                min={MIN_DOB}
                max={maxDob}
                disabled={shouldDisableField('dob')}
              />
              {errors.dob && <span className={styles.errorText}>{errors.dob}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Social Security Number {missingFields.ssn && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <div className={styles.inputWrapper}>
                {/* Only mask SSN if it was loaded from server (matches userData) AND showSSN is false */}
                {(() => {
                  const savedSsn = userData?.ssn || ''
                  const hasSavedSsn = savedSsn && savedSsn.replace(/\D/g, '').length === 9
                  const shouldMask = hasSavedSsn && !showSSN
                  
                  return shouldMask ? (
                    <input 
                      className={`${styles.input} ${styles.inputWithToggle}`}
                      type="text"
                      name="ssn" 
                      value={maskSSN(formData.ssn)} 
                      readOnly
                      disabled={shouldDisableField('ssn')}
                      maxLength={11}
                    />
                  ) : (
                    <input 
                      className={`${styles.input} ${styles.inputWithToggle}`}
                      type="text"
                      name="ssn" 
                      value={formData.ssn || ''} 
                      onChange={handleChange} 
                      placeholder="123-45-6789"
                      inputMode="numeric"
                      disabled={shouldDisableField('ssn')}
                      maxLength={11}
                    />
                  )
                })()}
                {/* Only show toggle button when SSN was saved (loaded from server) */}
                {userData?.ssn && (userData.ssn.replace(/\D/g, '').length === 9) && (
                  <button
                    type="button"
                    className={styles.toggleButton}
                    onClick={() => setShowSSN(!showSSN)}
                    aria-label={showSSN ? 'Hide SSN' : 'Show SSN'}
                    disabled={shouldDisableField('ssn')} 
                  >
                    {showSSN ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Address Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '16px'}}>
             <h2 className={styles.sectionTitle} style={{borderBottom: 'none', paddingBottom: 0, marginBottom: 0}}>Contact & Address Information</h2>
        </div>

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Contact Details</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Email {missingFields.email && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input 
                className={`${styles.input} ${errors.email ? styles.inputError : ''}`} 
                name="email" 
                value={formData.email} 
                onChange={handleChange}
                disabled={shouldDisableField('email')} 
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Phone {missingFields.phoneNumber && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input 
                className={`${styles.input} ${errors.phoneNumber ? styles.inputError : ''}`} 
                type="tel" 
                name="phoneNumber" 
                value={formData.phoneNumber} 
                onChange={handleChange} 
                placeholder="(555) 555-5555" 
                disabled={shouldDisableField('phoneNumber')} 
                maxLength={30} 
              />
            </div>
          </div>
        </div>

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Primary Address</h3>
          <div className={styles.compactGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 1 {missingFields.street1 && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input
                className={`${styles.input} ${errors.addressStreet1 ? styles.inputError : ''}`}
                name="street1"
                value={addressForm.street1}
                onChange={handleAddressFormChange}
                placeholder="123 Main St"
                disabled={shouldDisableField('street1')}
                maxLength={200}
              />
              {errors.addressStreet1 && <span className={styles.errorText}>{errors.addressStreet1}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 2 {missingFields.street2 && hasInvestments && <span style={{color: '#6b7280', fontSize: '11px'}}>(Optional)</span>}</label>
              <input
                className={styles.input}
                name="street2"
                value={addressForm.street2}
                onChange={handleAddressFormChange}
                placeholder="Apt, Suite, etc. (Optional)"
                disabled={shouldDisableField('street2')}
                maxLength={200}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>City {missingFields.city && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input
                className={`${styles.input} ${errors.addressCity ? styles.inputError : ''}`}
                name="city"
                value={addressForm.city}
                onChange={handleAddressFormChange}
                placeholder="New York"
                disabled={shouldDisableField('city')}
                maxLength={100}
              />
              {errors.addressCity && <span className={styles.errorText}>{errors.addressCity}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>State {missingFields.state && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <select
                className={`${styles.input} ${errors.addressState ? styles.inputError : ''}`}
                name="state"
                value={addressForm.state}
                onChange={handleAddressFormChange}
                disabled={shouldDisableField('state')}
              >
                <option value="">Select state</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.addressState && <span className={styles.errorText}>{errors.addressState}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>ZIP Code {missingFields.zip && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input
                className={`${styles.input} ${errors.addressZip ? styles.inputError : ''}`}
                name="zip"
                value={addressForm.zip}
                onChange={handleAddressFormChange}
                placeholder="10001"
                disabled={shouldDisableField('zip')}
                inputMode="numeric"
                maxLength={5}
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

      {/* Show save button if no investments OR if there are missing fields to fill */}
      {(!hasInvestments || hasMissingFields) && (
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
      )}
    </div>
  )
}

function JointHolderTab({ formData, errors, showJointSSN, setShowJointSSN, maskSSN, handleJointHolderChange, handleJointAddressChange, handleSave, isSaving, saveSuccess, MIN_DOB, maxDob, hasInvestments, shouldDisableFields, userData }) {
  // Check for missing joint holder fields - use userData to check original server values
  const jointUserData = userData?.jointHolder
  const missingJointFields = {
    jointHoldingType: isFieldEmpty(userData?.jointHoldingType),
    firstName: isFieldEmpty(jointUserData?.firstName),
    lastName: isFieldEmpty(jointUserData?.lastName),
    email: isFieldEmpty(jointUserData?.email),
    phone: isFieldEmpty(jointUserData?.phone),
    dob: isFieldEmpty(jointUserData?.dob),
    ssn: isFieldEmpty(jointUserData?.ssn),
    street1: isFieldEmpty(jointUserData?.address?.street1),
    street2: isFieldEmpty(jointUserData?.address?.street2), // Optional but editable
    city: isFieldEmpty(jointUserData?.address?.city),
    state: isFieldEmpty(jointUserData?.address?.state),
    zip: isFieldEmpty(jointUserData?.address?.zip),
  }
  
  // For save button - includes optional fields
  const hasMissingJointFields = Object.values(missingJointFields).some(v => v)
  
  // For info message - only required fields (excludes street2)
  const hasMissingRequiredJointFields = missingJointFields.jointHoldingType || missingJointFields.firstName ||
    missingJointFields.lastName || missingJointFields.email || missingJointFields.phone ||
    missingJointFields.dob || missingJointFields.ssn || missingJointFields.street1 ||
    missingJointFields.city || missingJointFields.state || missingJointFields.zip
  
  // A field should be disabled only if user has investments AND field is not missing
  const shouldDisableJointField = (fieldName) => {
    if (!hasInvestments) return false
    return !missingJointFields[fieldName]
  }

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Joint Holder</h2>
        {hasInvestments && !hasMissingRequiredJointFields && (
          <p style={{ fontSize: '14px', color: '#d97706', marginBottom: '16px', fontWeight: '500' }}>
            ⚠️ Joint holder information is locked because you have pending or active investments.
          </p>
        )}
        
        {hasInvestments && hasMissingRequiredJointFields && (
          <p style={{ fontSize: '14px', color: '#2563eb', marginBottom: '16px', fontWeight: '500' }}>
            ℹ️ Some joint holder information is missing. You can fill in the empty fields below and save your changes.
          </p>
        )}

        <div className={styles.subCard}>
          <h3 className={styles.subSectionTitle}>Joint Details</h3>
          <div className={styles.compactGrid}>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label className={styles.label}>Joint Holder Relationship {missingJointFields.jointHoldingType && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <select
                className={`${styles.input} ${errors.jointHoldingType ? styles.inputError : ''}`}
                name="jointHoldingType"
                value={formData.jointHoldingType || ''}
                onChange={handleJointHolderChange}
                disabled={shouldDisableJointField('jointHoldingType')}
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
              <label className={styles.label}>First Name {missingJointFields.firstName && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointFirstName ? styles.inputError : ''}`} name="firstName" value={formData.jointHolder?.firstName || ''} onChange={handleJointHolderChange} disabled={shouldDisableJointField('firstName')} maxLength={100} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last Name {missingJointFields.lastName && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointLastName ? styles.inputError : ''}`} name="lastName" value={formData.jointHolder?.lastName || ''} onChange={handleJointHolderChange} disabled={shouldDisableJointField('lastName')} maxLength={100} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Date of Birth {missingJointFields.dob && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointDob ? styles.inputError : ''}`} type="date" name="dob" value={formData.jointHolder?.dob || ''} onChange={handleJointHolderChange} min={MIN_DOB} max={maxDob} disabled={shouldDisableJointField('dob')} />
              {errors.jointDob && <span className={styles.errorText}>{errors.jointDob}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Social Security Number {missingJointFields.ssn && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <div className={styles.inputWrapper}>
                <input 
                  className={`${styles.input} ${styles.inputWithToggle} ${errors.jointSsn ? styles.inputError : ''}`}
                  type="text"
                  name="ssn" 
                  value={showJointSSN ? (formData.jointHolder?.ssn || '') : maskSSN(formData.jointHolder?.ssn || '')} 
                  onChange={handleJointHolderChange}
                  readOnly={!showJointSSN && !missingJointFields.ssn}
                  disabled={shouldDisableJointField('ssn')}
                  placeholder="123-45-6789"
                  maxLength={30}
                />
                <button
                  type="button"
                  className={styles.toggleButton}
                  onClick={() => setShowJointSSN(!showJointSSN)}
                  aria-label={showJointSSN ? 'Hide SSN' : 'Show SSN'}
                  disabled={shouldDisableJointField('ssn')}
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
              <label className={styles.label}>Email {missingJointFields.email && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointEmail ? styles.inputError : ''}`} name="email" value={formData.jointHolder?.email || ''} onChange={handleJointHolderChange} disabled={shouldDisableJointField('email')} maxLength={255} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Phone {missingJointFields.phone && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointPhone ? styles.inputError : ''}`} type="tel" name="phone" value={formData.jointHolder?.phone || ''} onChange={handleJointHolderChange} placeholder="(555) 555-5555" disabled={shouldDisableJointField('phone')} maxLength={30} />
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
              <label className={styles.label}>Street Address 1 {missingJointFields.street1 && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointStreet1 ? styles.inputError : ''}`} name="street1" value={formData.jointHolder?.address?.street1 || ''} onChange={handleJointAddressChange} placeholder="123 Main St" disabled={shouldDisableJointField('street1')} maxLength={200} />
              {errors.jointStreet1 && <span className={styles.errorText}>{errors.jointStreet1}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Street Address 2 {missingJointFields.street2 && hasInvestments && <span style={{color: '#6b7280', fontSize: '11px'}}>(Optional)</span>}</label>
              <input className={styles.input} name="street2" value={formData.jointHolder?.address?.street2 || ''} onChange={handleJointAddressChange} placeholder="Apt, Suite, etc. (Optional)" disabled={shouldDisableJointField('street2')} maxLength={200} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>City {missingJointFields.city && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointCity ? styles.inputError : ''}`} name="city" value={formData.jointHolder?.address?.city || ''} onChange={handleJointAddressChange} placeholder="New York" disabled={shouldDisableJointField('city')} maxLength={100} />
              {errors.jointCity && <span className={styles.errorText}>{errors.jointCity}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>State {missingJointFields.state && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <select className={`${styles.input} ${errors.jointState ? styles.inputError : ''}`} name="state" value={formData.jointHolder?.address?.state || ''} onChange={handleJointAddressChange} disabled={shouldDisableJointField('state')}>
                <option value="">Select state</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.jointState && <span className={styles.errorText}>{errors.jointState}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>ZIP Code {missingJointFields.zip && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
              <input className={`${styles.input} ${errors.jointZip ? styles.inputError : ''}`} name="zip" value={formData.jointHolder?.address?.zip || ''} onChange={handleJointAddressChange} placeholder="10001" disabled={shouldDisableJointField('zip')} inputMode="numeric" maxLength={5} />
              {errors.jointZip && <span className={styles.errorText}>{errors.jointZip}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Country</label>
              <input className={styles.input} name="country" value={formData.jointHolder?.address?.country || 'United States'} disabled />
            </div>
          </div>
        </div>
      </section>

      {/* Show save button if no investments OR if there are missing fields */}
      {(!hasInvestments || hasMissingJointFields) && (
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
      )}
    </div>
  )
}

function EntityInfoTab({ formData, userData, errors, showRepSSN, setShowRepSSN, maskSSN, handleEntityChange, handleEntityAddressChange, handleSave, isSaving, saveSuccess, MIN_DOB, maxDob, maxToday, entityLocked, hasInvestments }) {
  // Check for missing entity fields - use userData to check original server values
  const entityUserData = userData?.entity
  const missingEntityFields = {
    name: isFieldEmpty(entityUserData?.name),
    registrationDate: isFieldEmpty(entityUserData?.registrationDate) && isFieldEmpty(entityUserData?.formationDate),
    taxId: isFieldEmpty(entityUserData?.taxId),
    street1: isFieldEmpty(entityUserData?.address?.street1),
    street2: isFieldEmpty(entityUserData?.address?.street2), // Optional but editable
    city: isFieldEmpty(entityUserData?.address?.city),
    state: isFieldEmpty(entityUserData?.address?.state),
    zip: isFieldEmpty(entityUserData?.address?.zip),
  }
  
  // For save button - includes optional fields
  const hasMissingEntityFields = Object.values(missingEntityFields).some(v => v)
  
  // For info message - only required fields (excludes street2)
  const hasMissingRequiredEntityFields = missingEntityFields.name || missingEntityFields.registrationDate ||
    missingEntityFields.taxId || missingEntityFields.street1 || missingEntityFields.city ||
    missingEntityFields.state || missingEntityFields.zip
  
  // A field should be disabled only if entity is locked AND field is not missing
  const shouldDisableEntityField = (fieldName) => {
    if (!entityLocked) return false
    return !missingEntityFields[fieldName]
  }

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Entity Information</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
          Information about the entity associated with your investments. Note: Different LLCs require separate accounts with different email addresses.
        </p>
        {hasInvestments && !hasMissingRequiredEntityFields && (
          <p style={{ fontSize: '14px', color: '#d97706', marginBottom: '16px', fontWeight: '500' }}>
            ⚠️ Entity information is locked because you have pending or active investments.
          </p>
        )}
        
        {hasInvestments && hasMissingRequiredEntityFields && (
          <p style={{ fontSize: '14px', color: '#2563eb', marginBottom: '16px', fontWeight: '500' }}>
            ℹ️ Some entity information is missing. You can fill in the empty fields below and save your changes.
          </p>
        )}
        <div className={styles.compactGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Entity Name {missingEntityFields.name && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
            <input
              className={`${styles.input} ${errors.entityName ? styles.inputError : ''}`}
              type="text"
              name="name"
              value={formData.entity?.name || ''}
              onChange={handleEntityChange}
              disabled={shouldDisableEntityField('name')}
              maxLength={150}
            />
            {errors.entityName && <span className={styles.errorText}>{errors.entityName}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Formation Date {missingEntityFields.registrationDate && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
            <input
              className={`${styles.input} ${errors.entityRegistrationDate ? styles.inputError : ''}`}
              type="date"
              name="registrationDate"
              value={formData.entity?.registrationDate || ''}
              onChange={handleEntityChange}
              min={MIN_DOB}
              max={maxToday}
              disabled={shouldDisableEntityField('registrationDate')}
            />
            {errors.entityRegistrationDate && <span className={styles.errorText}>{errors.entityRegistrationDate}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>EIN / Tax ID {missingEntityFields.taxId && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
            <input
              className={`${styles.input} ${errors.entityTaxId ? styles.inputError : ''}`}
              type="text"
              name="taxId"
              value={formData.entity?.taxId || ''}
              onChange={handleEntityChange}
              disabled={shouldDisableEntityField('taxId')}
              maxLength={30}
            />
            {errors.entityTaxId && <span className={styles.errorText}>{errors.entityTaxId}</span>}
          </div>
        </div>
        <div className={styles.compactGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Street Address 1 {missingEntityFields.street1 && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
            <input
              className={`${styles.input} ${errors.entityStreet1 ? styles.inputError : ''}`}
              type="text"
              name="street1"
              value={formData.entity?.address?.street1 || ''}
              onChange={handleEntityAddressChange}
              disabled={shouldDisableEntityField('street1')}
              maxLength={200}
            />
            {errors.entityStreet1 && <span className={styles.errorText}>{errors.entityStreet1}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Street Address 2 {missingEntityFields.street2 && hasInvestments && <span style={{color: '#6b7280', fontSize: '11px'}}>(Optional)</span>}</label>
            <input
              className={styles.input}
              type="text"
              name="street2"
              value={formData.entity?.address?.street2 || ''}
              onChange={handleEntityAddressChange}
              disabled={shouldDisableEntityField('street2')}
              maxLength={200}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>City {missingEntityFields.city && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
            <input
              className={`${styles.input} ${errors.entityCity ? styles.inputError : ''}`}
              type="text"
              name="city"
              value={formData.entity?.address?.city || ''}
              onChange={handleEntityAddressChange}
              disabled={shouldDisableEntityField('city')}
              maxLength={100}
            />
            {errors.entityCity && <span className={styles.errorText}>{errors.entityCity}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>State {missingEntityFields.state && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
            <select
              className={`${styles.input} ${errors.entityState ? styles.inputError : ''}`}
              name="state"
              value={formData.entity?.address?.state || ''}
              onChange={handleEntityAddressChange}
              disabled={shouldDisableEntityField('state')}
            >
              <option value="">Select state</option>
              {US_STATES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {errors.entityState && <span className={styles.errorText}>{errors.entityState}</span>}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>ZIP Code {missingEntityFields.zip && hasInvestments && <span style={{color: '#2563eb', fontSize: '11px'}}>(Required)</span>}</label>
            <input
              className={`${styles.input} ${errors.entityZip ? styles.inputError : ''}`}
              type="text"
              name="zip"
              value={formData.entity?.address?.zip || ''}
              onChange={handleEntityAddressChange}
              disabled={shouldDisableEntityField('zip')}
              inputMode="numeric"
              maxLength={5}
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

      {/* Show save button if entity is not locked OR if there are missing fields */}
      {(!entityLocked || hasMissingEntityFields) && (
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
      )}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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


function BankingTab({ userData, bankAccounts, handleConnectBankClick, plaidReady, plaidLoading, handleSetDefaultBank, handleRemoveBank, isRemovingBank, mounted }) {
  // Prefer the independently fetched bankAccounts, fall back to userData.bankAccounts
  const availableBanks = Array.isArray(bankAccounts) && bankAccounts.length > 0 
    ? bankAccounts 
    : (Array.isArray(userData?.bankAccounts) ? userData.bankAccounts : [])
  
  const defaultBankId = userData?.banking?.defaultBankAccountId || null
  
  // Determine if button should be disabled (only when using Plaid directly and not ready)
  const isButtonDisabled = !MANUAL_BANK_ENTRY_ENABLED && !plaidReady

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Banking Information</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
          Manage your connected bank account. Only one account can be connected at a time. Connecting a new account will replace the existing one.
        </p>

        {availableBanks.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No bank accounts connected yet.</p>
            <button
              className={styles.addBankButton}
              onClick={handleConnectBankClick}
              disabled={isButtonDisabled}
            >
              {!MANUAL_BANK_ENTRY_ENABLED && plaidLoading ? 'Loading...' : 'Add Bank Account'}
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
                  mounted={mounted}
                />
              ))}
            </div>
            <div className={styles.actions}>
              <button
                className={styles.addBankButton}
                onClick={handleConnectBankClick}
                disabled={isButtonDisabled}
              >
                {!MANUAL_BANK_ENTRY_ENABLED && plaidLoading ? 'Loading...' : 'Change Bank Account'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function BankAccountCard({ bank, isDefault, mounted }) {
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
      {lastUsed && mounted && (
        <div className={styles.bankCardMeta}>
          Last used: {new Date(lastUsed).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}

function SecurityTab({ userData, passwordForm, errors, handlePasswordChange, handleChangePassword, isChangingPassword, passwordChangeSuccess, mounted }) {
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
              {userData.createdAt && mounted ? new Date(userData.createdAt).toLocaleDateString() : 'Not available'}
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
              <select
                className={`${styles.input} ${errors.addressState ? styles.inputError : ''}`}
                name="state"
                value={addressForm.state}
                onChange={handleAddressFormChange}
              >
                <option value="">Select state</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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
                inputMode="numeric"
                maxLength={5}
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
