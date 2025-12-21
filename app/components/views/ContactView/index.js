'use client'
import { useState } from 'react'
import { useUser } from '../../../contexts/UserContext'
import { apiClient } from '../../../../lib/apiClient'
import logger from '@/lib/logger'
import styles from './ContactView.module.css'

// Category options with display labels and API values
const CATEGORY_OPTIONS = [
  { value: '', label: 'Select a category' },
  { value: 'Investment Question', label: 'Investment Question' },
  { value: 'Payment/Distribution Question', label: 'Payment/Distribution Question' },
  { value: 'Account Issue', label: 'Account Issue' },
  { value: 'General Inquiry / Other', label: 'General Inquiry / Other' }
]

// Priority options matching API enum (low, medium, high)
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
]

export default function ContactView() {
  const { userData } = useUser()
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    priority: 'medium',
    category: '',
    preferredContactMethod: 'email'
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

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
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
      // Build request matching ContactRequestCreate schema
      const contactData = {
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        priority: formData.priority,
        category: formData.category,
        preferredContactMethod: formData.preferredContactMethod
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
          preferredContactMethod: 'email'
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
          ✓ Your message has been sent successfully! We&apos;ll get back to you soon.
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
              {CATEGORY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
              {PRIORITY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
                name="preferredContactMethod"
                value="email"
                checked={formData.preferredContactMethod === 'email'}
                onChange={handleChange}
                disabled={isSubmitting}
                className={styles.radio}
              />
              <span>Email</span>
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="preferredContactMethod"
                value="phone"
                checked={formData.preferredContactMethod === 'phone'}
                onChange={handleChange}
                disabled={isSubmitting}
                className={styles.radio}
              />
              <span>Phone</span>
            </label>
          </div>
        </div>

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

