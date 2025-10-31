'use client'
import { useState, useEffect } from 'react'
import { fetchWithCsrf } from '../../../lib/csrfClient'
import styles from './DocumentManagerSection.module.css'

/**
 * Document Manager Section
 * Handles bulk upload, single upload, and document management
 * Used to send documents to users and manage/delete them
 */
export default function DocumentManagerSection({ currentUser, onUploadComplete }) {
  const [activeSubTab, setActiveSubTab] = useState('bulk')
  const [bulkFile, setBulkFile] = useState(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResults, setBulkResults] = useState(null)
  
  // Single upload state
  const [singleUserId, setSingleUserId] = useState('')
  const [singleFile, setSingleFile] = useState(null)
  const [singleUploading, setSingleUploading] = useState(false)
  const [singleResult, setSingleResult] = useState(null)
  const [users, setUsers] = useState([])
  
  // Document list state
  const [documents, setDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  
  // Pending assignments state
  const [pendingAssignments, setPendingAssignments] = useState({})

  useEffect(() => {
    loadUsers()
    loadDocuments()
  }, [])

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.success) {
        setUsers(data.users.filter(u => !u.isAdmin))
      }
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const loadDocuments = async () => {
    setDocumentsLoading(true)
    try {
      const params = new URLSearchParams({
        adminEmail: currentUser.email,
        type: 'document'
      })
      
      const res = await fetch(`/api/admin/documents/list?${params}`)
      const data = await res.json()
      if (data.success) {
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
    }
    setDocumentsLoading(false)
  }

  const handleBulkUpload = async (e) => {
    e.preventDefault()
    
    if (!bulkFile) {
      alert('Please select a ZIP file')
      return
    }

    setBulkUploading(true)
    setBulkResults(null)

    try {
      const formData = new FormData()
      formData.append('file', bulkFile)
      formData.append('adminEmail', currentUser.email)

      const res = await fetchWithCsrf('/api/admin/documents/bulk-upload', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      
      if (data.success) {
        setBulkResults(data)
        setBulkFile(null)
        loadDocuments()
        if (onUploadComplete) onUploadComplete()
      } else {
        alert(`Upload failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Bulk upload error:', error)
      alert('Upload failed. Please try again.')
    }

    setBulkUploading(false)
  }

  const handleSingleUpload = async (e) => {
    e.preventDefault()
    
    if (!singleUserId || !singleFile) {
      alert('Please select a user and file')
      return
    }

    setSingleUploading(true)
    setSingleResult(null)

    try {
      const formData = new FormData()
      formData.append('file', singleFile)
      formData.append('userId', singleUserId)
      formData.append('adminEmail', currentUser.email)

      const res = await fetchWithCsrf('/api/admin/documents/upload-single', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      
      if (data.success) {
        setSingleResult(data)
        setSingleFile(null)
        setSingleUserId('')
        loadDocuments()
        if (onUploadComplete) onUploadComplete()
      } else {
        alert(`Upload failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Single upload error:', error)
      alert('Upload failed. Please try again.')
    }

    setSingleUploading(false)
  }

  const handleDeleteDocument = async (userId, documentId, fileName) => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
      return
    }

    try {
      const res = await fetch('/api/admin/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single',
          userId,
          documentId,
          adminEmail: currentUser.email
        })
      })

      const data = await res.json()
      
      if (data.success) {
        alert('Document deleted successfully')
        loadDocuments()
      } else {
        alert(`Delete failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Delete failed. Please try again.')
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL documents? This cannot be undone.')) {
      return
    }

    try {
      const res = await fetchWithCsrf('/api/admin/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'all',
          adminEmail: currentUser.email
        })
      })

      const data = await res.json()
      
      if (data.success) {
        alert(data.message)
        loadDocuments()
      } else {
        alert(`Delete failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Delete all error:', error)
      alert('Delete failed. Please try again.')
    }
  }

  const handleAssignPending = async (filename, userId, pdfDataBase64) => {
    try {
      const res = await fetchWithCsrf('/api/admin/documents/assign-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          fileName: filename,
          pdfData: pdfDataBase64,
          adminEmail: currentUser.email
        })
      })

      const data = await res.json()
      
      if (data.success) {
        alert(`Document assigned to ${data.user.email}`)
        // Remove from pending list
        setBulkResults(prev => ({
          ...prev,
          results: {
            ...prev.results,
            duplicateNames: prev.results.duplicateNames.filter(d => d.filename !== filename)
          }
        }))
        loadDocuments()
      } else {
        alert(`Assignment failed: ${data.error}`)
      }
    } catch (error) {
      console.error('Assign pending error:', error)
      alert('Assignment failed. Please try again.')
    }
  }

  return (
    <div className={styles.documentManagerSection}>
      <div className={styles.subTabs}>
        <button
          className={activeSubTab === 'bulk' ? styles.activeSubTab : styles.subTab}
          onClick={() => setActiveSubTab('bulk')}
        >
          Bulk Upload
        </button>
        <button
          className={activeSubTab === 'single' ? styles.activeSubTab : styles.subTab}
          onClick={() => setActiveSubTab('single')}
        >
          Single User
        </button>
        <button
          className={activeSubTab === 'manage' ? styles.activeSubTab : styles.subTab}
          onClick={() => setActiveSubTab('manage')}
        >
          Manage Documents
        </button>
      </div>

      {/* Bulk Upload Tab */}
      {activeSubTab === 'bulk' && (
        <div className={styles.bulkUpload}>
          <form onSubmit={handleBulkUpload} className={styles.uploadForm}>
            <div className={styles.formGroup}>
              <label>ZIP File (PDFs named FirstnameLastname_*.pdf)</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setBulkFile(e.target.files[0])}
                required
              />
              {bulkFile && <p className={styles.fileName}>{bulkFile.name}</p>}
              <p className={styles.helpText}>
                Upload a ZIP file containing PDFs. Each PDF should be named with the user's first and last name (e.g., JosephRobert_1234.pdf).
              </p>
            </div>

            <button 
              type="submit" 
              className={styles.uploadButton}
              disabled={bulkUploading}
            >
              {bulkUploading ? 'Uploading...' : 'Upload Bulk Documents'}
            </button>
          </form>

          {bulkResults && (
            <div className={styles.results}>
              <h4>Upload Results</h4>
              <div className={styles.summary}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Total Files:</span>
                  <span className={styles.statValue}>{bulkResults.summary.total}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Auto-Matched:</span>
                  <span className={`${styles.statValue} ${styles.success}`}>
                    {bulkResults.summary.autoMatched}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Duplicate Names:</span>
                  <span className={`${styles.statValue} ${styles.warning}`}>
                    {bulkResults.summary.duplicateNames}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>No Match:</span>
                  <span className={`${styles.statValue} ${styles.warning}`}>
                    {bulkResults.summary.noMatch}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Errors:</span>
                  <span className={`${styles.statValue} ${styles.error}`}>
                    {bulkResults.summary.errors}
                  </span>
                </div>
              </div>

              {bulkResults.results.autoMatched.length > 0 && (
                <div className={styles.resultSection}>
                  <h5>✓ Successfully Uploaded ({bulkResults.results.autoMatched.length})</h5>
                  <ul className={styles.resultList}>
                    {bulkResults.results.autoMatched.map((item, idx) => (
                      <li key={idx}>
                        <strong>{item.filename}</strong> → {item.email}
                        {item.emailSent && <span className={styles.emailBadge}>📧 Email sent</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {bulkResults.results.duplicateNames.length > 0 && (
                <div className={styles.resultSection}>
                  <h5>⚠ Duplicate Names - Manual Assignment Required ({bulkResults.results.duplicateNames.length})</h5>
                  {bulkResults.results.duplicateNames.map((item, idx) => (
                    <div key={idx} className={styles.duplicateItem}>
                      <p><strong>{item.filename}</strong> - {item.firstName} {item.lastName}</p>
                      <p>Select user:</p>
                      <div className={styles.userOptions}>
                        {item.matchingUsers.map(user => (
                          <button
                            key={user.id}
                            className={styles.userOptionButton}
                            onClick={() => {
                              if (confirm(`Assign ${item.filename} to ${user.email}?`)) {
                                // This would need the PDF data stored - simplified for now
                                alert('Please use single user upload for manual assignments')
                              }
                            }}
                          >
                            {user.email}
                            <br />
                            <small>ID: {user.id} | Created: {new Date(user.displayCreatedAt || user.createdAt).toLocaleDateString()}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {bulkResults.results.noMatch.length > 0 && (
                <div className={styles.resultSection}>
                  <h5>⚠ No Matching Users ({bulkResults.results.noMatch.length})</h5>
                  <ul className={styles.resultList}>
                    {bulkResults.results.noMatch.map((item, idx) => (
                      <li key={idx}>
                        <strong>{item.filename}</strong> - {item.firstName} {item.lastName}
                        <br />
                        <small>{item.reason}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {bulkResults.results.errors.length > 0 && (
                <div className={styles.resultSection}>
                  <h5>❌ Errors ({bulkResults.results.errors.length})</h5>
                  <ul className={styles.resultList}>
                    {bulkResults.results.errors.map((item, idx) => (
                      <li key={idx}>
                        <strong>{item.filename}</strong>: {item.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Single User Upload Tab */}
      {activeSubTab === 'single' && (
        <div className={styles.singleUpload}>
          <form onSubmit={handleSingleUpload} className={styles.uploadForm}>
            <div className={styles.formGroup}>
              <label>Select User</label>
              <select
                value={singleUserId}
                onChange={(e) => setSingleUserId(e.target.value)}
                required
              >
                <option value="">-- Select User --</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>PDF File</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setSingleFile(e.target.files[0])}
                required
              />
              {singleFile && <p className={styles.fileName}>{singleFile.name}</p>}
            </div>

            <button 
              type="submit" 
              className={styles.uploadButton}
              disabled={singleUploading}
            >
              {singleUploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </form>

          {singleResult && (
            <div className={styles.successMessage}>
              ✓ Document uploaded successfully to {singleResult.user.name} ({singleResult.user.email})
              {singleResult.emailSent && <span className={styles.emailBadge}>📧 Email sent</span>}
            </div>
          )}
        </div>
      )}

      {/* Manage Documents Tab */}
      {activeSubTab === 'manage' && (
        <div className={styles.manageDocuments}>
          <div className={styles.filters}>
            <button onClick={loadDocuments} className={styles.filterButton}>
              Refresh List
            </button>
            <button onClick={handleDeleteAll} className={styles.dangerButton}>
              Delete All Documents
            </button>
          </div>

          {documentsLoading ? (
            <div className={styles.loading}>Loading documents...</div>
          ) : (
            <div className={styles.documentsTable}>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>File Name</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan="5" className={styles.emptyState}>
                        No documents found
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>{doc.user.firstName} {doc.user.lastName}</td>
                        <td>{doc.user.email}</td>
                        <td>{doc.fileName}</td>
                        <td>{new Date(doc.uploadedAt).toLocaleString()}</td>
                        <td>
                          <button
                            className={styles.deleteButton}
                            onClick={() => handleDeleteDocument(doc.user.id, doc.id, doc.fileName)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

