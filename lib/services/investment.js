import ApiService from './base'
import logger from '../logger'

class InvestmentService extends ApiService {
  /**
   * Get all investments for current user
   */
  async getInvestments(userId = null) {
    // API returns InvestmentListResponse: { success: true, investments: [...] }
    return this.request('/api/investments', {
      method: 'GET',
    })
  }

  /**
   * Get specific investment by ID
   */
  async getInvestment(investmentId) {
    return this.request(`/api/investments/${investmentId}`, {
      method: 'GET',
    })
  }

  /**
   * Create new investment
   */
  async createInvestment(userId, investmentData) {
    logger.info('[InvestmentService] Creating investment:', investmentData)
    return this.request('/api/investments', {
      method: 'POST',
      body: JSON.stringify(investmentData),
    })
  }

  /**
   * Update investment
   */
  async updateInvestment(userId, investmentId, fields) {
    return this.request(`/api/investments/${investmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    })
  }

  /**
   * Save identity draft on investment
   */
  async saveIdentityDraft(investmentId, draft) {
    return this.updateInvestment(null, investmentId, { identityDraft: draft })
  }

  /**
   * Delete investment
   */
  async deleteInvestment(userId, investmentId) {
    await this.request(`/api/investments/${investmentId}`, {
      method: 'DELETE',
    })
    
    return {
      success: true,
      message: 'Investment deleted successfully'
    }
  }

  /**
   * Submit investment for approval
   */
  async submitInvestment(investmentId, payload = null) {
    const options = {
      method: 'POST'
    }
    if (payload && Object.keys(payload).length > 0) {
      options.body = JSON.stringify(payload)
    }
    return this.request(`/api/investments/${investmentId}/submit`, options)
  }

  /**
   * Get payout summary for investment
   */
  async getPayoutSummary(investmentId) {
    return this.request(`/api/investments/${investmentId}/payout-summary`, {
      method: 'GET',
    })
  }

  /**
   * Get compounding summary for investment
   */
  async getCompoundingSummary(investmentId) {
    return this.request(`/api/investments/${investmentId}/compounding-summary`, {
      method: 'GET',
    })
  }

  /**
   * Create accreditation attestation for an investment
   */
  async createAttestation(investmentId, attestationData) {
    return this.request(`/api/investments/${investmentId}/attestations`, {
      method: 'POST',
      body: JSON.stringify(attestationData),
    })
  }

  /**
   * Get activity events for current user
   */
  async getActivityEvents() {
    return this.request('/api/activity/events', {
      method: 'GET',
    })
  }

  /**
   * Fund an investment using a saved payment method via ACH
   */
  async fundInvestment(investmentId, paymentMethodId, amountCents, idempotencyKey, memo = null) {
    return this.request(`/api/investments/${investmentId}/fund`, {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id: paymentMethodId,
        amount_cents: amountCents,
        idempotency_key: idempotencyKey,
        ...(memo ? { memo } : {}),
      }),
    })
  }

  /**
   * Get funding status
   */
  async getFundingStatus(investmentId, fundingId) {
    return this.request(`/api/investments/${investmentId}/funding/${fundingId}`, {
      method: 'GET',
    })
  }

  /**
   * Request withdrawal for an investment
   */
  async requestWithdrawal(investmentId) {
    return this.request(`/api/investments/${investmentId}/withdraw`, {
      method: 'POST',
    })
  }

  // =====================================================================
  // DOCUMENT HANDLING
  // =====================================================================

  _normalizeAgreementResponse(raw) {
    if (!raw) {
      return {
        success: false,
        error: 'Empty agreement response',
        data: null
      }
    }

    const agreementPayload =
      raw?.data?.agreement ??
      raw?.agreement ??
      raw?.data ??
      raw

    const signedUrl =
      agreementPayload?.signed_url ??
      agreementPayload?.signedUrl ??
      agreementPayload?.url ??
      agreementPayload?.download_url ??
      agreementPayload?.downloadUrl ??
      null

    const pdfBase64 =
      agreementPayload?.pdf_base64 ??
      agreementPayload?.pdfBase64 ??
      agreementPayload?.pdf ??
      agreementPayload?.pdf_bytes ??
      agreementPayload?.pdfBytes ??
      null

    const normalizedSignedUrl =
      typeof signedUrl === 'string' && signedUrl.trim() ? signedUrl.trim() : null

    const sanitizedPdfBase64 =
      typeof pdfBase64 === 'string' && pdfBase64.trim()
        ? pdfBase64.replace(/\s+/g, '')
        : null

    const expiresAt =
      agreementPayload?.expires_at ??
      agreementPayload?.expiresAt ??
      null

    const fileName =
      agreementPayload?.file_name ??
      agreementPayload?.fileName ??
      null

    const contentType =
      agreementPayload?.content_type ??
      agreementPayload?.contentType ??
      (pdfBase64 ? 'application/pdf' : (signedUrl ? 'application/pdf' : null))

    const success = raw?.success !== undefined
      ? !!raw.success
      : Boolean(normalizedSignedUrl || sanitizedPdfBase64)

    const data = {
      signed_url: normalizedSignedUrl,
      pdf_base64: sanitizedPdfBase64,
      expires_at: expiresAt,
      file_name: fileName,
      content_type: contentType,
      payload: agreementPayload
    }

    if (success && !normalizedSignedUrl && !sanitizedPdfBase64) {
      return {
        success: false,
        error: 'Agreement response missing file artifacts',
        data
      }
    }

    const errorMessage =
      raw?.error ||
      raw?.message ||
      raw?.detail ||
      (success ? null : 'Agreement not available')

    return errorMessage && !success
      ? { success: false, error: errorMessage, data }
      : { success: true, data }
  }

  async _fetchInvestmentAgreement(investmentId) {
    if (!investmentId) {
      return {
        success: false,
        error: 'investmentId is required to fetch agreement',
        data: null
      }
    }

    const endpoint = `/api/investments/${investmentId}/agreement`
    const url = this.buildUrl(endpoint)

    const headers = {
      Accept: 'application/json, application/pdf;q=0.9,*/*;q=0.8'
    }

    this.ensureTokensLoaded()

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    try {
      const response = await fetch(url, { method: 'GET', headers })
      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json') || contentType.includes('application/vnd.api+json')

      if (!response.ok) {
        let errorPayload = null
        if (isJson) {
          try {
            errorPayload = await response.json()
          } catch {
            errorPayload = null
          }
        } else {
          try {
            const text = await response.text()
            errorPayload = text ? { error: text } : null
          } catch {
            errorPayload = null
          }
        }

        if (errorPayload) {
          const normalized = this._normalizeAgreementResponse(errorPayload)
          return { success: false, ...normalized }
        }

        return {
          success: false,
          error: `Failed to load investment agreement (status ${response.status})`,
          data: null
        }
      }

      if (isJson) {
        const raw = await response.json()
        return this._normalizeAgreementResponse(raw)
      }

      // Treat the response as binary PDF (or other blob)
      const arrayBuffer = await response.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return {
          success: false,
          error: 'Agreement response was empty',
          data: null
        }
      }

      const arrayBufferToBase64 = (buffer) => {
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(buffer).toString('base64')
        }

        const bytes = new Uint8Array(buffer)
        const chunkSize = 0x8000
        let binary = ''

        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize)
          binary += String.fromCharCode(...chunk)
        }

        return btoa(binary)
      }

      const base64 = arrayBufferToBase64(arrayBuffer)
      const contentDisposition = response.headers.get('content-disposition') || ''
      let fileName = null
      const fileNameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"']+)/i)
      if (fileNameMatch && fileNameMatch[1]) {
        try {
          fileName = decodeURIComponent(fileNameMatch[1].replace(/["']/g, ''))
        } catch {
          fileName = fileNameMatch[1].replace(/["']/g, '')
        }
      }

      const normalized = this._normalizeAgreementResponse({
        success: true,
        data: {
          pdf_base64: base64,
          content_type: contentType || 'application/pdf',
          file_name: fileName
        }
      })

      return normalized
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'Failed to load investment agreement',
        data: error?.responseData ?? null
      }
    }
  }

  async generateBondAgreement(investmentId, userId) {
    return this._fetchInvestmentAgreement(investmentId)
  }

  async getBondAgreement(investmentId, userId = null) {
    return this._fetchInvestmentAgreement(investmentId)
  }

  async downloadBondAgreement(investmentId, userId = null) {
    return this._fetchInvestmentAgreement(investmentId)
  }
}

export const investmentService = new InvestmentService()
export default InvestmentService

