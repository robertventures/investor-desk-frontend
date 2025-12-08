import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
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

export async function GET(request, { params }) {
  try {
    const { userId, docId } = params
    
    if (!userId || !docId) {
      return NextResponse.json(
        { success: false, error: 'Missing user ID or document ID' },
        { status: 400 }
      )
    }

    // Extract numeric ID if userId is like "USR-1007"
    const numericUserId = userId.toString().replace(/\D/g, '')
    
    // Load metadata to find the document
    const metadata = await loadMetadata()
    const userDocuments = metadata[numericUserId] || metadata[userId] || []
    const document = userDocuments.find(doc => doc.id === docId)

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Read the file
    const filePath = path.join(UPLOADS_DIR, document.filePath)
    const fileBuffer = await readFile(filePath)
    
    // Determine content type
    const ext = path.extname(document.fileName).toLowerCase()
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream'

    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${document.fileName}"`,
        'Content-Length': fileBuffer.length.toString()
      }
    })
  } catch (error) {
    console.error('Download document error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

