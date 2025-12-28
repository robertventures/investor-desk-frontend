import { NextResponse } from 'next/server'

/**
 * POST /api/webhooks/account-created
 * Triggers LeadConnector webhook when a user confirms their account
 * Payload: { email }
 */
export async function POST(request) {
  try {
    const webhookUrl = process.env.WEBHOOK_ACCOUNT_CREATED
    
    if (!webhookUrl) {
      console.error('[Webhook] WEBHOOK_ACCOUNT_CREATED environment variable not configured')
      return NextResponse.json(
        { success: false, error: 'Webhook not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    // Forward to LeadConnector webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[Webhook] account-created failed:', response.status, errorText)
      return NextResponse.json(
        { success: false, error: 'Webhook delivery failed' },
        { status: 502 }
      )
    }

    console.log('[Webhook] account-created sent successfully for:', email)
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Webhook] account-created error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}



