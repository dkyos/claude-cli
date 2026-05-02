// Minimal Code Assist server client. Talks to
// `https://cloudcode-pa.googleapis.com/v1internal:METHOD` using OAuth2Client
// (which sets the Authorization: Bearer header from the cached access_token
// and refreshes via refresh_token when needed).
//
// Methods implemented: loadCodeAssist, onboardUser, getOperation,
// generateContent, streamGenerateContent (SSE), countTokens.
// Everything else (recordCodeAssistMetrics, retrieveUserQuota, experiments,
// admin controls, billing/credits) is intentionally not ported.

import type { OAuth2Client } from 'google-auth-library'
import * as readline from 'node:readline'
import { Readable } from 'node:stream'
import type {
  CaCountTokenRequest,
  CaCountTokenResponse,
  CaGenerateContentRequest,
  CaGenerateContentResponse,
  CaLoadCodeAssistRequest,
  CaLoadCodeAssistResponse,
  CaLongRunningOperationResponse,
  CaOnboardUserRequest,
} from './codeAssistTypes.js'

export const CODE_ASSIST_ENDPOINT =
  process.env.CODE_ASSIST_ENDPOINT || 'https://cloudcode-pa.googleapis.com'
export const CODE_ASSIST_API_VERSION =
  process.env.CODE_ASSIST_API_VERSION || 'v1internal'

const BASE = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}`

export class CodeAssistServer {
  constructor(
    public readonly client: OAuth2Client,
    public projectId?: string,
    public readonly sessionId: string = '',
  ) {}

  // -- Eligibility / onboarding --------------------------------------------

  async loadCodeAssist(
    req: CaLoadCodeAssistRequest,
  ): Promise<CaLoadCodeAssistResponse> {
    return this.requestPost('loadCodeAssist', req)
  }

  async onboardUser(
    req: CaOnboardUserRequest,
  ): Promise<CaLongRunningOperationResponse> {
    return this.requestPost('onboardUser', req)
  }

  async getOperation(name: string): Promise<CaLongRunningOperationResponse> {
    return this.requestGet(`/${name}`)
  }

  // -- Content generation --------------------------------------------------

  async generateContent(
    req: CaGenerateContentRequest,
    signal?: AbortSignal,
  ): Promise<CaGenerateContentResponse> {
    return this.requestPost('generateContent', req, signal)
  }

  async *streamGenerateContent(
    req: CaGenerateContentRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<CaGenerateContentResponse> {
    const url = this.urlFor('streamGenerateContent') + '?alt=sse'
    const headers = await this.authHeaders()
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw Object.assign(
        new Error(`Code Assist streamGenerateContent: ${res.status} ${text}`),
        { status: res.status },
      )
    }
    // Code Assist returns text/event-stream lines: `data: <json>` separated by
    // blank lines. Multiple `data:` lines in a row belong to the same chunk.
    const rl = readline.createInterface({
      input: Readable.fromWeb(res.body as never),
      crlfDelay: Infinity,
    })
    let buf: string[] = []
    for await (const line of rl) {
      if (line.startsWith('data: ')) {
        buf.push(line.slice(6).trim())
      } else if (line === '') {
        if (buf.length === 0) continue
        const chunk = buf.join('\n')
        buf = []
        try {
          yield JSON.parse(chunk) as CaGenerateContentResponse
        } catch {
          // Skip malformed chunk; keep streaming.
        }
      }
    }
    if (buf.length > 0) {
      const tail = buf.join('\n').trim()
      if (tail) {
        try { yield JSON.parse(tail) as CaGenerateContentResponse } catch {}
      }
    }
  }

  async countTokens(req: CaCountTokenRequest): Promise<CaCountTokenResponse> {
    return this.requestPost('countTokens', req)
  }

  // -- Plumbing ------------------------------------------------------------

  private urlFor(method: string): string {
    return `${BASE}:${method}`
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const t = await this.client.getAccessToken()
    if (!t.token) {
      throw new Error('Code Assist: OAuth2Client returned no access token')
    }
    return { Authorization: `Bearer ${t.token}` }
  }

  private async requestPost<T>(
    method: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = this.urlFor(method)
    const headers = await this.authHeaders()
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw Object.assign(
        new Error(`Code Assist ${method}: ${res.status} ${text}`),
        { status: res.status, body: text },
      )
    }
    if (!text) return undefined as T
    return JSON.parse(text) as T
  }

  private async requestGet<T>(pathSuffix: string): Promise<T> {
    const url = `${BASE}${pathSuffix}`
    const headers = await this.authHeaders()
    const res = await fetch(url, { method: 'GET', headers })
    const text = await res.text()
    if (!res.ok) {
      throw Object.assign(
        new Error(`Code Assist GET ${pathSuffix}: ${res.status} ${text}`),
        { status: res.status, body: text },
      )
    }
    return JSON.parse(text) as T
  }
}
