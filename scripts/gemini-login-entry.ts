// Entry point for the standalone OAuth-only login binary.
import { loginWithGoogle } from '../src/services/auth/gemini/index.js'

async function main() {
  console.log('Starting Google OAuth flow for Gemini...')
  const result = await loginWithGoogle({
    onUrlReady: (url: string) => {
      console.log('Open this URL in your browser to authorize:')
      console.log()
      console.log('  ' + url)
      console.log()
    },
    openUrl: async (url: string) => {
      // Best-effort: try `open` (macOS), `xdg-open` (Linux), `start` (Windows).
      // If none works, the user can paste the printed URL manually.
      try {
        const { spawn } = await import('node:child_process')
        const cmd = process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open'
        const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
        spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
      } catch {}
    },
  })

  if (result.kind === 'oauth') {
    console.log('Authentication successful. Credentials saved to ~/.gemini/oauth_creds.json')
    process.exit(0)
  } else {
    console.error('Authentication failed.')
    process.exit(1)
  }
}

void main()
