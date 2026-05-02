// High-level Gemini auth surface used by the rest of the CLI.
//
// Three concerns kept distinct:
//   1. getGeminiCredentials()  — read-only resolver: returns whichever auth
//                                method is currently usable without running
//                                interactive flows.
//   2. ensureFreshCredentials() — refresh path: if OAuth tokens are about to
//                                expire and we have a refresh_token, swap
//                                them. Used by the API client just before a
//                                request.
//   3. loginWithGoogle()       — interactive flow trigger. Only invoked from
//                                /login or first-run setup.

import { loadApiKey } from './apiKey.js'
import {
  loginWithGoogle as oauthLogin,
  logout as oauthLogout,
  refreshIfNeeded,
  makeClient,
} from './oauth.js'
import { loadCredentials } from './credentials.js'
import type { OAuth2Client } from 'google-auth-library'

export type GeminiAuth =
  | { kind: 'api-key'; apiKey: string }
  | { kind: 'oauth'; accessToken: string }
  | { kind: 'none' }

export async function getGeminiCredentials(): Promise<GeminiAuth> {
  const apiKey = await loadApiKey()
  if (apiKey) return { kind: 'api-key', apiKey }
  const creds = await loadCredentials()
  if (creds && creds.access_token) {
    return { kind: 'oauth', accessToken: creds.access_token }
  }
  return { kind: 'none' }
}

export async function ensureFreshCredentials(): Promise<GeminiAuth> {
  // Only OAuth needs refreshing; API keys don't expire.
  if (await loadApiKey()) {
    return getGeminiCredentials()
  }
  const refreshed = await refreshIfNeeded()
  if (refreshed && refreshed.access_token) {
    return { kind: 'oauth', accessToken: refreshed.access_token }
  }
  return { kind: 'none' }
}

export async function loginWithGoogle(opts?: {
  openUrl?: (url: string) => Promise<void> | void
  onUrlReady?: (url: string) => void
}): Promise<GeminiAuth> {
  const creds = await oauthLogin(opts)
  return creds.access_token
    ? { kind: 'oauth', accessToken: creds.access_token }
    : { kind: 'none' }
}

export async function logout(): Promise<void> {
  await oauthLogout()
}

// Returns an OAuth2Client wired to the user's saved refresh_token. The client
// auto-refreshes the access_token when it nears expiry and re-saves the new
// tokens (via the 'tokens' event handler in oauth.ts:makeClient). Pass this to
// `GeminiAnthropicAdapter({ oauthClient })` so Code Assist requests get a
// fresh Authorization header on every call.
export async function getOauthClient(): Promise<OAuth2Client | null> {
  const creds = await loadCredentials()
  if (!creds || (!creds.access_token && !creds.refresh_token)) return null
  return makeClient(creds)
}
