// File-based OAuth credential storage compatible with gemini-cli.
//
// gemini-cli writes/reads `~/.gemini/oauth_creds.json` (the legacy file path)
// before migrating to a Keychain-backed store. We deliberately use the file
// form here so a user who has already run `gemini auth login` (in gemini-cli)
// can run this fork's binary without re-authenticating.
//
// The file shape matches google-auth-library's Credentials interface:
//   { access_token, refresh_token, expiry_date, token_type, scope, id_token }
//
// expiry_date is epoch milliseconds (the same convention OAuth2Client uses).

import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'

export type GoogleCredentials = {
  access_token?: string
  refresh_token?: string
  scope?: string
  token_type?: string
  expiry_date?: number
  id_token?: string
}

const GEMINI_DIR = '.gemini'
const OAUTH_FILE = 'oauth_creds.json'

export function getCredentialsPath(): string {
  return path.join(homedir(), GEMINI_DIR, OAUTH_FILE)
}

export async function loadCredentials(): Promise<GoogleCredentials | null> {
  try {
    const raw = await fs.readFile(getCredentialsPath(), 'utf-8')
    return JSON.parse(raw) as GoogleCredentials
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'ENOENT'
    ) {
      return null
    }
    throw err
  }
}

export async function saveCredentials(creds: GoogleCredentials): Promise<void> {
  if (!creds.access_token) {
    throw new Error('Refusing to save OAuth credentials without an access token')
  }
  const file = getCredentialsPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(creds, null, 2), { mode: 0o600 })
}

export async function clearCredentials(): Promise<void> {
  await fs.rm(getCredentialsPath(), { force: true })
}

// Treat tokens as expired 30s before their stated expiry to avoid races
// where a request is in flight when the token is rejected as expired.
const EXPIRY_BUFFER_MS = 30_000

export function isExpired(creds: GoogleCredentials): boolean {
  if (!creds.expiry_date) return false
  return Date.now() + EXPIRY_BUFFER_MS >= creds.expiry_date
}
