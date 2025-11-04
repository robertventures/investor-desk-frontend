'use client'
import { useState } from 'react'
import { useUser } from '../contexts/UserContext'
import { apiClient } from '../../lib/apiClient'
import logger from '@/lib/logger'
import styles from './ContactView.module.css'

// Format US phone numbers as (XXX) XXX-XXXX while typing
const formatPhone = (value = '') => {
  const digitsOnly = (value || '').replace(/\D/g, '')
  const withoutCountry = digitsOnly.startsWith('1') ? digitsOnly.slice(1) : digitsOnly
  const len = withoutCountry.length
  if (len === 0) return ''
  if (len <= 3) return `(${withoutCountry}`
  if (len <= 6) return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3)}`
  return `(${withoutCountry.slice(0, 3)}) ${withoutCountry.slice(3, 6)}-${withoutCountry.slice(6, 10)}`
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

export default function ContactView() {
  const { userData } = useUser()
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    priority: 'medium',
    category: '',
    contactMethod: 'email',
    phoneNumber: ''
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [generalError, setGeneralError] = useState('')

  const validateForm = () => {
    const newErrors = {}

    if (!formData.subject || formData.subject.trim().length === 0) {
      newErrors.subject = 'Subject is required'
    } else if (formData.subject.length > 200) {
      newErrors.subject = 'Subject must be 200 characters or less'
    }

    if (!formData.message || formData.message.trim().length === 0) {
      newErrors.message = 'Message is required'
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters'
    } else if (formData.message.length > 5000) {
      newErrors.message = 'Message must be 5000 characters or less'
    }

    if (!formData.category) {
      newErrors.category = 'Category is required'
    }

    if (formData.contactMethod === 'sms') {
      if (!formData.phoneNumber || formData.phoneNumber.trim().length === 0) {
        newErrors.phoneNumber = 'Phone number is required for SMS contact'
      } else {
        const digits = formData.phoneNumber.replace(/\D/g, '')
        const withoutCountry = digits.startsWith('1') ? digits.slice(1) : digits
        if (withoutCountry.length !== 10) {
          newErrors.phoneNumber = 'Please enter a valid 10-digit phone number'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value

    if (name === 'phoneNumber') {
      formattedValue = formatPhone(value)
    }

    setFormData(prev => ({ ...prev, [name]: formattedValue }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
    if (generalError) setGeneralError('')
    setSubmitSuccess(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setGeneralError('')
    setSubmitSuccess(false)

    try {
      const contactData = {
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        priority: formData.priority,
        category: formData.category,
        contactMethod: formData.contactMethod
      }

      if (formData.contactMethod === 'sms' && formData.phoneNumber) {
        contactData.phoneNumber = normalizePhoneForDB(formData.phoneNumber)
      }

      const response = await apiClient.submitContactForm(contactData)

      if (response.success) {
        setSubmitSuccess(true)
        // Clear form after successful submission
        setFormData({
          subject: '',
          message: '',
          priority: 'medium',
          category: '',
          contactMethod: 'email',
          phoneNumber: ''
        })
        // Clear success message after 5 seconds
        setTimeout(() => {
          setSubmitSuccess(false)
        }, 5000)
      } else {
        setGeneralError(response.error || 'Failed to send your message. Please try again.')
      }
    } catch (error) {
      logger.error('Contact form submission error:', error)
      setGeneralError(error.message || 'An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.contactContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Contact Us</h1>
        <p className={styles.subtitle}>
          Get in touch with our team for any questions or support.
        </p>
      </div>

      {userData && (
        <div className={styles.userInfo}>
          <p className={styles.userInfoText}>
            <strong>From:</strong> {userData.full_name || userData.name || 'User'} ({userData.email})
          </p>
        </div>
      )}

      {submitSuccess && (
        <div className={styles.successMessage}>
          ✓ Your message has been sent successfully! We'll get back to you soon.
        </div>
      )}

      {generalError && (
        <div className={styles.errorMessage}>
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label htmlFor="subject" className={styles.label}>
              Subject <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              className={`${styles.input} ${errors.subject ? styles.inputError : ''}`}
              placeholder="What is this regarding?"
              maxLength={200}
              disabled={isSubmitting}
            />
            {errors.subject && <span className={styles.errorText}>{errors.subject}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="category" className={styles.label}>
              Category <span className={styles.required}>*</span>
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className={`${styles.select} ${errors.category ? styles.inputError : ''}`}
              disabled={isSubmitting}
            >
              <option value="">Select a category</option>
              <option value="General Inquiry">General Inquiry</option>
              <option value="Investment Question">Investment Question</option>
              <option value="Account Issue">Account Issue</option>
              <option value="Technical Support">Technical Support</option>
              <option value="Payment/Distribution Question">Payment/Distribution Question</option>
              <option value="Other">Other</option>
            </select>
            {errors.category && <span className={styles.errorText}>{errors.category}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="priority" className={styles.label}>
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              className={styles.select}
              disabled={isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="message" className={styles.label}>
            Message <span className={styles.required}>*</span>
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            className={`${styles.textarea} ${errors.message ? styles.inputError : ''}`}
            placeholder="Please provide details about your inquiry..."
            rows={6}
            maxLength={5000}
            disabled={isSubmitting}
          />
          <div className={styles.charCount}>
            {formData.message.length} / 5000 characters
          </div>
          {errors.message && <span className={styles.errorText}>{errors.message}</span>}
        </div>

        <div className={styles.contactMethodSection}>
          <label className={styles.label}>Preferred Contact Method</label>
          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="contactMethod"
                value="email"
                checked={formData.contactMethod === 'email'}
                onChange={handleChange}
                disabled={isSubmitting}
                className={styles.radio}
              />
              <span>Email</span>
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="contactMethod"
                value="sms"
                checked={formData.contactMethod === 'sms'}
                onChange={handleChange}
                disabled={isSubmitting}
                className={styles.radio}
              />
              <span>SMS/Text Message</span>
            </label>
          </div>
        </div>

        {formData.contactMethod === 'sms' && (
          <div className={styles.field}>
            <label htmlFor="phoneNumber" className={styles.label}>
              Phone Number <span className={styles.required}>*</span>
            </label>
            <input
              type="tel"
              id="phoneNumber"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleChange}
              className={`${styles.input} ${errors.phoneNumber ? styles.inputError : ''}`}
              placeholder="(XXX) XXX-XXXX"
              disabled={isSubmitting}
            />
            {errors.phoneNumber && <span className={styles.errorText}>{errors.phoneNumber}</span>}
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </form>
    </div>
  )
}

