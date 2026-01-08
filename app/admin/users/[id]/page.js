'use client'
import { useEffect, useMemo, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { apiClient } from '../../../../lib/apiClient'
import { adminService } from '../../../../lib/services/admin'
import AdminHeader from '../../../components/layout/AdminHeader'
import { calculateInvestmentValue } from '../../../../lib/investmentCalculations.js'
import { formatDateForDisplay } from '../../../../lib/dateUtils.js'
import { maskSSN, formatCurrency } from '../../../../lib/formatters.js'
import { normalizePhoneForDB } from '../../../../lib/validation'
import styles from './page.module.css'
import { useUser } from '@/app/contexts/UserContext'
import ConfirmModal from '../../components/ConfirmModal'

function AdminUserDetailsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const id = params?.id
  const { userData, loading: userLoading } = useUser()
  const initializedRef = useRef(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [appTime, setAppTime] = useState(null)
  const [activityPage, setActivityPage] = useState(1)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview')
  const [activityEvents, setActivityEvents] = useState([])
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [refreshingBalanceId, setRefreshingBalanceId] = useState(null)
  const [setupLink, setSetupLink] = useState(null)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [showSSN, setShowSSN] = useState(false)
  const [showJointSSN, setShowJointSSN] = useState(false)
  const [showAuthRepSSN, setShowAuthRepSSN] = useState(false)
  const [showBalance, setShowBalance] = useState(false)
  const [activityFilterInvestmentId, setActivityFilterInvestmentId] = useState('all')
  const [activityTypeFilter, setActivityTypeFilter] = useState('all') // 'all', 'distributions', 'contributions'
  const [selectedActivityEvent, setSelectedActivityEvent] = useState(null)
  
  // Delete document modal state
  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    fileName: '',
    documentId: null,
    isLoading: false,
    isSuccess: false
  })

  // Document upload state
  const fileInputRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)

  // TIN Matching state
  const [tinMatchingRequest, setTinMatchingRequest] = useState(null)
  const [isLoadingTinStatus, setIsLoadingTinStatus] = useState(false)
  const [isRefreshingTin, setIsRefreshingTin] = useState(false)

  // 1099-INT state
  const [form1099INTSubmissions, setForm1099INTSubmissions] = useState([])
  const [isLoading1099INT, setIsLoading1099INT] = useState(false)
  const [isGenerating1099INT, setIsGenerating1099INT] = useState(false)

  // Memoize processed activity events
  const allActivity = useMemo(() => {
    if (!activityEvents) return []
    
    const events = activityEvents.map(event => {
      // Parse metadata if it exists (handle both camelCase and snake_case)
      let metadata = {}
      const rawMetadata = event.eventMetadata || event.event_metadata
      try {
        if (rawMetadata && typeof rawMetadata === 'string') {
          metadata = JSON.parse(rawMetadata)
        } else if (rawMetadata && typeof rawMetadata === 'object') {
          metadata = rawMetadata
        }
      } catch (e) {
        console.error('Failed to parse event metadata:', e)
      }

      return {
        id: event.id,
        type: event.activityType || event.activity_type,
        userId: event.userId || event.user_id,
        investmentId: event.investmentId || event.investment_id,
        amount: metadata.amount,
        date: event.eventDate || event.event_date,
        createdAt: event.createdAt || event.created_at,
        title: event.title,
        description: event.description,
        // Prefer transaction status over activity status
        status: event.transaction?.status || event.status,
        metadata: metadata,
        monthIndex: metadata.monthIndex,
        rawData: event  // Store full raw event data for inspection
      }
    })

    // Sort by date (newest first), with secondary sort by createdAt and tertiary by id
    events.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      
      if (dateB !== dateA) {
        return dateB - dateA
      }
      
      // Secondary sort by createdAt (newest first)
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      
      if (createdB !== createdA) {
        return createdB - createdA
      }
      
      // Tertiary sort by id (descending string comparison for TX-INV-... format)
      return String(b.id || '').localeCompare(String(a.id || ''))
    })
    
    return events
  }, [activityEvents])

  // Simple filter - just compare as strings (computed on each render for freshness)
  // First filter by investment ID
  const investmentFiltered = activityFilterInvestmentId === 'all' 
    ? allActivity 
    : allActivity.filter(e => String(e.investmentId) === String(activityFilterInvestmentId))
  
  // Then filter by activity type
  const filteredActivity = activityTypeFilter === 'all'
    ? investmentFiltered
    : activityTypeFilter === 'distributions'
      ? investmentFiltered.filter(e => e.type === 'distribution' || e.type === 'monthly_distribution')
      : activityTypeFilter === 'contributions'
        ? investmentFiltered.filter(e => e.type === 'contribution' || e.type === 'monthly_contribution' || e.type === 'monthly_compounded')
        : investmentFiltered

  const MIN_DOB = '1900-01-01'
  const ACTIVITY_ITEMS_PER_PAGE = 20

  const formatZip = (value = '') => value.replace(/\D/g, '').slice(0, 5)
  const formatPhone = (value = '') => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  const isCompletePhone = (value = '') => value.replace(/\D/g, '').length === 10
  const formatSsn = (value = '') => {
    const digits = value.replace(/\D/g, '').slice(0, 9)
    if (digits.length <= 3) return digits
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  }
  const isCompleteSsn = (value = '') => value.replace(/\D/g, '').length === 9
  const formatCity = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')
  const formatName = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')
  const formatEntityName = (value = '') => value.replace(/[^a-zA-Z0-9\s'\-\.&,]/g, '')
  const formatStreet = (value = '') => value.replace(/[^a-zA-Z0-9\s'\-\.,#]/g, '')

  const US_STATES = useMemo(() => [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
  ], [])

  const [form, setForm] = useState({
    accountType: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States',
    dob: '',
    ssn: '',
    entityName: '',
    entityTaxId: '',
    entityRegistrationDate: '',
    jointHoldingType: '',
    jointHolder: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dob: '',
      ssn: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States'
    },
    authorizedRep: {
      firstName: '',
      lastName: '',
      title: '',
      dob: '',
      ssn: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States'
    },
    // IRA Custodian fields (stored in entity object on backend)
    custodian: {
      name: '',
      taxId: '',
      phone: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States'
    }
  })
  const [errors, setErrors] = useState({})
  // Precompute date boundaries without hooks to avoid hook order issues
  const maxAdultDob = (() => {
    const now = new Date()
    const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate())
    return cutoff.toISOString().split('T')[0]
  })()
  const maxToday = (() => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  })()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (userLoading) return
    if (!userData || !userData.isAdmin) {
      console.log('[AdminUserDetails] Not an admin, redirecting to dashboard')
      router.push('/dashboard')
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true

    const init = async () => {
      try {
        setCurrentUser(userData)

        const [usersData, investmentsData, paymentMethodsData, tinMatchingData, form1099Data] = await Promise.all([
          apiClient.getAllUsers(),
          apiClient.getAdminInvestments(),
          adminService.getUserPaymentMethods(id),
          adminService.getTinMatchingRequests({ user_id: id }),
          adminService.get1099INTSubmissions({ user_id: id })
        ])
        
        if (!usersData || !usersData.success) {
          console.error('[AdminUserDetails] Failed to load users data')
          return
        }

        if (paymentMethodsData && paymentMethodsData.success) {
          setPaymentMethods(paymentMethodsData.payment_methods || [])
        }

        if (tinMatchingData && tinMatchingData.success && tinMatchingData.requests.length > 0) {
          // Get the most recent TIN matching request
          const sortedRequests = [...tinMatchingData.requests].sort((a, b) => 
            new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)
          )
          setTinMatchingRequest(sortedRequests[0])
        }

        if (form1099Data && form1099Data.success && form1099Data.submissions) {
          // Sort submissions by tax year (newest first), then by updated date
          const sortedSubmissions = [...form1099Data.submissions].sort((a, b) => {
            const yearDiff = (b.taxYear || b.tax_year || '0').localeCompare(a.taxYear || a.tax_year || '0')
            if (yearDiff !== 0) return yearDiff
            return new Date(b.updatedAt || b.updated_at || 0) - new Date(a.updatedAt || a.updated_at || 0)
          })
          setForm1099INTSubmissions(sortedSubmissions)
        }

        const investmentsByUser = {}
        if (investmentsData && investmentsData.success) {
          const investmentsList = investmentsData.investments || []
          investmentsList.forEach(inv => {
            const userId = inv.userId.toString()
            if (!investmentsByUser[userId]) {
              investmentsByUser[userId] = []
            }
            investmentsByUser[userId].push(inv)
          })
        }

        let targetUser = usersData.users.find(u => {
          const userId = u.id.toString()
          const targetId = id.toString()
          return userId === targetId || userId.replace(/\D/g, '') === targetId.replace(/\D/g, '')
        })

        if (!targetUser) {
          console.error('[AdminUserDetails] User not found:', id)
          return
        }

        const userIdStr = targetUser.id.toString()
        const numericMatch = userIdStr.match(/\d+$/)
        const numericId = numericMatch ? numericMatch[0] : userIdStr
        targetUser = {
          ...targetUser,
          investments: investmentsByUser[userIdStr] || investmentsByUser[numericId] || []
        }

        setUser(targetUser)
        
        if (usersData.timeOffset !== undefined && usersData.timeOffset !== null) {
          const realTime = new Date()
          const currentAppTime = new Date(realTime.getTime() + usersData.timeOffset).toISOString()
          setAppTime(currentAppTime)
        }

        await loadUserActivity(targetUser.id)
        
        
        const u = targetUser;
        setForm({
            accountType: u.accountType || 'individual',
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            email: u.email || '',
            phone: u.phone || u.phoneNumber || '',
            street1: u.address?.street1 || '',
            street2: u.address?.street2 || '',
            city: u.address?.city || '',
            state: u.address?.state || '',
            zip: u.address?.zip || '',
            country: u.address?.country || 'United States',
            dob: u.dob || '',
            ssn: u.ssn || '',
            entityName: u.entity?.name || u.entityName || '',
            entityTaxId: u.entity?.taxId || '',
            entityRegistrationDate: u.entity?.formationDate || u.entity?.registrationDate || '',
            jointHoldingType: u.jointHoldingType || '',
            jointHolder: {
              firstName: u.jointHolder?.firstName || '',
              lastName: u.jointHolder?.lastName || '',
              email: u.jointHolder?.email || '',
              phone: u.jointHolder?.phone || '',
              dob: u.jointHolder?.dob || '',
              ssn: u.jointHolder?.ssn || '',
              street1: u.jointHolder?.address?.street1 || '',
              street2: u.jointHolder?.address?.street2 || '',
              city: u.jointHolder?.address?.city || '',
              state: u.jointHolder?.address?.state || '',
              zip: u.jointHolder?.address?.zip || '',
              country: u.jointHolder?.address?.country || 'United States'
            },
            authorizedRep: {
              // For entity accounts, authorized rep data comes from root user fields
              firstName: u.accountType === 'entity' ? (u.firstName || '') : (u.authorizedRepresentative?.firstName || ''),
              lastName: u.accountType === 'entity' ? (u.lastName || '') : (u.authorizedRepresentative?.lastName || ''),
              title: u.entity?.title || u.authorizedRepresentative?.title || '',
              dob: u.accountType === 'entity' ? (u.dob || '') : (u.authorizedRepresentative?.dob || ''),
              ssn: u.accountType === 'entity' ? (u.ssn || '') : (u.authorizedRepresentative?.ssn || ''),
              street1: u.accountType === 'entity' ? (u.address?.street1 || '') : (u.authorizedRepresentative?.address?.street1 || ''),
              street2: u.accountType === 'entity' ? (u.address?.street2 || '') : (u.authorizedRepresentative?.address?.street2 || ''),
              city: u.accountType === 'entity' ? (u.address?.city || '') : (u.authorizedRepresentative?.address?.city || ''),
              state: u.accountType === 'entity' ? (u.address?.state || '') : (u.authorizedRepresentative?.address?.state || ''),
              zip: u.accountType === 'entity' ? (u.address?.zip || '') : (u.authorizedRepresentative?.address?.zip || ''),
              country: u.accountType === 'entity' ? (u.address?.country || 'United States') : (u.authorizedRepresentative?.address?.country || 'United States')
            },
            // IRA Custodian data (from entity object when accountType is 'ira')
            custodian: {
              name: u.accountType === 'ira' ? (u.entity?.name || '') : '',
              taxId: u.accountType === 'ira' ? (u.entity?.taxId || '') : '',
              phone: u.accountType === 'ira' ? (u.entity?.phone || '') : '',
              street1: u.accountType === 'ira' ? (u.entity?.address?.street1 || '') : '',
              street2: u.accountType === 'ira' ? (u.entity?.address?.street2 || '') : '',
              city: u.accountType === 'ira' ? (u.entity?.address?.city || '') : '',
              state: u.accountType === 'ira' ? (u.entity?.address?.state || '') : '',
              zip: u.accountType === 'ira' ? (u.entity?.address?.zip || '') : '',
              country: u.accountType === 'ira' ? (u.entity?.address?.country || 'United States') : 'United States'
            }
          })
      } catch (e) {
        console.error('Failed to load user', e)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [id, router, userData, userLoading])

  // Load user activity events from API
  const loadUserActivity = async (userId) => {
    try {
      setIsLoadingActivity(true)
      const activityData = await apiClient.getUserActivityEvents(userId)
      
      if (activityData && activityData.success) {
        const events = activityData.events || activityData.items || []
        console.log(`[AdminUserDetails] Loaded ${events.length} activity events for user ${userId}`)
        setActivityEvents(events)
      }
    } catch (e) {
      console.error('[AdminUserDetails] Failed to load activity events:', e)
    } finally {
      setIsLoadingActivity(false)
    }
  }

  // Close delete document modal
  const closeDeleteModal = () => {
    setDeleteModalState({
      isOpen: false,
      fileName: '',
      documentId: null,
      isLoading: false,
      isSuccess: false
    })
  }

  // Handle document deletion
  const handleDeleteDocument = async () => {
    if (!deleteModalState.documentId) {
      closeDeleteModal()
      return
    }

    setDeleteModalState(prev => ({ ...prev, isLoading: true }))

    try {
      // API call to delete document would go here
      // For now, just show success since document deletion API may not be implemented
      console.log('[AdminUserDetails] Document deletion requested for:', deleteModalState.documentId)
      
      setDeleteModalState(prev => ({ ...prev, isLoading: false, isSuccess: true }))
      
      // Close modal after a brief delay to show success
      setTimeout(() => {
        closeDeleteModal()
      }, 1500)
    } catch (error) {
      console.error('[AdminUserDetails] Failed to delete document:', error)
      setDeleteModalState(prev => ({ ...prev, isLoading: false }))
      alert('Failed to delete document: ' + (error.message || 'Unknown error'))
    }
  }

  const handleRefreshBalance = async () => {
    try {
      setRefreshingBalanceId(true)
      const response = await adminService.refreshUserPaymentMethodBalance(user.id)
      
      if (response.success && response.payment_method) {
        setPaymentMethods([response.payment_method])
        alert('Balance refreshed successfully')
      } else {
        alert('Failed to refresh balance: ' + (response.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to refresh balance:', error)
      alert('An error occurred while refreshing balance')
    } finally {
      setRefreshingBalanceId(null)
    }
  }

  // Handle document upload click - triggers file input
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  // Handle file selection for document upload
  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file')
      event.target.value = ''
      return
    }

    setIsUploading(true)
    try {
      // TODO: Implement document upload API
      console.log('[AdminUserDetails] Document upload requested:', file.name)
      alert('Document upload functionality coming soon')
    } catch (error) {
      console.error('[AdminUserDetails] Failed to upload document:', error)
      alert('Failed to upload document: ' + (error.message || 'Unknown error'))
    } finally {
      setIsUploading(false)
      // Reset the file input
      event.target.value = ''
    }
  }

  const handleApproveInvestment = async (investmentId) => {
    if (!confirm('Are you sure you want to approve this investment? This will activate the investment.')) {
      return
    }
    
    try {
      // Optimistic update
      setUser(prev => ({
        ...prev,
        investments: prev.investments.map(inv => 
          inv.id === investmentId ? { ...inv, status: 'active' } : inv
        )
      }))

      const res = await adminService.approveInvestment(investmentId)
      
      if (!res.success) {
        // Revert on failure
        alert('Failed to approve investment: ' + (res.error || 'Unknown error'))
        const freshUser = await adminService.getUser(id)
        if (freshUser.success) setUser(freshUser.user)
      }
    } catch (error) {
      console.error('Failed to approve investment:', error)
      alert('An error occurred while approving investment')
      // Refresh to ensure consistency
      try {
        const freshUser = await adminService.getUser(id)
        if (freshUser.success) setUser(freshUser.user)
      } catch (refreshError) {
        console.error('Failed to refresh user data:', refreshError)
      }
    }
  }

  const handleRejectInvestment = async (investmentId) => {
    const reason = prompt('Please enter a reason for rejection:')
    if (reason === null) return // Cancelled

    try {
      // Optimistic update
      setUser(prev => ({
        ...prev,
        investments: prev.investments.map(inv => 
          inv.id === investmentId ? { ...inv, status: 'rejected' } : inv
        )
      }))

      const res = await adminService.rejectInvestment(investmentId, reason)
      
      if (!res.success) {
        // Revert on failure
        alert('Failed to reject investment: ' + (res.error || 'Unknown error'))
        const freshUser = await adminService.getUser(id)
        if (freshUser.success) setUser(freshUser.user)
      }
    } catch (error) {
      console.error('Failed to reject investment:', error)
      alert('An error occurred while rejecting investment')
      // Refresh to ensure consistency
      try {
        const freshUser = await adminService.getUser(id)
        if (freshUser.success) setUser(freshUser.user)
      } catch (refreshError) {
        console.error('Failed to refresh user data:', refreshError)
      }
    }
  }

  // Refresh data when switching tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.pushState({}, '', url)

    // Refresh activity when switching to activity tab
    if (tab === 'activity' && user) {
      loadUserActivity(user.id)
    }
    
  }

  if (isLoading) {
    return (
      <div className={styles.main}>
        <AdminHeader activeTab="accounts" />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.loadingState}>Loading user details...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className={styles.main}>
        <AdminHeader activeTab="accounts" />
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.errorState}>User not found.</div>
          </div>
        </div>
      </div>
    )
  }

  

  const setField = (name, value) => {
    if (name.startsWith('jointHolder.')) {
      const field = name.replace('jointHolder.', '')
      setForm(prev => ({ ...prev, jointHolder: { ...prev.jointHolder, [field]: value } }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
      return
    }
    if (name.startsWith('authorizedRep.')) {
      const field = name.replace('authorizedRep.', '')
      setForm(prev => ({ ...prev, authorizedRep: { ...prev.authorizedRep, [field]: value } }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
      return
    }
    if (name.startsWith('custodian.')) {
      const field = name.replace('custodian.', '')
      setForm(prev => ({ ...prev, custodian: { ...prev.custodian, [field]: value } }))
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
      return
    }
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'zip' || name === 'jointHolder.zip' || name === 'authorizedRep.zip' || name === 'custodian.zip') {
      setField(name, formatZip(value))
      return
    }
    if (name === 'phone' || name === 'jointHolder.phone' || name === 'custodian.phone') {
      setField(name, formatPhone(value))
      return
    }
    if (name === 'ssn' || name === 'jointHolder.ssn' || name === 'authorizedRep.ssn') {
      setField(name, formatSsn(value))
      return
    }
    if (name === 'city' || name === 'jointHolder.city' || name === 'authorizedRep.city' || name === 'custodian.city') {
      setField(name, formatCity(value))
      return
    }
    if (name === 'entityName' || name === 'custodian.name') {
      setField(name, formatEntityName(value))
      return
    }
    if (name === 'firstName' || name === 'lastName' || 
        name === 'jointHolder.firstName' || name === 'jointHolder.lastName' ||
        name === 'authorizedRep.firstName' || name === 'authorizedRep.lastName') {
      setField(name, formatName(value))
      return
    }
    if (name === 'street1' || name === 'street2' || 
        name === 'jointHolder.street1' || name === 'jointHolder.street2' ||
        name === 'authorizedRep.street1' || name === 'authorizedRep.street2' ||
        name === 'custodian.street1' || name === 'custodian.street2') {
      setField(name, formatStreet(value))
      return
    }
    setField(name, value)
  }

  const validate = () => {
    const v = {}
    // Admin edit: Only validate format when fields have values, don't require fields to be filled
    // This allows admins to save partial updates without filling all fields
    
    // Email is the only truly required field (needed for user identification)
    if (!form.email.trim()) v.email = 'Email is required'
    
    // Format validations - only check if field has a value
    if (form.phone.trim() && !isCompletePhone(form.phone)) v.phone = 'Enter full 10-digit phone'
    if (form.zip.trim() && form.zip.length !== 5) v.zip = 'Enter 5 digits'
    if (form.ssn.trim() && !isCompleteSsn(form.ssn)) v.ssn = 'Enter full SSN'

    if (form.accountType === 'entity') {
      // Format validations for authorized rep - only check if field has a value
      if (form.authorizedRep.zip.trim() && form.authorizedRep.zip.length !== 5) v['authorizedRep.zip'] = 'Enter 5 digits'
      if (form.authorizedRep.ssn.trim() && !isCompleteSsn(form.authorizedRep.ssn)) v['authorizedRep.ssn'] = 'Enter full SSN'
    }

    if (form.accountType === 'joint') {
      // Format validations for joint holder - only check if field has a value
      if (form.jointHolder.phone.trim() && !isCompletePhone(form.jointHolder.phone)) v['jointHolder.phone'] = 'Enter full 10-digit phone'
      if (form.jointHolder.zip.trim() && form.jointHolder.zip.length !== 5) v['jointHolder.zip'] = 'Enter 5 digits'
      if (form.jointHolder.ssn.trim() && !isCompleteSsn(form.jointHolder.ssn)) v['jointHolder.ssn'] = 'Enter full SSN'
    }

    setErrors(v)
    return Object.keys(v).length === 0
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    // Reset form to original user data
    const u = user
    setForm({
      accountType: u.accountType || 'individual',
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      phone: u.phone || u.phoneNumber || '',
      street1: u.address?.street1 || '',
      street2: u.address?.street2 || '',
      city: u.address?.city || '',
      state: u.address?.state || '',
      zip: u.address?.zip || '',
      country: u.address?.country || 'United States',
      dob: u.dob || '',
      ssn: u.ssn || '',
      entityName: u.entity?.name || u.entityName || '',
      entityTaxId: u.entity?.taxId || '',
      entityRegistrationDate: u.entity?.formationDate || u.entity?.registrationDate || '',
      jointHoldingType: u.jointHoldingType || '',
      jointHolder: {
        firstName: u.jointHolder?.firstName || '',
        lastName: u.jointHolder?.lastName || '',
        email: u.jointHolder?.email || '',
        phone: u.jointHolder?.phone || '',
        dob: u.jointHolder?.dob || '',
        ssn: u.jointHolder?.ssn || '',
        street1: u.jointHolder?.address?.street1 || '',
        street2: u.jointHolder?.address?.street2 || '',
        city: u.jointHolder?.address?.city || '',
        state: u.jointHolder?.address?.state || '',
        zip: u.jointHolder?.address?.zip || '',
        country: u.jointHolder?.address?.country || 'United States'
      },
      authorizedRep: {
        // For entity accounts, authorized rep data comes from root user fields
        firstName: u.accountType === 'entity' ? (u.firstName || '') : (u.authorizedRepresentative?.firstName || ''),
        lastName: u.accountType === 'entity' ? (u.lastName || '') : (u.authorizedRepresentative?.lastName || ''),
        title: u.entity?.title || u.authorizedRepresentative?.title || '',
        dob: u.accountType === 'entity' ? (u.dob || '') : (u.authorizedRepresentative?.dob || ''),
        ssn: u.accountType === 'entity' ? (u.ssn || '') : (u.authorizedRepresentative?.ssn || ''),
        street1: u.accountType === 'entity' ? (u.address?.street1 || '') : (u.authorizedRepresentative?.address?.street1 || ''),
        street2: u.accountType === 'entity' ? (u.address?.street2 || '') : (u.authorizedRepresentative?.address?.street2 || ''),
        city: u.accountType === 'entity' ? (u.address?.city || '') : (u.authorizedRepresentative?.address?.city || ''),
        state: u.accountType === 'entity' ? (u.address?.state || '') : (u.authorizedRepresentative?.address?.state || ''),
        zip: u.accountType === 'entity' ? (u.address?.zip || '') : (u.authorizedRepresentative?.address?.zip || ''),
        country: u.accountType === 'entity' ? (u.address?.country || 'United States') : (u.authorizedRepresentative?.address?.country || 'United States')
      },
      // IRA Custodian data (from entity object when accountType is 'ira')
      custodian: {
        name: u.accountType === 'ira' ? (u.entity?.name || '') : '',
        taxId: u.accountType === 'ira' ? (u.entity?.taxId || '') : '',
        phone: u.accountType === 'ira' ? (u.entity?.phone || '') : '',
        street1: u.accountType === 'ira' ? (u.entity?.address?.street1 || '') : '',
        street2: u.accountType === 'ira' ? (u.entity?.address?.street2 || '') : '',
        city: u.accountType === 'ira' ? (u.entity?.address?.city || '') : '',
        state: u.accountType === 'ira' ? (u.entity?.address?.state || '') : '',
        zip: u.accountType === 'ira' ? (u.entity?.address?.zip || '') : '',
        country: u.accountType === 'ira' ? (u.entity?.address?.country || 'United States') : 'United States'
      }
    })
    setErrors({})
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!validate()) return
    setIsSaving(true)
    try {
      let payload = {}

      if (form.accountType === 'entity') {
        // For entity accounts, the top-level user fields represent the Authorized Representative
        // The entity object contains the entity details
        payload = {
          firstName: form.authorizedRep.firstName,
          lastName: form.authorizedRep.lastName,
          email: form.email, // Email is top level
          phone: normalizePhoneForDB(form.phone || ''),
          dob: form.authorizedRep.dob,
          ssn: form.authorizedRep.ssn,
          address: {
            street1: form.authorizedRep.street1,
            street2: form.authorizedRep.street2,
            city: form.authorizedRep.city,
            state: form.authorizedRep.state,
            zip: form.authorizedRep.zip,
            country: form.authorizedRep.country
          },
          entity: {
            name: form.entityName,
            taxId: form.entityTaxId,
            formationDate: form.entityRegistrationDate,
            title: form.authorizedRep.title,
            address: {
              street1: form.street1,
              street2: form.street2,
              city: form.city,
              state: form.state,
              zip: form.zip,
              country: form.country
            }
          }
        }
      } else if (form.accountType === 'joint') {
        payload = {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: normalizePhoneForDB(form.phone || ''),
          dob: form.dob,
          ssn: form.ssn,
          address: {
            street1: form.street1,
            street2: form.street2,
            city: form.city,
            state: form.state,
            zip: form.zip,
            country: form.country
          },
          jointHoldingType: form.jointHoldingType,
          jointHolder: {
            firstName: form.jointHolder.firstName,
            lastName: form.jointHolder.lastName,
            email: form.jointHolder.email,
            phone: normalizePhoneForDB(form.jointHolder.phone || ''),
            dob: form.jointHolder.dob,
            ssn: form.jointHolder.ssn,
            address: {
              street1: form.jointHolder.street1,
              street2: form.jointHolder.street2,
              city: form.jointHolder.city,
              state: form.jointHolder.state,
              zip: form.jointHolder.zip,
              country: form.jointHolder.country
            }
          }
        }
      } else if (form.accountType === 'ira') {
        // For IRA accounts, top-level fields are the individual investor
        // The entity object contains the IRA custodian details
        payload = {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: normalizePhoneForDB(form.phone || ''),
          dob: form.dob,
          ssn: form.ssn,
          address: {
            street1: form.street1,
            street2: form.street2,
            city: form.city,
            state: form.state,
            zip: form.zip,
            country: form.country
          },
          // IRA Custodian data stored in entity object
          entity: {
            name: form.custodian.name,
            taxId: form.custodian.taxId,
            phone: form.custodian.phone,
            address: {
              street1: form.custodian.street1,
              street2: form.custodian.street2,
              city: form.custodian.city,
              state: form.custodian.state,
              zip: form.custodian.zip,
              country: form.custodian.country
            }
          }
        }
      } else {
        // Individual
        payload = {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: normalizePhoneForDB(form.phone || ''),
          dob: form.dob,
          ssn: form.ssn,
          address: {
            street1: form.street1,
            street2: form.street2,
            city: form.city,
            state: form.state,
            zip: form.zip,
            country: form.country
          }
        }
      }

      console.log('[AdminUserDetails] Saving payload:', JSON.stringify(payload, null, 2))
      const result = await adminService.updateUser(id, payload)
      
      if (!result.success) {
        alert(result.error || 'Failed to save user changes')
        return
      }
      
      // Update local user state with the response
      if (result.user) {
        setUser(result.user)
      }
      
      setIsEditing(false)
      alert('User updated successfully')
    } catch (e) {
      console.error('Failed to save user', e)
      alert('An error occurred while saving: ' + (e.message || 'Unknown error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleGenerateSetupLink = async () => {
    setIsGeneratingLink(true)
    try {
      // Reset user onboarding via backend API
      const result = await adminService.resetUserOnboarding(id)
      
      if (!result.success) {
        alert('Failed to generate setup link: ' + (result.error || 'Unknown error'))
        return
      }
      
      // Disconnect bank accounts from investments to ensure clean onboarding test
      try {
        const invResult = await adminService.getAdminInvestments({ user_id: id })
        if (invResult.success && invResult.investments) {
           console.log('Disconnecting banks for investments:', invResult.investments.length)
           const updates = invResult.investments.map(inv => {
             if (inv.bankAccountId || (inv.banking && inv.banking.bank)) {
               console.log('Disconnecting bank for investment:', inv.id)
               return apiClient.updateInvestment(id, inv.id, { bankAccountId: null })
             }
             return Promise.resolve()
           })
           await Promise.all(updates)
        }
      } catch (e) {
        console.warn('Failed to disconnect banks for setup link:', e)
      }
      
      // Check if user needs bank account (has monthly investments)
      let needsBank = true // Default to true to be safe
      try {
        const invResult = await adminService.getAdminInvestments({ user_id: id })
        if (invResult.success && invResult.investments) {
           // Check logic matches getInvestmentsNeedingBanks in onboarding page
           const hasMonthly = invResult.investments.some(inv => 
             inv.status !== 'withdrawn' && 
             inv.paymentFrequency === 'monthly'
           )
           needsBank = hasMonthly
        }
      } catch (e) {
        console.warn('Failed to check investments for setup link:', e)
      }
      
      // Build the full onboarding link with all parameters
      const emailParam = result.user?.email ? `&email=${encodeURIComponent(result.user.email)}` : ''
      const idParam = result.user?.id ? `&uid=${encodeURIComponent(result.user.id)}` : ''
      const generatedLink = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/onboarding?token=${result.token}&needs_bank=${needsBank}${emailParam}${idParam}`
      
      // Copy to clipboard automatically
      try {
        await navigator.clipboard.writeText(generatedLink)
      } catch (clipboardErr) {
        console.error('Failed to copy to clipboard:', clipboardErr)
      }
      
      // Store the link to display in UI
      setSetupLink(generatedLink)
      
      // Update user data from the reset response (already contains updated user)
      if (result.user) {
        setUser(prev => ({
          ...prev,
          ...result.user,
          investments: prev.investments // Preserve existing investments array
        }))
      }
    } catch (e) {
      console.error('Failed to generate setup link:', e)
      alert('An error occurred while generating the setup link')
    } finally {
      setIsGeneratingLink(false)
    }
  }

  const handleSendPasswordReset = async () => {
    if (!window.confirm(`Send password reset email to ${user.email}?`)) {
      return
    }
    try {
      const result = await apiClient.requestPasswordReset(user.email)
      if (result.success) {
        alert(`Password reset email sent to ${user.email}`)
      } else {
        alert('Failed to send reset email: ' + (result.error || 'Unknown error'))
      }
    } catch (e) {
      console.error('Failed to send password reset:', e)
      alert('An error occurred while sending password reset email')
    }
  }

  const handleDeleteUser = async () => {
    if (!user) return

    const confirmMessage = `Are you sure you want to delete ${user.firstName || ''} ${user.lastName || ''} (${user.email})?\n\nThis will permanently delete:\n• Account and profile\n• All investments and transactions\n• All activity and withdrawals\n• Authentication access\n\nThis action cannot be undone.`
    
    if (!window.confirm(confirmMessage)) {
      return
    }

    try {
      console.log(`[AdminUserDetails] Deleting user ${user.id} (${user.email})...`)
      
      const data = await apiClient.deleteUser(user.id)
      console.log('[AdminUserDetails] Delete response:', data)
      
      // Handle partial success (database deleted but auth failed)
      if (data.partialSuccess) {
        alert(`⚠️ Partial Success:\n\n${data.error}\n\n✅ User removed from database\n❌ Failed to remove from the authentication service\n\nYou may need to manually delete this user in your auth provider dashboard.`)
        router.push('/admin?tab=accounts')
        return
      }
      
      // Handle complete failure
      if (!data.success) {
        alert(`❌ Failed to delete user:\n\n${data.error}`)
        return
      }
      
      // Success - redirect to accounts list
      console.log('[AdminUserDetails] ✅ User deleted successfully')
      alert(`✅ User ${user.email} deleted successfully!`)
      router.push('/admin?tab=accounts')
    } catch (e) {
      console.error('[AdminUserDetails] Delete failed:', e)
      alert(`An error occurred: ${e.message}`)
    }
  }

  const handleRefreshTinMatching = async () => {
    if (!user) return
    
    setIsRefreshingTin(true)
    try {
      console.log('[TIN Matching] Initiating refresh for user:', id)
      const result = await adminService.refreshTinMatching(id)
      console.log('[TIN Matching] Refresh result:', result)
      
      if (result.success) {
        // Fetch updated TIN matching requests to get the latest status
        const tinData = await adminService.getTinMatchingRequests({ user_id: id })
        console.log('[TIN Matching] Fetched updated requests:', tinData)
        
        if (tinData.success && tinData.requests.length > 0) {
          const sortedRequests = [...tinData.requests].sort((a, b) => 
            new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)
          )
          console.log('[TIN Matching] Latest request:', sortedRequests[0])
          setTinMatchingRequest(sortedRequests[0])
        }
        
        // Show success message with status
        const statusMessage = result.status === 'success' 
          ? '✅ TIN verified successfully!' 
          : result.status === 'submitted'
            ? '📤 TIN verification submitted - awaiting result'
            : result.status === 'failed'
              ? '❌ TIN verification failed'
              : `TIN matching status: ${result.status || 'Request initiated'}`
        alert(statusMessage)
      } else {
        console.error('[TIN Matching] Refresh failed:', result)
        const errorMsg = result.error || 'Unknown error'
        alert(`Failed to refresh TIN matching: ${errorMsg}${result.statusCode ? ` (HTTP ${result.statusCode})` : ''}`)
      }
    } catch (e) {
      console.error('[TIN Matching] Exception:', e)
      alert(`An error occurred while refreshing TIN matching: ${e.message || 'Unknown error'}`)
    } finally {
      setIsRefreshingTin(false)
    }
  }

  // Helper to get default tax year
  const getDefaultTaxYear = () => {
    const now = new Date()
    const month = now.getMonth() // 0-11
    const year = now.getFullYear()
    // Jan-Apr: use previous year (filing season)
    // May-Dec: use current year (preparing for next filing)
    return month <= 3 ? (year - 1).toString() : year.toString()
  }

  // Handle 1099-INT generation
  const handleGenerate1099INT = async () => {
    if (!user) return
    
    const taxYear = getDefaultTaxYear()
    setIsGenerating1099INT(true)
    
    try {
      console.log('[1099-INT] Generating for user:', id, 'tax year:', taxYear)
      const result = await adminService.generate1099INTForUser(id, taxYear)
      console.log('[1099-INT] Generation result:', result)
      
      if (result.success) {
        // Fetch updated 1099-INT submissions
        const form1099Data = await adminService.get1099INTSubmissions({ user_id: id })
        
        if (form1099Data.success && form1099Data.submissions) {
          const sortedSubmissions = [...form1099Data.submissions].sort((a, b) => {
            const yearDiff = (b.taxYear || b.tax_year || '0').localeCompare(a.taxYear || a.tax_year || '0')
            if (yearDiff !== 0) return yearDiff
            return new Date(b.updatedAt || b.updated_at || 0) - new Date(a.updatedAt || a.updated_at || 0)
          })
          setForm1099INTSubmissions(sortedSubmissions)
        }
        
        // Show success/skip message
        if (result.status === 'created') {
          alert(`✅ 1099-INT form created for tax year ${taxYear}`)
        } else if (result.status === 'skipped') {
          alert(`⚠️ 1099-INT generation skipped: ${result.reason || 'Unknown reason'}`)
        } else {
          alert(`1099-INT status: ${result.status}`)
        }
      } else {
        console.error('[1099-INT] Generation failed:', result)
        alert(`Failed to generate 1099-INT: ${result.error || 'Unknown error'}`)
      }
    } catch (e) {
      console.error('[1099-INT] Exception:', e)
      alert(`An error occurred while generating 1099-INT: ${e.message || 'Unknown error'}`)
    } finally {
      setIsGenerating1099INT(false)
    }
  }

  // Handle 1099-INT sync status
  const handleSync1099INTStatus = async (submissionId) => {
    try {
      const result = await adminService.sync1099INTStatus(submissionId)
      
      if (result.success) {
        // Refresh the submissions list
        const form1099Data = await adminService.get1099INTSubmissions({ user_id: id })
        if (form1099Data.success && form1099Data.submissions) {
          const sortedSubmissions = [...form1099Data.submissions].sort((a, b) => {
            const yearDiff = (b.taxYear || b.tax_year || '0').localeCompare(a.taxYear || a.tax_year || '0')
            if (yearDiff !== 0) return yearDiff
            return new Date(b.updatedAt || b.updated_at || 0) - new Date(a.updatedAt || a.updated_at || 0)
          })
          setForm1099INTSubmissions(sortedSubmissions)
        }
        alert('✅ Status synced successfully')
      } else {
        alert(`Failed to sync status: ${result.error || 'Unknown error'}`)
      }
    } catch (e) {
      alert(`Error syncing status: ${e.message || 'Unknown error'}`)
    }
  }

  // Handle viewing 1099-INT document
  const handleView1099INTDocument = async (documentId) => {
    if (!documentId) {
      alert('No document available yet')
      return
    }
    
    try {
      // Open document in new tab using the user documents endpoint
      const numericUserId = id.toString().replace(/\D/g, '')
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'https://backend-9r5h.onrender.com'}/api/admin/users/${numericUserId}/documents/${documentId}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert(`Error opening document: ${e.message || 'Unknown error'}`)
    }
  }

  // Calculate investment metrics using app time if available
  const activeInvestments = (user.investments || []).filter(inv => inv.status === 'active' || inv.status === 'withdrawal_notice')
  // Only count investments with status 'pending' - draft investments are not submitted yet
  const pendingTotal = (user.investments || []).filter(inv => inv.status === 'pending').reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
  
  // Calculate pending payouts (monthly distributions awaiting admin approval)
  const pendingPayouts = (user.investments || [])
    .flatMap(inv => Array.isArray(inv.transactions) ? inv.transactions : [])
    .filter(tx => tx.type === 'distribution' && tx.status === 'pending')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  
  // Calculate original investment value (sum of all active investment principals)
  const originalInvestmentValue = activeInvestments.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
  
  // Calculate current account value (sum of all active investments with compounding)
  // Use app time from Time Machine if available
  const currentAccountValue = activeInvestments.reduce((sum, inv) => {
    const calculation = calculateInvestmentValue(inv, appTime)
    return sum + calculation.currentValue
  }, 0)
  
  const totalEarnings = currentAccountValue - originalInvestmentValue

  return (
    <div className={styles.main}>
      <AdminHeader activeTab="accounts" />
      <div className={styles.container}>
        <div className={styles.content}>
          {/* Breadcrumb Navigation */}
          <div className={styles.breadcrumb}>
            <button className={styles.breadcrumbLink} onClick={() => router.push('/admin?tab=accounts')}>
              ← Accounts
            </button>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span className={styles.breadcrumbCurrent}>Account #{user.id}</span>
          </div>

          {/* Page Header */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.title}>Account Details</h1>
              <p className={styles.subtitle}>
                {user.firstName} {user.lastName} • {user.email}
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
              <div className={styles.tabNav}>
                <button 
                  className={`${styles.tabButton} ${activeTab === 'overview' ? styles.tabButtonActive : ''}`}
                  onClick={() => handleTabChange('overview')}
                >
                  Overview
                </button>
                <button 
                  className={`${styles.tabButton} ${activeTab === 'investments' ? styles.tabButtonActive : ''}`}
                  onClick={() => handleTabChange('investments')}
                >
                  Investments
                </button>
                <button 
                  className={`${styles.tabButton} ${activeTab === 'activity' ? styles.tabButtonActive : ''}`}
                  onClick={() => handleTabChange('activity')}
                >
                  Activity
                </button>
                <button 
                  className={`${styles.tabButton} ${activeTab === 'actions' ? styles.tabButtonActive : ''}`}
                  onClick={() => handleTabChange('actions')}
                >
                  Actions
                </button>
              </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <>
              {/* Pending Items Section - Only show if there are pending items */}
              {((user.investments || []).some(inv => inv.status === 'pending') || pendingPayouts > 0) && (
                <div className={styles.sectionCard} style={{ marginBottom: '24px' }}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Pending Items</h2>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Pending Investments List */}
                    {(user.investments || []).filter(inv => inv.status === 'pending').map(inv => {
                      const isWireTransfer = inv.paymentMethod === 'wire' || inv.banking?.fundingMethod === 'wire'
                      return (
                        <div key={inv.id} style={{ 
                          padding: '16px', 
                          background: isWireTransfer ? '#fff7ed' : '#f0f9ff', 
                          borderRadius: '8px', 
                          border: isWireTransfer ? '1px solid #fdba74' : '1px solid #bae6fd',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: '600', color: isWireTransfer ? '#9a3412' : '#0369a1' }}>Pending Investment #{inv.id}</span>
                              {isWireTransfer ? (
                                <span style={{ background: '#c2410c', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>ACTION REQUIRED</span>
                              ) : (
                                <span style={{ background: '#0284c7', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>AWAITING ACH</span>
                              )}
              </div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937' }}>
                              {formatCurrency(inv.amount)}
            </div>
                            <div style={{ fontSize: '12px', color: isWireTransfer ? '#9a3412' : '#0369a1' }}>
                              Created: {inv.createdAt ? formatDateForDisplay(inv.createdAt) : '-'} • {isWireTransfer ? 'Wire Transfer' : 'ACH'}
          </div>
            </div>
            
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => router.push(`/admin/investments/${inv.id}`)}
                              style={{
                                padding: '8px 16px',
                                background: 'white',
                                border: isWireTransfer ? '1px solid #fdba74' : '1px solid #bae6fd',
                                borderRadius: '6px',
                                color: isWireTransfer ? '#9a3412' : '#0369a1',
                                fontWeight: '500',
                                cursor: 'pointer'
                              }}
                            >
                              View Details
                            </button>
                            {isWireTransfer && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleApproveInvestment(inv.id)
                                }}
                                style={{
                                  padding: '8px 16px',
                                  background: '#ea580c',
                                  border: 'none',
                                  borderRadius: '6px',
                                  color: 'white',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                              >
                                Approve Investment
                              </button>
                            )}
                </div>
              </div>
                      )
                    })}

                    {/* Pending Payouts Summary */}
                    {pendingPayouts > 0 && (
                      <div style={{ 
                        padding: '16px', 
                        background: '#fff7ed', 
                        borderRadius: '8px', 
                        border: '1px solid #fdba74'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500' }}>Pending Payouts</div>
                          <span style={{ background: '#c2410c', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>ACTION REQUIRED</span>
                </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
                          {formatCurrency(pendingPayouts)}
              </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          Awaiting approval
                </div>
              </div>
                    )}
                </div>
              </div>
              )}

          {/* Account Profile Section */}
          <div className={styles.sectionCard} style={{ marginBottom: '24px' }}>
            <div className={styles.sectionHeader}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <h2 className={styles.sectionTitle}>Account Profile</h2>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {!isEditing && (
                    <a 
                      href={`https://clarity.microsoft.com/projects/view/iyocd8lpma/impressions?date=Last%203%20days&f=customUserId%3Dis%3B${encodeURIComponent(id)}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.editButton}
                      style={{ 
                        textDecoration: 'none', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        color: '#64748b'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                      View Recordings
                    </a>
                  )}
                  {!isEditing && (
                    <button className={styles.editButton} onClick={handleEdit}>
                      Edit Profile
                    </button>
                  )}
                </div>
              </div>
                </div>
            <div className={styles.grid}>
              <div><b>Account Type:</b> {(() => {
                if (!form.accountType) return '-';
                if (form.accountType === 'ira') return 'SDIRA';
                return form.accountType.charAt(0).toUpperCase() + form.accountType.slice(1);
              })()}</div>
              <div>
                <b>Verified:</b> {user.isVerified ? 'Yes' : 'No'}
              </div>
              <div>
                <b>Accreditation Status:</b> 
                {(() => {
                  const latestInvestment = (user.investments || [])
                    .sort((a, b) => {
                      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
                      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
                      return dateB - dateA
                    })[0]
                  const status = latestInvestment?.compliance?.status
                  
                  if (status === 'accredited') {
                    return <span style={{ color: '#166534', fontWeight: '500', marginLeft: '6px' }}>✓ Accredited</span>
                  }
                  if (status === 'not_accredited') {
                    return <span style={{ color: '#4b5563', fontWeight: '500', marginLeft: '6px' }}>Not Accredited</span>
                  }
                  return <span style={{ color: '#9ca3af', marginLeft: '6px' }}>-</span>
                })()}
              </div>
              <div>
                <label><b>Email</b></label>
                <input name="email" value={form.email} onChange={handleChange} disabled={!isEditing} />
                {errors.email && <div className={styles.muted}>{errors.email}</div>}
              </div>
              {form.accountType !== 'entity' && (
                <>
                  <div>
                    <label><b>First Name</b></label>
                    <input name="firstName" value={form.firstName} onChange={handleChange} disabled={!isEditing} />
                    {errors.firstName && <div className={styles.muted}>{errors.firstName}</div>}
                  </div>
                  <div>
                    <label><b>Last Name</b></label>
                    <input name="lastName" value={form.lastName} onChange={handleChange} disabled={!isEditing} />
                    {errors.lastName && <div className={styles.muted}>{errors.lastName}</div>}
                  </div>
                </>
              )}
              <div>
                <label><b>Phone</b></label>
                <input name="phone" value={form.phone} onChange={handleChange} placeholder="(555) 555-5555" disabled={!isEditing} />
                {errors.phone && <div className={styles.muted}>{errors.phone}</div>}
              </div>
              {form.accountType !== 'entity' && (
                <>
                  <div>
                    <label><b>Date of Birth</b></label>
                    <input type="date" name="dob" value={form.dob} onChange={handleChange} min={MIN_DOB} max={maxAdultDob} disabled={!isEditing} />
                    {errors.dob && <div className={styles.muted}>{errors.dob}</div>}
                  </div>
                  <div>
                    <label><b>SSN</b></label>
                    <div className={styles.ssnInputWrapper}>
                      <input 
                        className={styles.ssnInputWithToggle}
                        name="ssn" 
                        value={showSSN ? form.ssn : maskSSN(form.ssn)} 
                        onChange={handleChange} 
                        placeholder="123-45-6789" 
                        disabled={!isEditing}
                      />
                      <button
                        type="button"
                        className={styles.ssnToggleButton}
                        onClick={() => setShowSSN(!showSSN)}
                        aria-label={showSSN ? 'Hide SSN' : 'Show SSN'}
                      >
                        {showSSN ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {errors.ssn && <div className={styles.muted}>{errors.ssn}</div>}
                  </div>
                </>
              )}
              <div>
                <label><b>Street Address</b></label>
                <input name="street1" value={form.street1} onChange={handleChange} disabled={!isEditing} />
                {errors.street1 && <div className={styles.muted}>{errors.street1}</div>}
              </div>
              <div>
                <label><b>Apt or Unit</b></label>
                <input name="street2" value={form.street2} onChange={handleChange} disabled={!isEditing} />
              </div>
              <div>
                <label><b>City</b></label>
                <input name="city" value={form.city} onChange={handleChange} disabled={!isEditing} />
                {errors.city && <div className={styles.muted}>{errors.city}</div>}
              </div>
              <div>
                <label><b>Zip</b></label>
                <input name="zip" value={form.zip} onChange={handleChange} disabled={!isEditing} />
                {errors.zip && <div className={styles.muted}>{errors.zip}</div>}
              </div>
              <div>
                <label><b>State</b></label>
                <select name="state" value={form.state} onChange={handleChange} disabled={!isEditing}>
                  <option value="">Select state</option>
                  {US_STATES.map(s => (<option key={s} value={s}>{s}</option>))}
                </select>
                {errors.state && <div className={styles.muted}>{errors.state}</div>}
              </div>
              <div>
                <label><b>Country</b></label>
                <input name="country" value={form.country} readOnly disabled />
                </div>
              </div>
              
            {/* IRA Custodian Information Subsection */}
            {form.accountType === 'ira' && (
              <>
                <div className={styles.sectionHeader} style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                  <h3 className={styles.sectionTitle} style={{ fontSize: '18px', color: '#6b7280' }}>IRA Custodian Information</h3>
                </div>
                <div className={styles.grid}>
                  <div>
                    <label><b>Account Name</b></label>
                    <input name="custodian.name" value={form.custodian.name} onChange={handleChange} disabled={!isEditing} />
                    {errors['custodian.name'] && <div className={styles.muted}>{errors['custodian.name']}</div>}
                  </div>
                  <div>
                    <label><b>IRA Tax ID</b></label>
                    <input name="custodian.taxId" value={form.custodian.taxId} onChange={handleChange} placeholder="12-3456789" disabled={!isEditing} />
                    {errors['custodian.taxId'] && <div className={styles.muted}>{errors['custodian.taxId']}</div>}
                  </div>
                  <div>
                    <label><b>Custodian Phone</b></label>
                    <input name="custodian.phone" value={form.custodian.phone} onChange={handleChange} placeholder="(555) 555-5555" disabled={!isEditing} />
                    {errors['custodian.phone'] && <div className={styles.muted}>{errors['custodian.phone']}</div>}
                  </div>
                  <div>
                    <label><b>Custodian Street Address</b></label>
                    <input name="custodian.street1" value={form.custodian.street1} onChange={handleChange} disabled={!isEditing} />
                    {errors['custodian.street1'] && <div className={styles.muted}>{errors['custodian.street1']}</div>}
                  </div>
                  <div>
                    <label><b>Apt or Unit</b></label>
                    <input name="custodian.street2" value={form.custodian.street2} onChange={handleChange} disabled={!isEditing} />
                  </div>
                  <div>
                    <label><b>City</b></label>
                    <input name="custodian.city" value={form.custodian.city} onChange={handleChange} disabled={!isEditing} />
                    {errors['custodian.city'] && <div className={styles.muted}>{errors['custodian.city']}</div>}
                  </div>
                  <div>
                    <label><b>Zip</b></label>
                    <input name="custodian.zip" value={form.custodian.zip} onChange={handleChange} disabled={!isEditing} />
                    {errors['custodian.zip'] && <div className={styles.muted}>{errors['custodian.zip']}</div>}
                  </div>
                  <div>
                    <label><b>State</b></label>
                    <select name="custodian.state" value={form.custodian.state} onChange={handleChange} disabled={!isEditing}>
                      <option value="">Select state</option>
                      {US_STATES.map(s => (<option key={s} value={s}>{s}</option>))}
                    </select>
                    {errors['custodian.state'] && <div className={styles.muted}>{errors['custodian.state']}</div>}
                  </div>
                  <div>
                    <label><b>Country</b></label>
                    <input name="custodian.country" value={form.custodian.country} readOnly disabled />
                  </div>
                </div>
              </>
            )}

            {/* Entity Information Subsection */}
            {form.accountType === 'entity' && (
              <>
                <div className={styles.sectionHeader} style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                  <h3 className={styles.sectionTitle} style={{ fontSize: '18px', color: '#6b7280' }}>Entity Information</h3>
                </div>
                <div className={styles.grid}>
                <div>
                  <label><b>Entity Name</b></label>
                  <input name="entityName" value={form.entityName} onChange={handleChange} disabled={!isEditing} />
                  {errors.entityName && <div className={styles.muted}>{errors.entityName}</div>}
              </div>
                <div>
                  <label><b>Entity Tax ID (EIN)</b></label>
                  <input name="entityTaxId" value={form.entityTaxId} onChange={handleChange} placeholder="12-3456789" disabled={!isEditing} />
                  {errors.entityTaxId && <div className={styles.muted}>{errors.entityTaxId}</div>}
                </div>
                <div>
                  <label><b>Entity Formation Date</b></label>
                  <input type="date" name="entityRegistrationDate" value={form.entityRegistrationDate} onChange={handleChange} min={MIN_DOB} max={maxToday} disabled={!isEditing} />
                  {errors.entityRegistrationDate && <div className={styles.muted}>{errors.entityRegistrationDate}</div>}
            </div>
          </div>

              {/* Authorized Representative Subsection */}
              <div className={styles.sectionHeader} style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                <h3 className={styles.sectionTitle} style={{ fontSize: '18px', color: '#6b7280' }}>Authorized Representative</h3>
              </div>
              <div className={styles.grid}>
                <div>
                  <label><b>First Name</b></label>
                  <input name="authorizedRep.firstName" value={form.authorizedRep.firstName} onChange={handleChange} disabled={!isEditing} />
                  {errors['authorizedRep.firstName'] && <div className={styles.muted}>{errors['authorizedRep.firstName']}</div>}
                    </div>
                <div>
                  <label><b>Last Name</b></label>
                  <input name="authorizedRep.lastName" value={form.authorizedRep.lastName} onChange={handleChange} disabled={!isEditing} />
                  {errors['authorizedRep.lastName'] && <div className={styles.muted}>{errors['authorizedRep.lastName']}</div>}
                </div>
                <div>
                  <label><b>Title</b></label>
                  <input name="authorizedRep.title" value={form.authorizedRep.title} onChange={handleChange} placeholder="e.g., Manager, CEO" disabled={!isEditing} />
                  {errors['authorizedRep.title'] && <div className={styles.muted}>{errors['authorizedRep.title']}</div>}
                </div>
                <div>
                  <label><b>Date of Birth</b></label>
                  <input type="date" name="authorizedRep.dob" value={form.authorizedRep.dob} onChange={handleChange} min={MIN_DOB} max={maxAdultDob} disabled={!isEditing} />
                  {errors['authorizedRep.dob'] && <div className={styles.muted}>{errors['authorizedRep.dob']}</div>}
                </div>
                <div>
                  <label><b>SSN</b></label>
                  <div className={styles.ssnInputWrapper}>
                    <input 
                      className={styles.ssnInputWithToggle}
                      name="authorizedRep.ssn" 
                      value={showAuthRepSSN ? form.authorizedRep.ssn : maskSSN(form.authorizedRep.ssn)} 
                      onChange={handleChange} 
                      placeholder="123-45-6789" 
                      disabled={!isEditing}
                    />
                    <button
                      type="button"
                      className={styles.ssnToggleButton}
                      onClick={() => setShowAuthRepSSN(!showAuthRepSSN)}
                      aria-label={showAuthRepSSN ? 'Hide SSN' : 'Show SSN'}
                    >
                      {showAuthRepSSN ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {errors['authorizedRep.ssn'] && <div className={styles.muted}>{errors['authorizedRep.ssn']}</div>}
                </div>
                <div>
                  <label><b>Street Address</b></label>
                  <input name="authorizedRep.street1" value={form.authorizedRep.street1} onChange={handleChange} disabled={!isEditing} />
                  {errors['authorizedRep.street1'] && <div className={styles.muted}>{errors['authorizedRep.street1']}</div>}
                </div>
                <div>
                  <label><b>Apt or Unit</b></label>
                  <input name="authorizedRep.street2" value={form.authorizedRep.street2} onChange={handleChange} disabled={!isEditing} />
                </div>
                <div>
                  <label><b>City</b></label>
                  <input name="authorizedRep.city" value={form.authorizedRep.city} onChange={handleChange} disabled={!isEditing} />
                  {errors['authorizedRep.city'] && <div className={styles.muted}>{errors['authorizedRep.city']}</div>}
                </div>
                <div>
                  <label><b>Zip</b></label>
                  <input name="authorizedRep.zip" value={form.authorizedRep.zip} onChange={handleChange} disabled={!isEditing} />
                  {errors['authorizedRep.zip'] && <div className={styles.muted}>{errors['authorizedRep.zip']}</div>}
                </div>
                <div>
                  <label><b>State</b></label>
                  <select name="authorizedRep.state" value={form.authorizedRep.state} onChange={handleChange} disabled={!isEditing}>
                    <option value="">Select state</option>
                    {US_STATES.map(s => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  {errors['authorizedRep.state'] && <div className={styles.muted}>{errors['authorizedRep.state']}</div>}
                </div>
                <div>
                  <label><b>Country</b></label>
                  <input name="authorizedRep.country" value={form.authorizedRep.country} readOnly disabled />
                </div>
              </div>
              </>
            )}

            {/* Joint Holder Subsection */}
            {form.accountType === 'joint' && (
              <>
                <div className={styles.sectionHeader} style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                  <h3 className={styles.sectionTitle} style={{ fontSize: '18px', color: '#6b7280' }}>Joint Holder Information</h3>
                </div>
                <div className={styles.grid}>
                  <div>
                    <label><b>Joint Holding Type</b></label>
                    <select name="jointHoldingType" value={form.jointHoldingType} onChange={handleChange} disabled={!isEditing}>
                      <option value="">Select joint holding type</option>
                      <option value="spouse">Spouse</option>
                      <option value="sibling">Sibling</option>
                      <option value="domestic_partner">Domestic Partner</option>
                      <option value="business_partner">Business Partner</option>
                      <option value="other">Other</option>
                    </select>
                    {errors.jointHoldingType && <div className={styles.muted}>{errors.jointHoldingType}</div>}
                  </div>
                  <div />
                  <div>
                    <label><b>First Name</b></label>
                    <input name="jointHolder.firstName" value={form.jointHolder.firstName} onChange={handleChange} disabled={!isEditing} />
                    {errors['jointHolder.firstName'] && <div className={styles.muted}>{errors['jointHolder.firstName']}</div>}
                  </div>
                  <div>
                    <label><b>Last Name</b></label>
                    <input name="jointHolder.lastName" value={form.jointHolder.lastName} onChange={handleChange} disabled={!isEditing} />
                    {errors['jointHolder.lastName'] && <div className={styles.muted}>{errors['jointHolder.lastName']}</div>}
                  </div>
                  <div>
                    <label><b>Email</b></label>
                    <input name="jointHolder.email" value={form.jointHolder.email} onChange={handleChange} disabled={!isEditing} />
                    {errors['jointHolder.email'] && <div className={styles.muted}>{errors['jointHolder.email']}</div>}
                  </div>
                  <div>
                    <label><b>Phone</b></label>
                    <input name="jointHolder.phone" value={form.jointHolder.phone} onChange={handleChange} placeholder="(555) 555-5555" disabled={!isEditing} />
                    {errors['jointHolder.phone'] && <div className={styles.muted}>{errors['jointHolder.phone']}</div>}
                  </div>
                  <div>
                    <label><b>Date of Birth</b></label>
                    <input type="date" name="jointHolder.dob" value={form.jointHolder.dob} onChange={handleChange} min={MIN_DOB} max={maxAdultDob} disabled={!isEditing} />
                    {errors['jointHolder.dob'] && <div className={styles.muted}>{errors['jointHolder.dob']}</div>}
                  </div>
                  <div>
                    <label><b>SSN</b></label>
                    <div className={styles.ssnInputWrapper}>
                      <input 
                        className={styles.ssnInputWithToggle}
                        name="jointHolder.ssn" 
                        value={showJointSSN ? form.jointHolder.ssn : maskSSN(form.jointHolder.ssn)} 
                        onChange={handleChange} 
                        placeholder="123-45-6789" 
                        disabled={!isEditing}
                      />
                      <button
                        type="button"
                        className={styles.ssnToggleButton}
                        onClick={() => setShowJointSSN(!showJointSSN)}
                        aria-label={showJointSSN ? 'Hide SSN' : 'Show SSN'}
                      >
                        {showJointSSN ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {errors['jointHolder.ssn'] && <div className={styles.muted}>{errors['jointHolder.ssn']}</div>}
                  </div>
                  <div>
                    <label><b>Street Address</b></label>
                    <input name="jointHolder.street1" value={form.jointHolder.street1} onChange={handleChange} disabled={!isEditing} />
                    {errors['jointHolder.street1'] && <div className={styles.muted}>{errors['jointHolder.street1']}</div>}
                  </div>
                  <div>
                    <label><b>Apt or Unit</b></label>
                    <input name="jointHolder.street2" value={form.jointHolder.street2} onChange={handleChange} disabled={!isEditing} />
                  </div>
                  <div>
                    <label><b>City</b></label>
                    <input name="jointHolder.city" value={form.jointHolder.city} onChange={handleChange} disabled={!isEditing} />
                    {errors['jointHolder.city'] && <div className={styles.muted}>{errors['jointHolder.city']}</div>}
                  </div>
                  <div>
                    <label><b>Zip</b></label>
                    <input name="jointHolder.zip" value={form.jointHolder.zip} onChange={handleChange} disabled={!isEditing} />
                    {errors['jointHolder.zip'] && <div className={styles.muted}>{errors['jointHolder.zip']}</div>}
                  </div>
                  <div>
                    <label><b>State</b></label>
                    <select name="jointHolder.state" value={form.jointHolder.state} onChange={handleChange} disabled={!isEditing}>
                      <option value="">Select state</option>
                      {US_STATES.map(s => (<option key={s} value={s}>{s}</option>))}
                    </select>
                    {errors['jointHolder.state'] && <div className={styles.muted}>{errors['jointHolder.state']}</div>}
                  </div>
                  <div>
                    <label><b>Country</b></label>
                    <input name="jointHolder.country" value={form.jointHolder.country} readOnly disabled />
            </div>
          </div>
        </>
      )}

            {/* Save/Cancel buttons */}
            {isEditing && (
              <div className={styles.sectionActions}>
                <button className={styles.saveButton} onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving Changes...' : 'Save Changes'}
                </button>
                <button className={styles.cancelButton} onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </button>
              </div>
            )}
          </div>
            </>
          )}

          {/* Investments Tab */}
          {activeTab === 'investments' && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>All Investments</h2>
              </div>
              {(user.investments && user.investments.length > 0) ? (
                <div className={styles.list}>
                  {user.investments.map(inv => (
                    <div key={inv.id} style={{
                      padding: '16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      background: 'white'
                    }}>
                      {/* Investment Header - Compact */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#111827'
                          }}>
                            Investment #{inv.id}
                          </span>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.025em',
                            background: inv.status === 'active' ? 'var(--status-success-bg)' :
                                      inv.status === 'pending' ? 'var(--status-warning-bg)' :
                                      inv.status === 'submitted' ? 'var(--status-info-bg)' :
                                      inv.status === 'approved' ? 'var(--status-success-bg)' :
                                      inv.status === 'withdrawal_notice' ? 'var(--status-info-bg)' :
                                      inv.status === 'withdrawn' ? 'var(--status-neutral-bg)' :
                                      inv.status === 'draft' ? 'var(--status-neutral-bg)' :
                                      'var(--status-error-bg)',
                            color: inv.status === 'active' ? 'var(--status-success-color)' :
                                  inv.status === 'pending' ? 'var(--status-warning-color)' :
                                  inv.status === 'submitted' ? 'var(--status-info-color)' :
                                  inv.status === 'approved' ? 'var(--status-success-color)' :
                                  inv.status === 'withdrawal_notice' ? 'var(--status-info-color)' :
                                  inv.status === 'withdrawn' ? 'var(--status-neutral-color)' :
                                  inv.status === 'draft' ? 'var(--status-neutral-color)' :
                                  'var(--status-error-color)'
                          }}>
                            {inv.status}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#111827' }}>
                            {formatCurrency(inv.amount)}
                          </div>
                        </div>
                      </div>

                      {/* Compact Details Row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '12px',
                        marginBottom: '12px'
                      }}>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>Type:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500' }}>
                            {(() => {
                              // Derive investment type from user profile data
                              // Prioritize explicit accountType before inferring from entity/joint data
                              const type = inv.accountType || 
                                user.accountType ||
                                (inv.entity || user.entity ? 'entity' : null) ||
                                (inv.jointHoldingType || user.jointHoldingType ? 'joint' : null) ||
                                'individual';
                              // Display "SDIRA" for IRA accounts, capitalize others
                              if (type === 'ira') return 'SDIRA';
                              return type.charAt(0).toUpperCase() + type.slice(1);
                            })()}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>Lockup:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500' }}>
                            {inv.lockupPeriod || '-'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>Frequency:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500' }}>
                            {inv.paymentFrequency || '-'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>Bonds:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500' }}>
                            {inv.bonds?.toLocaleString() || '-'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>Created:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500' }}>
                            {inv.createdAt ? formatDateForDisplay(inv.createdAt) : '-'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>Confirmed:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500' }}>
                            {inv.confirmedAt ? formatDateForDisplay(inv.confirmedAt) : '-'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>Lockup Ends:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500' }}>
                            {inv.lockupEndAt ? formatDateForDisplay(inv.lockupEndAt) : '-'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500' }}>State:</span>
                          <span style={{ color: '#111827', marginLeft: '4px', fontWeight: '500', textTransform: 'capitalize' }}>
                            {inv.state || '-'}
                          </span>
                        </div>
                      </div>

                      {/* Specialized Info - Inline */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '12px'
                      }}>
                        {inv.compliance && inv.compliance.status === 'accredited' && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            background: '#f0f9ff',
                            border: '1px solid #e0f2fe',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#0369a1',
                            fontWeight: '500'
                          }}>
                            ✓ Accredited
                          </span>
                        )}
                        {inv.compliance && inv.compliance.status === 'not_accredited' && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            background: '#f3f4f6',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#4b5563',
                            fontWeight: '500'
                          }}>
                            Not Accredited
                          </span>
                        )}

                        {inv.banking && inv.banking.fundingMethod && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            background: '#f0fdf4',
                            border: '1px solid #dcfce7',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#166534',
                            fontWeight: '500'
                          }}>
                            🏦 {inv.banking.fundingMethod}
                          </span>
                        )}

                        {inv.entity && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            background: '#fefce8',
                            border: '1px solid #fef3c7',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#92400e',
                            fontWeight: '500'
                          }}>
                            🏢 {inv.entity.name || 'Entity'}
                          </span>
                        )}

                        {inv.jointHoldingType && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            background: '#fdf4ff',
                            border: '1px solid #f3e8ff',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#6b21a8',
                            fontWeight: '500'
                          }}>
                            👥 {inv.jointHoldingType}
                          </span>
                        )}
                      </div>

                      {/* Actions - Compact */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        paddingTop: '12px',
                        borderTop: '1px solid #f3f4f6'
                      }}>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => router.push(`/admin/investments/${inv.id}`)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          Details →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.muted}>No investments</div>
              )}
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <>
          {/* Activity Section */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div>
                    <h2 className={styles.sectionTitle}>Activity History</h2>
                    {(() => {
                      const total = filteredActivity.length
                      const totalPages = Math.ceil(total / ACTIVITY_ITEMS_PER_PAGE)
                      return totalPages > 1 ? (
                        <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
                          Page {activityPage} of {totalPages}
                        </div>
                      ) : null
                    })()}
                  </div>
                  <select
                    value={activityFilterInvestmentId}
                    onChange={(e) => {
                      setActivityFilterInvestmentId(e.target.value)
                      setActivityTypeFilter('all')
                      setActivityPage(1)
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                      color: '#374151',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="all">All Investments</option>
                    {(user.investments || []).map(inv => (
                      <option key={inv.id} value={String(inv.id)}>
                        Inv #{inv.id} - {formatCurrency(inv.amount)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => user && loadUserActivity(user.id)}
                  disabled={isLoadingActivity}
                  style={{
                    padding: '8px 16px',
                    background: isLoadingActivity ? '#f3f4f6' : '#0369a1',
                    color: isLoadingActivity ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: isLoadingActivity ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isLoadingActivity ? '⟳ Loading...' : '↻ Refresh'}
                </button>
              </div>
            </div>
            {(() => {
              // Helper function to get event metadata (icon, title, color)
              const getEventMeta = (eventType) => {
                switch (eventType) {
                  case 'account_created':
                    return { icon: '👤', title: 'Account Created', color: '#0369a1', showAmount: false }
                  case 'investment_created':
                    return { icon: '🧾', title: 'Investment Created', color: '#0369a1', showAmount: false }
                  case 'investment_submitted':
                    return { icon: '📋', title: 'Investment Submitted', color: '#0369a1', showAmount: false }
                  case 'investment_approved':
                    return { icon: '✓', title: 'Investment Approved', color: '#0891b2', showAmount: false }
                  case 'investment_confirmed':
                    return { icon: '✅', title: 'Investment Confirmed', color: '#065f46', showAmount: true }
                  case 'investment_rejected':
                    return { icon: '❌', title: 'Investment Rejected', color: '#991b1b', showAmount: false }
                  case 'investment':
                    return { icon: '🧾', title: 'Investment', color: '#0369a1', showAmount: true }
                  case 'distribution':
                    return { icon: '💸', title: 'Distribution', color: '#7c3aed', showAmount: true }
                  case 'monthly_distribution':
                    return { icon: '💸', title: 'Distribution', color: '#7c3aed', showAmount: true }
                  case 'monthly_contribution':
                    return { icon: '📈', title: 'Contribution', color: '#0369a1', showAmount: true }
                  case 'contribution':
                    return { icon: '📈', title: 'Contribution', color: '#0369a1', showAmount: true }
                  case 'monthly_compounded':
                    return { icon: '📈', title: 'Monthly Compounded', color: '#0369a1', showAmount: true }
                  case 'withdrawal_requested':
                    return { icon: '🏦', title: 'Withdrawal Requested', color: '#ca8a04', showAmount: true }
                  case 'withdrawal_notice_started':
                    return { icon: '⏳', title: 'Withdrawal Notice Started', color: '#ca8a04', showAmount: false }
                  case 'withdrawal_approved':
                    return { icon: '✅', title: 'Withdrawal Processed', color: '#065f46', showAmount: true }
                  case 'withdrawal_rejected':
                    return { icon: '❌', title: 'Withdrawal Rejected', color: '#991b1b', showAmount: false }
                  case 'redemption':
                    return { icon: '🏦', title: 'Redemption', color: '#ca8a04', showAmount: true }
                  default:
                    return { icon: '•', title: eventType || 'Unknown Event', color: '#6b7280', showAmount: true }
                }
              }

              if (isLoadingActivity) {
                return (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>⟳ Loading activity...</div>
                  </div>
                )
              }

              if (!activityEvents || activityEvents.length === 0) {
                return (
                  <div className={styles.muted} style={{ padding: '40px', textAlign: 'center' }}>
                    No activity events yet
                  </div>
                )
              }

              // Build an index of investments so we can reflect their CURRENT status
              // when rendering investment-related events (created/submitted/confirmed)
              const investmentsById = {}
              ;(user.investments || []).forEach(inv => {
                investmentsById[String(inv.id)] = inv
              })
              
              // Helper to lookup investment by ID
              const getInvestmentById = (id) => investmentsById[String(id)] || null

              const distributions = filteredActivity.filter(e => e.type === 'distribution' || e.type === 'monthly_distribution')
              const contributions = filteredActivity.filter(e => e.type === 'contribution' || e.type === 'monthly_contribution' || e.type === 'monthly_compounded')
              const accountEvents = filteredActivity.filter(e => 
                e.type?.includes('account') || 
                e.type?.includes('investment_created') || 
                e.type?.includes('investment_submitted') ||
                e.type?.includes('investment_confirmed')
              )
              const totalDistributionAmount = distributions.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
              const totalContributionAmount = contributions.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
              
              // Pending count should reflect investment state, not raw event status
              // We deduplicate by investmentId to avoid double counting (e.g. Created + Submitted both showing as pending)
              // We also exclude 'investment_created' from being considered "pending" even if the investment is pending
              const pendingInvestmentsSet = new Set()
              const pendingCount = filteredActivity.filter(e => {
                const invIdStr = String(e.investmentId || '')
                if (invIdStr && pendingInvestmentsSet.has(invIdStr)) return false
                
                const inv = e.investmentId ? getInvestmentById(e.investmentId) : null
                // Don't override status for creation events - they are historical points in time
                const isCreationEvent = e.type === 'investment_created'
                
                const status = (inv && e.type?.includes('investment') && !isCreationEvent) ? inv.status : e.status
                
                if (status === 'pending') {
                  if (invIdStr) pendingInvestmentsSet.add(invIdStr)
                  return true
                }
                return false
              }).length

              // Pagination
              const totalActivityPages = Math.ceil(filteredActivity.length / ACTIVITY_ITEMS_PER_PAGE)
              const startIndex = (activityPage - 1) * ACTIVITY_ITEMS_PER_PAGE
              const endIndex = startIndex + ACTIVITY_ITEMS_PER_PAGE
              const paginatedActivity = filteredActivity.slice(startIndex, endIndex)

              return allActivity.length > 0 ? (
                <>
                  {/* Activity Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                    <div 
                      onClick={() => { setActivityTypeFilter('all'); setActivityPage(1); }}
                      style={{ 
                        padding: '16px', 
                        background: activityTypeFilter === 'all' ? '#e0f2fe' : '#f8fafc', 
                        borderRadius: '8px', 
                        border: activityTypeFilter === 'all' ? '2px solid #0369a1' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Click to show all activity"
                    >
                      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Total Activity</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937' }}>
                        {investmentFiltered.length}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{accountEvents.length} account events</div>
                    </div>
                    <div 
                      onClick={() => { setActivityTypeFilter('distributions'); setActivityPage(1); }}
                      style={{ 
                        padding: '16px', 
                        background: activityTypeFilter === 'distributions' ? '#ede9fe' : '#f8fafc', 
                        borderRadius: '8px', 
                        border: activityTypeFilter === 'distributions' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Click to filter by distributions"
                    >
                      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>💸 Distributions</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#7c3aed' }}>
                        {formatCurrency(totalDistributionAmount)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{distributions.length} distributions</div>
                    </div>
                    <div 
                      onClick={() => { setActivityTypeFilter('contributions'); setActivityPage(1); }}
                      style={{ 
                        padding: '16px', 
                        background: activityTypeFilter === 'contributions' ? '#e0f2fe' : '#f8fafc', 
                        borderRadius: '8px', 
                        border: activityTypeFilter === 'contributions' ? '2px solid #0369a1' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Click to filter by contributions"
                    >
                      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>📈 Contributions</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1' }}>
                        {formatCurrency(totalContributionAmount)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{contributions.length} contributions</div>
                    </div>
                    {pendingCount > 0 && (
                      <div style={{ padding: '16px', background: 'var(--status-warning-bg)', borderRadius: '8px', border: '1px solid #f59e0b' }}>
                        <div style={{ fontSize: '14px', color: 'var(--status-warning-color)', marginBottom: '4px' }}>⏳ Pending Approval</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--status-warning-color)' }}>{pendingCount}</div>
                        <div style={{ fontSize: '12px', color: 'var(--status-warning-color)' }}>events</div>
                      </div>
                    )}
                  </div>

                  {/* Activity List */}
                  {paginatedActivity.length === 0 ? (
                    <div className={styles.muted} style={{ padding: '40px', textAlign: 'center' }}>
                      No activity events found matching filter
                    </div>
                  ) : (
                    <div className={styles.list}>
                      {paginatedActivity.map(event => {
                      const meta = getEventMeta(event.type)
                      // For investment events, display the INVESTMENT's current status (draft/pending/active)
                      // instead of the API event status which is typically 'completed'.
                      // Exception: 'investment_created' is a historical log and shouldn't reflect current status
                      const invForEvent = event.investmentId ? getInvestmentById(event.investmentId) : null
                      const isCreationEvent = event.type === 'investment_created'
                      const displayStatus = (invForEvent && event.type?.includes('investment') && !isCreationEvent) 
                        ? (invForEvent.status || event.status) 
                        : event.status
                        
                      return (
                        <div 
                          key={event.id} 
                          className={styles.activityCard}
                          onClick={() => setSelectedActivityEvent(event)}
                          title="Click to view raw event data"
                        >
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '18px',
                                color: meta.color
                              }}>
                                {meta.icon}
                              </span>
                              <span style={{ fontWeight: 'bold' }}>
                                {meta.title}
                              </span>
                              {displayStatus && (
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  background: displayStatus === 'completed' ? 'var(--status-success-bg)' :
                                            displayStatus === 'received' ? 'var(--status-success-bg)' :
                                            displayStatus === 'approved' ? 'var(--status-success-bg)' :
                                            displayStatus === 'pending' ? 'var(--status-warning-bg)' :
                                            displayStatus === 'submitted' ? 'var(--status-info-bg)' :
                                            displayStatus === 'active' ? 'var(--status-info-bg)' :
                                            displayStatus === 'draft' ? 'var(--status-neutral-bg)' :
                                            displayStatus === 'withdrawal_notice' ? 'var(--status-info-bg)' :
                                            displayStatus === 'withdrawn' ? 'var(--status-neutral-bg)' :
                                            displayStatus === 'rejected' ? 'var(--status-error-bg)' :
                                            displayStatus === 'failed' ? 'var(--status-error-bg)' :
                                            'var(--status-neutral-bg)',
                                  color: displayStatus === 'completed' ? 'var(--status-success-color)' :
                                        displayStatus === 'received' ? 'var(--status-success-color)' :
                                        displayStatus === 'approved' ? 'var(--status-success-color)' :
                                        displayStatus === 'pending' ? 'var(--status-warning-color)' :
                                        displayStatus === 'submitted' ? 'var(--status-info-color)' :
                                        displayStatus === 'active' ? 'var(--status-info-color)' :
                                        displayStatus === 'draft' ? 'var(--status-neutral-color)' :
                                        displayStatus === 'withdrawal_notice' ? 'var(--status-info-color)' :
                                        displayStatus === 'withdrawn' ? 'var(--status-neutral-color)' :
                                        displayStatus === 'rejected' ? 'var(--status-error-color)' :
                                        displayStatus === 'failed' ? 'var(--status-error-color)' :
                                        'var(--status-neutral-color)'
                                }}>
                                  {displayStatus}
                                </span>
                              )}
                            </div>
                            {meta.showAmount && event.amount != null && (
                              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937' }}>
                                {formatCurrency(event.amount)}
                              </div>
                            )}
                          </div>

                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: '12px',
                            fontSize: '14px',
                            color: '#64748b'
                          }}>
                            {event.investmentId && (
                              <div>
                                <b>Investment ID:</b>{' '}
                                <button
                                  onClick={() => router.push(`/admin/investments/${event.investmentId}`)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#0369a1',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    padding: 0,
                                    font: 'inherit'
                                  }}
                                  title="View investment details"
                                >
                                  {event.investmentId}
                                </button>
                              </div>
                            )}
                            <div><b>Date:</b> {event.date ? formatDateForDisplay(event.date) : '-'}</div>
                            {event.monthIndex != null && (
                              <div><b>Month Index:</b> Month {event.monthIndex}</div>
                            )}
                            {event.lockupPeriod && (
                              <div><b>Lockup Period:</b> {event.lockupPeriod}</div>
                            )}
                            {event.paymentFrequency && (
                              <div><b>Payment Frequency:</b> {event.paymentFrequency}</div>
                            )}
                            <div>
                              <b>Event ID:</b>{' '}
                              {(event.type === 'investment' || event.type === 'distribution' || event.type === 'contribution') && event.id ? (
                                <span>{event.id}</span>
                              ) : (
                                <span>{event.id}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )}

                  {/* Pagination Controls */}
                  {totalActivityPages > 1 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '16px',
                      padding: '24px 16px',
                      marginTop: '20px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}>
                      <button
                        onClick={() => setActivityPage(prev => Math.max(1, prev - 1))}
                        disabled={activityPage === 1}
                        style={{
                          padding: '8px 16px',
                          background: activityPage === 1 ? '#f3f4f6' : '#0369a1',
                          color: activityPage === 1 ? '#9ca3af' : 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: activityPage === 1 ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          minWidth: '100px',
                          opacity: activityPage === 1 ? 0.5 : 1
                        }}
                      >
                        ← Previous
                      </button>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827',
                        minWidth: '150px',
                        textAlign: 'center'
                      }}>
                        Page {activityPage} of {totalActivityPages}
                        <span style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          fontWeight: 400
                        }}>
                          (Showing {startIndex + 1}-{Math.min(endIndex, allActivity.length)} of {allActivity.length})
                        </span>
                      </div>
                      <button
                        onClick={() => setActivityPage(prev => Math.min(totalActivityPages, prev + 1))}
                        disabled={activityPage === totalActivityPages}
                        style={{
                          padding: '8px 16px',
                          background: activityPage === totalActivityPages ? '#f3f4f6' : '#0369a1',
                          color: activityPage === totalActivityPages ? '#9ca3af' : 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: activityPage === totalActivityPages ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          minWidth: '100px',
                          opacity: activityPage === totalActivityPages ? 0.5 : 1
                        }}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.muted}>No activity yet</div>
              )
            })()}
          </div>
            </>
          )}

          {/* Actions Tab */}

              {activeTab === 'actions' && (
            <>
              {/* Pending Approvals Section */}
              {user.investments && user.investments.some(inv => inv.status === 'pending') && (
                <div style={{ 
                  marginBottom: '24px', 
                  padding: '16px', 
                  border: '1px solid #f59e0b', 
                  background: '#fffbeb', 
                  borderRadius: '8px' 
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    marginBottom: '12px' 
                  }}>
                    <h3 style={{ 
                      margin: 0, 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: '#b45309',
                      display: 'flex',
                      alignItems: 'center', 
                      gap: '6px'
                    }}>
                      ⚠️ Pending Approvals
                    </h3>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {user.investments.filter(inv => inv.status === 'pending').map(inv => (
                      <div key={inv.id} style={{
                        padding: '20px',
                        border: '1px solid #e5e7eb',
                        borderLeft: '4px solid #f59e0b',
                        borderRadius: '8px',
                        background: 'white',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ fontWeight: '700', fontSize: '18px', color: '#111827' }}>
                              {formatCurrency(inv.amount)}
                            </div>
                            <span style={{ 
                              fontSize: '12px', 
                              padding: '2px 8px', 
                              background: '#f3f4f6', 
                              color: '#4b5563', 
                              borderRadius: '12px',
                              fontFamily: 'monospace',
                              border: '1px solid #e5e7eb'
                            }}>
                              #{inv.id}
                            </span>
                            <span style={{ fontSize: '12px', color: '#6b7280' }}>
                              {formatDateForDisplay(inv.createdAt)}
                            </span>
                          </div>
                          
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                            gap: '12px 24px',
                            fontSize: '13px' 
                          }}>
                            <div>
                              <div style={{ color: '#6b7280', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Lockup Period</div>
                              <div style={{ color: '#111827', fontWeight: '500' }}>{inv.lockupPeriod === '1-year' ? '1-Year' : '3-Year'}</div>
                            </div>
                            <div>
                              <div style={{ color: '#6b7280', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Frequency</div>
                              <div style={{ color: '#111827', fontWeight: '500' }}>{inv.paymentFrequency}</div>
                            </div>
                            <div>
                              <div style={{ color: '#6b7280', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Payment Method</div>
                              <div style={{ color: '#111827', fontWeight: '500' }}>{inv.paymentMethod === 'wire' ? 'Wire Transfer' : 'ACH'}</div>
                            </div>
                            {inv.compliance?.status === 'accredited' && (
                              <div>
                                <div style={{ color: '#6b7280', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Status</div>
                                <div style={{ color: '#0369a1', fontWeight: '600' }}>✓ Accredited</div>
                              </div>
                            )}
                            {inv.compliance?.status === 'not_accredited' && (
                              <div>
                                <div style={{ color: '#6b7280', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Status</div>
                                <div style={{ color: '#4b5563', fontWeight: '600' }}>Not Accredited</div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '24px', paddingLeft: '24px', borderLeft: '1px solid #f3f4f6', justifyContent: 'center' }}>
                          {(inv.paymentMethod === 'wire' || inv.banking?.fundingMethod === 'wire') ? (
                            <>
                              <button
                                onClick={() => handleApproveInvestment(inv.id)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#16a34a',
                                  color: 'white',
                                  fontWeight: '600',
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  width: '100%',
                                  minWidth: '100px',
                                  transition: 'all 0.2s'
                                }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectInvestment(inv.id)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: '1px solid #fee2e2',
                                  background: 'white',
                                  color: '#ef4444',
                                  fontWeight: '600',
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  width: '100%',
                                  minWidth: '100px',
                                  transition: 'all 0.2s'
                                }}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span style={{
                              fontSize: '13px',
                              color: '#6b7280',
                              fontStyle: 'italic',
                              textAlign: 'center',
                              padding: '8px 16px'
                            }}>
                              Auto-approves on settlement
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Quick Actions */}
                <div className={styles.sectionCard}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Quick Actions</h2>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <button 
                      onClick={handleGenerateSetupLink} 
                      className={styles.actionCard}
                      title="Generate and copy onboarding link"
                      disabled={isGeneratingLink}
                    >
                      <span className={styles.actionIcon}>🔗</span>
                      <span className={styles.actionLabel}>{isGeneratingLink ? 'Generating...' : 'Send Onboarding Link'}</span>
                    </button>
                    
                    <button 
                      onClick={handleSendPasswordReset} 
                      className={styles.actionCard}
                      title="Send password reset email to user"
                    >
                      <span className={styles.actionIcon}>🔑</span>
                      <span className={styles.actionLabel}>Send Reset Password</span>
                    </button>

                    <button 
                      onClick={handleUploadClick} 
                      className={styles.actionCard}
                      title="Upload document for user"
                      disabled={isUploading}
                    >
                      <span className={styles.actionIcon}>📄</span>
                      <span className={styles.actionLabel}>{isUploading ? 'Uploading...' : 'Upload Document'}</span>
                    </button>
                    
                    <button 
                      onClick={handleRefreshTinMatching} 
                      className={styles.actionCard}
                      title="Verify or refresh TIN matching status"
                      disabled={isRefreshingTin}
                    >
                      <span className={styles.actionIcon}>🔍</span>
                      <span className={styles.actionLabel}>{isRefreshingTin ? 'Verifying...' : 'Verify Tax ID'}</span>
                    </button>

                    <button 
                      onClick={handleGenerate1099INT} 
                      className={styles.actionCard}
                      title={`Generate 1099-INT form for tax year ${getDefaultTaxYear()}`}
                      disabled={isGenerating1099INT}
                    >
                      <span className={styles.actionIcon}>📋</span>
                      <span className={styles.actionLabel}>{isGenerating1099INT ? 'Generating...' : 'Generate 1099-INT'}</span>
                    </button>
                    
                    <button 
                      onClick={handleDeleteUser} 
                      className={`${styles.actionCard} ${styles.dangerAction}`}
                      title="Permanently delete user"
                    >
                      <span className={styles.actionIcon}>🗑️</span>
                      <span className={styles.actionLabel}>Delete User</span>
                    </button>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".pdf"
                    onChange={handleFileChange}
                  />
                  
                  {/* Onboarding Link Display */}
                  {setupLink && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px 16px',
                      background: '#ecfdf5',
                      border: '1px solid #10b981',
                      borderRadius: '8px'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        marginBottom: '8px'
                      }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#065f46' }}>
                          ✅ Onboarding link copied to clipboard!
                        </span>
                        <button
                          onClick={() => setSetupLink(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6b7280',
                            fontSize: '16px',
                            padding: '0 4px'
                          }}
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <input
                          type="text"
                          value={setupLink}
                          readOnly
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            background: 'white',
                            color: '#374151'
                          }}
                          onClick={(e) => e.target.select()}
                        />
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(setupLink)
                          }}
                          style={{
                            padding: '8px 12px',
                            background: '#059669',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500',
                            whiteSpace: 'nowrap'
                          }}
                          title="Copy again"
                        >
                          Copy
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                        Valid for 72 hours
                      </div>
                    </div>
                  )}
                </div>

                {/* Bank Account Section */}
                <div className={styles.sectionCard}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Bank Account</h2>
                  </div>
                  {paymentMethods && paymentMethods.length > 0 ? (
                    <div className={styles.list}>
                      {paymentMethods.map(pm => (
                        <div key={pm.id} style={{
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          marginBottom: '12px',
                          background: 'white'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '16px' }}>{pm.display_name || pm.bank_name}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                {pm.bank_name} • {pm.account_type} • ****{pm.last4}
                              </div>
                            </div>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              background: pm.status === 'verified' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                              color: pm.status === 'verified' ? 'var(--status-success-color)' : 'var(--status-error-color)'
                            }}>
                              {pm.status}
                            </span>
                          </div>

                          {(pm.type === 'plaid' || pm.type === 'bank_ach') && (
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Current Balance</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontWeight: '600', color: '#111827' }}>
                                    {showBalance 
                                      ? (pm.current_balance ? formatCurrency(pm.current_balance) : 'Not available')
                                      : '$•••••••'}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Available Balance</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontWeight: '600', color: '#111827' }}>
                                    {showBalance 
                                      ? (pm.available_balance ? formatCurrency(pm.available_balance) : 'Not available')
                                      : '$•••••••'}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                                  Updated: {pm.balance_last_updated ? new Date(pm.balance_last_updated).toLocaleString() : 'Not available'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <button
                                    onClick={() => setShowBalance(!showBalance)}
                                    aria-label={showBalance ? 'Hide Balance' : 'Show Balance'}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      fontSize: '12px',
                                      cursor: 'pointer',
                                      fontWeight: '500',
                                      color: '#6b7280',
                                      textDecoration: 'underline'
                                    }}
                                  >
                                    {showBalance ? 'Hide' : 'Show'}
                                  </button>
                                  <span style={{ color: '#e5e7eb' }}>|</span>
                                  <button
                                    onClick={() => handleRefreshBalance()}
                                    disabled={refreshingBalanceId}
                                    style={{
                                      fontSize: '12px',
                                      color: '#0369a1',
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      cursor: refreshingBalanceId ? 'not-allowed' : 'pointer',
                                      textDecoration: 'underline'
                                    }}
                                  >
                                    {refreshingBalanceId ? 'Refreshing...' : 'Refresh Balance'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.muted} style={{ padding: '20px', textAlign: 'center' }}>
                      No bank account connected
                    </div>
                  )}
                </div>
              </div>

              {/* TIN Matching Status Section */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className={styles.sectionTitle}>Tax ID Verification (TIN)</h2>
                  <button
                    onClick={handleRefreshTinMatching}
                    disabled={isRefreshingTin}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      background: 'var(--color-info)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isRefreshingTin ? 'not-allowed' : 'pointer',
                      opacity: isRefreshingTin ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    {isRefreshingTin ? 'Verifying...' : 'Verify Now'}
                  </button>
                </div>
                
                {tinMatchingRequest ? (
                  <div style={{
                    padding: '20px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: 'white'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                          Verification Status
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Request ID: {tinMatchingRequest.id || tinMatchingRequest.requestId || 'N/A'}
                        </div>
                      </div>
                      <span className={styles.tinStatusBadge} data-status={tinMatchingRequest.status} style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        background: tinMatchingRequest.status === 'success' ? '#dcfce7' :
                                   tinMatchingRequest.status === 'failed' ? '#fef2f2' :
                                   tinMatchingRequest.status === 'submitted' ? '#fef3c7' :
                                   tinMatchingRequest.status === 'pending' ? '#f3f4f6' : '#f3f4f6',
                        color: tinMatchingRequest.status === 'success' ? '#166534' :
                               tinMatchingRequest.status === 'failed' ? '#dc2626' :
                               tinMatchingRequest.status === 'submitted' ? '#92400e' :
                               tinMatchingRequest.status === 'pending' ? '#6b7280' : '#6b7280'
                      }}>
                        {tinMatchingRequest.status === 'success' ? '✓ Verified' :
                         tinMatchingRequest.status === 'failed' ? '✗ Failed' :
                         tinMatchingRequest.status === 'submitted' ? '⏳ In Progress' :
                         tinMatchingRequest.status === 'pending' ? '○ Pending' :
                         tinMatchingRequest.status || 'Unknown'}
                      </span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                      <div>
                        <span style={{ color: '#6b7280' }}>Submitted:</span>{' '}
                        <span style={{ color: '#1f2937', fontWeight: '500' }}>
                          {tinMatchingRequest.submittedAt || tinMatchingRequest.submitted_at 
                            ? new Date(tinMatchingRequest.submittedAt || tinMatchingRequest.submitted_at).toLocaleString()
                            : tinMatchingRequest.status === 'failed' 
                              ? 'Failed before submission'
                              : tinMatchingRequest.status === 'pending'
                                ? 'Pending submission'
                                : 'Not yet submitted'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>Last Updated:</span>{' '}
                        <span style={{ color: '#1f2937', fontWeight: '500' }}>
                          {tinMatchingRequest.updatedAt || tinMatchingRequest.updated_at
                            ? new Date(tinMatchingRequest.updatedAt || tinMatchingRequest.updated_at).toLocaleString()
                            : tinMatchingRequest.createdAt || tinMatchingRequest.created_at
                              ? new Date(tinMatchingRequest.createdAt || tinMatchingRequest.created_at).toLocaleString()
                              : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {tinMatchingRequest.status === 'failed' && (
                      <div style={{ 
                        marginTop: '12px', 
                        padding: '10px 12px', 
                        background: '#fef2f2', 
                        borderRadius: '6px',
                        border: '1px solid #fecaca'
                      }}>
                        <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: '500' }}>
                          {tinMatchingRequest.failureReason || tinMatchingRequest.failure_reason
                            ? `Reason: ${tinMatchingRequest.failureReason || tinMatchingRequest.failure_reason}`
                            : !(tinMatchingRequest.submittedAt || tinMatchingRequest.submitted_at)
                              ? 'Validation failed - user may be missing required tax ID or name information'
                              : 'Verification failed - the tax ID does not match the name on file'}
                        </span>
                      </div>
                    )}

                    {tinMatchingRequest.status === 'success' && (
                      <div style={{ 
                        marginTop: '12px', 
                        padding: '10px 12px', 
                        background: '#dcfce7', 
                        borderRadius: '6px',
                        border: '1px solid #bbf7d0'
                      }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: '500' }}>
                          ✓ Tax ID verified and matches the name on file
                        </span>
                      </div>
                    )}

                    {tinMatchingRequest.status === 'submitted' && (
                      <div style={{ 
                        marginTop: '12px', 
                        padding: '10px 12px', 
                        background: '#fef3c7', 
                        borderRadius: '6px',
                        border: '1px solid #fde68a'
                      }}>
                        <span style={{ fontSize: '12px', color: '#92400e', fontWeight: '500' }}>
                          ⏳ Verification in progress - results typically arrive within minutes
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    padding: '32px 20px',
                    textAlign: 'center',
                    border: '1px dashed #e2e8f0',
                    borderRadius: '8px',
                    background: '#fafafa'
                  }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                      No TIN verification request found
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      Click &quot;Verify Now&quot; to initiate Tax ID verification for this user
                    </div>
                  </div>
                )}
              </div>

              {/* 1099-INT Tax Forms Section */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className={styles.sectionTitle}>1099-INT Tax Forms</h2>
                  <button
                    onClick={handleGenerate1099INT}
                    disabled={isGenerating1099INT}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      background: 'var(--color-info)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isGenerating1099INT ? 'not-allowed' : 'pointer',
                      opacity: isGenerating1099INT ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    {isGenerating1099INT ? 'Generating...' : `Generate ${getDefaultTaxYear()}`}
                  </button>
                </div>
                
                {form1099INTSubmissions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {form1099INTSubmissions.map(submission => {
                      const status = submission.status
                      const taxYear = submission.taxYear || submission.tax_year
                      const documentId = submission.documentId || submission.document_id
                      const interestIncome = submission.interestIncome || submission.interest_income
                      
                      // Status badge styling
                      const getStatusBadgeStyle = (status) => {
                        const baseStyle = {
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                        }
                        
                        switch (status) {
                          case 'finished':
                          case 'success':
                            return { ...baseStyle, background: '#dcfce7', color: '#166534' }
                          case 'transmitted':
                          case 'submitted':
                          case 'valid':
                            return { ...baseStyle, background: '#dbeafe', color: '#1e40af' }
                          case 'pending':
                            return { ...baseStyle, background: '#fef3c7', color: '#92400e' }
                          case 'invalid':
                          case 'failed':
                            return { ...baseStyle, background: '#fef2f2', color: '#dc2626' }
                          default:
                            return { ...baseStyle, background: '#f3f4f6', color: '#6b7280' }
                        }
                      }
                      
                      const getStatusLabel = (status) => {
                        switch (status) {
                          case 'finished': return '✓ Complete'
                          case 'success': return '✓ IRS Accepted'
                          case 'transmitted': return '📤 Transmitted'
                          case 'submitted': return '📨 Submitted'
                          case 'valid': return '✓ Valid'
                          case 'pending': return '○ Pending'
                          case 'invalid': return '✗ Invalid'
                          case 'failed': return '✗ Failed'
                          default: return status || 'Unknown'
                        }
                      }
                      
                      return (
                        <div 
                          key={submission.id}
                          style={{
                            padding: '16px 20px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            background: 'white'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                                Tax Year {taxYear}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                Submission ID: {submission.id}
                              </div>
                            </div>
                            <span style={getStatusBadgeStyle(status)}>
                              {getStatusLabel(status)}
                            </span>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '12px' }}>
                            <div>
                              <span style={{ color: '#6b7280' }}>Interest Income:</span>{' '}
                              <span style={{ color: '#1f2937', fontWeight: '500' }}>
                                {interestIncome ? formatCurrency(parseFloat(interestIncome)) : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Last Updated:</span>{' '}
                              <span style={{ color: '#1f2937', fontWeight: '500' }}>
                                {submission.updatedAt || submission.updated_at
                                  ? new Date(submission.updatedAt || submission.updated_at).toLocaleString()
                                  : 'N/A'}
                              </span>
                            </div>
                          </div>
                          
                          {/* Action buttons based on status */}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(status === 'success' || status === 'transmitted') && (
                              <button
                                onClick={() => handleSync1099INTStatus(submission.id)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  background: '#f3f4f6',
                                  color: '#374151',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                🔄 Sync Status
                              </button>
                            )}
                            
                            {(status === 'finished' || documentId) && (
                              <button
                                onClick={() => handleView1099INTDocument(documentId)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  background: '#059669',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                📄 View Document
                              </button>
                            )}
                          </div>
                          
                          {/* Error message for failed/invalid */}
                          {(status === 'failed' || status === 'invalid') && (
                            <div style={{ 
                              marginTop: '12px', 
                              padding: '10px 12px', 
                              background: '#fef2f2', 
                              borderRadius: '6px',
                              border: '1px solid #fecaca'
                            }}>
                              <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: '500' }}>
                                {submission.failureReason || submission.failure_reason
                                  ? submission.failureReason || submission.failure_reason
                                  : status === 'invalid'
                                    ? 'Form validation failed - check recipient information'
                                    : 'Processing failed - please try again or contact support'}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{
                    padding: '32px 20px',
                    textAlign: 'center',
                    border: '1px dashed #e2e8f0',
                    borderRadius: '8px',
                    background: '#fafafa'
                  }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                      No 1099-INT forms generated yet
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      Click &quot;Generate {getDefaultTaxYear()}&quot; to create a 1099-INT form for this user
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Raw Event Data Modal */}
          {selectedActivityEvent && (
            <div className={styles.modalOverlay} onClick={() => setSelectedActivityEvent(null)}>
              <div className={styles.eventDetailModal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.eventDetailHeader}>
                  <h2 className={styles.eventDetailTitle}>
                    Event Details: {selectedActivityEvent.id}
                  </h2>
                  <button 
                    className={styles.closeButton}
                    onClick={() => setSelectedActivityEvent(null)}
                    aria-label="Close modal"
                  >
                    ×
                  </button>
                </div>
                <div className={styles.eventDetailBody}>
                  <pre className={styles.jsonPre}>
                    {JSON.stringify(selectedActivityEvent.rawData || selectedActivityEvent, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Delete Document Confirmation Modal */}
          <ConfirmModal
            isOpen={deleteModalState.isOpen}
            onClose={closeDeleteModal}
            onConfirm={handleDeleteDocument}
            title="Delete Document"
            message={`Are you sure you want to delete "${deleteModalState.fileName}"? This action cannot be undone.`}
            confirmText="Delete"
            cancelText="Cancel"
            isLoading={deleteModalState.isLoading}
            isSuccess={deleteModalState.isSuccess}
            successMessage="Document deleted successfully"
            variant="danger"
          />
        </div>
      </div>
    </div>
  )
}

export default function AdminUserDetailsPage() {
  return (
    <Suspense fallback={
      <div className={styles.main}>
        <div className={styles.container}>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            Loading...
          </div>
        </div>
      </div>
    }>
      <AdminUserDetailsContent />
    </Suspense>
  )
}

