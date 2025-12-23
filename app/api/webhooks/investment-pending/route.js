import { NextResponse } from 'next/server'

/**
 * POST /api/webhooks/investment-pending
 * Triggers LeadConnector webhook when a user submits their investment (draft -> pending)
 * Payload: { email, phone, firstName, lastName }
 */
export async function POST(request) {
  try {
    const webhookUrl = process.env.WEBHOOK_INVESTMENT_PENDING
    
    if (!webhookUrl) {
      console.error('[Webhook] WEBHOOK_INVESTMENT_PENDING environment variable not configured')
      return NextResponse.json(
        { success: false, error: 'Webhook not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { email, phone, firstName, lastName } = body

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
      body: JSON.stringify({
        email,
        phone: phone || null,
        firstName: firstName || null,
        lastName: lastName || null,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[Webhook] investment-pending failed:', response.status, errorText)
      return NextResponse.json(
        { success: false, error: 'Webhook delivery failed' },
        { status: 502 }
      )
    }

    console.log('[Webhook] investment-pending sent successfully for:', email)
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Webhook] investment-pending error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

