// API-key resolution for the Gemini fork.
//
// Priority (each step is checked in order; first hit wins):
//   1. GEMINI_API_KEY env var
//   2. GOOGLE_API_KEY env var (gemini-cli accepts both; we mirror that)
//   3. ~/.gemini/.api_key file (matches gemini-cli's fallback file path)
//
// The original gemini-cli also tries macOS Keychain via HybridTokenStorage —
// we omit that for now to keep the dependency surface small. Users on macOS
// who want keychain storage can put their key in `security add-generic-password`
// and resolve it via apiKeyHelper at the higher Anthropic-emulating layer.

import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'

const GEMINI_DIR = '.gemini'
const FALLBACK_FILE = '.api_key'

export async function loadApiKey(): Promise<string | null> {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY
  try {
    const buf = await fs.readFile(
      path.join(homedir(), GEMINI_DIR, FALLBACK_FILE),
      'utf-8',
    )
    const trimmed = buf.trim()
    return trimmed || null
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return null
    }
    throw err
  }
}
