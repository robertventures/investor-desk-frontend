import { NextResponse } from 'next/server'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import path from 'path'

const METADATA_FILE = path.join(process.cwd(), 'public', 'uploads', 'documents', 'metadata.json')
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

async function loadMetadata() {
  try {
    const data = await readFile(METADATA_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

async function saveMetadata(metadata) {
  await mkdir(path.dirname(METADATA_FILE), { recursive: true })
  await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8')
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { userId, documentId, adminEmail } = body

    if (!userId || !documentId) {
      return NextResponse.json(
        { success: false, error: 'Missing user ID or document ID' },
        { status: 400 }
      )
    }

    // Extract numeric ID if userId is like "USR-1007"
    const numericUserId = userId.toString().replace(/\D/g, '')

    // Load metadata
    const metadata = await loadMetadata()
    
    // Find the user's documents
    const userDocuments = metadata[numericUserId] || metadata[userId] || []
    const documentIndex = userDocuments.findIndex(doc => doc.id === documentId)

    if (documentIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    const document = userDocuments[documentIndex]

    // Delete the actual file
    try {
      const filePath = path.join(UPLOADS_DIR, document.filePath)
      await unlink(filePath)
      console.log(`[Delete] File deleted: ${filePath} by ${adminEmail}`)
    } catch (fileError) {
      console.warn(`[Delete] Could not delete file: ${fileError.message}`)
      // Continue even if file deletion fails (file might not exist)
    }

    // Remove from metadata
    userDocuments.splice(documentIndex, 1)
    
    // Update metadata with the new array
    if (metadata[numericUserId]) {
      metadata[numericUserId] = userDocuments
    }
    if (metadata[userId]) {
      metadata[userId] = userDocuments
    }
    // Also update USR-xxx format if it exists
    if (metadata[`USR-${numericUserId}`]) {
      metadata[`USR-${numericUserId}`] = userDocuments
    }
    
    await saveMetadata(metadata)

    console.log(`[Delete] Document ${documentId} deleted for user ${userId} by ${adminEmail}`)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

