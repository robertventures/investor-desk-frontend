import { NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
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
  await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8')
}

export async function DELETE(request, { params }) {
  try {
    const { docId } = params
    const { userId, adminEmail } = await request.json()

    if (!docId || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing document ID or user ID' },
        { status: 400 }
      )
    }

    // Extract numeric ID if userId is like "USR-1007"
    const numericUserId = userId.toString().replace(/\D/g, '')
    
    // Load metadata
    const metadata = await loadMetadata()
    const userDocsKey = metadata[numericUserId] ? numericUserId : userId
    
    if (!metadata[userDocsKey]) {
      return NextResponse.json(
        { success: false, error: 'User documents not found' },
        { status: 404 }
      )
    }

    const docIndex = metadata[userDocsKey].findIndex(doc => doc.id === docId)
    
    if (docIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Remove from metadata
    const deletedDoc = metadata[userDocsKey].splice(docIndex, 1)[0]
    await saveMetadata(metadata)

    console.log(`[Delete] Document ${deletedDoc.fileName} deleted by ${adminEmail}`)

    // Note: We're not deleting the actual file to be safe, but removing it from metadata hides it.
    // In a real app, you'd delete the file from S3/storage here.

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

