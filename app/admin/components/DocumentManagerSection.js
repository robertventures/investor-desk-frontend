'use client'
import { useState, useEffect } from 'react'
import { adminService } from '../../../lib/services/admin'
import styles from './DocumentManagerSection.module.css'

/**
 * Document Manager Section
 * Handles listing, uploading, and deleting documents for a specific user
 */
export default function DocumentManagerSection({ user, currentUser, onUploadComplete }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  useEffect(() => {
    if (user?.id) {
      loadDocuments()
    }
  }, [user?.id])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const result = await adminService.getUserDocuments(user.id)
      
      if (result.success) {
        // Sort by upload date desc
        // Backend returns "createdAt", map it to "uploadedAt" if needed or use directly
        const docs = (result.documents || []).map(doc => ({
          ...doc,
          uploadedAt: doc.createdAt || doc.uploadedAt,
          uploadedBy: doc.uploadedBy || 'Admin' // Fallback if backend doesn't return this yet
        })).sort((a, b) => 
          new Date(b.uploadedAt) - new Date(a.uploadedAt)
        )
        setDocuments(docs)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
    }
    setLoading(false)
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!selectedFile || !user || !currentUser) return

    setUploading(true)
    try {
      const result = await adminService.uploadUserDocument(user.id, selectedFile)
      
      if (result.success) {
        alert(`Document uploaded successfully`)
        setSelectedFile(null)
        // Reset file input
        const fileInput = document.getElementById('document-upload-input')
        if (fileInput) fileInput.value = ''
        
        loadDocuments()
        if (onUploadComplete) onUploadComplete()
      } else {
        alert(`Upload failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed. Please try again.')
    }
    setUploading(false)
  }

  const handleDelete = async (docId, fileName) => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
      return
    }

    try {
      const result = await adminService.deleteUserDocument(user.id, docId)
      
      if (result.success) {
        alert('Document deleted successfully')
        loadDocuments()
      } else {
        alert(`Delete failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Delete failed. Please try again.')
    }
  }

  const handleDownload = async (docId, fileName) => {
    try {
      const result = await adminService.getUserDocument(user.id, docId)
      
      if (!result.success || !result.blob) {
        alert('Failed to download document')
        return
      }

      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download document:', error)
      alert('Failed to download document')
    }
  }

  return (
    <div className={styles.container}>
      {/* Upload Section */}
      <div className={styles.uploadSection}>
        <h3>Upload Document</h3>
        <form onSubmit={handleUpload} className={styles.uploadForm}>
          <div className={styles.fileInputWrapper}>
            <input
              id="document-upload-input"
              type="file"
              accept=".pdf"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              className={styles.fileInput}
              required
            />
          </div>
          <button 
            type="submit" 
            className={styles.uploadButton}
            disabled={uploading || !selectedFile}
          >
            {uploading ? 'Uploading...' : 'Upload PDF'}
          </button>
        </form>
      </div>

      {/* Documents List */}
      <div className={styles.listSection}>
        <h3>User Documents ({documents.length})</h3>
        
        {loading ? (
          <div className={styles.loading}>Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className={styles.emptyState}>No documents uploaded for this user.</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className={styles.fileNameCell}>
                      <span className={styles.fileIcon}>📄</span>
                      {doc.fileName}
                    </td>
                    <td>{doc.uploadedBy}</td>
                    <td>{new Date(doc.uploadedAt).toLocaleString()}</td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={() => handleDownload(doc.id, doc.fileName)}
                        className={styles.actionButton}
                        title="Download"
                      >
                        📥
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id, doc.fileName)}
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
