// Wraps Gemini SDK errors into Anthropic SDK error classes so the existing
// retry classifier (`is529Error`, `shouldRetry`) and ~30 other instanceof
// checks scattered through the codebase keep working unchanged.
//
// Status mapping rationale:
//   - 5xx (500/502/503/504) → 529 with overloaded_error body. Anthropic's
//     "overloaded" path triggers the same retry-with-backoff that Gemini's
//     UNAVAILABLE/INTERNAL deserves.
//   - 429 → 429 (Anthropic rate_limit_error).
//   - 401/403 → 401 (auth failure surfaces consistently).
//   - timeouts/aborts → APIConnectionTimeoutError / APIUserAbortError.
//   - everything else → APIError with the original status if numeric.

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk'

type ErrorWithStatus = Error & {
  status?: number
  code?: string | number
  cause?: unknown
}

function asError(err: unknown): ErrorWithStatus {
  if (err instanceof Error) return err as ErrorWithStatus
  return new Error(typeof err === 'string' ? err : JSON.stringify(err)) as ErrorWithStatus
}

function detectStatus(err: ErrorWithStatus): number | undefined {
  if (typeof err.status === 'number') return err.status
  // @google/genai often surfaces HTTP status in the message: "got status: 429
  // Too Many Requests" or in error.cause.
  const msg = err.message ?? ''
  const m = msg.match(/status:?\s*(\d{3})/i)
  if (m) return Number(m[1])
  return undefined
}

export function wrapGeminiError(err: unknown, signal?: AbortSignal): never {
  const e = asError(err)

  // User aborts come through as DOMException 'AbortError' or `signal.aborted`.
  if (
    e.name === 'AbortError' ||
    e.message?.toLowerCase().includes('aborted') ||
    (signal && signal.aborted)
  ) {
    throw new APIUserAbortError()
  }

  // Network-level timeouts / connection failures.
  if (
    e.name === 'TimeoutError' ||
    e.message?.toLowerCase().includes('timeout') ||
    (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED')
  ) {
    throw new APIConnectionTimeoutError({ message: `Gemini timeout: ${e.message}` })
  }
  if (
    e.code === 'ECONNREFUSED' ||
    e.code === 'ENOTFOUND' ||
    e.code === 'ECONNRESET' ||
    e.message?.toLowerCase().includes('fetch failed')
  ) {
    throw new APIConnectionError({ message: `Gemini connection: ${e.message}`, cause: e })
  }

  const status = detectStatus(e)
  const headers = new Headers()
  // Surface the message verbatim; if the original includes the magic
  // 'overloaded_error' substring, retry classifier kicks in.
  let body: { type: string; message: string } = {
    type: 'api_error',
    message: e.message || 'unknown gemini error',
  }
  let mappedStatus = status

  if (status && status >= 500 && status < 600) {
    mappedStatus = 529
    body = { type: 'overloaded_error', message: e.message ?? 'gemini overloaded' }
  } else if (status === 401 || status === 403) {
    mappedStatus = 401
    body = { type: 'authentication_error', message: e.message ?? 'gemini auth failed' }
  } else if (status === 429) {
    mappedStatus = 429
    body = { type: 'rate_limit_error', message: e.message ?? 'gemini rate limited' }
  } else if (!status) {
    mappedStatus = 500
    body = { type: 'api_error', message: e.message ?? 'unknown gemini error' }
  }

  // The Anthropic SDK's APIError constructor signature: (status, body, message, headers).
  throw new APIError(
    mappedStatus,
    body as unknown as Record<string, unknown>,
    body.message,
    headers,
  )
}
