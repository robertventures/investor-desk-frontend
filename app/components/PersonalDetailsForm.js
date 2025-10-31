'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './PersonalDetailsForm.module.css'

// Names: Allow only letters, spaces, hyphens, apostrophes, and periods
const formatName = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

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

export default function PersonalDetailsForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: ''
  })
  const [errors, setErrors] = useState({})

  const handleInputChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value
    
    if (name === 'firstName' || name === 'lastName') {
      formattedValue = formatName(value)
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: formattedValue
    }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required'
    }
    
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required'
    }
    
    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!/^[\+]?[1-9][\d]{0,15}$/.test(formData.phoneNumber.replace(/\s/g, ''))) {
      newErrors.phoneNumber = 'Please enter a valid phone number'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (validateForm()) {
      try {
        if (typeof window === 'undefined') return
        
        // Get user ID from localStorage (set in previous step)
        const userId = localStorage.getItem('currentUserId')
        const email = new URLSearchParams(window.location.search).get('email') || 
                     localStorage.getItem('signupEmail')
        
        if (!userId) {
          alert('User session not found. Please start the signup process again.')
          router.push('/')
          return
        }
        
        const updateData = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneNumber: normalizePhoneForDB(formData.phoneNumber)
        }
        
        // Update existing user in database
        const response = await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData)
        })
        
        const result = await response.json()
        
        if (result.success) {
          // Keep user session for next step
          // Navigate to investment page
          router.push('/investment?context=onboarding')
        } else {
          alert(`Error: ${result.error}`)
        }
      } catch (error) {
        console.error('Error updating user data:', error)
        alert('An error occurred while saving your data. Please try again.')
      }
    }
  }


  return (
    <div className={styles.personalDetailsForm}>
      <form onSubmit={handleSubmit} className={styles.formContainer}>
        <div className={styles.formFields}>
          <div className={styles.fieldGroup}>
            <label htmlFor="firstName" className={styles.fieldLabel}>
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              placeholder="Enter your first name"
              className={`${styles.fieldInput} ${errors.firstName ? styles.fieldInputError : ''}`}
            />
            {errors.firstName && (
              <span className={styles.errorMessage}>{errors.firstName}</span>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="lastName" className={styles.fieldLabel}>
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              placeholder="Enter your last name"
              className={`${styles.fieldInput} ${errors.lastName ? styles.fieldInputError : ''}`}
            />
            {errors.lastName && (
              <span className={styles.errorMessage}>{errors.lastName}</span>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="phoneNumber" className={styles.fieldLabel}>
              Phone Number
            </label>
            <input
              type="tel"
              id="phoneNumber"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              placeholder="Enter your phone number"
              className={`${styles.fieldInput} ${errors.phoneNumber ? styles.fieldInputError : ''}`}
            />
            {errors.phoneNumber && (
              <span className={styles.errorMessage}>{errors.phoneNumber}</span>
            )}
          </div>
        </div>

        <div className={styles.buttonSection}>
          <button 
            type="submit"
            className={styles.submitButton}
          >
            Next
          </button>
        </div>
      </form>
    </div>
  )
}
