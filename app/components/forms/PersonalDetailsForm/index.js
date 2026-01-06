'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './PersonalDetailsForm.module.css'

// Names: Allow only letters, spaces, hyphens, apostrophes, and periods
const formatName = (value = '') => value.replace(/[^a-zA-Z\s'\-\.]/g, '')

export default function PersonalDetailsForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: ''
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
          lastName: formData.lastName
        }
        
        // Update existing user in database via Next.js API route
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
              maxLength={100}
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
              maxLength={100}
            />
            {errors.lastName && (
              <span className={styles.errorMessage}>{errors.lastName}</span>
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
