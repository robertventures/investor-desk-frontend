import { NextResponse } from 'next/server'
import { writeFile, mkdir, readFile } from 'fs/promises'
import path from 'path'

const METADATA_FILE = path.join(process.cwd(), 'public', 'uploads', 'documents', 'metadata.json')

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
    const formData = await request.formData()
    const file = formData.get('file')
    const userId = formData.get('userId')
    const adminEmail = formData.get('adminEmail')
    const userName = formData.get('userName') || 'User ' + userId
    const userEmail = formData.get('userEmail') || 'unknown@example.com'

    if (!file || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing file or user ID' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Extract numeric ID for consistent storage (handles both "USR-1007" and "1007")
    const numericUserId = userId.toString().replace(/\D/g, '')

    // Create user directory using numeric ID for consistency
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'documents', numericUserId)
    await mkdir(uploadDir, { recursive: true })

    // Save file with original name
    const safeFilename = path.basename(file.name)
    const filePath = path.join(uploadDir, safeFilename)
    
    await writeFile(filePath, buffer)

    // Generate document ID
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Load and update metadata
    const metadata = await loadMetadata()
    if (!metadata[numericUserId]) {
      metadata[numericUserId] = []
    }
    
    const documentEntry = {
      id: docId,
      fileName: safeFilename,
      type: 'document',
      uploadedAt: new Date().toISOString(),
      uploadedBy: adminEmail,
      filePath: `documents/${numericUserId}/${safeFilename}` // Relative path for serving
    }
    
    metadata[numericUserId].push(documentEntry)
    await saveMetadata(metadata)

    console.log(`[Upload] File saved to ${filePath} by ${adminEmail}, docId: ${docId}`)

    // Return success with echoed user details
    return NextResponse.json({
      success: true,
      message: 'Document uploaded successfully',
      user: {
        id: userId,
        name: userName,
        email: userEmail
      },
      document: documentEntry,
      emailSent: false // Mocked
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}
