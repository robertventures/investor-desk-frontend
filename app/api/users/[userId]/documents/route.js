import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
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

export async function GET(request, { params }) {
  try {
    const { userId } = params
    
    console.log(`[API] GET /api/users/${userId}/documents - params:`, params)
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing user ID' },
        { status: 400 }
      )
    }

    // Extract numeric ID if userId is like "USR-1007"
    const numericUserId = userId.toString().replace(/\D/g, '')
    
    console.log(`[API] Looking for documents - userId: ${userId}, numericUserId: ${numericUserId}`)
    
    // Load metadata
    const metadata = await loadMetadata()
    console.log(`[API] Metadata keys:`, Object.keys(metadata))
    
    // Try multiple formats
    const userDocuments = metadata[numericUserId] || metadata[userId] || metadata[`USR-${numericUserId}`] || []
    
    console.log(`[API] Found ${userDocuments.length} documents for user ${userId}`)

    return NextResponse.json({
      success: true,
      documents: userDocuments
    })
  } catch (error) {
    console.error('[API] List documents error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

